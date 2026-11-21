import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';

export const orbitWidth = 7;
export const orbitHeight = 11;
export const orbitSceneHeight = 562;
export const orbitMatchSize = 4;
export const orbitGravityMs = 650;
export const orbitClearMs = 582;
const cellCount = orbitWidth * orbitHeight;
const debris = 5;
const maxIncoming = 12;
const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

type Jelly = 1 | 2 | 3 | 4;
export type OrbitCell = 0 | Jelly | typeof debris;
type Pair = [Jelly, Jelly];
type Piece = { pair: Pair; x: number; y: number; rotation: number };
export const orbitInputs = ['left', 'right', 'rotate', 'down', 'drop'] as const;
export type OrbitInput = typeof orbitInputs[number];
type OrbitFall = { from: number; to: number };
export type OrbitResolution = { until: number; chain: number } & (
  { kind: 'clear'; indices: number[] } | { kind: 'fall'; moves: OrbitFall[] }
);
export type OrbitBoard = {
  cells: OrbitCell[]; piece: Piece; next: Pair; seed: number; serial: number;
  cleared: number; bestChain: number; incoming: number; out: boolean;
  event?: { landed: number[] };
  resolution?: OrbitResolution;
};
export type OrbitRound = {
  players: Role[]; boards: Partial<Record<Role, OrbitBoard>>; tickAt: number; revision: number;
  winner?: Role | 'draw';
};

function nextPair(seed: number): [Pair, number] {
  const first = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const second = (Math.imul(first, 1664525) + 1013904223) >>> 0;
  return [[(1 + (first >>> 30)) as Jelly, (1 + (second >>> 30)) as Jelly], second];
}

function spawn(pair: Pair): Piece {
  return { pair, x: 2, y: 0, rotation: 0 };
}

export function createOrbitRound(players: Role[], seed = Math.floor(Math.random() * 0x100000000)): OrbitRound {
  const [pair, afterFirst] = nextPair(seed);
  const [next, afterNext] = nextPair(afterFirst);
  const boards = Object.fromEntries(players.map(role => [role, {
    cells: Array<OrbitCell>(cellCount).fill(0), piece: spawn(pair), next, seed: afterNext, serial: 0,
    cleared: 0, bestChain: 0, incoming: 0, out: false,
  }]));
  return { players, boards, tickAt: 0, revision: 0 };
}

export function pairPoints(piece: Piece) {
  const [dx, dy] = directions[piece.rotation];
  return [[piece.x, piece.y], [piece.x + dx, piece.y + dy]];
}

function indexAt(x: number, y: number) {
  return x >= 0 && x < orbitWidth && y >= 0 && y < orbitHeight ? x + y * orbitWidth : -1;
}

function fits(cells: OrbitCell[], piece: Piece) {
  return pairPoints(piece).every(([x, y]) => cells[indexAt(x, y)] === 0);
}

