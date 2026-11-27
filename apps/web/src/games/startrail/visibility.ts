import { balance, rayDistance, screen, world } from './outpost.ts';
import type { Box, Point } from './outpost.ts';
import type { IndirectField } from './gi.ts';
import { indirectSize } from './gi-gl.ts';
import { flareFalloff } from './support.ts';
import type { TerrainRelief } from './terrain-material.ts';

const TAU = Math.PI * 2;
const { width, height } = screen;
const cell = 2;
const edgeSample = 2;
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const opaqueBlack = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1 ? 0xff000000 : 0xff;

export function surface(w: number, h: number, read = false) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: read })!;
  context.imageSmoothingEnabled = false;
  return context;
}

function angleOf(from: Point, x: number, y: number) {
  return (Math.atan2(y - from.y, x - from.x) + TAU) % TAU;
}

// Sample a world-aligned circle and the exact silhouettes of each blocker. Aim never changes these rays.
function occlusionPath(origin: Point, range: number, boxes: Box[], edge: 'front' | 'back', wallLip = 0) {
  const neighbors = boxes.filter(box =>
    Math.hypot(Math.max(box.x - origin.x, origin.x - box.x - box.width, 0),
      Math.max(box.y - origin.y, origin.y - box.y - box.height, 0)) < range,
  );
  const angles = Array.from({ length: 96 }, (_, i) => TAU * i / 96);
  const sampled = new Set<number>();
  for (const box of neighbors) {
    const corners = box.polygon?.vertices ?? [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
      { x: box.x, y: box.y + box.height }, { x: box.x + box.width, y: box.y + box.height }];
    for (const point of corners) {
      const angle = angleOf(origin, point.x, point.y);
      if (sampled.has(angle)) continue;
      sampled.add(angle);
      for (const offset of [-.00006, 0, .00006]) angles.push((angle + offset + TAU) % TAU);
    }
  }
  const path = new Path2D();
  angles.sort((a, b) => a - b).forEach((angle, i) => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const hit = rayDistance(origin, dx, dy, range, neighbors, edge);
    const radius = Math.min(range, hit + wallLip);
    const x = origin.x + dx * radius, y = origin.y + dy * radius;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

export type Light = { origin: Point; range: number; amount: number; color: string; reveals?: boolean;
  heading?: number; halfAngle?: number; stationary?: boolean };
export type FlashLight = { from: Point; to: Point; color: string; radius: number; amount: number; spread?: boolean;
  passes?: number; emitter?: Point; opensFog?: boolean; spill?: number; additive?: boolean; source?: object; intensityScale?: number };
type Headlamp = { origin: Point; heading: number };
type LightPath = { x: number; y: number; path: Path2D };
type FlashPath = LightPath & { reach: number };
type IndirectMask = { image: HTMLCanvasElement; width: number; height: number };

function projectLights(ctx: CanvasRenderingContext2D, camera: Box) {
  ctx.scale(ctx.canvas.width / camera.width, ctx.canvas.height / camera.height);
  ctx.translate(-camera.x, -camera.y);
}

export function makeVisibility(drawGround: (ctx: CanvasRenderingContext2D, camera: Box) => void, terrainRelief: TerrainRelief, bounds: typeof world,
  software: boolean) {
  const columns = bounds.width / cell;
  const rows = bounds.height / cell;
  const known = new Uint8Array(columns * rows);
  const current = surface(width / cell + 1, height / cell + 1, true);
  const fog = surface(1, 1, software);
  const unknown = surface(1, 1, software);
  let fogPixels: ImageData, unknownPixels: ImageData;
  let fogAlpha: Uint32Array, unknownAlpha: Uint32Array;
  let spanSamples: Int32Array, spanEnds: Int32Array;
  let samples = new Uint8Array(current.canvas.width * current.canvas.height);
  let remembered = new Uint8Array(samples.length);
  const lighting = surface(width, height, software);
  const beam = surface(width, height, software);
  let incident: CanvasRenderingContext2D | undefined;
  let incidentBeam: CanvasRenderingContext2D | undefined;
  let bounce: CanvasRenderingContext2D | undefined;
  let key = '';
  let blockerKey = '';
  let previousBoxes: Box[] | undefined;
  let ambientPath: Path2D;
  let ambientIncidentPath: Path2D | undefined;
  let headlampPath: Path2D;
  let headlampKey = '';
  let headlampIncidentPath: Path2D;
  let headlampIncidentKey = '';
  let sightPath: Path2D;
  let fogKey = '';
  let ditherKey = '';
  let hasRememberedGround = false;
  let flarePaths = new WeakMap<Point, LightPath>();
  let lightPaths = new WeakMap<Point, LightPath>();
  let incidentLightPaths = new WeakMap<Point, LightPath>();
  let flashPaths = new WeakMap<object, FlashPath>();
  let indirectPaths = new WeakMap<object, FlashPath>();
  let flashMask: CanvasRenderingContext2D | undefined;
  let fogWithFlash: CanvasRenderingContext2D | undefined;
  let unknownWithFlash: CanvasRenderingContext2D | undefined;

  function refresh(origin: Point, boxes: Box[]) {
    if (boxes !== previousBoxes) {
      previousBoxes = boxes;
      const geometry = boxes.map(box => `${box.x},${box.y},${box.width},${box.height}`).join(';');
      if (geometry !== blockerKey) {
        lightPaths = new WeakMap(); flarePaths = new WeakMap(); incidentLightPaths = new WeakMap();
        flashPaths = new WeakMap(); indirectPaths = new WeakMap(); blockerKey = geometry;
      }
    }
    const signature = `${origin.x},${origin.y}:${blockerKey}`;
    if (signature !== key) {
      ambientPath = occlusionPath(origin, 39, boxes, 'back');
      ambientIncidentPath = undefined;
      sightPath = occlusionPath(origin, balance.sight.range, boxes, 'front', balance.sight.wallSurface);
      key = signature;
    }
    return key;
  }

  function pathFor(light: Light, boxes: Box[], pass: 'direct' | 'vision' | 'incident' = 'direct') {
    const cache = pass === 'vision' ? flarePaths : pass === 'incident' ? incidentLightPaths : lightPaths;
    let sample = cache.get(light.origin);
    if (!sample || Math.abs(light.origin.x - sample.x) > 1 || Math.abs(light.origin.y - sample.y) > 1) {
      const wallDepth = pass === 'vision' ? balance.sight.wallSurface : pass === 'incident' ? balance.indirect.wallDepth : 0;
      sample = { x: light.origin.x, y: light.origin.y,
        path: occlusionPath(light.origin, light.range, boxes, pass === 'direct' ? 'back' : 'front', wallDepth) };
      cache.set(light.origin, sample);
    }
    return sample.path;
  }

  function headlampSurface(lamp: Point, boxes: Box[]) {
    const key = `${lamp.x},${lamp.y}:${blockerKey}`;
    if (key !== headlampIncidentKey) {
      headlampIncidentPath = occlusionPath(lamp, balance.beam.range, boxes, 'front', balance.indirect.wallDepth);
      headlampIncidentKey = key;
    }
    return headlampIncidentPath;
  }

  function paintFlashes(ctx: CanvasRenderingContext2D, flashes: readonly FlashLight[], boxes: Box[], pass: 'surface' | 'spill' | 'emission' | 'bounce' = 'surface') {
    const wide = pass === 'bounce';
    const { flashRadiusScale, wallDepth } = balance.indirect;
    for (const flash of flashes) {
      const gain = wide ? 1 : pass === 'spill' ? flash.spill ?? 0 : pass === 'emission' ? (flash.additive ? .33 : 0) : (flash.additive ? 0 : 1);
      if (!gain) continue;
      ctx.save();
      ctx.globalAlpha *= gain * (flash.intensityScale ?? 1);
      const light = wide ? { ...flash, radius: flash.radius * flashRadiusScale } : flash;
      if (flash.emitter) {
        const paths = wide ? indirectPaths : flashPaths;
        const source = flash.source ?? flash;
        const { x, y } = flash.emitter;
        const reach = Math.max(Math.hypot(flash.to.x - x, flash.to.y - y), 40) + light.radius;
        let cached = paths.get(source);
        if (!cached || cached.reach !== reach || cached.x !== x || cached.y !== y) {
          cached = { x, y, reach, path: occlusionPath(flash.emitter, reach, boxes,
            wide || flash.opensFog ? 'front' : 'back', wide ? wallDepth : flash.opensFog ? 2 : 0) };
          paths.set(source, cached);
        }
        ctx.clip(cached.path);
      }
      for (let i = 0; i < (flash.passes ?? 1); i++) transientLight(ctx, light, wide);
      ctx.restore();
    }
  }

  function lightScene(ctx: CanvasRenderingContext2D, origin: Point, heading: number, camera: Box, boxes: Box[], lights: Light[], flashes: FlashLight[],
    flashlightOn = true, lamp = origin, captureIncident = false, directStrength = 1) {
    refresh(origin, boxes);
    const local = { origin, range: 39, amount: .52, color: '255,223,173' };
    const exposure = balance.indirect.inputExposure;
    if (captureIncident) {
      incident ??= surface(indirectSize.width, indirectSize.height, true);
      incident.globalCompositeOperation = 'source-over';
      incident.fillStyle = '#000'; incident.fillRect(0, 0, indirectSize.width, indirectSize.height);
      incident.globalCompositeOperation = 'lighter';
      incident.save(); projectLights(incident, camera);
      incident.globalAlpha = exposure;
      for (const light of lights) radialLight(incident, light, pathFor(light, boxes, 'incident'));
      ambientIncidentPath ??= occlusionPath(origin, 39, boxes, 'front', balance.indirect.wallDepth);
      radialLight(incident, local, ambientIncidentPath);
      paintFlashes(incident, flashes, boxes, 'bounce');
      incident.restore();
    }
    lighting.globalCompositeOperation = 'source-over';
    lighting.fillStyle = '#454f66'; lighting.fillRect(0, 0, width, height);
    lighting.globalCompositeOperation = 'lighter';
    lighting.save(); projectLights(lighting, camera);
    lighting.globalAlpha = directStrength;
    for (const light of lights) if (!light.reveals) radialLight(lighting, light, pathFor(light, boxes));
    radialLight(lighting, local, ambientPath);
    lighting.restore();

    if (flashlightOn) {
      const nextKey = `${lamp.x},${lamp.y}:${blockerKey}`;
      if (nextKey !== headlampKey) {
        headlampPath = occlusionPath(lamp, balance.beam.range, boxes, 'back');
        headlampKey = nextKey;
      }
      paintHeadlamp(beam, lamp, heading, camera, headlampPath);
      lighting.save();
      lighting.globalAlpha = directStrength;
      lighting.drawImage(beam.canvas, 0, 0);
      lighting.restore();
      if (captureIncident && incident) {
        incidentBeam ??= surface(indirectSize.width, indirectSize.height, true);
        paintHeadlamp(incidentBeam, lamp, heading, camera, headlampPath, headlampSurface(lamp, boxes));
        incident.save();
        incident.globalAlpha = exposure;
        incident.drawImage(incidentBeam.canvas, 0, 0);
        incident.restore();
      }
    }
    paintPeripheralShade(beam, origin, heading, camera, flashlightOn ? directStrength : 0);
    lighting.globalCompositeOperation = 'source-over';
    lighting.drawImage(beam.canvas, 0, 0);
    lighting.globalCompositeOperation = 'lighter';
    lighting.save(); projectLights(lighting, camera);
    lighting.globalAlpha = directStrength;
    for (const light of lights) {
      if (light.reveals) radialLight(lighting, light, pathFor(light, boxes));
    }
    paintFlashes(lighting, flashes, boxes);
    lighting.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(lighting.canvas, 0, 0, camera.width, camera.height);
    if (directStrength > 0 && terrainRelief) {
      const influence = (light: Light) => light.amount /
        (1 + Math.hypot(light.origin.x - origin.x, light.origin.y - origin.y) / light.range * 2);
      const nearby = lights.filter(light => light.amount > .07).sort((a, b) => influence(b) - influence(a)).slice(0, 3);
      for (const light of nearby) terrainRelief(ctx, camera, light, pathFor(light, boxes), directStrength);
      if (flashlightOn) terrainRelief(ctx, camera, {
        origin: lamp, range: balance.beam.range, heading, halfAngle: balance.beam.halfAngle,
        amount: balance.beam.intensity, elevation: 33, color: '248,239,214',
      }, headlampPath, directStrength);
    }
    ctx.globalAlpha *= directStrength;
    if (directStrength && flashes.some(flash => flash.spill)) {
      beam.clearRect(0, 0, width, height);
      beam.save(); projectLights(beam, camera);
      beam.globalCompositeOperation = 'lighter';
      paintFlashes(beam, flashes, boxes, 'spill');
      beam.restore();
      ctx.globalCompositeOperation = 'screen'; ctx.drawImage(beam.canvas, 0, 0, camera.width, camera.height);
    }
    if (directStrength && flashes.some(flash => flash.additive)) {
      // Preserve the muzzle's contribution after the 8-bit light map saturates under the headlamp.
      beam.clearRect(0, 0, width, height);
      beam.save(); projectLights(beam, camera);
      beam.globalCompositeOperation = 'lighter';
      paintFlashes(beam, flashes, boxes, 'emission');
      beam.restore();
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(beam.canvas, 0, 0, camera.width, camera.height);
    }
    ctx.restore();
    return captureIncident ? incident?.canvas : undefined;
  }

  function coverUnseen(ctx: CanvasRenderingContext2D, origin: Point, camera: Box, boxes: Box[], lights: Light[], pulses: readonly FlashLight[],
    display: Pick<HTMLCanvasElement, 'width' | 'height'>, pixelStep: number, maskIndirect = false, lamp?: Headlamp) {
    const viewColumns = Math.ceil(camera.width / cell) + 1, viewRows = Math.ceil(camera.height / cell) + 1;
    const rgbaStride = viewColumns * 4;
    if (current.canvas.width !== viewColumns || current.canvas.height !== viewRows) {
      current.canvas.width = viewColumns;
      current.canvas.height = viewRows;
      samples = new Uint8Array(viewColumns * viewRows);
      remembered = new Uint8Array(samples.length);
      fogKey = '';
    }
    const { width: canvasWidth, height: canvasHeight } = display;
    const gridWidth = Math.ceil(canvasWidth / pixelStep), gridHeight = Math.ceil(canvasHeight / pixelStep);
    if (!spanSamples || fog.canvas.width !== gridWidth || fog.canvas.height !== gridHeight) {
      for (const { canvas } of [fog, unknown]) { canvas.width = gridWidth; canvas.height = gridHeight; }
      fogPixels = fog.createImageData(gridWidth, gridHeight);
      unknownPixels = unknown.createImageData(gridWidth, gridHeight);
      fogAlpha = new Uint32Array(fogPixels.data.buffer);
      unknownAlpha = new Uint32Array(unknownPixels.data.buffer);
      spanSamples = new Int32Array(gridWidth);
      spanEnds = new Int32Array(gridWidth);
      ditherKey = '';
      flashMask = fogWithFlash = unknownWithFlash = undefined;
    }
    const offsetX = Math.floor(camera.x / cell), offsetY = Math.floor(camera.y / cell);
    const x0 = offsetX * cell, y0 = offsetY * cell;
    const reveals = lights.filter(light => light.reveals);
    const beamKey = lamp ? `${lamp.origin.x},${lamp.origin.y},${Math.round(lamp.heading * 160)}` : '';
    const nextKey = `${refresh(origin, boxes)}|${offsetX},${offsetY}|${reveals.map(light =>
      `${Math.round(light.origin.x / cell)},${Math.round(light.origin.y / cell)}`).join(';')}|${beamKey}`;
    const { range, feather, visibleLight, rememberedLight } = balance.sight;
    const memoryLight = .27 * rememberedLight / visibleLight;
    if (nextKey !== fogKey) {
      current.clearRect(0, 0, viewColumns, viewRows);
      current.save(); current.scale(1 / cell, 1 / cell); current.translate(-x0, -y0);
      current.fillStyle = '#fff'; current.fill(sightPath);
      current.fillStyle = '#f00';
      for (const light of reveals) {
        current.fill(pathFor(light, boxes, 'vision'));
      }
      if (lamp) {
        const { x, y } = lamp.origin;
        const { range, halfAngle } = balance.beam;
        const glow = current.createRadialGradient(x, y, range * .6, x, y, range);
        glow.addColorStop(0, '#f00'); glow.addColorStop(1, '#f000');
        current.save(); current.clip(headlampSurface(lamp.origin, boxes)); current.fillStyle = glow;
        current.beginPath(); current.moveTo(x, y);
        current.arc(x, y, range, lamp.heading - halfAngle, lamp.heading + halfAngle);
        current.closePath(); current.fill(); current.restore();
      }
      current.restore();
      const rays = current.getImageData(0, 0, viewColumns, viewRows).data;
      hasRememberedGround = false;
      const innerRangeSquared = (range - feather) ** 2;
      for (let y = 0; y < viewRows; y++) {
        const dy = (y + offsetY) * cell + 1 - origin.y;
        const dySquared = dy * dy;
        for (let x = 0; x < viewColumns; x++) {
          const sample = y * viewColumns + x;
          const index = sample * 4;
          const alpha = index + 3;
          const wx = x + offsetX, wy = y + offsetY;
          if (wx < 0 || wx >= columns || wy < 0 || wy >= rows) {
            samples[sample] = remembered[sample] = 0;
            continue;
          }
          const worldIndex = wy * columns + wx;
          const dx = wx * cell + 1 - origin.x;
          const threshold = (bayer[(wy & 3) * 4 + (wx & 3)] + .5) / 16;
          const center = rays[alpha];
          let visibility = 0;
          if (center) {
            const left = x >= edgeSample ? rays[alpha - edgeSample * 4] : center;
            const right = x < viewColumns - edgeSample ? rays[alpha + edgeSample * 4] : center;
            const top = y >= edgeSample ? rays[alpha - edgeSample * rgbaStride] : center;
            const bottom = y < viewRows - edgeSample ? rays[alpha + edgeSample * rgbaStride] : center;
            const edgeCoverage = (center * 2 + left + right + top + bottom) / (6 * 255);
            const distanceSquared = dx * dx + dySquared;
            const falloff = distanceSquared <= innerRangeSquared ? 1 : (range - Math.sqrt(distanceSquared)) / feather;
            const flare = (center - rays[index + 1]) / 255;
            visibility = Math.max(edgeCoverage * falloff, flare);
          }
          if (visibility > threshold) known[worldIndex] = 1;
          remembered[sample] = known[worldIndex];
          samples[sample] = Math.round(Math.max(0, Math.min(1, visibility)) * 16);
          if (remembered[sample] && samples[sample] < 16) hasRememberedGround = true;
        }
      }
      fogKey = nextKey;
      ditherKey = '';
    }
    const dotWidth = camera.width * pixelStep / canvasWidth, dotHeight = camera.height * pixelStep / canvasHeight;
    const nextDither = `${camera.x},${camera.y},${dotWidth},${dotHeight},${pixelStep},${canvasWidth},${canvasHeight}`;
    if (nextDither !== ditherKey) {
      // Sample the center of each output block, including any clipped block at the right or bottom edge.
      let spans = 0;
      for (let x = 0; x < gridWidth; x++) {
        const sample = Math.floor((camera.x + Math.min(x + .5, (canvasWidth / pixelStep + x) / 2) * dotWidth) / cell) - offsetX;
        if (spans === 0 || sample !== spanSamples[spans - 1]) spanSamples[spans++] = sample;
        spanEnds[spans - 1] = x + 1;
      }
      for (let y = 0; y < gridHeight; y++) {
        const worldY = camera.y + Math.min(y + .5, (canvasHeight / pixelStep + y) / 2) * dotHeight;
        const row = (Math.floor(worldY / cell) - offsetY) * viewColumns;
        const patternRow = (y & 3) * 4;
        const pixelRow = y * gridWidth;
        let from = 0;
        for (let span = 0; span < spans;) {
          const sample = row + spanSamples[span];
          const coverage = samples[sample], explored = remembered[sample];
          // Open and black areas normally cover most of each row. Fill whole runs and dither only the edges.
          let end = spanEnds[span++];
          while (span < spans) {
            const next = row + spanSamples[span];
            if (samples[next] !== coverage || remembered[next] !== explored) break;
            end = spanEnds[span++];
          }
          if (coverage === 0 || coverage === 16) {
            const alpha = coverage === 0 ? opaqueBlack : 0;
            fogAlpha.fill(alpha, pixelRow + from, pixelRow + end);
            if (hasRememberedGround) unknownAlpha.fill(explored ? 0 : alpha, pixelRow + from, pixelRow + end);
          } else {
            for (let x = from; x < end; x++) {
              const alpha = coverage <= bayer[patternRow + (x & 3)] ? opaqueBlack : 0;
              fogAlpha[pixelRow + x] = alpha;
              if (hasRememberedGround) unknownAlpha[pixelRow + x] = explored ? 0 : alpha;
            }
          }
          from = end;
        }
      }
      fog.putImageData(fogPixels, 0, 0);
      if (hasRememberedGround) unknown.putImageData(unknownPixels, 0, 0);
      ditherKey = nextDither;
    }
    if (pulses.length) {
      flashMask ??= surface(gridWidth, gridHeight, software);
      flashMask.clearRect(0, 0, gridWidth, gridHeight);
      flashMask.save(); flashMask.scale(1 / dotWidth, 1 / dotHeight); flashMask.translate(-camera.x, -camera.y);
      flashMask.globalCompositeOperation = 'lighter';
      paintFlashes(flashMask, pulses, boxes, maskIndirect ? 'bounce' : 'surface');
      flashMask.restore();
    }
    function frameMask(mask: CanvasRenderingContext2D) {
      if (!pulses.length || !flashMask) return mask.canvas;
      // A pulse only exposes the current frame and never changes the exploration grid.
      const result = mask === fog ? fogWithFlash ??= surface(gridWidth, gridHeight, software) : unknownWithFlash ??= surface(gridWidth, gridHeight, software);
      result.clearRect(0, 0, gridWidth, gridHeight);
      result.globalCompositeOperation = 'source-over';
      result.drawImage(mask.canvas, 0, 0);
      result.globalCompositeOperation = 'destination-out';
      result.drawImage(flashMask.canvas, 0, 0);
      return result.canvas;
    }
    const maskWidth = gridWidth * dotWidth, maskHeight = gridHeight * dotHeight;
    const fogImage = frameMask(fog);
    ctx.save();
    if (hasRememberedGround) {
      // Use the coarse grid only as a mask. Previously explored surfaces retain the same terrain detail.
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(fogImage, 0, 0, maskWidth, maskHeight);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.globalAlpha = memoryLight;
      drawGround(ctx, camera);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, camera.width, camera.height);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(hasRememberedGround ? frameMask(unknown) : fogImage, 0, 0, maskWidth, maskHeight);
    ctx.restore();
    if (maskIndirect) return { image: fogImage, width: maskWidth, height: maskHeight };
  }

  function addIndirect(ctx: CanvasRenderingContext2D, camera: Box, radiance: IndirectField, mask: IndirectMask, strength: number) {
    const { width: gridWidth, height: gridHeight } = mask.image;
    if (bounce?.canvas.width !== gridWidth || bounce.canvas.height !== gridHeight) bounce = surface(gridWidth, gridHeight, software);
    bounce.save();
    bounce.clearRect(0, 0, gridWidth, gridHeight);
    bounce.globalCompositeOperation = 'source-over';
    bounce.imageSmoothingEnabled = true;
    bounce.scale(gridWidth / mask.width, gridHeight / mask.height);
    const { view } = radiance;
    bounce.drawImage(radiance.image, view.x - camera.x, view.y - camera.y, view.width, view.height);
    bounce.resetTransform();
    bounce.globalCompositeOperation = 'destination-out';
    bounce.drawImage(mask.image, 0, 0);
    bounce.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bounce.canvas, 0, 0, mask.width, mask.height);
    ctx.restore();
  }

  function wasSeen(point: Point) {
    const x = Math.floor(point.x / cell), y = Math.floor(point.y / cell);
    return x >= 0 && x < columns && y >= 0 && y < rows && known[y * columns + x] === 1;
  }

  return { lightScene, coverUnseen, addIndirect, wasSeen };
}

export function visibleSurface(origin: Point, point: Point, boxes: Box[], ownBody?: Box, maxRange: number = balance.sight.range) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const range = Math.hypot(dx, dy);
  if (range < 1) return true;
  if (range >= maxRange) return false;
  return rayDistance(origin, dx / range, dy / range, range, ownBody ? boxes.filter(box => box !== ownBody) : boxes) >= range - .1;
}

