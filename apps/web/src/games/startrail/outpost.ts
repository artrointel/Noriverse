export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type EnemyKind = 'mite' | 'boar' | 'scout' | 'sentinel' | 'spore' | 'grub';
export type ExplorerKind = 'solori' | 'kommi';
export const explorerNames = { solori: '솔오리', kommi: '꼬미' } as const;
export type MapMode = 'off' | 'panel' | 'overlay';

export const screen = { width: 480, height: 270 };
export const defaultPixelStep = 2;
export const maxPixelStep = 5;
export const pulseLightDuration = .15;
export const tileSize = 48;
const columns = 36;
const rows = 28;
export const world = { width: columns * tileSize, height: rows * tileSize };

function grid(x: number, y: number): Point {
  return { x: x * tileSize, y: y * tileSize };
}

export const landing = grid(3.6, 23);
export const weaponPickups = [
  { ...grid(4.7, 23.65), weapon: 'eagle' },
  { ...grid(14.95, 21.78), weapon: 'ak' },
  { ...grid(24.42, 24.35), weapon: 'shotgun' },
  { ...grid(5.78, 23.8), weapon: 'medical' },
] as const;
export const relay = grid(18.5, 14);
export const relayAccess = grid(18.5, 14.65);
export const lift = grid(33.8, 12);
export const gate: Box = { ...grid(31.5, 11), width: 15, height: 2 * tileSize };
export const gateCenter = { x: gate.x + gate.width / 2, y: gate.y + gate.height / 2 };
export const crates = [grid(4.5, 22), grid(10.6, 22.5), grid(9, 18.5), grid(14.4, 24.2), grid(16.3, 13.2),
  grid(20.8, 15.8), grid(22.5, 22.6), grid(25, 24.9), grid(19.8, 5.55), grid(25.45, 11.15), grid(29.5, 12.5)];
export const crystals = [grid(1.45, 21.5), grid(2.5, 25.3), grid(8.4, 21.3), grid(6.1, 9.2), grid(10.35, 15.7),
  grid(15.5, 16.8), grid(18.6, 12.5), grid(22.6, 13.4), grid(25.6, 19.5), grid(14.9, 5.3), grid(23.45, 8.35), grid(32.6, 10.5)];
const guide = [landing, grid(14.7, 23), grid(14.7, 16.1), grid(18.5, 16.1), relayAccess];
export const cables = [guide, [relay, grid(22.5, 14.8), grid(26.5, 14.8), grid(26.5, 12), gateCenter, lift],
  [grid(14.7, 23), grid(23.8, 23)], [grid(8.8, 23), grid(8.8, 9.8), grid(4, 9.8)]];
export const caches = [grid(4.1, 9.5), grid(25.15, 23.75)];
export const landmarks = [
  { ...grid(6.15, 22), frame: 5 }, { ...grid(6.25, 8.55), frame: 4 }, { ...grid(12.3, 14.45), frame: 5 },
  { ...grid(17, 12.5), frame: 4 }, { ...grid(21.5, 16.5), frame: 5 }, { ...grid(16, 4.55), frame: 4 },
  { ...grid(24.35, 9.85), frame: 5 }, { ...grid(23.3, 25.35), frame: 4 }, { ...grid(25.5, 19), frame: 5 },
  { ...grid(28.6, 10.55), frame: 4 }, { ...grid(34.25, 10.55), frame: 5 },
];
export const interiorZones = [[14, 23, 12, 17], [14, 19, 4, 7], [22, 26, 22, 25], [29, 34, 10, 13]] as const;
export const isMetalFloor = (x: number, y: number) => interiorZones.some(([left, right, top, bottom]) => x >= left && x <= right && y >= top && y <= bottom);
export const patrols = [
  { ...grid(10.5, 23.35), kind: 'mite' }, { ...grid(14.9, 21), kind: 'mite' },
  { ...grid(8.5, 19.5), kind: 'grub' }, { ...grid(6.2, 9.8), kind: 'spore' },
  { ...grid(13.1, 14.7), kind: 'boar' }, { ...grid(22.9, 24), kind: 'grub' },
  { ...grid(20.9, 13.7), kind: 'scout' }, { ...grid(15.4, 6.1), kind: 'sentinel' },
  { ...grid(23.72, 7.8), kind: 'mite' }, { ...grid(24.5, 18.5), kind: 'spore' },
  { ...grid(27.6, 11.9), kind: 'scout' }, { ...grid(29.35, 11.5), kind: 'sentinel' },
  { ...grid(33.05, 11.05), kind: 'boar' },
] satisfies (Point & { kind: EnemyKind })[];
export const waves = [
  { at: .6, spawns: [{ ...grid(15.5, 15.35), kind: 'mite' }, { ...grid(21.7, 16.1), kind: 'spore' }] },
  { at: 4.5, spawns: [{ ...grid(22.8, 14.75), kind: 'scout' }, { ...grid(17, 12.8), kind: 'grub' }] },
  { at: 9, spawns: [{ ...grid(16, 15.5), kind: 'boar' }, { ...grid(21.5, 13), kind: 'mite' }] },
] satisfies { at: number; spawns: (Point & { kind: EnemyKind })[] }[];

const floorAreas = [
  [1, 6, 21, 25], [7, 13, 22, 23], [13, 16, 20, 24], [17, 21, 22, 23], [22, 26, 22, 25],
  [8, 9, 9, 21], [3, 8, 8, 10], [10, 13, 14, 15], [14, 15, 17, 20], [14, 23, 12, 17],
  [16, 17, 8, 11], [14, 19, 4, 7], [19, 23, 5, 6], [23, 24, 7, 12], [24, 29, 10, 12],
  [24, 26, 14, 15], [26, 27, 12, 14], [24, 25, 16, 19], [29, 31, 11, 12], [32, 34, 10, 13],
] as const;