function dropPiece(board: OrbitBoard) {
  let piece = board.piece;
  while (fits(board.cells, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
  return piece;
}

function settledPoints(cells: OrbitCell[], piece: Piece) {
  return pairPoints(piece).map(([x, y]) => {
    if (piece.rotation % 2 === 0) while (cells[indexAt(x, y + 1)] === 0) y++;
    return [x, y];
  });
}

export function orbitLanding(board: OrbitBoard) {
  return settledPoints(board.cells, dropPiece(board));
}

function fallingMoves(cells: readonly OrbitCell[]) {
  const moves: OrbitFall[] = [];
  for (let x = 0; x < orbitWidth; x++) {
    let destination = orbitHeight - 1;
    for (let y = orbitHeight - 1; y >= 0; y--) {
      const value = cells[x + y * orbitWidth];
      if (!value) continue;
      if (y !== destination) moves.push({ from: x + y * orbitWidth, to: x + destination * orbitWidth });
      destination--;
    }
  }
  return moves;
}

function settle(cells: readonly OrbitCell[], moves: OrbitFall[]) {
  const next = [...cells];
  for (const { from } of moves) next[from] = 0;
  for (const { from, to } of moves) next[to] = cells[from];
  return next;
}

function neighbors(index: number) {
  return directions.map(([dx, dy]) => indexAt(index % orbitWidth + dx, Math.floor(index / orbitWidth) + dy)).filter(index => index >= 0);
}

function matchingCells(cells: readonly OrbitCell[]) {
  const visited = new Set<number>();
  const popped = new Set<number>();
  for (const [index, color] of cells.entries()) {
    if (!color || color === debris || visited.has(index)) continue;
    const group = [index];
    visited.add(index);
    for (const current of group) for (const next of neighbors(current)) {
      if (cells[next] !== color || visited.has(next)) continue;
      visited.add(next);
      group.push(next);
    }
    if (group.length >= orbitMatchSize) for (const tile of group) popped.add(tile);
  }
  for (const index of [...popped]) for (const neighbor of neighbors(index)) {
    if (cells[neighbor] === debris) popped.add(neighbor);
  }
  return [...popped];
}

export function resolveOrbitTiles(grid: readonly OrbitCell[]) {
  let cells = settle(grid, fallingMoves(grid));
  const waves: { index: number; color: OrbitCell }[][] = [];
  let cleared = 0;
  for (let indices = matchingCells(cells); indices.length; indices = matchingCells(cells)) {
    waves.push(indices.map(index => ({ index, color: cells[index] })));
    for (const index of indices) {
      if (cells[index] !== debris) cleared++;
      cells[index] = 0;
    }
    cells = settle(cells, fallingMoves(cells));
  }
  return { cells, waves, cleared };
}

function fallTime(moves: OrbitFall[]) {
  return 260 + Math.max(...moves.map(({ from, to }) => (to - from) / orbitWidth)) * 35;
}

export function orbitResolutionMs(phase: OrbitResolution) {
  return phase.kind === 'clear' ? orbitClearMs : fallTime(phase.moves);
}

type BoardChange = { board: OrbitBoard; attack: number };

function spawnAfterLock(board: OrbitBoard, chain: number): BoardChange {
  const cells = [...board.cells];
  let overflow = false;
  for (let i = 0; i < board.incoming; i++) {
    const x = (board.serial + i) % orbitWidth;
    let y = 0;
    while (y < orbitHeight && !cells[x + y * orbitWidth]) y++;
    if (!y) overflow = true;
    else cells[x + (y - 1) * orbitWidth] = debris;
  }
  const spawned = spawn(board.next);
  const [next, seed] = nextPair(board.seed);
  return {
    board: { ...board, cells, piece: spawned, next, seed, serial: board.serial + 1, incoming: 0,
      out: overflow || !fits(cells, spawned), resolution: undefined },
    attack: chain >= 2 ? Math.min(6, (chain - 1) * 2) : 0,
  };
}

function startClear(board: OrbitBoard, chain: number, now: number): BoardChange {
  const indices = matchingCells(board.cells);
  if (!indices.length) return spawnAfterLock(board, chain);
  return { board: { ...board, resolution: { kind: 'clear', chain: chain + 1, indices, until: now + orbitClearMs } }, attack: 0 };
}

function finishPhase(board: OrbitBoard, phase: OrbitResolution, now: number): BoardChange {
  if (phase.kind === 'fall') return startClear({ ...board, cells: settle(board.cells, phase.moves) }, phase.chain, now);
  const cells = [...board.cells];
  let cleared = board.cleared;
  for (const index of phase.indices) {
    if (cells[index] !== debris) cleared++;
    cells[index] = 0;
  }
  const next = { ...board, cells, cleared, bestChain: Math.max(board.bestChain, phase.chain) };
  const moves = fallingMoves(cells);
  if (!moves.length) return spawnAfterLock(next, phase.chain);
  return { board: { ...next, resolution: { kind: 'fall', chain: phase.chain, moves, until: now + fallTime(moves) } }, attack: 0 };
}

function lock(board: OrbitBoard, piece: Piece, now: number) {
  const cells = [...board.cells];
  const landed = settledPoints(board.cells, piece).map(([x, y]) => indexAt(x, y));
  landed.forEach((index, half) => { cells[index] = piece.pair[half]; });
  return startClear({ ...board, cells, event: { landed } }, 0, now);
}

function step(board: OrbitBoard, input: OrbitInput, now: number): BoardChange | undefined {
  const { piece, cells } = board;
  if (input === 'drop') return lock(board, dropPiece(board), now);
  if (input === 'rotate') {
    const rotated = { ...piece, rotation: (piece.rotation + 1) % directions.length };
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const candidate = { ...rotated, x: rotated.x + dx, y: rotated.y + dy };
      if (fits(cells, candidate)) return { board: { ...board, piece: candidate }, attack: 0 };
    }
    return;
  }
  const moved = input === 'down' ? { ...piece, y: piece.y + 1 }
    : { ...piece, x: piece.x + (input === 'left' ? -1 : 1) };
  if (fits(cells, moved)) return { board: { ...board, piece: moved }, attack: 0 };
  if (input === 'down') return lock(board, piece, now);
}

function updateOrbit(round: OrbitRound, changes: [Role, ReturnType<typeof step>][], tickAt = round.tickAt): OrbitRound {
  const boards = { ...round.boards };
  for (const [role, change] of changes) if (change) boards[role] = change.board;
  const living = round.players.filter(role => !boards[role]?.out);
  for (const [role, change] of changes) {
    if (!change?.attack || boards[role]?.out) continue;
    const index = round.players.indexOf(role);
    const target = [...round.players.slice(index + 1), ...round.players.slice(0, index)].find(role => living.includes(role));
    if (!target) continue;
    const board = boards[target]!;
    boards[target] = { ...board, incoming: Math.min(maxIncoming, board.incoming + change.attack) };
  }
  const winner = !living.length ? 'draw'
    : round.players.length > 1 && living.length === 1 && !boards[living[0]]?.resolution ? living[0] : undefined;
  return { ...round, boards, tickAt: winner ? 0 : tickAt, revision: round.revision + 1, winner };
}

export function nextOrbitAt(round: OrbitRound) {
  if (!round.tickAt || round.winner) return 0;
  return Math.min(round.tickAt, ...round.players.map(role => round.boards[role]?.resolution?.until ?? Infinity));
}

export function advanceOrbit(round: OrbitRound, now: number): OrbitRound | undefined {
  const nextAt = nextOrbitAt(round);
  if (!nextAt || now < nextAt) return;
  const gravity = now >= round.tickAt;
  return updateOrbit(round, round.players.flatMap(role => {
    const board = round.boards[role]!;
    if (board.out) return [];
    const phase = board.resolution;
    if (phase) return now >= phase.until ? [[role, finishPhase(board, phase, now)]] : [];
    return gravity ? [[role, step(board, 'down', now)]] : [];
  }), gravity ? now + orbitGravityMs : round.tickAt);
}

export function applyOrbitInput(round: OrbitRound, role: Role, raw: unknown, now = Date.now()): OrbitRound | undefined {
  const board = round.boards[role];
  if (!board || board.out || board.resolution || round.winner || !raw || typeof raw !== 'object' || !('serial' in raw) || raw.serial !== board.serial
    || !('input' in raw) || !orbitInputs.includes(raw.input as OrbitInput)) return;
  const change = step(board, raw.input as OrbitInput, now);
  if (change) return updateOrbit(round, [[role, change]]);
}

export function resignOrbit(round: OrbitRound, role: Role) {
  const board = round.boards[role];
  if (round.winner || !board || board.out) return;
  return updateOrbit(round, [[role, { board: { ...board, out: true, resolution: undefined }, attack: 0 }]]);
}

export function orbitOutcome(round: OrbitRound, role: Role) {
  if (!round.winner || !round.boards[role]) return;
  return round.winner === 'draw' ? 'draw' : round.winner === role ? 'win' : 'loss';
}

function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function validPair(value: unknown): value is Pair {
  return Array.isArray(value) && value.length === 2 && value.every(color => integer(color, 4) && color > 0);
}

function validResolution(phase: OrbitResolution, cells: OrbitCell[]) {
  if (!phase || !integer(phase.until) || !phase.until || !integer(phase.chain, cellCount / orbitMatchSize) || !phase.chain) return false;
  if (phase.kind === 'clear') return Array.isArray(phase.indices) && phase.indices.length >= orbitMatchSize
    && phase.indices.length <= cellCount && new Set(phase.indices).size === phase.indices.length
    && phase.indices.every(index => integer(index, cellCount - 1) && cells[index]);
  if (phase.kind !== 'fall' || !Array.isArray(phase.moves) || !phase.moves.length || phase.moves.length > cellCount) return false;
  const expected = fallingMoves(cells);
  return expected.length === phase.moves.length && phase.moves.every((move, i) =>
    move && move.from === expected[i].from && move.to === expected[i].to);
}

function validBoard(value: unknown): value is OrbitBoard {
  if (!value || typeof value !== 'object') return false;
  const board = value as OrbitBoard;
  const piece = board.piece;
  const event = board.event;
  return Array.isArray(board.cells) && board.cells.length === cellCount && board.cells.every(value => integer(value, debris))
    && piece && validPair(piece.pair) && integer(piece.x, orbitWidth - 1) && integer(piece.y, orbitHeight - 1) && integer(piece.rotation, 3)
    && validPair(board.next) && integer(board.seed, 0xffffffff) && integer(board.serial)
    && integer(board.cleared) && integer(board.bestChain, cellCount / orbitMatchSize) && integer(board.incoming, maxIncoming)
    && typeof board.out === 'boolean' && (board.resolution === undefined
      ? board.out || fits(board.cells, piece) : !board.out && validResolution(board.resolution, board.cells))
    && (event === undefined || (event && Array.isArray(event.landed) && event.landed.length === 2
      && event.landed.every(index => integer(index, cellCount - 1))));
}

export function readOrbitRound(raw: unknown): OrbitRound | undefined {
  if (!raw || typeof raw !== 'object') return;
  const round = raw as OrbitRound;
  if (!Array.isArray(round.players) || round.players.length < 2 || round.players.length > 4 || !round.players.every(isRoomRole)
    || !round.players.includes('host') || new Set(round.players).size !== round.players.length || !round.boards || typeof round.boards !== 'object'
    || Object.keys(round.boards).length !== round.players.length || !round.players.every(role => validBoard(round.boards[role]))
    || !integer(round.revision) || !integer(round.tickAt)) return;
  const alive = round.players.filter(role => !round.boards[role]?.out);
  const expected = !alive.length ? 'draw' : alive.length === 1 && !round.boards[alive[0]]?.resolution ? alive[0] : undefined;
  if (round.winner === expected && (!round.winner || !round.tickAt)) return round;
}
