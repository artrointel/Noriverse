import { isRoomGame, isRoomRole, roomCapacity, roomRoles } from '../../../../packages/protocol/rooms.ts';
import { isTilePuzzle } from '../../../../packages/protocol/games.ts';
import { minimumRoomPlayers } from '../../../../packages/protocol/games.ts';
import type { MatchOutcome } from '../../../../packages/protocol/profile.ts';
import type { Participant, Role, RoomGame } from '../../../../packages/protocol/rooms.ts';
import { boardRules, isBoardGame, isTurnBasedGame } from '../games/board-rules.ts';
import { defaultOmokOverline, isOmokOverline } from '../games/omok/rules.ts';
import type { OmokOverline } from '../games/omok/rules.ts';
import { createFlickRound, flickPlayers, readFlickRound, readFlickSettings, settledStatus } from '../games/alkkagi/rules.ts';
import type { FlickPlayer, FlickPower, FlickRound, FlickSettings } from '../games/alkkagi/rules.ts';
import { oppositeStone } from '../games/table.ts';
import type { Stone } from '../games/table.ts';
import { isTurnLimit, readPendingTimeout } from '../games/turn-clock.ts';
import type { PendingTimeout, TurnLimit } from '../games/turn-clock.ts';
import { readSichuanRoomSettings } from '../games/sichuan/options.ts';
import type { SichuanRoomSettings } from '../games/sichuan/options.ts';
import { puzzleOutcome, readPuzzleRound } from '../games/sichuan/multiplayer.ts';
import type { PuzzleRound } from '../games/sichuan/multiplayer.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { readSketchRound, readSketchSettings, sketchOutcome } from '../games/sketch/rules.ts';
import type { SketchRound, SketchSettings } from '../games/sketch/rules.ts';
import { liarOutcome, readLiarSettings, readLiarView } from '../games/liar/rules.ts';
import type { LiarSettings, LiarView, LiarRound } from '../games/liar/rules.ts';
import { orbitOutcome, readOrbitRound } from '../games/slime/rules.ts';
import type { OrbitRound } from '../games/slime/rules.ts';
import { moleOutcome, readMoleRound, readMoleSettings, shiftMoleClock } from '../games/mole/rules.ts';
import type { MoleRound, MoleSettings } from '../games/mole/rules.ts';

export type Match = { id: string; game: RoomGame; hostColor: Stone; startedAt: number; finishedAt: number; allowDoubleThree: boolean; overline: OmokOverline;
  history: number[]; physics?: FlickRound; physicsSeats?: Role[]; flickSettings?: FlickSettings; power?: FlickPower;
  surrendered?: Stone; timedOut?: Stone; timeoutPending?: PendingTimeout;
  puzzleConfig?: SichuanRoomSettings; puzzle?: PuzzleRound;
  sketchConfig?: SketchSettings; sketch?: SketchRound;
  liarConfig?: LiarSettings; liar?: LiarView | LiarRound;
  slime?: OrbitRound;
  moleConfig?: MoleSettings; mole?: MoleRound;
  mockSeats?: Role[];
  turnLimit: TurnLimit; deadline: number; beginsAt?: number; clockOffset?: number; pausedAt?: number; pausedMs?: number;
  disconnectedSeats?: Role[] };
export const blankMatch: Match = { id: '', game: 'omok', hostColor: 1, startedAt: 0, finishedAt: 0, allowDoubleThree: true,
  overline: defaultOmokOverline, history: [], turnLimit: 0, deadline: 0 };
export function lobbyMatch(game: RoomGame, settings: MatchSettings): Match {
  const { allowDoubleThree, overline, power, turnLimit, flick, puzzle, memory, sketch, liar, mole } = settings;
  return { ...blankMatch, id: crypto.randomUUID(), game, allowDoubleThree, overline, power,
    turnLimit: isTurnBasedGame(game) ? turnLimit : 0, sketchConfig: game === 'sketch' ? sketch : undefined,
    liarConfig: game === 'liar' ? liar : undefined,
    moleConfig: game === 'mole' ? mole : undefined,
    puzzleConfig: game === 'memory' ? memory : game === 'sichuan' ? puzzle : undefined, flickSettings: game === 'physics' ? flick : undefined,
    physics: game === 'physics' ? createFlickRound(flick) : undefined };
}

