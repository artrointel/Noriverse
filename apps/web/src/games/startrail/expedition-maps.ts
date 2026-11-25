import * as outpost from './outpost.ts';
import type { Box, EnemyKind, Point } from './outpost.ts';
import type { Weapon } from './gear.ts';
import { buildTerrainGeometry, insideTerrain } from './terrain.ts';

type TileMaterial = { cell: number; xSign: number; ySign: number };
export type TileDetail = Point & { kind: 'fracture' | 'shards' | 'grate' | 'plate'; angle: number };
export type Patrol = Point & { kind: EnemyKind };
type World = { width: number; height: number };
type StageMap = {
  id: '1-1' | '1-2'; title: string; world: World; floor: readonly (readonly boolean[])[];
  terrainOutlines: readonly (readonly Point[])[]; mapWallEdges: ReturnType<typeof buildTerrainGeometry>['edges'];
  walkable(point: Point): boolean; obstacles: readonly Box[];
  landing: Point; lift: Point; relay: Point; relayAccess: Point; relayBody: Box; gate: Box; gateCenter: Point;
  cables: Point[][]; tileDetails: readonly TileDetail[]; landmarks: readonly (Point & { frame: number })[];
  crates: readonly Point[]; crystals: readonly Point[]; caches: readonly Point[]; patrols: readonly Patrol[];
  weaponPickups: readonly (Point & { weapon: Weapon })[]; material(column: number, row: number): TileMaterial;
  outsideMaterial?(column: number, row: number): TileMaterial;
  atlasColumns: number;
};

const { tileSize } = outpost;
const grid = (x: number, y: number): Point => ({ x: x * tileSize, y: y * tileSize });
const variation = (cell: number, column: number, row: number) => ({ cell, xSign: column % 2 ? -1 : 1, ySign: row % 2 ? -1 : 1 });

export const outpostStage: StageMap = {
  ...outpost, id: '1-1', title: '지표 중계소', atlasColumns: 2,
  material(column, row) {
    return outpost.isMetalFloor(column, row) ? { cell: 1, xSign: 1, ySign: 1 } : variation(0, column, row);
  },
};

const columns = 42, rows = 31;
type Zone = readonly [left: number, right: number, top: number, bottom: number];
const zones: readonly Zone[] = [
  [1, 7, 21, 27], [7, 13, 23, 25], [9, 12, 12, 23], [10, 24, 10, 13], [14, 19, 7, 9],
  [23, 25, 13, 17], [12, 17, 24, 27], [17, 20, 21, 25], [20, 22, 19, 23], [13, 16, 28, 29],
  [21, 29, 16, 21], [25, 28, 14, 15], [29, 32, 18, 20], [32, 36, 16, 22], [33, 35, 11, 16],
  [31, 36, 7, 11], [37, 38, 9, 10], [39, 40, 7, 12], [28, 31, 8, 9],
];
const within = (zone: Zone, x: number, y: number) => x >= zone[0] && x <= zone[1] && y >= zone[2] && y <= zone[3];
const floor = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => zones.some(zone => within(zone, column, row))));
const { outlines: terrainOutlines, walls, edges: mapWallEdges } = buildTerrainGeometry(floor, tileSize, [
  { ...grid(1, 21), cut: 66 }, { ...grid(8, 28), cut: 57 }, { ...grid(9, 12), cut: 58 }, { ...grid(14, 7), cut: 57 },
  { ...grid(25, 10), cut: 62 }, { ...grid(13, 30), cut: 61 }, { ...grid(24, 22), cut: 54 }, { ...grid(32, 23), cut: 62 },
  { ...grid(37, 7), cut: 58 }, { ...grid(41, 13), cut: 55 },
]);
const landing = grid(3.7, 24), lift = grid(39.9, 10), relay = grid(34.5, 19.2), relayAccess = grid(34.5, 19.85);
const relayBody = { x: relay.x - 18, y: relay.y - 14, width: 36, height: 24 };
const gate: Box = { ...grid(37.55, 9), width: 15, height: 2 * tileSize };
const gateCenter = { x: gate.x + gate.width / 2, y: gate.y + gate.height / 2 };
const shelter = grid(27.5, 15.3);
const emergencyRoute = [shelter, grid(27.5, 19.5), grid(33.8, 19.5), grid(33.8, 10.2), gateCenter, lift];

