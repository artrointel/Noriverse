import { defaultSichuanSettings, motifCount, resolveSichuanSettings, sichuanObstacleCount, sichuanTileCount } from './options.ts';
import type { SichuanSettings } from './options.ts';

export const obstacle = -1;
export type Tile = number | null;
export type TilePoint = readonly [x: number, y: number];
type Pair = readonly [first: number, second: number];

export const isMatchTile = (tile: Tile | undefined): tile is number => typeof tile === 'number' && tile >= 0;
export const tilePoint = (index: number, size: number): TilePoint => [index % size, Math.floor(index / size)];
const samePoint = (a: TilePoint, b: TilePoint) => a[0] === b[0] && a[1] === b[1];
const distance = (a: TilePoint, b: TilePoint) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function pathBetween(board: readonly Tile[], first: number, second: number, size: number) {
  const start = tilePoint(first, size), end = tilePoint(second, size);
  const vacant = ([x, y]: TilePoint) => x < 0 || y < 0 || x >= size || y >= size || board[y * size + x] === null;
  function segmentClear(a: TilePoint, b: TilePoint) {
    if (a[0] !== b[0] && a[1] !== b[1]) return false;
    const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
    for (let x = a[0] + dx, y = a[1] + dy; x !== b[0] || y !== b[1]; x += dx, y += dy) {
      if (!vacant([x, y])) return false;
    }
    return true;
  }
  if (segmentClear(start, end)) return [start, end];
  for (const corner of [[start[0], end[1]], [end[0], start[1]]] as const) {
    if (vacant(corner) && segmentClear(start, corner) && segmentClear(corner, end)) return [start, corner, end];
  }
  let shortest: TilePoint[] | undefined;
  let length = Infinity;
  for (let line = -1; line <= size; line++) {
    for (const [a, b] of [[[line, start[1]], [line, end[1]]], [[start[0], line], [end[0], line]]] as const) {
      if (samePoint(a, start) || samePoint(b, end) || samePoint(a, b) || !vacant(a) || !vacant(b)) continue;
      const cost = distance(start, a) + distance(a, b) + distance(b, end);
      if (cost >= length || !segmentClear(start, a) || !segmentClear(a, b) || !segmentClear(b, end)) continue;
      length = cost;
      shortest = [start, a, b, end];
    }
  }
  return shortest;
}

export function connectTiles(board: readonly Tile[], first: number, second: number) {
  if (first === second || !isMatchTile(board[first]) || board[first] !== board[second]) return;
  return pathBetween(board, first, second, Math.sqrt(board.length));
}

export function availableTileMatches(board: readonly Tile[]) {
  let pair: Pair | undefined;
  let pairs = 0;
  for (let first = 0; first < board.length; first++) {
    if (!isMatchTile(board[first])) continue;
    for (let second = first + 1; second < board.length; second++) {
      if (!connectTiles(board, first, second)) continue;
      pair ??= [first, second];
      pairs++;
    }
  }
  return { pair, pairs };
}

export function shuffle<T>(items: T[], random: () => number) {
  for (let end = items.length - 1; end > 0; end--) {
    const index = Math.floor(random() * (end + 1));
    [items[end], items[index]] = [items[index], items[end]];
  }
  return items;
}

function pairMotifs(board: readonly Tile[], pairs: readonly Pair[], motifs: number[], requireChanges: boolean) {
  const next: Tile[] = board.map(tile => tile === obstacle ? obstacle : null);
  if (!requireChanges) {
    pairs.forEach(([first, second], index) => { next[first] = next[second] = motifs[index]; });
    return next;
  }

  // Match each removable slot to a motif that changes both of its cells.
  const slotForMotif = motifs.map(() => -1);
  function assign(slot: number, seen: Set<number>): boolean {
    const [first, second] = pairs[slot];
    return motifs.some((tile, index) => {
      if (tile === board[first] || tile === board[second] || seen.has(index)) return false;
      seen.add(index);
      const previous = slotForMotif[index];
      if (previous !== -1 && !assign(previous, seen)) return false;
      slotForMotif[index] = slot;
      return true;
    });
  }
  if (!pairs.every((_, slot) => assign(slot, new Set()))) return;
  slotForMotif.forEach((slot, index) => {
    const [first, second] = pairs[slot];
    next[first] = next[second] = motifs[index];
  });
  return next;
}

