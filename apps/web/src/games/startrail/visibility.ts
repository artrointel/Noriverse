import { balance, rayDistance, screen, world } from './outpost.ts';
import type { Box, Point } from './outpost.ts';

const TAU = Math.PI * 2;
const { width, height } = screen;
const cell = 2;
const viewColumns = width / cell + 1;
const viewRows = height / cell + 1;
const edgeSample = 2;
const rgbaStride = viewColumns * 4;
const columns = world.width / cell;
const rows = world.height / cell;
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

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
  for (const box of neighbors) {
    for (const x of [box.x, box.x + box.width]) for (const y of [box.y, box.y + box.height]) {
      const angle = angleOf(origin, x, y);
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

type Light = { origin: Point; range: number; amount: number; color: string };

export function makeVisibility(drawGround: (ctx: CanvasRenderingContext2D, camera: Point) => void) {
  const known = new Uint8Array(columns * rows);
  const current = surface(viewColumns, viewRows, true);
  const fog = surface(viewColumns, viewRows);
  const unknown = surface(viewColumns, viewRows);
  const fogPixels = fog.createImageData(viewColumns, viewRows);
  const unknownPixels = unknown.createImageData(viewColumns, viewRows);
  const lighting = surface(width, height);
  const beam = surface(width, height);
  let key = '';
  let blockerKey = '';
  let playerPath: Path2D;
  let sightPath: Path2D;
  let fogKey = '';
  let hasRememberedGround = false;
  const fixturePaths = new Map<Point, Path2D>();

  function refresh(origin: Point, boxes: Box[]) {
    const geometry = boxes.map(box => `${box.x},${box.y},${box.width},${box.height}`).join(';');
    const signature = `${origin.x},${origin.y}:${geometry}`;
    if (geometry !== blockerKey) { fixturePaths.clear(); blockerKey = geometry; }
    if (signature !== key) {
      playerPath = occlusionPath(origin, balance.beam.range, boxes, 'back');
      sightPath = occlusionPath(origin, balance.sight.range, boxes, 'front', balance.sight.wallSurface);
      key = signature;
    }
    return key;
  }

  function lightScene(ctx: CanvasRenderingContext2D, origin: Point, heading: number, camera: Point, boxes: Box[], lights: Light[]) {
    refresh(origin, boxes);
    lighting.globalCompositeOperation = 'source-over';
    lighting.fillStyle = '#454f66'; lighting.fillRect(0, 0, width, height);
    lighting.globalCompositeOperation = 'lighter';
    lighting.save(); lighting.translate(-camera.x, -camera.y);
    for (const light of lights) {
      let path = fixturePaths.get(light.origin);
      if (!path) { path = occlusionPath(light.origin, light.range, boxes, 'back'); fixturePaths.set(light.origin, path); }
      radialLight(lighting, light, path);
    }
    radialLight(lighting, { origin, range: 39, amount: .52, color: '255,223,173' }, playerPath);
    lighting.restore();

    beam.clearRect(0, 0, width, height);
    beam.save(); beam.translate(-camera.x, -camera.y);
    beam.clip(playerPath);
    const spread = balance.beam.halfAngle / Math.PI;
    const cone = beam.createConicGradient(heading - balance.beam.halfAngle, origin.x, origin.y);
    for (const [fraction, opacity] of [[0, 0], [.13, .22], [.3, .66], [.5, .98], [.7, .66], [.87, .22], [1, 0]]) {
      cone.addColorStop(fraction * spread, `rgba(248,239,214,${opacity})`);
    }
    cone.addColorStop(1, 'rgba(248,239,214,0)');
    beam.fillStyle = cone;
    const r = balance.beam.range;
    beam.fillRect(origin.x - r, origin.y - r, r * 2, r * 2);
    beam.globalCompositeOperation = 'destination-in';
    const falloff = beam.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, r);
    falloff.addColorStop(0, '#fff'); falloff.addColorStop(.57, '#fffc'); falloff.addColorStop(1, '#fff0');
    beam.fillStyle = falloff;
    beam.fillRect(origin.x - r, origin.y - r, r * 2, r * 2);
    beam.restore();
    lighting.drawImage(beam.canvas, 0, 0);
    paintPeripheralShade(beam, origin, heading, camera);
    lighting.globalCompositeOperation = 'source-over';
    lighting.drawImage(beam.canvas, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(lighting.canvas, 0, 0); ctx.globalCompositeOperation = 'source-over';
  }

  function coverUnseen(ctx: CanvasRenderingContext2D, origin: Point, camera: Point, boxes: Box[]) {
    const offsetX = Math.floor(camera.x / cell), offsetY = Math.floor(camera.y / cell);
    const x0 = offsetX * cell, y0 = offsetY * cell;
    const nextKey = `${refresh(origin, boxes)}|${offsetX},${offsetY}`;
    const { range, feather, visibleLight, rememberedLight } = balance.sight;
    const memoryLight = .27 * rememberedLight / visibleLight;
    if (nextKey !== fogKey) {
      current.clearRect(0, 0, viewColumns, viewRows);
      current.save(); current.scale(1 / cell, 1 / cell); current.translate(-x0, -y0);
      current.fillStyle = '#fff'; current.fill(sightPath); current.restore();
      const rays = current.getImageData(0, 0, viewColumns, viewRows).data;
      const pixels = fogPixels.data, blackout = unknownPixels.data;
      hasRememberedGround = false;
      const innerRangeSquared = (range - feather) ** 2;
      for (let y = 0; y < viewRows; y++) {
        const dy = (y + offsetY) * cell + 1 - origin.y;
        const dySquared = dy * dy;
        for (let x = 0; x < viewColumns; x++) {
          const index = (y * viewColumns + x) * 4;
          const alpha = index + 3;
          const wx = x + offsetX, wy = y + offsetY;
          if (wx < 0 || wx >= columns || wy < 0 || wy >= rows) {
            pixels[alpha] = blackout[alpha] = 255;
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
            visibility = edgeCoverage * falloff;
          }
          if (visibility > threshold) {
            known[worldIndex] = 1;
            pixels[alpha] = blackout[alpha] = 0;
          } else {
            const visited = known[worldIndex] === 1;
            pixels[alpha] = 255;
            blackout[alpha] = visited ? 0 : 255;
            if (visited) hasRememberedGround = true;
          }
        }
      }
      fog.putImageData(fogPixels, 0, 0);
      unknown.putImageData(unknownPixels, 0, 0);
      fogKey = nextKey;
    }
    const maskX = x0 - camera.x, maskY = y0 - camera.y;
    ctx.save();
    if (hasRememberedGround) {
      // Use the coarse grid only as a mask. Previously explored surfaces retain the same terrain detail.
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(fog.canvas, maskX, maskY, viewColumns * cell, viewRows * cell);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.globalAlpha = memoryLight;
      drawGround(ctx, camera);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(unknown.canvas, maskX, maskY, viewColumns * cell, viewRows * cell);
    ctx.restore();
  }

  function wasSeen(point: Point) {
    const x = Math.floor(point.x / cell), y = Math.floor(point.y / cell);
    return x >= 0 && x < columns && y >= 0 && y < rows && known[y * columns + x] === 1;
  }

  return { lightScene, coverUnseen, wasSeen };
}

export function visibleSurface(origin: Point, point: Point, boxes: Box[], ownBody?: Box) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const range = Math.hypot(dx, dy);
  if (range < 1) return true;
  if (range >= balance.sight.range) return false;
  return rayDistance(origin, dx / range, dy / range, range, ownBody ? boxes.filter(box => box !== ownBody) : boxes) >= range - .1;
}

export function flashlightLevel(origin: Point, heading: number, point: Point) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const range = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) - heading;
  const spread = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) / balance.beam.halfAngle;
  return Math.max(0, 1 - spread) * Math.max(0, 1 - range / balance.beam.range);
}