const accents: readonly [number, number, TileDetail['kind'], number][] = [
  [3.2, 23.4, 'plate', 0], [6.2, 25.9, 'grate', 0], [10.2, 21.5, 'grate', 1.57], [11.75, 17.7, 'plate', 1.57],
  [12.2, 11.5, 'plate', 0], [15.2, 8.7, 'grate', 1.57], [17.4, 10.8, 'grate', 0], [20.6, 12.8, 'plate', 0],
  [24.3, 15.2, 'grate', 1.57], [12.5, 26.6, 'shards', .45], [14.1, 28.6, 'fracture', -.53], [16.3, 25.2, 'shards', .8],
  [17.9, 24.8, 'fracture', -.2], [19.1, 22.2, 'shards', .35], [20.3, 21.2, 'fracture', 1.1], [22.75, 19.5, 'shards', .23],
  [25.3, 16.6, 'plate', 0], [27.3, 18.1, 'grate', 1.57], [29.7, 19.2, 'plate', 0], [31.6, 20.4, 'grate', 0],
  [32.8, 21.1, 'grate', 1.57], [35.9, 17.2, 'plate', 1.57], [33.5, 14.3, 'grate', 1.57], [34.5, 11.35, 'plate', 0],
  [30.4, 9.4, 'plate', 1.57], [32.9, 8.25, 'grate', 0], [36.4, 10.1, 'plate', 0], [39.85, 11.25, 'grate', 0],
];

export const observatoryStage = {
  id: '1-2', title: '얼음 아래 관측소', world: { width: columns * tileSize, height: rows * tileSize }, atlasColumns: 4,
  floor, terrainOutlines, mapWallEdges, obstacles: [...walls, relayBody], walkable: point => insideTerrain(point, terrainOutlines),
  landing, lift, relay, relayAccess, relayBody, gate, gateCenter, shelter, emergencyRoute,
  cables: [[landing, grid(10.8, 24.2), grid(10.8, 11.8), grid(24, 11.8), grid(24, 18.7), grid(27.5, 18.7), shelter],
    [grid(10.8, 24.2), grid(18.8, 25.1), grid(18.8, 22), grid(21.6, 22), grid(21.6, 19.5), grid(27.5, 19.5)], emergencyRoute],
  alertReinforcements: ['grub', 'mite', 'scout'],
  tileDetails: accents.map(([x, y, kind, angle]) => ({ ...grid(x, y), kind, angle })),
  landmarks: [[6.6, 21.75, 5], [10.4, 15.1, 4], [16.9, 7.8, 5], [21.7, 11.25, 4], [14.6, 28.8, 5], [20.4, 23.3, 5],
    [25.9, 15.5, 4], [27.6, 16.25, 5], [32.35, 17.1, 4], [35.9, 16.8, 5], [31.4, 8.8, 4], [39.6, 8.2, 5]]
    .map(([x, y, frame]) => ({ ...grid(x, y), frame })),
  crates: [grid(7.6, 25.4), grid(11.55, 15.9), grid(19.4, 11.25), grid(23.7, 14.2), grid(26.2, 20.85), grid(31.15, 20.3), grid(36.15, 21.15), grid(35.75, 8.2)],
  crystals: [grid(5.8, 22.2), grid(11.8, 21.55), grid(14.6, 26.85), grid(17.8, 24.25), grid(22.45, 20.75), grid(23.2, 17.15), grid(30.4, 8.8)],
  caches: [grid(5.2, 23.6), grid(16.8, 8.6), grid(14.6, 28.45), grid(28.5, 16.7)],
  weaponPickups: [{ ...grid(17.4, 9.15), weapon: 'medical' }, { ...grid(15.15, 26.9), weapon: 'shotgun' }],
  patrols: [{ ...grid(10.95, 18.5), kind: 'mite' }, { ...grid(13.5, 12.2), kind: 'scout' }, { ...grid(18.55, 11.5), kind: 'sentinel' },
    { ...grid(23.35, 12), kind: 'scout' }, { ...grid(15.2, 25.7), kind: 'grub' }, { ...grid(14.95, 28.9), kind: 'spore' },
    { ...grid(18.5, 22.8), kind: 'boar' }, { ...grid(22.25, 21.05), kind: 'mite' }, { ...grid(23.15, 17.4), kind: 'spore' },
    { ...grid(28.55, 19.9), kind: 'mite' }, { ...grid(34.15, 16.85), kind: 'sentinel' }, { ...grid(33.9, 10.15), kind: 'grub' },
    { ...grid(35.6, 9.5), kind: 'scout' }],
  material(x, y) {
    if (within([25, 28, 14, 16], x, y)) return { cell: 6, xSign: 1, ySign: 1 };
    if (within([32, 36, 16, 22], x, y)) return { cell: 3, xSign: 1, ySign: 1 };
    if (within([9, 25, 10, 14], x, y) || within([33, 38, 9, 16], x, y)) return { cell: 7, xSign: 1, ySign: 1 };
    if (within([1, 8, 21, 27], x, y) || within([22, 32, 16, 20], x, y) || x >= 31 && y <= 11) return { cell: 2, xSign: 1, ySign: 1 };
    return variation(x >= 13 && y >= 21 ? 1 : 0, x, y);
  },
  outsideMaterial(x, y) {
    return variation((x * 11 + y * 17) % 7 < 2 ? 5 : 4, x, y);
  },
} satisfies StageMap & { shelter: Point; emergencyRoute: Point[]; alertReinforcements: EnemyKind[] };

export type ExpeditionMap = typeof outpostStage | typeof observatoryStage;