function packPairs(board: readonly Tile[], motifs: number[], random: () => number, preferChanges: boolean) {
  const size = Math.sqrt(board.length);
  const occupied = shuffle(board.flatMap((tile, index) => isMatchTile(tile) ? [index] : []), random);
  const mask = [...board];
  const pairs: Pair[] = [];
  // Assign each matching pair in an order that permits all pairs to be removed.
  while (occupied.length > 0) {
    let pair: Pair | undefined;
    for (let first = 0; first < occupied.length && !pair; first++) {
      const second = occupied.findIndex((cell, index) => index > first && pathBetween(mask, occupied[first], cell, size));
      if (second !== -1) pair = [first, second];
    }
    if (!pair) return;
    const [first, second] = pair;
    pairs.push([occupied[first], occupied[second]]);
    mask[occupied[first]] = mask[occupied[second]] = null;
    occupied.splice(second, 1);
    occupied.splice(first, 1);
  }
  return pairMotifs(board, pairs, motifs, preferChanges);
}

function openDominoes(board: readonly Tile[]) {
  return board.flatMap((tile, index): Pair[] => index % 2 === 0 && tile !== obstacle && board[index + 1] !== obstacle
    ? [[index, index + 1]] : []);
}

function bestRearrangement(board: readonly Tile[], motifs: number[], random: () => number, preferChanges = false) {
  for (let attempt = 0; attempt < (preferChanges ? 7 : 3); attempt++) {
    const arranged = packPairs(board, shuffle([...motifs], random), random, preferChanges);
    if (arranged) return arranged;
  }

  // Obstacle placement reserves adjacent pairs for a safe reshuffle.
  const positions = shuffle(openDominoes(board), random).sort(([a, b], [c, d]) =>
    Number(isMatchTile(board[a])) + Number(isMatchTile(board[b])) - Number(isMatchTile(board[c])) - Number(isMatchTile(board[d])))
    .slice(0, motifs.length);
  if (positions.length < motifs.length) return packPairs(board, motifs, random, false) ?? [...board];
  const shuffled = shuffle([...motifs], random);
  return pairMotifs(board, positions, shuffled, preferChanges) ?? pairMotifs(board, positions, shuffled, false) ?? [...board];
}

export function shuffleTiles(board: readonly Tile[], random = Math.random) {
  const motifs = board.filter(isMatchTile).sort((a, b) => a - b).filter((_, index) => index % 2 === 0);
  const next = bestRearrangement(board, motifs, random, true);
  if (next.some((tile, index) => tile !== board[index])) return next;
  const [first, ...rest] = motifs;
  const second = rest.find(motif => motif !== first);
  if (second === undefined || !availableTileMatches(next).pair) return next;
  return next.map(tile => tile === first ? second : tile === second ? first : tile);
}

export function createSichuanBoard(settings = resolveSichuanSettings(defaultSichuanSettings), random = Math.random) {
  const { size, density, theme, obstacleDensity } = settings;
  const cellCount = size ** 2;
  const board: Tile[] = Array(cellCount).fill(null);
  const slots = shuffle(openDominoes(board), random);
  const blocks = sichuanObstacleCount(size, density, obstacleDensity);
  for (const [first, second] of slots.splice(0, Math.floor(blocks / 2))) board[first] = board[second] = obstacle;
  if (blocks % 2) board[slots.shift()![0]] = obstacle;
  const pairs = sichuanTileCount(size, density) / 2;
  const positions = shuffle(slots.flat(), random).slice(0, pairs * 2);
  for (const index of positions) board[index] = 0;
  const motifs = Array.from({ length: pairs }, (_, index) => index % motifCount(theme));
  return bestRearrangement(board, motifs, random);
}

export function nextSichuanCombo(previous: { at: number; count: number } | undefined, at: number) {
  return { at, count: previous && at - previous.at <= 1000 ? previous.count + 1 : 1 };
}