export const floor = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) =>
  floorAreas.some(([left, right, top, bottom]) => col >= left && col <= right && row >= top && row <= bottom),
));

type MapEdge = { from: Point; to: Point; face: Point };
export const mapWallEdges: MapEdge[] = [];
for (const [y, row] of floor.entries()) for (const [x, open] of row.entries()) {
  if (!open) continue;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    if (floor[y + dy]?.[x + dx]) continue;
    const base = grid(x + (dx > 0 ? 1 : 0), y + (dy > 0 ? 1 : 0));
    for (let part = 0; part < 4; part++) {
      const size = tileSize / 4, start = part * size;
      const from = { x: base.x + Math.abs(dy) * start, y: base.y + Math.abs(dx) * start };
      const to = { x: from.x + Math.abs(dy) * size, y: from.y + Math.abs(dx) * size };
      mapWallEdges.push({ from, to, face: { x: (from.x + to.x) / 2 + dx * 4, y: (from.y + to.y) / 2 + dy * 4 } });
    }
  }
}

export const cliffs: Box[] = [];
// Only the cells that border a walkable tile need visible geometry and collision.
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < columns;) {
    const isEdge = (x: number) => x < columns && !floor[row][x] &&
      [row - 1, row, row + 1].some(y => [x - 1, x, x + 1].some(cx => floor[y]?.[cx]));
    if (!isEdge(col)) { col++; continue; }
    const first = col++;
    while (isEdge(col)) col++;
    cliffs.push({ ...grid(first, row), width: (col - first) * tileSize, height: tileSize });
  }
}

export const relayBody = { x: relay.x - 18, y: relay.y - 14, width: 36, height: 24 };
export const obstacles = [...cliffs, relayBody];

const rollDuration = .30 / .70;
export const balance = {
  player: { mass: 1, radius: 11, speed: 2.65, health: 100 },
  roll: { range: 74, duration: rollDuration, recovery: .43 },
  cometDash: { range: 86, duration: rollDuration, recovery: .43 },
  mite: { mass: .6, radius: 9, speed: 1.35, health: 2, damage: 7, impulse: 1.9 },
  boar: { mass: 2.5, radius: 16, speed: .82, health: 5, damage: 18, impulse: 4.6 },
  scout: { mass: .92, radius: 10, speed: 1.22, health: 3, damage: 10, impulse: 2.25 },
  sentinel: { mass: 1.95, radius: 14, speed: .75, health: 7, damage: 14, impulse: 3.2 },
  spore: { mass: .45, radius: 9, speed: 1.58, health: 2, damage: 10, impulse: 2 },
  grub: { mass: 1.35, radius: 12, speed: 1.02, health: 4, damage: 13, impulse: 3.3 },
  props: {
    crate: { hp: 4, width: 30, height: 30, mass: 1.65, anchored: false, color: '#adcad3' },
    crystal: { hp: 3, width: 22, height: 14, mass: 2, anchored: true, color: '#86ebff' },
  },
  relay: { radius: 31, puzzleSize: 4, defenseRadius: 135, duration: 13 },
  approachAggro: 154,
  defenseAggro: 255,
  attacks: {
    boar: { style: 'dash', range: 125, windup: .78, duration: .43, recovery: 1.1, speed: 5.6 },
    grub: { style: 'dash', range: 87, windup: .48, duration: .32, recovery: .95, speed: 4.8 },
    scout: { style: 'shot', accuracy: .86, range: 146, windup: .62, recovery: 1.48, keepDistance: 78, speed: 245, spread: [0] },
    sentinel: { style: 'shot', accuracy: .94, range: 175, windup: 1.05, recovery: 1.85, keepDistance: 110, speed: 205, spread: [-.12, 0, .12] },
    spore: { style: 'burst', range: 42, windup: .55, recovery: 1.15, radius: 52 },
  },
  fallen: { collapse: .37, duration: 1.25 },
  beam: { range: 223, halfAngle: .87, unlitEnemyOpacity: .10 },
  turretBeam: { range: 188, halfAngle: .13, amount: .57, elevation: 24 },
  indirect: { inputExposure: .45, albedoFloor: .50, gain: 5.4, wallResponse: .84,
    flashRadiusScale: 3.8, wallDepth: 12, flashRefreshMs: 55 },
  sight: {
    range: 197, feather: 30, wallSurface: 16, visibleLight: .70, rememberedLight: .50,
    peripheralFadeStart: .18, peripheralFadeAngle: .42, peripheralDarkness: .64,
  },
} as const;

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function onRay(origin: Point, heading: number, length: number): Point {
  return { x: origin.x + Math.cos(heading) * length, y: origin.y + Math.sin(heading) * length };
}

export function rayDistance(origin: Point, dx: number, dy: number, limit: number, boxes: readonly Box[], edge: 'front' | 'back' = 'front') {
  const ix = 1 / (dx || 1e-10);
  const iy = 1 / (dy || 1e-10);
  let nearest = limit, depth = limit;
  for (const box of boxes) {
    const x1 = (box.x - origin.x) * ix, x2 = (box.x + box.width - origin.x) * ix;
    const y1 = (box.y - origin.y) * iy, y2 = (box.y + box.height - origin.y) * iy;
    const entry = Math.max(Math.min(x1, x2), Math.min(y1, y2));
    const exit = Math.min(Math.max(x1, x2), Math.max(y1, y2));
    if (entry <= exit && entry >= 0 && entry < nearest) {
      nearest = entry;
      depth = Math.min(exit, limit);
    }
  }
  return edge === 'back' ? depth : nearest;
}
