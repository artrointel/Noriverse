import { tileSize } from './outpost.ts';
import type { Box } from './outpost.ts';
import { outpostStage } from './expedition-maps.ts';
import type { ExpeditionMap, TileDetail } from './expedition-maps.ts';
import { surface } from './visibility.ts';
import type { Light } from './visibility.ts';
import { createReliefShader } from './terrain-relief-gl.ts';

export const terrainTextureScale = 2;
const reliefContrast = .5;
const slopeGain = .032;

function encodeNormal(data: Uint8ClampedArray, i: number, nx: number, ny: number) {
  const z = 1 / Math.sqrt(1 + nx * nx + ny * ny);
  data[i] = 128 + nx * z * 127;
  data[i + 1] = 128 + ny * z * 127;
  data[i + 2] = z * 255;
}

export function bakeTileNormals(tiles: HTMLImageElement, atlasColumns = 2, metalCells = atlasColumns === 2 ? [1] : [2, 3, 6, 7]) {
  const { naturalWidth: width, naturalHeight: height } = tiles;
  const side = width / atlasColumns;
  const atlas = surface(width, height, true);
  atlas.drawImage(tiles, 0, 0);
  const normals = atlas.getImageData(0, 0, width, height);
  const heights = new Uint8ClampedArray(width * height);
  const span = Math.max(1, Math.round(side / tileSize));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const luma = normals.data[i] * .2126 + normals.data[i + 1] * .7152 + normals.data[i + 2] * .0722;
    const u = x % side, v = y % side;
    const material = Math.floor(y / side) * atlasColumns + Math.floor(x / side);
    const metal = metalCells.includes(material);
    const seam = Math.min(u, v, side - u - 1, side - v - 1) < span;
    heights[y * width + x] = 126 + (luma - 80) * (metal ? .42 : .8) - (metal && seam ? 23 : 0);
  }
  for (let y = 0; y < height; y++) {
    const first = y - y % side;
    const above = Math.max(first, y - span) * width, below = Math.min(first + side - 1, y + span) * width;
    for (let x = 0; x < width; x++) {
      const start = x - x % side;
      const left = Math.max(start, x - span), right = Math.min(start + side - 1, x + span);
      const dx = (heights[y * width + left] - heights[y * width + right]) * slopeGain;
      const dy = (heights[above + x] - heights[below + x]) * slopeGain;
      encodeNormal(normals.data, (y * width + x) * 4, dx, dy);
    }
  }
  atlas.putImageData(normals, 0, 0);
  return atlas.canvas;
}

export function blendTileBoundaries(image: ImageData, floor: readonly (readonly boolean[])[], open: boolean) {
  const { width, data } = image;
  const size = tileSize * terrainTextureScale;
  const span = 7 * terrainTextureScale;
  const weights = Array.from({ length: span }, (_, i) => {
    const t = 1 - (i + .5) / span;
    return .5 * t * t * (3 - 2 * t);
  });
  function mix(a: number, b: number, amount: number) {
    if (!data[a + 3] || !data[b + 3]) return;
    for (let c = 0; c < 3; c++) {
      const x = data[a + c], y = data[b + c];
      data[a + c] = x + (y - x) * amount;
      data[b + c] = y + (x - y) * amount;
    }
  }
  for (let row = 0; row < floor.length; row++) for (let column = 1; column < floor[row].length; column++) {
    if (floor[row][column - 1] !== open || floor[row][column] !== open) continue;
    const seam = column * size;
    for (let y = row * size; y < (row + 1) * size; y++) {
      const center = y * width + seam;
      for (let i = 0; i < span; i++) mix((center - 1 - i) * 4, (center + i) * 4, weights[i]);
    }
  }
  for (let row = 1; row < floor.length; row++) for (let column = 0; column < floor[row].length; column++) {
    if (floor[row - 1][column] !== open || floor[row][column] !== open) continue;
    const seam = row * size;
    for (let i = 0; i < span; i++) {
      const above = (seam - 1 - i) * width, below = (seam + i) * width;
      for (let x = column * size; x < (column + 1) * size; x++) mix((above + x) * 4, (below + x) * 4, weights[i]);
    }
  }
}

function face(ctx: CanvasRenderingContext2D, points: readonly (readonly [number, number])[], fill: string) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