export function flashlightLevel(origin: Point, heading: number, point: Point) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const range = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) - heading;
  const spread = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) / balance.beam.halfAngle;
  return balance.beam.intensity * Math.max(0, 1 - spread) * Math.max(0, 1 - range / balance.beam.range);
}

export function peripheralLight(origin: Point, heading: number, point: Point, flashlightOn = true) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const angle = Math.atan2(dy, dx) - heading;
  const offAxis = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
  const { range, peripheralFadeStart, peripheralFadeAngle, peripheralDarkness } = balance.sight;
  const angularShade = flashlightOn ? Math.min(1, Math.max(0, (offAxis - balance.beam.halfAngle) / peripheralFadeAngle)) : 1;
  const distanceShade = Math.min(1, Math.max(0, (Math.hypot(dx, dy) / range - peripheralFadeStart) / (1 - peripheralFadeStart)));
  return 1 - angularShade * distanceShade * peripheralDarkness;
}

function paintHeadlamp(ctx: CanvasRenderingContext2D, origin: Point, heading: number, camera: Box, clip: Path2D, wallSurface?: Path2D) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save(); projectLights(ctx, camera); ctx.clip(clip);
  if (wallSurface) ctx.clip(wallSurface);
  const spread = balance.beam.halfAngle / Math.PI;
  const cone = ctx.createConicGradient(heading - balance.beam.halfAngle, origin.x, origin.y);
  for (const [fraction, opacity] of [[0, 0], [.13, .22], [.3, .66], [.5, .98], [.7, .66], [.87, .22], [1, 0]]) {
    cone.addColorStop(fraction * spread, `rgba(248,239,214,${opacity * balance.beam.intensity})`);
  }
  cone.addColorStop(1, 'rgba(248,239,214,0)');
  ctx.fillStyle = cone;
  const r = balance.beam.range;
  ctx.fillRect(origin.x - r, origin.y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'destination-in';
  const falloff = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, r);
  falloff.addColorStop(0, '#fff'); falloff.addColorStop(.57, '#fffc'); falloff.addColorStop(1, '#fff0');
  ctx.fillStyle = falloff;
  ctx.fillRect(origin.x - r, origin.y - r, r * 2, r * 2);
  ctx.restore();
}

