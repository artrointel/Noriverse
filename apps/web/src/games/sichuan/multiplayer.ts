import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { motifCount, readSichuanRoomSettings, resolveSichuanSettings } from './options.ts';
import type { SichuanMode, SichuanRoomSettings } from './options.ts';
import { availableTileMatches, connectTiles, createSichuanBoard, isMatchTile, nextSichuanCombo, obstacle, shuffleTiles } from './rules.ts';
import type { Tile, TilePoint } from './rules.ts';

type Options = ReturnType<typeof resolveSichuanSettings>;
type PuzzleBoard = { tiles: Tile[]; shufflesLeft: number };
export type PuzzleStats = { removed: number; maxCombo: number; streak: number; lastAt: number };
type PuzzleEvent = { actor: Role; kind: 'shuffle' } | { actor: Role; kind: 'pair'; path: TilePoint[]; combo: number };
export type PuzzleResult = 'host' | 'guest' | 'team' | 'timeout' | 'abandoned';
export type PuzzleRound = {
  options: Options; ready: Record<Role, boolean>; beginsAt: number; revision: number;
  boards: Record<Role, PuzzleBoard>; stats: Record<Role, PuzzleStats>; event?: PuzzleEvent; result?: PuzzleResult;
};

const initialStats = (): PuzzleStats => ({ removed: 0, maxCombo: 0, streak: 0, lastAt: 0 });
export const puzzleBoardFor = (round: PuzzleRound, mode: SichuanMode, role: Role) => round.boards[mode === 'coop' ? 'host' : role];
export const puzzleOutcome = (result: PuzzleResult, role: Role) => result === role || result === 'team' ? 'win' : 'loss';
export const puzzleEnd = (round: PuzzleRound) => round.beginsAt ? round.beginsAt + round.options.timeLimit * 1000 : 0;

export function makePuzzleRound(config: SichuanRoomSettings, random = Math.random): PuzzleRound {
  const options = resolveSichuanSettings(config.settings, random);
  const tiles = createSichuanBoard(options, random);
  return { options, ready: { host: false, guest: false }, beginsAt: 0, revision: 0,
    boards: { host: { tiles, shufflesLeft: options.shuffles }, guest: { tiles: [...tiles], shufflesLeft: options.shuffles } },
    stats: { host: initialStats(), guest: initialStats() } };
}

export function readyPuzzle(round: PuzzleRound, role: Role, now: number): PuzzleRound | undefined {
  if (round.ready[role]) return;
  const ready = { ...round.ready, [role]: true };
  return { ...round, ready, beginsAt: ready.host && ready.guest ? now + 1100 : 0, revision: round.revision + 1 };
}

export type PuzzleAction = { kind: 'pair'; first: number; second: number; generation: number }
  | { kind: 'shuffle'; generation: number };

export function applyPuzzleAction(round: PuzzleRound, mode: SichuanMode, actor: Role, raw: unknown, now: number, random = Math.random): PuzzleRound | undefined {
  if (!raw || typeof raw !== 'object' || round.result || !round.beginsAt || now < round.beginsAt || now >= puzzleEnd(round)) return;
  const action = raw as Partial<PuzzleAction>;
  const key = mode === 'coop' ? 'host' : actor;
  const board = round.boards[key];
  if (action.generation !== board.shufflesLeft) return;
  if (action.kind === 'shuffle') {
    if (!board.shufflesLeft || !board.tiles.some(isMatchTile) || availableTileMatches(board.tiles).pair) return;
    return { ...round, revision: round.revision + 1, event: { kind: 'shuffle', actor },
      boards: { ...round.boards, [key]: { tiles: shuffleTiles(board.tiles, random), shufflesLeft: board.shufflesLeft - 1 } },
      stats: { ...round.stats, [actor]: { ...round.stats[actor], streak: 0, lastAt: 0 } } };
  }
  if (action.kind !== 'pair' || typeof action.first !== 'number' || typeof action.second !== 'number'
    || !Number.isInteger(action.first) || !Number.isInteger(action.second)) return;
  const path = connectTiles(board.tiles, action.first, action.second);
  if (!path) return;
  const tiles = [...board.tiles];
  tiles[action.first] = tiles[action.second] = null;
  const stats = round.stats[actor];
  const combo = nextSichuanCombo(stats.lastAt ? { at: stats.lastAt, count: stats.streak } : undefined, now).count;
  return { ...round, revision: round.revision + 1, event: { kind: 'pair', actor, path, combo },
    result: tiles.some(isMatchTile) ? undefined : mode === 'coop' ? 'team' : actor,
    boards: { ...round.boards, [key]: { ...board, tiles } },
    stats: { ...round.stats, [actor]: { removed: stats.removed + 2, maxCombo: Math.max(stats.maxCombo, combo), streak: combo, lastAt: now } } };
}

const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;

export function readPuzzleRound(value: unknown, config: SichuanRoomSettings): PuzzleRound | undefined {
  if (!value || typeof value !== 'object') return;
  const r = value as Partial<PuzzleRound>;
  if (!r.options || !readSichuanRoomSettings({ mode: config.mode, settings: r.options })
    || !integer(r.options.timeLimit, 3600) || typeof r.options.density !== 'number'
    || (r.options.theme as string) === 'random' || !integer(r.beginsAt) || !integer(r.revision, 200)
    || !r.ready || typeof r.ready.host !== 'boolean' || typeof r.ready.guest !== 'boolean'
    || Boolean(r.beginsAt) !== (r.ready.host && r.ready.guest)
    || !r.boards || !r.stats) return;
  const { size, theme } = r.options;
  for (const role of ['host', 'guest'] as const) {
    const board = r.boards[role], stats = r.stats[role];
    if (!board || !Array.isArray(board.tiles) || board.tiles.length !== size ** 2 || !integer(board.shufflesLeft, 5)
      || board.tiles.some(tile => tile !== null && tile !== obstacle && !integer(tile, motifCount(theme) - 1))
      || !stats || !integer(stats.removed, size ** 2) || !integer(stats.maxCombo, size ** 2 / 2)
      || !integer(stats.streak, stats.maxCombo) || !integer(stats.lastAt)) return;
  }
  if (r.result !== undefined && !['host', 'guest', 'team', 'timeout', 'abandoned'].includes(r.result)) return;
  const event = r.event;
  if (event !== undefined && (!event || (event.actor !== 'host' && event.actor !== 'guest')
    || (event.kind !== 'shuffle' && (event.kind !== 'pair' || !integer(event.combo, size ** 2 / 2)
      || !Array.isArray(event.path) || event.path.length < 2 || event.path.length > 4
      || event.path.some(point => !Array.isArray(point) || point.length !== 2 || point.some(axis => !Number.isInteger(axis) || axis < -1 || axis > size)))))) return;
  return r as PuzzleRound;
}