export function peripheralLight(origin: Point, heading: number, point: Point) {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const angle = Math.atan2(dy, dx) - heading;
  const offAxis = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
  const { range, peripheralFadeStart, peripheralFadeAngle, peripheralDarkness } = balance.sight;
  const angularShade = Math.min(1, Math.max(0, (offAxis - balance.beam.halfAngle) / peripheralFadeAngle));
  const distanceShade = Math.min(1, Math.max(0, (Math.hypot(dx, dy) / range - peripheralFadeStart) / (1 - peripheralFadeStart)));
  return 1 - angularShade * distanceShade * peripheralDarkness;
}

function paintPeripheralShade(ctx: CanvasRenderingContext2D, origin: Point, heading: number, camera: Point) {
  const { range, peripheralFadeStart, peripheralFadeAngle, peripheralDarkness } = balance.sight;
  ctx.clearRect(0, 0, width, height);
  ctx.save(); ctx.translate(-camera.x, -camera.y);
  const distance = ctx.createRadialGradient(origin.x, origin.y, range * peripheralFadeStart, origin.x, origin.y, range);
  distance.addColorStop(0, 'rgba(0,0,0,0)');
  distance.addColorStop(1, `rgba(0,0,0,${peripheralDarkness})`);
  ctx.fillStyle = distance; ctx.fillRect(camera.x, camera.y, width, height);
  const front = balance.beam.halfAngle / TAU, transition = peripheralFadeAngle / TAU;
  const angle = ctx.createConicGradient(heading - Math.PI, origin.x, origin.y);
  angle.addColorStop(0, '#000'); angle.addColorStop(.5 - front - transition, '#000');
  angle.addColorStop(.5 - front, '#0000'); angle.addColorStop(.5 + front, '#0000');
  angle.addColorStop(.5 + front + transition, '#000'); angle.addColorStop(1, '#000');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = angle; ctx.fillRect(camera.x, camera.y, width, height);
  ctx.restore();
}

function radialLight(ctx: CanvasRenderingContext2D, light: Light, path: Path2D) {
  const { origin, range, amount, color } = light;
  const gradient = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, range);
  gradient.addColorStop(0, `rgba(${color},${amount})`);
  gradient.addColorStop(.42, `rgba(${color},${amount * .71})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.save(); ctx.clip(path);
  ctx.fillStyle = gradient; ctx.fillRect(origin.x - range, origin.y - range, range * 2, range * 2);
  ctx.restore();
}