export function drawTileDetail(color: CanvasRenderingContext2D, height: CanvasRenderingContext2D, detail: TileDetail) {
  for (const ctx of [color, height]) { ctx.save(); ctx.translate(detail.x, detail.y); ctx.rotate(detail.angle); }
  if (detail.kind === 'fracture') {
    const cracks = [[[-16, -4], [-8, -1], [-2, -4], [5, 3], [16, 8]], [[-2, -4], [2, -9], [9, -13]], [[5, 3], [2, 9], [-3, 13]]] as const;
    for (const points of cracks) {
      for (const [ctx, stroke, width] of [[color, '#78aac37a', 2.6], [height, '#585858', 3]] as const) {
        ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
        for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
        ctx.stroke();
      }
      color.strokeStyle = '#182d47'; color.lineWidth = 1.2; color.stroke();
    }
  } else if (detail.kind === 'shards') {
    for (const [x, y, size] of [[-10, 3, 4], [-1, -5, 5.5], [8, 2, 6], [11, -6, 3.5], [1, 7, 3]] as const) {
      color.fillStyle = '#0a192b80'; color.beginPath(); color.ellipse(x + 1.6, y + 1.3, size, size * .6, 0, 0, Math.PI * 2); color.fill();
      face(color, [[x - size, y], [x - size * .15, y - size], [x + size, y - 1], [x + size * .38, y + size * .68]], '#416f8f');
      face(color, [[x - size, y], [x - size * .15, y - size], [x + size, y - 1], [x, y + 1]], '#80bed3');
      face(height, [[x - size, y], [x - size * .15, y - size], [x + size, y - 1], [x + size * .38, y + size * .68]], '#bcbcbc');
      face(height, [[x - size * .7, y], [x - size * .15, y - size * .72], [x + size * .65, y - 1], [x, y + .6]], '#e2e2e2');
    }
  } else {
    const grate = detail.kind === 'grate';
    for (const [ctx, bottom, metal] of [[color, '#142238', '#617981'], [height, '#535353', '#a1a1a1']] as const) {
      ctx.beginPath(); ctx.roundRect(-15, -9, 30, 18, 3);
      ctx.fillStyle = bottom; ctx.fill();
      ctx.beginPath(); ctx.roundRect(-13, -7, 26, 14, 2);
      ctx.fillStyle = metal; ctx.fill();
    }
    if (grate) {
      for (let i = -10; i <= 10; i += 4) {
        color.fillStyle = '#202e3f'; color.fillRect(i, -5, 2, 10);
        height.fillStyle = '#494949'; height.fillRect(i, -5, 2, 10);
      }
    } else {
      color.strokeStyle = '#263b50'; color.lineWidth = 1; color.strokeRect(-9, -4, 18, 8);
      height.strokeStyle = '#686868'; height.lineWidth = 1.5; height.strokeRect(-9, -4, 18, 8);
      color.fillStyle = '#b5a372'; color.fillRect(-4, -1, 8, 2);
    }
    for (const x of [-11, 11]) for (const y of [-5, 5]) {
      color.fillStyle = '#b2c5ca'; color.fillRect(x - .75, y - .75, 1.5, 1.5);
      height.fillStyle = '#d6d6d6'; height.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  color.restore(); height.restore();
}

function bakeTerrainNormals(tiles: CanvasRenderingContext2D, details: CanvasRenderingContext2D, material: ExpeditionMap['material']) {
  const { width, height } = tiles.canvas;
  const normals = tiles.getImageData(0, 0, width, height);
  const { data } = normals;
  const relief = details.getImageData(0, 0, width, height).data;
  const cell = tileSize * terrainTextureScale;
  const stride = width * 4;
  const elevation = (i: number) => 126 + (relief[i] - 126) * (relief[i + 3] / 255);
  for (let row = 0; row < height / cell; row++) for (let column = 0; column < width / cell; column++) {
    const { xSign, ySign } = material(column, row);
    const xEnd = Math.min(width - 1, (column + 1) * cell), yEnd = Math.min(height - 1, (row + 1) * cell);
    for (let y = Math.max(1, row * cell); y < yEnd; y++) for (let x = Math.max(1, column * cell); x < xEnd; x++) {
      const i = y * stride + x * 4;
      if (!data[i + 3] && !relief[i + 3]) continue;
      // The tile transform mirrors positions; the encoded normal still needs the same direction flip.
      if (data[i + 3]) {
        if (xSign < 0) data[i] = 256 - data[i];
        if (ySign < 0) data[i + 1] = 256 - data[i + 1];
      }
      if (!(relief[i + 3] || relief[i - 1] || relief[i + 7] || relief[i - stride + 3] || relief[i + stride + 3])) continue;
      const tileWeight = data[i + 3] ? 255 / (127 * Math.max(1, data[i + 2])) : 0;
      const dx = (data[i] - 128) * tileWeight + (elevation(i - 4) - elevation(i + 4)) * slopeGain;
      const dy = (data[i + 1] - 128) * tileWeight + (elevation(i - stride) - elevation(i + stride)) * slopeGain;
      encodeNormal(data, i, dx, dy);
      data[i + 3] = Math.max(data[i + 3], relief[i + 3]);
    }
  }
  return normals;
}

type ReliefRaster = { layer: CanvasRenderingContext2D; pixels: ImageData; packed: Uint32Array; key?: string };
const littleEndian = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1;
const alphaShift = littleEndian ? 24 : 0;
const white = littleEndian ? 0x00ffffff : 0xffffff00;

function makeRaster(width: number, height: number): ReliefRaster {
  const layer = surface(width, height, true);
  const pixels = layer.createImageData(width, height);
  return { layer, pixels, packed: new Uint32Array(pixels.data.buffer) };
}

export function createTerrainRelief(tiles: CanvasRenderingContext2D, details: CanvasRenderingContext2D, material = outpostStage.material,
  blendFloor?: readonly (readonly boolean[])[]) {
  const normals = bakeTerrainNormals(tiles, details, material);
  if (blendFloor) blendTileBoundaries(normals, blendFloor, true);
  const { width: columns, height: rows, data: normal } = normals;
  const scale = terrainTextureScale;
  let shader: ReturnType<typeof createReliefShader> | null;
  const stationary = new WeakMap<Light['origin'], ReliefRaster>();
  let scratch: ReliefRaster | undefined;

  function shadeOnCanvas(bounds: Box, light: Light & { elevation?: number }, power: number, ax: number, ay: number, cone: number, rasterScale: number) {
    const { origin, range, heading } = light;
    const minX = bounds.x, minY = bounds.y, maxX = minX + bounds.width, maxY = minY + bounds.height;
    const z = light.elevation ?? 33;
    const key = `${minX}/${minY}/${maxX}/${maxY}/${origin.x}/${origin.y}/${range}/${heading}/${cone}/${z}/${power}`;
    let raster: ReliefRaster;
    if (light.stationary) {
      const previous = stationary.get(origin);
      raster = previous?.pixels.width === bounds.width && previous.pixels.height === bounds.height ? previous : makeRaster(bounds.width, bounds.height);
      stationary.set(origin, raster);
    } else {
      if (!scratch || scratch.pixels.width < bounds.width || scratch.pixels.height < bounds.height) {
        const width = Math.max(scratch?.pixels.width ?? 0, Math.ceil(bounds.width / 64) * 64);
        const height = Math.max(scratch?.pixels.height ?? 0, Math.ceil(bounds.height / 64) * 64);
        scratch = makeRaster(width, height);
      }
      raster = scratch;
    }
    const { layer, pixels, packed } = raster;
    if (raster.key === key) return layer.canvas;
    const range2 = range * range, z2 = z * z;
    const cone2 = cone * cone;
    const sourceSpacing = scale / rasterScale;
    for (let y = minY; y < maxY; y++) {
      const dy = origin.y - (y + .5) / rasterScale, dy2 = dy * dy;
      const outputRow = (y - minY) * pixels.width;
      const normalRow = Math.floor((y + .5) * sourceSpacing) * columns;
      packed.fill(0, outputRow, outputRow + bounds.width);
      for (let x = minX; x < maxX; x++) {
        const id = (normalRow + Math.floor((x + .5) * sourceSpacing)) * 4;
        const nz = normal[id + 2];
        if (!normal[id + 3] || nz === 255 && normal[id] === 128 && normal[id + 1] === 128) continue;
        const dx = origin.x - (x + .5) / rasterScale;
        const length2 = dx * dx + dy2;
        if (length2 >= range2) continue;
        const forward = -dx * ax - dy * ay;
        if (heading !== undefined && cone > 0 && (forward < 0 || forward * forward < length2 * cone2)) continue;
        const length = Math.sqrt(length2);
        const spread = heading === undefined ? 1 : (forward / (length || 1) - cone) / (1 - cone);
        if (spread <= 0) continue;
        const nx = (normal[id] - 128) / 127, ny = (normal[id + 1] - 128) / 127;
        const diffuse = (nx * dx + ny * dy + (nz / 255 - 1) * z) / Math.sqrt(length2 + z2);
        const opacity = Math.min(.72, Math.abs(diffuse) * (1 - length / range) * spread * power) * normal[id + 3] * reliefContrast;
        packed[outputRow + x - minX] = (Math.round(opacity) << alphaShift) | (diffuse > 0 ? white : 0);
      }
    }
    layer.putImageData(pixels, 0, 0, 0, 0, bounds.width, bounds.height);
    raster.key = key;
    return layer.canvas;
  }

  function paintRelief(target: CanvasRenderingContext2D, view: Box, light: Light & { elevation?: number }, clip: Path2D, strength: number) {
    const { origin, range, heading, halfAngle } = light;
    const ax = Math.cos(heading ?? 0), ay = Math.sin(heading ?? 0);
    const angle = halfAngle ?? Math.PI;
    const cone = Math.cos(angle), sine = Math.sin(angle);
    const extent = (dot: number) => heading === undefined || dot >= cone ? range :
      range * Math.max(0, dot * cone + Math.sqrt(Math.max(0, 1 - dot * dot)) * sine);
    // The camera crops a world-aligned material. One texel of padding keeps filtering continuous at the crop edges.
    const left = Math.max(0, Math.floor((origin.x - extent(-ax)) * scale) - 1);
    const top = Math.max(0, Math.floor((origin.y - extent(-ay)) * scale) - 1);
    const right = Math.min(columns, Math.ceil((origin.x + extent(ax)) * scale) + 1);
    const bottom = Math.min(rows, Math.ceil((origin.y + extent(ay)) * scale) + 1);
    const minX = Math.max(left, Math.floor(view.x * scale) - 1), minY = Math.max(top, Math.floor(view.y * scale) - 1);
    const width = Math.min(right, Math.ceil((view.x + view.width) * scale) + 1) - minX;
    const height = Math.min(bottom, Math.ceil((view.y + view.height) * scale) + 1) - minY;
    if (width <= 0 || height <= 0) return;
    const bounds = { x: minX, y: minY, width, height };
    const power = light.amount * strength * 3.9;
    let sourceX = 0, sourceY = 0, reduction = 1;
    if (!light.stationary && shader === undefined) shader = createReliefShader(normals, scale, reliefContrast) ?? null;
    let image = light.stationary ? undefined : shader?.paint(bounds, light, power, ax, ay, cone);
    if (!image) {
      // Keep moving lights on the world grid. A software rasterizer only needs one lighting sample per world pixel.
      const x = Math.floor(minX / scale), y = Math.floor(minY / scale);
      const rasterBounds = light.stationary ? { x: left, y: top, width: right - left, height: bottom - top } :
        { x, y, width: Math.ceil((minX + width) / scale) - x, height: Math.ceil((minY + height) / scale) - y };
      reduction = light.stationary ? 1 : scale;
      image = shadeOnCanvas(rasterBounds, light, power, ax, ay, cone, scale / reduction);
      sourceX = minX / reduction - rasterBounds.x;
      sourceY = minY / reduction - rasterBounds.y;
    }
    target.save(); target.translate(-view.x, -view.y); target.clip(clip);
    target.globalCompositeOperation = 'soft-light';
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = 'low';
    target.drawImage(image, sourceX, sourceY, width / reduction, height / reduction, minX / scale, minY / scale, width / scale, height / scale);
    target.restore();
  }
  return Object.assign(paintRelief, { dispose: () => shader?.dispose() });
}

export type TerrainRelief = ReturnType<typeof createTerrainRelief>;