function paintPeripheralShade(ctx: CanvasRenderingContext2D, origin: Point, heading: number, camera: Box, directionStrength: number) {
  const { range, peripheralFadeStart, peripheralFadeAngle, peripheralDarkness } = balance.sight;
  ctx.clearRect(0, 0, width, height);
  ctx.save(); projectLights(ctx, camera);
  const distance = ctx.createRadialGradient(origin.x, origin.y, range * peripheralFadeStart, origin.x, origin.y, range);
  distance.addColorStop(0, 'rgba(0,0,0,0)');
  distance.addColorStop(1, `rgba(0,0,0,${peripheralDarkness})`);
  ctx.fillStyle = distance; ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  if (directionStrength > 0) {
    const front = balance.beam.halfAngle / TAU, transition = peripheralFadeAngle / TAU;
    const angle = ctx.createConicGradient(heading - Math.PI, origin.x, origin.y);
    const frontShade = `rgba(0,0,0,${1 - directionStrength})`;
    angle.addColorStop(0, '#000'); angle.addColorStop(.5 - front - transition, '#000');
    angle.addColorStop(.5 - front, frontShade); angle.addColorStop(.5 + front, frontShade);
    angle.addColorStop(.5 + front + transition, '#000'); angle.addColorStop(1, '#000');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = angle; ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  }
  ctx.restore();
}