export function matchColor(match: Match, role: Role): FlickPlayer | undefined {
  if (match.physicsSeats) return flickPlayers[match.physicsSeats.indexOf(role)];
  return role === 'host' ? match.hostColor : oppositeStone(match.hostColor);
}

export function inRound(match: Match, role: Role) {
  return !match.mockSeats?.includes(role) && (!match.puzzle || match.puzzle.players.includes(role)) && (!match.physicsSeats || match.physicsSeats.includes(role))
    && (!match.sketch || match.sketch.players.includes(role)) && (!match.liar || match.liar.players.includes(role))
    && (!match.slime || match.slime.players.includes(role)) && (!match.mole || match.mole.players.includes(role));
}

export function mockSeatsFor(game: RoomGame, participants: readonly Participant[], count: number) {
  const taken = new Set<Role>(['host', ...participants.map(player => player.role)]);
  return roomRoles.filter(role => !taken.has(role)).slice(0, Math.max(0, Math.min(count, roomCapacity[game] - taken.size)));
}

export function roundSeats(game: RoomGame, peers: Role[], participants: Participant[]): Role[] | undefined {
  if (peers.length + 1 < minimumRoomPlayers(game) || peers.length + 1 > roomCapacity[game]
    || participants.some(person => person.role !== 'host' && !peers.includes(person.role))) return;
  return ['host', ...peers];
}

export function matchTurn(match: Match) {
  if (match.physics) {
    const status = settledStatus(match.physics);
    return status.phase === 'aim' ? status.turn : undefined;
  }
  return isBoardGame(match.game) ? boardRules[match.game].turn(match.history) : undefined;
}

export function matchWinner(match: Match) {
  return match.physics ? settledStatus(match.physics).winner : isBoardGame(match.game) ? boardRules[match.game].result(match.history, match.overline) : undefined;
}

export function matchOutcome(match: Match, role: Role): Exclude<MatchOutcome, 'practice'> | undefined {
  if (!match.finishedAt) return;
  if (match.mole) return moleOutcome(match.mole, role);
  if (match.slime) return orbitOutcome(match.slime, role);
  if (match.liar) return liarOutcome(match.liar, role);
  if (match.sketch) return sketchOutcome(match.sketch, role);
  if (match.puzzle?.result) return puzzleOutcome(match.puzzle.result, role);
  const loser = match.surrendered ?? match.timedOut;
  const winner = loser ? oppositeStone(loser) : matchWinner(match);
  return winner === 'draw' ? 'draw' : winner ? winner === matchColor(match, role) ? 'win' : 'loss' : undefined;
}

export function matchBeginsAt(match: Match) {
  return match.puzzle?.beginsAt ?? match.beginsAt ?? match.startedAt;
}

export function matchInProgress(match: Match, now: number) {
  const begins = matchBeginsAt(match);
  return begins > 0 && now >= begins && !match.finishedAt && !match.pausedAt;
}

