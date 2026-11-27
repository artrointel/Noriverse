import type { Box } from './outpost.ts';
import { balance, screen } from './outpost.ts';
import { createRadianceRenderer, indirectSize } from './gi-gl.ts';
import { surface } from './visibility.ts';

export type IndirectMode = 'direct' | 'cascades' | 'local' | 'diffusion';
export type LightingOptions = { mode: IndirectMode; directStrength: number; strength: number; preview: boolean };
export type IndirectField = { image: HTMLCanvasElement; view: Box };

export function createIndirectLighting() {
  const { width, height } = indirectSize;
  const materialScale = .25;
  let terrainSource: HTMLCanvasElement | undefined;
  let materialBase: CanvasRenderingContext2D | undefined;
  let material: CanvasRenderingContext2D | undefined;
  let walls: CanvasRenderingContext2D | undefined;
  let gpu: ReturnType<typeof createRadianceRenderer> | null;
  let diffuse: ReturnType<typeof makeDiffusion> | undefined;
  let cache: CanvasRenderingContext2D | undefined;
  let field: IndirectField | undefined;
  let recalculate = false, refreshedAt = 0, lastBlockerCount = 0, gpuUpdates = 0;
  let cpuMs = 0;
  let previousFlashes: readonly object[] = [];
  let previousFlashlight = true;
  let backend: 'direct' | 'gpu' | 'cpu' = 'direct';
  let mode: IndirectMode = 'direct';

  return {
    capture(terrain: HTMLCanvasElement, camera: Box, terrainScale: number, blockers: readonly Box[], nextMode: IndirectMode,
      flashes: readonly object[] = [], flashlightOn = true) {
      if (mode !== nextMode) { gpu?.resetTiming(); field = undefined; mode = nextMode; }
      if (mode === 'direct') { backend = 'direct'; return false; }
      const cost = backend === 'gpu' ? gpu?.timing().ms ?? 0 : cpuMs;
      const refreshLimit = flashes.length && backend === 'gpu' ? balance.indirect.flashRefreshMs : 240;
      const refreshInterval = Math.min(refreshLimit, Math.max(1000 / 30, cost * 2.5));
      const lightsChanged = flashlightOn !== previousFlashlight || flashes.length !== previousFlashes.length ||
        flashes.some((flash, i) => flash !== previousFlashes[i]);
      const age = performance.now() - refreshedAt;
      const moved = field && Math.abs(camera.x - field.view.x) + Math.abs(camera.y - field.view.y) > 28;
      recalculate = !field || lightsChanged || blockers.length !== lastBlockerCount || Math.abs(camera.width - field.view.width) > 20 ||
        moved && age >= 1000 / 30 || age >= refreshInterval;
      if (!recalculate) return false;
      previousFlashes = flashes;
      previousFlashlight = flashlightOn;
      lastBlockerCount = blockers.length;
      if (terrain !== terrainSource || !materialBase) {
        materialBase = surface(Math.ceil(terrain.width / terrainScale * materialScale), Math.ceil(terrain.height / terrainScale * materialScale), true);
        materialBase.imageSmoothingEnabled = true;
        materialBase.drawImage(terrain, 0, 0, materialBase.canvas.width, materialBase.canvas.height);
        terrainSource = terrain;
      }
      material ??= surface(width, height, true);
      walls ??= surface(width, height, true);
      material.imageSmoothingEnabled = true;
      material.drawImage(materialBase.canvas, camera.x * materialScale, camera.y * materialScale, camera.width * materialScale,
        camera.height * materialScale, 0, 0, width, height);
      walls.clearRect(0, 0, width, height);
      walls.fillStyle = '#fff';
      const sx = width / camera.width, sy = height / camera.height;
      for (const block of blockers) {
        const x = Math.floor((block.x - camera.x) * sx), y = Math.floor((block.y - camera.y) * sy);
        const right = Math.ceil((block.x + block.width - camera.x) * sx);
        const bottom = Math.ceil((block.y + block.height - camera.y) * sy);
        if (right <= 0 || bottom <= 0 || x >= width || y >= height) continue;
        if (block.polygon) {
          const [first, ...rest] = block.polygon.vertices;
          walls.beginPath();
          walls.moveTo((first.x - camera.x) * sx, (first.y - camera.y) * sy);
          for (const p of rest) walls.lineTo((p.x - camera.x) * sx, (p.y - camera.y) * sy);
          walls.closePath(); walls.fill();
        } else walls.fillRect(x, y, right - x, bottom - y);
      }
      return true;
    },
    paint(light: HTMLCanvasElement | undefined, camera: Box) {
      if (mode === 'direct' || !material || !walls) return;
      if (!recalculate || !light) return field;
      const span = camera.width / screen.width;
      let image: HTMLCanvasElement | undefined;
      if (mode !== 'diffusion') {
        if (gpu === undefined) gpu = createRadianceRenderer() ?? null;
        image = gpu?.paint(material.canvas, light, walls.canvas, mode === 'cascades', span);
        if (image) { backend = 'gpu'; gpuUpdates++; }
      }
      if (!image) {
        backend = 'cpu';
        diffuse ??= makeDiffusion();
        const start = performance.now();
        image = diffuse(material.canvas, light, walls.canvas, span);
        const elapsed = performance.now() - start;
        cpuMs = cpuMs * .7 + elapsed * .3;
      }
      // Cache in world coordinates so intervening game frames can move the camera without repainting the light field.
      cache ??= surface(width, height, backend === 'cpu');
      cache.imageSmoothingEnabled = true;
      cache.drawImage(image, 0, 0, width, height);
      refreshedAt = performance.now();
      return field = { image: cache.canvas, view: camera };
    },
    diagnostics() {
      const timing = backend === 'gpu' ? gpu?.timing() : undefined;
      return { backend, fallback: backend === 'cpu' && mode !== 'diffusion', gpuSupported: !!timing?.supported, gpuMs: timing?.ms, gpuUpdates };
    },
    reset() { field = undefined; previousFlashes = []; terrainSource = undefined; materialBase = undefined; },
    dispose() { gpu?.dispose(); },
  };
}

