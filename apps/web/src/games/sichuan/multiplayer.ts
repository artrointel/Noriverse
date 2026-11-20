import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { defaultHints, motifCount, readSichuanRoomSettings, resolveSichuanSettings, sichuanTileCount } from './options.ts';
import type { SichuanMode, SichuanRoomSettings } from './options.ts';
import { availableTileMatches, connectTiles, createSichuanBoard, isMatchTile, nextSichuanCombo, obstacle, shuffleTiles } from './rules.ts';
import type { Tile, TilePoint } from './rules.ts';

type Options = ReturnType<typeof resolveSichuanSettings>;
type PuzzleBoard = { tiles: Tile[]; shufflesLeft: number; hintsLeft: number; hint?: readonly [number, number] };
export type PuzzleStats = { removed: number; maxCombo: number; streak: number; lastAt: number };
type PuzzleEvent = { actor: Role; kind: 'shuffle' | 'hint' } | { actor: Role; kind: 'pair'; path: TilePoint[]; combo: number };
export type PuzzleResult = Role | 'team' | 'timeout' | 'abandoned';
type Seats<T> = Partial<Record<Role, T>>;
export type PuzzleRound = {
  options: Options; players: readonly Role[]; ready: Seats<boolean>; beginsAt: number; revision: number;
  boards: Seats<PuzzleBoard>; stats: Seats<PuzzleStats>; event?: PuzzleEvent; result?: PuzzleResult;
};

const defaultPlayers = ['host', 'guest'] as const;
const initialStats = (): PuzzleStats => ({ removed: 0, maxCombo: 0, streak: 0, lastAt: 0 });
export const puzzleBoardFor = (round: PuzzleRound, mode: SichuanMode, role: Role) => round.boards[mode === 'coop' ? 'host' : role];
export const puzzleOutcome = (result: PuzzleResult, role: Role) => result === role || result === 'team' ? 'win' : 'loss';
export const puzzleEnd = (round: PuzzleRound) => round.beginsAt ? round.beginsAt + round.options.timeLimit * 1000 : 0;

export function puzzleProgress(round: PuzzleRound, role: Role) {
  const { size, density } = round.options;
  const removed = round.stats[role]?.removed ?? 0;
  return Math.min(100, Math.floor(100 * removed / sichuanTileCount(size, density)));
}

export function makePuzzleRound(config: SichuanRoomSettings, random = Math.random, players: readonly Role[] = defaultPlayers): PuzzleRound {
  const options = resolveSichuanSettings(config.settings, random);
  const tiles = createSichuanBoard(options, random);
  return { options, players, ready: {}, beginsAt: 0, revision: 0,
    boards: Object.fromEntries(players.map(role => [role, { tiles: [...tiles], shufflesLeft: options.shuffles, hintsLeft: options.hints }])),
    stats: Object.fromEntries(players.map(role => [role, initialStats()])) };
}

export function readyPuzzle(round: PuzzleRound, role: Role, now: number): PuzzleRound | undefined {
  if (!round.players.includes(role) || round.ready[role]) return;
  const ready = { ...round.ready, [role]: true };
  return { ...round, ready, beginsAt: round.players.every(player => ready[player]) ? now + 1100 : 0, revision: round.revision + 1 };
}

export type PuzzleAction = { kind: 'pair'; first: number; second: number; generation: number }
  | { kind: 'shuffle'; generation: number }
  | { kind: 'hint'; generation: number; hintsLeft: number };

