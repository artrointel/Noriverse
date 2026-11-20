export const sichuanSize = 8;
export const sichuanMotifs = 16;
const tileCount = sichuanSize ** 2;
export type Tile = number | null;
export type TilePoint = readonly [x: number, y: number];
type Pair = readonly [first: number, second: number];

export const tilePoint = (index: number): TilePoint => [index % sichuanSize, Math.floor(index / sichuanSize)];
const samePoint = (a: TilePoint, b: TilePoint) => a[0] === b[0] && a[1] === b[1];
const distance = (a: TilePoint, b: TilePoint) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function pathBetween(board: readonly Tile[], first: number, second: number) {
  const start = tilePoint(first), end = tilePoint(second);
  const vacant = ([x, y]: TilePoint) => x < 0 || y < 0 || x >= sichuanSize || y >= sichuanSize || board[y * sichuanSize + x] === null;
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
  for (let line = -1; line <= sichuanSize; line++) {
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
  if (first === second || board[first] == null || board[first] !== board[second]) return;
  return pathBetween(board, first, second);
}

export function findTilePair(board: readonly Tile[]): Pair | undefined {
  for (let first = 0; first < board.length; first++) {
    if (board[first] === null) continue;
    for (let second = first + 1; second < board.length; second++) {
      if (connectTiles(board, first, second)) return [first, second];
    }
  }
}

function shuffle<T>(items: T[], random: () => number) {
  for (let end = items.length - 1; end > 0; end--) {
    const index = Math.floor(random() * (end + 1));
    [items[end], items[index]] = [items[index], items[end]];
  }
  return items;
}

export function shuffleTiles(board: readonly Tile[], random = Math.random): Tile[] {
  const occupied = shuffle(board.flatMap((tile, index) => tile === null ? [] : [index]), random);
  const motifPairs = shuffle(board.filter(tile => tile !== null).sort((a, b) => a - b).filter((_, index) => index % 2 === 0), random);
  const mask = board.map(tile => tile === null ? null : 0);
  const next: Tile[] = board.map(() => null);
  // Assign each matching pair in an order that permits all pairs to be removed.
  for (const motif of motifPairs) {
    let pair: Pair | undefined;
    for (let first = 0; first < occupied.length && !pair; first++) {
      const second = occupied.findIndex((cell, index) => index > first && pathBetween(mask, occupied[first], cell));
      if (second !== -1) pair = [first, second];
    }
    if (!pair) throw new Error('An occupied tile layout must have a connecting pair');
    const [first, second] = pair;
    for (const index of [occupied[first], occupied[second]]) {
      next[index] = motif;
      mask[index] = null;
    }
    occupied.splice(second, 1);
    occupied.splice(first, 1);
  }
  return next;
}

export function createSichuanBoard(random = Math.random) {
  return shuffleTiles(Array.from({ length: tileCount }, (_, index) => index % sichuanMotifs), random);
}
