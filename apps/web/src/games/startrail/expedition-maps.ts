import * as outpost from './outpost.ts';
import type { Box, EnemyKind, Point } from './outpost.ts';
import type { Weapon } from './gear.ts';
import { buildTerrainGeometry, insideTerrain } from './terrain.ts';

type TileMaterial = { cell: number; xSign: number; ySign: number };
export type TileDetail = Point & { kind: 'fracture' | 'shards' | 'grate' | 'plate'; angle: number };
export type Patrol = Point & { kind: EnemyKind };
export type StageId = '1-1' | '1-2' | '1-3' | '1-4';
export type TerrainPatch = Box & { theme: 'greenhouse' | 'salvage' | 'observation' };
export type StageStation = Point & { kind: 'antenna' | TerrainPatch['theme']; name: string; required: boolean; bounds: Box };
export type StageScenery = Point & { frame: number; size: number; bounds: Box };
type World = { width: number; height: number };
type StageMap<Id extends StageId> = {
  id: Id; title: string; titleEn: string; world: World; floor: readonly (readonly boolean[])[];
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

function station(x: number, y: number, kind: StageStation['kind'], name: string, required = true): StageStation {
  const point = grid(x, y);
  return { ...point, kind, name, required, bounds: { x: point.x - 14, y: point.y - 12, width: 28, height: 24 } };
}

export function requiredStationsRemaining(stations: readonly StageStation[], completed: ReadonlySet<StageStation>) {
  return stations.filter(point => point.required && !completed.has(point)).length;
}

export const outpostStage: StageMap<'1-1'> = {
  ...outpost, id: '1-1', title: '지표 중계소', titleEn: 'Surface relay', atlasColumns: 2,
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
  id: '1-2', title: '얼음 아래 관측소', titleEn: 'Observatory beneath the ice', world: { width: columns * tileSize, height: rows * tileSize }, atlasColumns: 4,
  floor, terrainOutlines, mapWallEdges, obstacles: [...walls, relayBody], walkable: point => insideTerrain(point, terrainOutlines),
  landing, lift, relay, relayAccess, relayBody, gate, gateCenter, shelter, emergencyRoute,
  cables: [[landing, grid(10.8, 24.2), grid(10.8, 11.8), grid(24, 11.8), grid(24, 18.7), grid(27.5, 18.7), shelter],
    [grid(10.8, 24.2), grid(18.8, 25.1), grid(18.8, 22), grid(21.6, 22), grid(21.6, 19.5), grid(27.5, 19.5)], emergencyRoute],
  tileDetails: accents.map(([x, y, kind, angle]) => ({ ...grid(x, y), kind, angle })),
  landmarks: [[6.6, 21.75, 5], [10.4, 15.1, 4], [16.9, 7.8, 5], [21.7, 11.25, 4], [14.6, 28.8, 5], [20.4, 23.3, 5],
    [25.9, 15.5, 4], [27.6, 16.25, 5], [32.35, 17.1, 4], [35.9, 16.8, 5], [31.4, 8.8, 4], [39.6, 8.2, 5]]
    .map(([x, y, frame]) => ({ ...grid(x, y), frame })),
  crates: [grid(7.6, 25.4), grid(11.55, 15.9), grid(19.4, 11.25), grid(23.7, 14.2), grid(26.2, 20.85), grid(31.15, 20.3), grid(36.15, 21.15), grid(35.75, 8.2)],
  crystals: [grid(5.8, 22.2), grid(11.8, 21.55), grid(14.6, 26.85), grid(17.8, 24.25), grid(22.45, 20.75), grid(23.2, 17.15), grid(30.4, 8.8)],
  caches: [grid(5.2, 23.6), grid(16.8, 8.6), grid(14.6, 28.45), grid(28.5, 16.7), grid(34.65, 12.1)],
  weaponPickups: [{ ...grid(17.4, 9.15), weapon: 'medical' }, { ...grid(15.15, 26.9), weapon: 'shotgun' }],
  patrols: [{ ...grid(10.95, 18.5), kind: 'mite' }, { ...grid(13.5, 12.2), kind: 'scout' }, { ...grid(18.55, 11.5), kind: 'sentinel' },
    { ...grid(23.35, 12), kind: 'scout' }, { ...grid(15.2, 25.7), kind: 'grub' }, { ...grid(14.95, 28.9), kind: 'spore' },
    { ...grid(18.5, 22.8), kind: 'boar' }, { ...grid(22.25, 21.05), kind: 'mite' }, { ...grid(23.15, 17.4), kind: 'spore' },
    { ...grid(28.55, 19.9), kind: 'rimeSkitter' }, { ...grid(34.15, 16.85), kind: 'starTick' },
    { ...grid(35.6, 9.5), kind: 'coralHopper' }],
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
} satisfies StageMap<'1-2'> & { shelter: Point; emergencyRoute: Point[] };

const auroraColumns = 46, auroraRows = 32;
const auroraZones: readonly Zone[] = [
  [1, 6, 23, 28], [6, 11, 24, 26], [9, 13, 12, 26], [11, 18, 11, 13], [16, 21, 7, 12],
  [21, 25, 9, 15], [24, 29, 13, 17], [12, 18, 23, 25], [16, 22, 24, 28], [21, 24, 20, 26],
  [23, 28, 17, 22], [28, 34, 12, 23], [33, 38, 15, 17], [39, 44, 12, 22],
  [15, 19, 16, 19], [13, 15, 16, 17], [26, 30, 24, 26], [29, 31, 21, 24], [28, 32, 9, 11],
];
const auroraFloor = Array.from({ length: auroraRows }, (_, y) => Array.from({ length: auroraColumns }, (_, x) =>
  auroraZones.some(zone => within(zone, x, y))));
const auroraTerrain = buildTerrainGeometry(auroraFloor, tileSize, [
  { ...grid(1, 23), cut: 62 }, { ...grid(7, 29), cut: 51 }, { ...grid(16, 7), cut: 59 },
  { ...grid(22, 7), cut: 53 }, { ...grid(15, 19), cut: 38 }, { ...grid(18, 29), cut: 66 },
  { ...grid(25, 27), cut: 57 }, { ...grid(28, 9), cut: 52 }, { ...grid(35, 24), cut: 54 },
  { ...grid(45, 12), cut: 56 }, { ...grid(45, 23), cut: 64 },
]);
const auroraWalkable = (point: Point) => insideTerrain(point, auroraTerrain.outlines);
const auroraLanding = grid(3.7, 25.3), shuttle = grid(42.4, 16.7), transmitter = grid(31.5, 17);
const transmitterAccess = grid(31.5, 17.72);
const transmitterBox = { x: transmitter.x - 23, y: transmitter.y - 17, width: 46, height: 29 };
const launchGate: Box = { ...grid(37.65, 15), width: 15, height: 3 * tileSize };
const launchGateCenter = { x: launchGate.x + launchGate.width / 2, y: launchGate.y + launchGate.height / 2 };
const antennas = [
  station(18.8, 9.3, 'antenna', '북쪽 안테나'), station(19.4, 25.9, 'antenna', '남쪽 안테나'),
] as const;

export const auroraStage = {
  id: '1-3', title: '오로라 관제소', titleEn: 'Aurora flight control', atlasColumns: 4,
  world: { width: auroraColumns * tileSize, height: auroraRows * tileSize }, floor: auroraFloor,
  terrainOutlines: auroraTerrain.outlines, mapWallEdges: auroraTerrain.edges,
  obstacles: [...auroraTerrain.walls, transmitterBox, ...antennas.map(point => point.bounds)], walkable: auroraWalkable,
  landing: auroraLanding, lift: shuttle, relay: transmitter, relayAccess: transmitterAccess, relayBody: transmitterBox,
  gate: launchGate, gateCenter: launchGateCenter, stations: antennas,
  cables: [
    [auroraLanding, grid(10.7, 25.1), grid(10.7, 12.6), grid(17.9, 12.6), antennas[0]],
    [grid(10.7, 25.1), grid(19.4, 25.1), antennas[1], grid(23.5, 25.9), grid(23.5, 21.7), grid(31.4, 21.7), transmitter],
    [antennas[0], grid(23.5, 10.5), grid(25.35, 14.5), grid(31.5, 14.5), transmitter],
  ],
  emergencyRoute: [transmitterAccess, grid(33.2, 17.15), launchGateCenter, shuttle],
  tileDetails: [[4.4, 24, 0], [8.5, 25.4, 1], [10.7, 18.9, 2], [14.5, 11.5, 1], [16.2, 18, 3], [18.9, 8.4, 2],
    [23.4, 11.5, 1], [26.3, 15.3, 3], [16.8, 26.8, 2], [19.4, 27.8, 0], [25.8, 21.3, 1], [26.6, 25.35, 0],
    [29.8, 11, 3], [30.6, 18.3, 2], [33.5, 15.55, 3], [35.4, 16.5, 2], [42.2, 19.2, 2]]
    .map(([x, y, art]) => ({ ...grid(x, y), kind: (['fracture', 'shards', 'grate', 'plate'] as const)[art], angle: art % 2 * .55 })),
  landmarks: [[4.8, 24, 5], [10.6, 22, 4], [14.5, 11.85, 4], [17.9, 7.9, 5], [24.7, 13.8, 5],
    [17.1, 25.9, 4], [23.3, 23, 5], [27.7, 19.6, 4], [31.5, 10.2, 4], [33.9, 20.9, 5], [40.5, 14.4, 5], [43.6, 19.85, 4]]
    .map(([x, y, frame]) => ({ ...grid(x, y), frame })),
  crates: [grid(8.4, 25.65), grid(10.5, 17), grid(17.55, 12.5), grid(21.3, 27.45), grid(24.75, 21.5),
    grid(30.2, 19.25), grid(32.9, 15.25), grid(41.4, 20.9)],
  crystals: [grid(11.5, 14.1), grid(20.8, 8.2), grid(25.4, 13.8), grid(18.2, 27.4), grid(17.3, 17.3), grid(28.2, 25.3)],
  caches: [grid(4.7, 25.75), grid(14, 12.4), grid(17.3, 26.7), grid(31.2, 21.7)],
  weaponPickups: [{ ...grid(12.25, 24.7), weapon: 'ak' }, { ...grid(17.6, 10.6), weapon: 'shotgun' },
    { ...grid(30.45, 10.6), weapon: 'eagle' }],
  patrols: [{ ...grid(9.6, 22.7), kind: 'mite' }, { ...grid(12.7, 14.1), kind: 'grub' }, { ...grid(15.1, 12.7), kind: 'scout' },
    { ...grid(18, 8.8), kind: 'spore' }, { ...grid(20.6, 10.1), kind: 'sentinel' }, { ...grid(23.75, 13.7), kind: 'boar' },
    { ...grid(14.5, 24.7), kind: 'mite' }, { ...grid(20.8, 25), kind: 'scout' }, { ...grid(22.25, 27.3), kind: 'spore' },
    { ...grid(23.1, 23.4), kind: 'grub' }, { ...grid(25.65, 19.85), kind: 'mite' }, { ...grid(29.2, 20.65), kind: 'sentinel' },
    { ...grid(33.2, 13.3), kind: 'grub' }, { ...grid(31.35, 22.6), kind: 'boar' }, { ...grid(32.85, 19.7), kind: 'spore' },
    { ...grid(35.4, 16.55), kind: 'scout' }, { ...grid(43.7, 15.2), kind: 'sentinel' }, { ...grid(43.45, 19.5), kind: 'mite' }],
  material(x, y) {
    if (x >= 39 || x >= 34 && y >= 15 && y <= 17) return { cell: 7, xSign: 1, ySign: 1 };
    if (within([16, 21, 7, 11], x, y) || within([18, 22, 25, 27], x, y) || within([30, 32, 15, 19], x, y)) return variation(6, x, y);
    if (within([28, 34, 12, 23], x, y) || within([1, 6, 23, 28], x, y)) return variation(2, x, y);
    if (within([9, 13, 12, 25], x, y) || within([22, 27, 19, 23], x, y)) return variation(3, x, y);
    return variation((x * 7 + y * 11) % 5 > 1 ? 0 : 1, x, y);
  },
  outsideMaterial(x, y) { return variation((x * 11 + y * 17) % 7 < 3 ? 5 : 4, x, y); },
} satisfies StageMap<'1-3'> & { stations: readonly StageStation[]; emergencyRoute: Point[] };

const debrisColumns = 60, debrisRows = 32;
const greenhouse: Zone = [13, 23, 5, 12], cargoBay: Zone = [21, 35, 22, 29], observation: Zone = [33, 43, 3, 10];
const debrisZones: readonly Zone[] = [
  [1, 8, 14, 21], [8, 15, 16, 19], [15, 28, 16, 20], [27, 33, 17, 19], [32, 41, 15, 18], [40, 48, 14, 21],
  [47, 53, 16, 18], [53, 58, 13, 21],
  greenhouse, [14, 17, 11, 17], [22, 24, 10, 17], [10, 13, 7, 9],
  cargoBay, [23, 26, 19, 24], [32, 35, 18, 24], [34, 38, 23, 26],
  observation, [34, 37, 8, 17], [41, 44, 9, 16], [30, 33, 6, 8],
  [17, 21, 19, 22], [27, 30, 14, 17],
];
const debrisVoids: readonly Zone[] = [[13, 14, 5, 5], [22, 23, 11, 12], [21, 23, 28, 29], [29, 30, 25, 25], [33, 34, 3, 4], [38, 39, 5, 5]];
const debrisFloor = Array.from({ length: debrisRows }, (_, y) => Array.from({ length: debrisColumns }, (_, x) =>
  debrisZones.some(zone => within(zone, x, y)) && !debrisVoids.some(zone => within(zone, x, y))));
const debrisTerrain = buildTerrainGeometry(debrisFloor, tileSize, [
  { ...grid(1, 14), cut: 59 }, { ...grid(9, 22), cut: 62 }, { ...grid(15, 5), cut: 47 }, { ...grid(24, 5), cut: 66 },
  { ...grid(10, 7), cut: 40 }, { ...grid(24, 30), cut: 52 }, { ...grid(39, 27), cut: 49 }, { ...grid(41, 3), cut: 58 },
  { ...grid(30, 6), cut: 37 }, { ...grid(45, 9), cut: 33 }, { ...grid(49, 22), cut: 57 }, { ...grid(59, 13), cut: 51 },
  { ...grid(59, 22), cut: 65 },
]);
const debrisLanding = grid(3.7, 18.2), rescueLift = grid(54.1, 17.6), beacon = grid(44.9, 17.1), beaconAccess = grid(44.9, 17.83);
const beaconBody = { x: beacon.x - 19, y: beacon.y - 13, width: 38, height: 25 };
const rescueGate: Box = { ...grid(49.6, 16), width: 15, height: 3 * tileSize };
const rescueGateCenter = { x: rescueGate.x + rescueGate.width / 2, y: rescueGate.y + rescueGate.height / 2 };
const debrisStations = [
  station(19.5, 8.7, 'greenhouse', '온실 순환기'),
  station(27.5, 26.7, 'salvage', '하역장 집게'),
  station(39.2, 7.2, 'observation', '관측실 스캐너', false),
] as const;
const debrisPatches: readonly TerrainPatch[] = [
  { ...grid(13, 5), width: 11 * tileSize, height: 8 * tileSize, theme: 'greenhouse' },
  { ...grid(21, 22), width: 15 * tileSize, height: 8 * tileSize, theme: 'salvage' },
  { ...grid(33, 3), width: 11 * tileSize, height: 8 * tileSize, theme: 'observation' },
];
const debrisScenery: StageScenery[] = [
  [6.65, 16.1, 0, 96], [8.4, 20.45, 1, 62], [12.7, 19.25, 2, 92], [17.9, 17, 1, 69],
  [28.6, 18.15, 2, 105], [40.8, 15.95, 0, 91], [46.7, 19.65, 1, 68], [51.8, 16.55, 2, 83], [57.4, 17.8, 0, 115],
  [15.75, 7.2, 3, 99], [22, 6.7, 4, 61], [18.4, 10.9, 4, 59], [21.65, 10.1, 3, 85],
  [23.8, 25.15, 6, 81], [30.45, 24.1, 5, 112], [32.1, 26.8, 6, 91], [34.3, 27.75, 5, 104],
  [36.1, 5.9, 7, 101], [41.5, 6.35, 8, 69], [40.8, 9.7, 7, 85],
].map(([x, y, frame, size]) => {
  const point = grid(x, y);
  const width = size * .52, height = size * .24;
  return { ...point, frame, size, bounds: { x: point.x - width / 2, y: point.y - height / 2, width, height } };
});

export const debrisStage = {
  id: '1-4', title: '잔해 고리 구조항', titleEn: 'Wreck-ring rescue station', atlasColumns: 4,
  world: { width: debrisColumns * tileSize, height: debrisRows * tileSize }, floor: debrisFloor,
  terrainOutlines: debrisTerrain.outlines, mapWallEdges: debrisTerrain.edges,
  obstacles: [...debrisTerrain.walls, beaconBody, ...[...debrisStations, ...debrisScenery].map(point => point.bounds)],
  walkable: (point: Point) => insideTerrain(point, debrisTerrain.outlines),
  landing: debrisLanding, lift: rescueLift, relay: beacon, relayAccess: beaconAccess, relayBody: beaconBody,
  gate: rescueGate, gateCenter: rescueGateCenter, stations: debrisStations, terrainPatches: debrisPatches, scenery: debrisScenery,
  cables: [
    [debrisLanding, grid(12.4, 17.7), grid(15.45, 17.7), grid(15.45, 9.2), debrisStations[0]],
    [grid(15.4, 17.7), grid(24.3, 18.7), grid(24.3, 26.1), debrisStations[1]],
    [grid(24.3, 18.7), grid(35, 17.7), grid(35, 7.6), debrisStations[2]],
    [grid(35, 17.7), grid(42.4, 17.7), beaconAccess],
  ],
  emergencyRoute: [beaconAccess, grid(47.8, 17.55), rescueGateCenter, rescueLift],
  tileDetails: [[7.2, 19.6], [11.8, 17.1], [14.9, 14.6], [24.1, 19.25], [29.45, 18.6], [34.9, 13.8],
    [36.8, 16.15], [43.7, 12.2], [45.8, 19.9], [48.2, 16.6], [52.5, 18.45], [55.7, 15.7]]
    .map(([x, y], index) => ({ ...grid(x, y), kind: (['grate', 'plate', 'fracture'] as const)[index % 3], angle: index % 2 * .42 })),
  landmarks: [[5.5, 15.85, 4], [15.55, 14.65, 5], [22.9, 15.2, 4], [24.4, 21.15, 4],
    [36.5, 13.7, 5], [42.9, 15.45, 4], [45.85, 20.4, 5], [47.5, 16.6, 4], [53.7, 14.6, 5]]
    .map(([x, y, frame]) => ({ ...grid(x, y), frame })),
  crates: [grid(9.45, 19.1), grid(25.15, 20.2), grid(34.4, 23.1), grid(38.2, 18.1), grid(44.1, 19.4), grid(56.25, 19)],
  crystals: [grid(16.25, 11.25), grid(21.75, 8.1), grid(30.75, 23.6), grid(36.6, 8.95), grid(46.5, 15.1)],
  caches: [grid(5.4, 18.3), grid(12, 8.3), grid(23, 26.65), grid(32.2, 7.5), grid(44.7, 20.15)],
  weaponPickups: [{ ...grid(11.5, 18.35), weapon: 'eagle' }, { ...grid(19.35, 10.55), weapon: 'medical' },
    { ...grid(29.2, 27.3), weapon: 'ak' }, { ...grid(46.25, 20.15), weapon: 'shotgun' }],
  patrols: [{ ...grid(10.7, 17.6), kind: 'mite' }, { ...grid(15.4, 12), kind: 'spore' }, { ...grid(16.4, 6.8), kind: 'grub' },
    { ...grid(20.8, 9.95), kind: 'scout' }, { ...grid(23.4, 7.2), kind: 'mite' }, { ...grid(22.7, 16.6), kind: 'sentinel' },
    { ...grid(24.7, 23.4), kind: 'boar' }, { ...grid(25.2, 27.3), kind: 'mite' }, { ...grid(31.3, 22.7), kind: 'sentinel' },
    { ...grid(34.2, 24.4), kind: 'spore' }, { ...grid(28.6, 15.5), kind: 'scout' }, { ...grid(35.6, 14.3), kind: 'grub' },
    { ...grid(37.2, 5.75), kind: 'scout' }, { ...grid(41.3, 8.45), kind: 'sentinel' }, { ...grid(43.3, 13.6), kind: 'mite' },
    { ...grid(43.1, 19.55), kind: 'spore' }, { ...grid(45.45, 15.05), kind: 'boar' }, { ...grid(48.9, 17.65), kind: 'scout' },
    { ...grid(55.7, 18.2), kind: 'grub' }, { ...grid(57.15, 16.1), kind: 'sentinel' }],
  material(x, y) {
    const index = (x * 5 + y * 3 + Math.floor(x / 5) * 2) % 8;
    if (within(greenhouse, x, y)) return variation(8 + (x + y) % 2, x, y);
    if (within(cargoBay, x, y)) return variation(10 + (x + y) % 2, x, y);
    if (within(observation, x, y)) return variation(12 + (x + y) % 2, x, y);
    return variation(index, x, y);
  },
  outsideMaterial(x, y) { return variation(14 + (x * 13 + y * 7) % 2, x, y); },
} satisfies StageMap<'1-4'> & { stations: readonly StageStation[]; terrainPatches: readonly TerrainPatch[];
  scenery: readonly StageScenery[]; emergencyRoute: Point[] };

export const nextStage = { '1-1': observatoryStage, '1-2': auroraStage, '1-3': debrisStage, '1-4': undefined };
export type ExpeditionMap = typeof outpostStage | typeof observatoryStage | typeof auroraStage | typeof debrisStage;