export function applyPuzzleAction(round: PuzzleRound, mode: SichuanMode, actor: Role, raw: unknown, now: number, random = Math.random): PuzzleRound | undefined {
  if (!raw || typeof raw !== 'object' || !round.players.includes(actor) || round.result || !round.beginsAt
    || now < round.beginsAt || now >= puzzleEnd(round)) return;
  const action = raw as Partial<PuzzleAction>;
  const key = mode === 'coop' ? 'host' : actor;
  const board = round.boards[key];
  const stats = round.stats[actor];
  if (!board || !stats || action.generation !== board.shufflesLeft) return;
  const updated = (next: PuzzleBoard, event: PuzzleEvent) => ({
    ...round, revision: round.revision + 1, event, boards: { ...round.boards, [key]: next },
  });
  if (action.kind === 'hint') {
    if (!board.hintsLeft || action.hintsLeft !== board.hintsLeft || board.hint) return;
    const { pair } = availableTileMatches(board.tiles);
    if (!pair) return;
    return updated({ ...board, hintsLeft: board.hintsLeft - 1, hint: pair }, { kind: 'hint', actor });
  }
  if (action.kind === 'shuffle') {
    if (!board.shufflesLeft || !board.tiles.some(isMatchTile)) return;
    const tiles = shuffleTiles(board.tiles, random);
    if (tiles.every((tile, index) => tile === board.tiles[index])) return;
    return { ...updated({ ...board, tiles, shufflesLeft: board.shufflesLeft - 1, hint: undefined }, { kind: 'shuffle', actor }),
      stats: { ...round.stats, [actor]: { ...stats, streak: 0, lastAt: 0 } } };
  }
  if (action.kind !== 'pair' || typeof action.first !== 'number' || typeof action.second !== 'number'
    || !Number.isInteger(action.first) || !Number.isInteger(action.second)) return;
  const path = connectTiles(board.tiles, action.first, action.second);
  if (!path) return;
  const tiles = [...board.tiles];
  tiles[action.first] = tiles[action.second] = null;
  const combo = nextSichuanCombo(stats.lastAt ? { at: stats.lastAt, count: stats.streak } : undefined, now).count;
  return { ...updated({ ...board, tiles, hint: undefined }, { kind: 'pair', actor, path, combo }),
    result: tiles.some(isMatchTile) ? undefined : mode === 'coop' ? 'team' : actor,
    stats: { ...round.stats, [actor]: { removed: stats.removed + 2, maxCombo: Math.max(stats.maxCombo, combo), streak: combo, lastAt: now } } };
}

const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;

export function readPuzzleRound(value: unknown, config: SichuanRoomSettings): PuzzleRound | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as Partial<PuzzleRound>;
  const players = r.players ?? defaultPlayers;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4 || !players.includes('host')
    || !players.every(isRoomRole) || new Set(players).size !== players.length) return;
  if (!r.options || !readSichuanRoomSettings({ mode: config.mode, settings: r.options })
    || !integer(r.options.timeLimit, 3600) || typeof r.options.density !== 'number'
    || (r.options.theme as string) === 'random' || !integer(r.beginsAt) || !integer(r.revision, 340)
    || !r.ready || players.some(role => r.ready?.[role] !== undefined && typeof r.ready[role] !== 'boolean')
    || Boolean(r.beginsAt) !== players.every(role => r.ready?.[role] === true) || !r.boards || !r.stats) return;
  const { size, theme } = r.options;
  const boards: Seats<PuzzleBoard> = {};
  for (const role of players as Role[]) {
    const board = r.boards[role], stats = r.stats[role];
    if (!board || !Array.isArray(board.tiles) || board.tiles.length !== size ** 2 || !integer(board.shufflesLeft, 5)
      || (board.hintsLeft !== undefined && !integer(board.hintsLeft, 5))
      || board.tiles.some(tile => tile !== null && tile !== obstacle && !integer(tile, motifCount(theme) - 1))
      || !stats || !integer(stats.removed, size ** 2) || !integer(stats.maxCombo, size ** 2 / 2)
      || !integer(stats.streak, stats.maxCombo) || !integer(stats.lastAt)) return;
    if (board.hint !== undefined && (!Array.isArray(board.hint) || board.hint.length !== 2
      || !board.hint.every(index => integer(index, size ** 2 - 1)) || !connectTiles(board.tiles, board.hint[0], board.hint[1]))) return;
    boards[role] = { ...board, hintsLeft: board.hintsLeft ?? 0 };
  }
  if (r.result !== undefined && !players.includes(r.result as Role) && !['team', 'timeout', 'abandoned'].includes(r.result)) return;
  const event = r.event;
  if (event !== undefined) {
    if (!event || !players.includes(event.actor)) return;
    if (event.kind !== 'shuffle' && event.kind !== 'hint' && (event.kind !== 'pair' || !integer(event.combo, size ** 2 / 2)
      || !Array.isArray(event.path) || event.path.length < 2 || event.path.length > 4
      || event.path.some(point => !Array.isArray(point) || point.length !== 2 || point.some(axis => !Number.isInteger(axis) || axis < -1 || axis > size)))) return;
  }
  return { ...r as PuzzleRound, players, boards, options: { ...r.options, hints: r.options.hints ?? defaultHints } };
}