function radialLight(ctx: CanvasRenderingContext2D, light: Light, path: Path2D) {
  const { origin, range, amount, color } = light;
  const gradient = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, range);
  gradient.addColorStop(0, `rgba(${color},${amount})`);
  if (light.reveals) {
    for (const stop of [.12, .25, .45, .68, .84]) {
      gradient.addColorStop(stop, `rgba(${color},${amount * flareFalloff(stop * range, range)})`);
    }
  } else gradient.addColorStop(.42, `rgba(${color},${amount * .71})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.save(); ctx.clip(path);
  ctx.fillStyle = gradient;
  if (light.heading === undefined || light.halfAngle === undefined) ctx.fillRect(origin.x - range, origin.y - range, range * 2, range * 2);
  else {
    ctx.globalAlpha *= .42;
    for (const fraction of [1, .76, .49]) {
      const angle = light.halfAngle * fraction;
      ctx.beginPath(); ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, range, light.heading - angle, light.heading + angle);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

export function distanceToLight(point: Point, from: Point, to: Point) {
  const x = to.x - from.x, y = to.y - from.y;
  const projection = ((point.x - from.x) * x + (point.y - from.y) * y) / (x * x + y * y || 1);
  const t = Math.max(0, Math.min(1, projection));
  return Math.hypot(point.x - from.x - t * x, point.y - from.y - t * y);
}

export function paintLightFan(ctx: CanvasRenderingContext2D, length: number, radius: number, color: string, amount: number) {
  const gradient = ctx.createLinearGradient(0, 0, length, 0);
  gradient.addColorStop(0, `rgba(${color},${amount * .65})`);
  gradient.addColorStop(.16, `rgba(${color},${amount})`);
  gradient.addColorStop(.56, `rgba(${color},${amount * .52})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  for (const [widthRatio, opacity] of [[1, .46], [.7, .7], [.39, .95]]) {
    const edge = radius * widthRatio;
    ctx.save(); ctx.globalAlpha *= opacity; ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(0, -edge * .18); ctx.quadraticCurveTo(length * .34, -edge * .49, length, -edge);
    ctx.lineTo(length, edge); ctx.quadraticCurveTo(length * .34, edge * .49, 0, edge * .18); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function transientLight(ctx: CanvasRenderingContext2D, light: FlashLight, wide: boolean) {
  const { from, to, color, radius, amount } = light;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1) return;
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x));
  if (light.spread) {
    paintLightFan(ctx, length, radius, color, amount);
  } else {
    const gradient = ctx.createLinearGradient(0, -radius, 0, radius);
    gradient.addColorStop(0, `rgba(${color},0)`);
    if (wide) gradient.addColorStop(.20, `rgba(${color},${amount * .66})`);
    gradient.addColorStop(.5, `rgba(${color},${amount})`);
    if (wide) gradient.addColorStop(.80, `rgba(${color},${amount * .66})`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = gradient;
    const cap = light.spill ? Math.min(radius, length / 2) : 4;
    ctx.beginPath(); ctx.roundRect(-3, -radius, length + 6, radius * 2, cap); ctx.fill();
  }
  ctx.restore();
}