export type IndirectLighting = ReturnType<typeof createIndirectLighting>;

function makeDiffusion() {
  const width = 80, height = 45, count = width * height;
  const capture = surface(width, height, true), output = surface(width, height, true);
  const emission = new Float32Array(count * 3), energy = new Float32Array(count * 3), other = new Float32Array(count * 3);
  const occupied = new Uint8Array(count);
  const image = output.createImageData(width, height);
  const neighbors = new Int32Array(count * 4).fill(-1);
  const { albedoFloor, wallResponse, gain } = balance.indirect;
  for (let i = 0; i < count; i++) {
    const x = i % width, y = Math.floor(i / width);
    if (x) neighbors[i * 4] = i - 1;
    if (x + 1 < width) neighbors[i * 4 + 1] = i + 1;
    if (y) neighbors[i * 4 + 2] = i - width;
    if (y + 1 < height) neighbors[i * 4 + 3] = i + width;
    image.data[i * 4 + 3] = 255;
  }
  function pixels(source: HTMLCanvasElement, smooth: boolean) {
    capture.clearRect(0, 0, width, height);
    capture.imageSmoothingEnabled = smooth;
    capture.drawImage(source, 0, 0, width, height);
    return capture.getImageData(0, 0, width, height).data;
  }

  return (material: HTMLCanvasElement, light: HTMLCanvasElement, walls: HTMLCanvasElement, span: number) => {
    const base = pixels(material, true), direct = pixels(light, true), mask = pixels(walls, true);
    for (let i = 0; i < count; i++) {
      occupied[i] = Number(mask[i * 4 + 3] > 90);
      for (let channel = 0; channel < 3; channel++) {
        const index = i * 4 + channel;
        const bounce = direct[index] / 255 * (albedoFloor + (1 - albedoFloor) * base[index] / 255);
        emission[i * 3 + channel] = bounce;
        energy[i * 3 + channel] = occupied[i] ? 0 : bounce * .23;
      }
    }
    let source = energy, target = other;
    const passes = Math.round(10 / span);
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < count; i++) {
        const index = i * 3;
        for (let channel = 0; channel < 3; channel++) {
          let spread = 0;
          if (!occupied[i]) for (let side = 0; side < 4; side++) {
            const n = neighbors[i * 4 + side];
            if (n >= 0) spread += occupied[n] ? emission[n * 3 + channel] * .38 : source[n * 3 + channel];
          }
          target[index + channel] = occupied[i] ? 0 : emission[index + channel] * .13 + spread * .20;
        }
      }
      [source, target] = [target, source];
    }
    for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) {
      const index = i * 3 + c;
      const reflected = source[index] * 1.45 + emission[index] * (occupied[i] ? wallResponse : .13);
      image.data[i * 4 + c] = 255 * (1 - Math.exp(-gain * reflected));
    }
    output.putImageData(image, 0, 0);
    return output.canvas;
  };
}