export function resumeMatchClock(match: Match, now: number): Match {
  if (!match.pausedAt) return match;
  const duration = Math.max(1, now - match.pausedAt);
  const shift = (time: number) => time ? time + duration : 0;
  const puzzle = match.puzzle && { ...match.puzzle, beginsAt: shift(match.puzzle.beginsAt),
    stats: { ...match.puzzle.stats } };
  for (const role of puzzle?.players ?? []) {
    const stats = puzzle!.stats[role];
    if (stats) puzzle!.stats[role] = { ...stats, lastAt: shift(stats.lastAt) };
  }
  const slime = match.slime && { ...match.slime, tickAt: shift(match.slime.tickAt), boards: { ...match.slime.boards } };
  for (const role of slime?.players ?? []) {
    const board = slime!.boards[role];
    if (board?.resolution) slime!.boards[role] = { ...board, resolution: { ...board.resolution, until: shift(board.resolution.until) } };
  }
  return { ...match, pausedAt: undefined, disconnectedSeats: undefined, pausedMs: (match.pausedMs ?? 0) + duration,
    beginsAt: match.beginsAt === undefined ? undefined : shift(match.beginsAt),
    deadline: shift(match.deadline),
    timeoutPending: match.timeoutPending && { ...match.timeoutPending, at: shift(match.timeoutPending.at) },
    puzzle, slime,
    mole: match.mole && shiftMoleClock(match.mole, duration),
    sketch: match.sketch && { ...match.sketch, opensAt: shift(match.sketch.opensAt), deadline: shift(match.sketch.deadline) },
    liar: match.liar && { ...match.liar, deadline: shift(match.liar.deadline) } };
}

function matchRevision(match: Match) {
  return match.mole?.revision ?? match.slime?.revision ?? match.liar?.revision ?? match.sketch?.revision ?? match.puzzle?.revision ?? match.physics?.revision ?? match.history.length;
}

function followsSnapshot(current: Match, next: Match) {
  if (next.id !== current.id) return true;
  const previousRevision = matchRevision(current);
  const nextRevision = matchRevision(next);
  const addedPause = (next.pausedMs ?? 0) - (current.pausedMs ?? 0);
  if (addedPause < 0 || !addedPause && current.pausedAt && current.pausedAt !== next.pausedAt) return false;
  const previousClock = current.timeoutPending?.at ?? current.deadline;
  const nextClock = next.timeoutPending?.at ?? next.deadline;
  if (previousRevision === nextRevision && previousClock && nextClock
    && (nextClock < previousClock || (nextClock === previousClock && current.timeoutPending && !next.timeoutPending))) return false;
  return nextRevision >= previousRevision && next.finishedAt >= current.finishedAt
    && (current.beginsAt === undefined || (next.beginsAt !== undefined && (!current.beginsAt || next.beginsAt === current.beginsAt + addedPause)))
    && next.hostColor === current.hostColor && next.game === current.game
    && next.allowDoubleThree === current.allowDoubleThree && next.overline === current.overline && next.turnLimit === current.turnLimit
    && (nextRevision > previousRevision || !current.physics?.shot || Boolean(next.physics?.shot || next.finishedAt));
}

export function readMatchSnapshot(raw: unknown, current: Match, receivedAt: number): Match | undefined {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
  if (!(raw.type === 'snapshot' && 'id' in raw && typeof raw.id === 'string' && raw.id.length <= 64
    && 'history' in raw && 'startedAt' in raw && typeof raw.startedAt === 'number'
    && Number.isSafeInteger(raw.startedAt) && raw.startedAt >= 0
    && 'finishedAt' in raw && typeof raw.finishedAt === 'number'
    && Number.isSafeInteger(raw.finishedAt) && (raw.finishedAt === 0 || raw.finishedAt >= raw.startedAt)
    && 'allowDoubleThree' in raw && typeof raw.allowDoubleThree === 'boolean')) return;
  const game = 'game' in raw ? raw.game : 'omok';
  if (!isRoomGame(game)) return;
  const mockSeats = 'mockSeats' in raw ? raw.mockSeats : undefined;
  if (mockSeats !== undefined && (!Array.isArray(mockSeats) || mockSeats.length >= roomCapacity[game]
    || !mockSeats.every(role => isRoomRole(role) && role !== 'host') || new Set(mockSeats).size !== mockSeats.length)) return;
  const puzzleConfig = isTilePuzzle(game) && 'puzzleConfig' in raw ? readSichuanRoomSettings(raw.puzzleConfig, game === 'memory') : undefined;
  if (isTilePuzzle(game) && !puzzleConfig) return;
  const puzzle = puzzleConfig && 'puzzle' in raw ? readPuzzleRound(raw.puzzle, puzzleConfig, game === 'memory') : undefined;
  if (puzzleConfig && (Boolean(raw.startedAt) !== Boolean(puzzle) || Boolean(raw.finishedAt) !== Boolean(puzzle?.result))) return;
  const sketchConfig = game === 'sketch' && 'sketchConfig' in raw ? readSketchSettings(raw.sketchConfig) : undefined;
  if (game === 'sketch' && !sketchConfig) return;
  const sketch = sketchConfig && 'sketch' in raw ? readSketchRound(raw.sketch, sketchConfig) : undefined;
  if (sketchConfig && (Boolean(raw.startedAt) !== Boolean(sketch) || Boolean(raw.finishedAt) !== (sketch?.phase === 'done'))) return;
  const liarConfig = game === 'liar' && 'liarConfig' in raw ? readLiarSettings(raw.liarConfig) : undefined;
  if (game === 'liar' && !liarConfig) return;
  const liar = liarConfig && 'liar' in raw ? readLiarView(raw.liar) : undefined;
  if (liarConfig && (Boolean(raw.startedAt) !== Boolean(liar) || Boolean(raw.finishedAt) !== Boolean(liar?.result))) return;
  const slime = game === 'slime' && 'slime' in raw ? readOrbitRound(raw.slime) : undefined;
  if (game === 'slime' && (Boolean(raw.startedAt) !== Boolean(slime) || Boolean(raw.finishedAt) !== Boolean(slime?.winner)
    || mockSeats?.some(role => slime && !slime.players.includes(role)))) return;
  const moleConfig = game === 'mole' && 'moleConfig' in raw ? readMoleSettings(raw.moleConfig) : undefined;
  const mole = moleConfig && 'mole' in raw ? readMoleRound(raw.mole) : undefined;
  if (game === 'mole' && (!moleConfig || Boolean(raw.startedAt) !== Boolean(mole) || Boolean(raw.finishedAt) !== Boolean(mole?.winners)
    || (mole && (mole.settings.mode !== moleConfig.mode || mole.settings.seconds !== moleConfig.seconds || mole.settings.size !== moleConfig.size
      || mockSeats?.some(role => !mole.players.includes(role)))))) return;
  const power = 'power' in raw ? raw.power : 1;
  if (power !== 1 && power !== 1.35) return;
  const physics = game === 'physics' && 'physics' in raw ? readFlickRound(raw.physics, power) : undefined;
  if (game === 'physics' && !physics) return;
  const flickSettings = game === 'physics' && 'flickSettings' in raw ? readFlickSettings(raw.flickSettings) : physics?.settings;
  if (game === 'physics' && !flickSettings) return;
  const physicsSeats = 'physicsSeats' in raw ? raw.physicsSeats : undefined;
  if (physicsSeats !== undefined && (!physics || !Array.isArray(physicsSeats) || physicsSeats.length !== (physics.players ?? 2)
    || !physicsSeats.every(isRoomRole) || !physicsSeats.includes('host') || new Set(physicsSeats).size !== physicsSeats.length)) return;
  if (physics && (physics.players ?? 2) > 2 && !physicsSeats) return;
  const nextHostColor = 'hostColor' in raw ? raw.hostColor : 1;
  if (nextHostColor !== 1 && (nextHostColor !== 2 || !isTurnBasedGame(game))) return;
  const endedBySurrender = 'surrendered' in raw ? raw.surrendered : undefined;
  if (endedBySurrender !== undefined && (endedBySurrender !== 1 && endedBySurrender !== 2 || raw.finishedAt === 0)) return;
  const timeoutColor = 'timedOut' in raw ? raw.timedOut : undefined;
  if (timeoutColor !== undefined && (timeoutColor !== 1 && timeoutColor !== 2 || !raw.finishedAt || endedBySurrender)) return;
  const pending = 'timeoutPending' in raw ? readPendingTimeout(raw.timeoutPending, raw.startedAt) : undefined;
  if ('timeoutPending' in raw && raw.timeoutPending !== undefined && (!pending || raw.finishedAt || physics?.shot)) return;
  const nextLimit = 'turnLimit' in raw ? raw.turnLimit : 0;
  const nextDeadlineAt = 'deadline' in raw ? raw.deadline : 0;
  const beginsAt = 'beginsAt' in raw ? raw.beginsAt : undefined;
  const pausedAt = 'pausedAt' in raw ? raw.pausedAt : undefined;
  const pausedMs = 'pausedMs' in raw ? raw.pausedMs : undefined;
  const disconnectedSeats = 'disconnectedSeats' in raw ? raw.disconnectedSeats : undefined;
  if (pausedAt !== undefined && (typeof pausedAt !== 'number' || !Number.isSafeInteger(pausedAt)
    || !raw.startedAt || pausedAt < raw.startedAt || raw.finishedAt)) return;
  if (pausedMs !== undefined && (typeof pausedMs !== 'number' || !Number.isSafeInteger(pausedMs) || pausedMs < 0 || !raw.startedAt)) return;
  if (disconnectedSeats !== undefined && (!pausedAt || !Array.isArray(disconnectedSeats) || !disconnectedSeats.length
    || disconnectedSeats.length >= roomCapacity[game] || !disconnectedSeats.every(role => isRoomRole(role) && role !== 'host')
    || new Set(disconnectedSeats).size !== disconnectedSeats.length)) return;
  if (beginsAt !== undefined && (typeof beginsAt !== 'number' || !Number.isSafeInteger(beginsAt) || beginsAt < 0
    || (beginsAt > 0 && (!raw.startedAt || beginsAt < raw.startedAt)))) return;
  const playStart = beginsAt ?? raw.startedAt;
  if (mole && mole.start !== playStart) return;
  if (slime && (slime.winner ? !playStart
    : playStart ? slime.tickAt < playStart : slime.tickAt !== 0)) return;
  if (!isTurnLimit(nextLimit) || typeof nextDeadlineAt !== 'number' || !Number.isSafeInteger(nextDeadlineAt)
    || (nextLimit && playStart && !raw.finishedAt && !physics?.shot && !pending ? nextDeadlineAt < playStart + nextLimit * 1000 : nextDeadlineAt !== 0)) return;
  const nextOverline = 'overline' in raw ? raw.overline : 'freestyle';
  if (!isOmokOverline(nextOverline)) return;
  const history = isBoardGame(game) ? boardRules[game].readHistory(raw.history, raw.allowDoubleThree, nextOverline) : [];
  if (!history) return;
  const measuredOffset = 'sentAt' in raw && typeof raw.sentAt === 'number' && Number.isSafeInteger(raw.sentAt)
    ? receivedAt - raw.sentAt : 0;
  const synchronizedStart = puzzle?.beginsAt || beginsAt;
  const clockOffset = synchronizedStart && raw.id === current.id && matchBeginsAt(current) > 0
    ? current.clockOffset ?? measuredOffset : measuredOffset;
  const next: Match = { id: raw.id, game, hostColor: nextHostColor, startedAt: raw.startedAt, finishedAt: raw.finishedAt, allowDoubleThree: raw.allowDoubleThree,
    overline: nextOverline, history, physics, power, surrendered: endedBySurrender, timedOut: timeoutColor, timeoutPending: pending,
    turnLimit: nextLimit, deadline: nextDeadlineAt, beginsAt, clockOffset, pausedAt, pausedMs, disconnectedSeats,
    puzzleConfig, puzzle, sketchConfig, sketch, liarConfig, liar, slime, moleConfig, mole, flickSettings, physicsSeats, mockSeats };
  if (pending && (!nextLimit || pending.color !== matchTurn(next))) return;
  if (disconnectedSeats?.some(role => !inRound(next, role))) return;
  if (followsSnapshot(current, next)) return next;
}
