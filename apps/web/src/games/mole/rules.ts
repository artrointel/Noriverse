import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';

export const moleSizes = [3, 4] as const;
export const moleTimes = [30, 60, 90] as const;
export const moleModes = ['timed', 'endless'] as const;
export type MoleSettings = { size: typeof moleSizes[number]; seconds: typeof moleTimes[number]; mode: typeof moleModes[number] };
export const defaultMoleSettings: MoleSettings = { size: 3, seconds: 60, mode: 'timed' };
export const moleHardLimit = 180_000;
export const feverThreshold = 30;
export const feverDuration = 5_000;
export const giantDuration = 3_000;
const firstSpawn = 350;
const strikeInterval = 80;
const targetKinds = ['crew', 'armored', 'trap', 'bonus'] as const;
type TargetKind = typeof targetKinds[number];
type AttackKind = 'fog' | 'decoys';
type StrikeKind = TargetKind | 'giant' | 'armor';
export type MoleTarget = { id: number; cell: number; character: number; kind: TargetKind; hp: number; from: number; until: number };
export type MoleStrike = { id: number; at: number; cell: number; kind: StrikeKind; points: number; timeDelta: number; fever: boolean };
export type MoleBoard = {
  score: number; combo: number; best: number; caught: number; sequence: number; next: number;
  until: number; feverUntil: number; giantUntil: number; fogUntil: number; decoys: number;
  out: boolean; resigned: boolean; targets: MoleTarget[]; strike?: MoleStrike;
};
export type MoleRound = { players: Role[]; boards: Partial<Record<Role, MoleBoard>>; settings: MoleSettings; seed: number;
  start: number; revision: number; winners?: Role[] };

export function readMoleSettings(raw: unknown): MoleSettings | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { size, seconds, mode } = raw as MoleSettings;
  if (moleSizes.includes(size) && moleTimes.includes(seconds) && moleModes.includes(mode)) return { size, seconds, mode };
}

export function createMoleRound(settings: MoleSettings, players: Role[], seed = Math.floor(Math.random() * 0x1_0000_0000)): MoleRound {
  const boards: MoleRound['boards'] = {};
  for (const role of players) boards[role] = {
    score: 0, combo: 0, best: 0, caught: 0, sequence: 0, next: 0, until: 0,
    feverUntil: 0, giantUntil: 0, fogUntil: 0, decoys: 0, out: false, resigned: false, targets: [],
  };
  return { players, boards, settings, seed, start: 0, revision: 0 };
}

export function startMoleRound(round: MoleRound, start: number): MoleRound {
  const boards = { ...round.boards };
  const limit = (round.settings.mode === 'endless' ? 60 : round.settings.seconds) * 1000;
  for (const role of round.players) boards[role] = { ...boards[role]!, next: start + firstSpawn, until: start + limit };
  return { ...round, boards, start, revision: round.revision + 1 };
}

function randomAt(seed: number, sequence: number, stream: number) {
  let value = seed ^ Math.imul(sequence, 0x9e3779b1) ^ Math.imul(stream, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 0x1_0000_0000;
}

function winnerSeats(round: MoleRound, boards: MoleRound['boards']) {
  const eligible = round.players.filter(role => !boards[role]!.resigned);
  if (eligible.length > 1 && eligible.some(role => !boards[role]!.out)) return;
  if (round.players.length === 1 && eligible.some(role => !boards[role]!.out)) return;
  const best = Math.max(...eligible.map(role => boards[role]!.score));
  return eligible.filter(role => boards[role]!.score === best);
}

function changed(round: MoleRound, boards: MoleRound['boards']): MoleRound {
  return { ...round, boards, winners: winnerSeats(round, boards), revision: round.revision + 1 };
}

export function nextMoleAt(round: MoleRound) {
  if (!round.start || round.winners) return;
  let next = Infinity;
  for (const role of round.players) {
    const board = round.boards[role]!;
    if (board.out) continue;
    next = Math.min(next, board.until, board.next, ...board.targets.map(target => target.until));
  }
  return Number.isFinite(next) ? next : undefined;
}

export function advanceMole(round: MoleRound, now: number): MoleRound | undefined {
  const next = nextMoleAt(round);
  if (next === undefined || now < next) return;
  const boards = { ...round.boards };
  const grid = round.settings.size;
  const speed = Math.min(1, (now - round.start) / (round.settings.mode === 'endless' ? 112_000 : 90_000));
  for (const role of round.players) {
    const board = boards[role]!;
    if (board.out) continue;
    if (board.until <= now) {
      boards[role] = { ...board, out: true, targets: [] };
      continue;
    }
    const expired = board.targets.filter(target => target.until <= now);
    const targets = board.targets.filter(target => target.until > now);
    const combo = expired.some(target => target.kind !== 'trap') ? 0 : board.combo;
    if (board.next > now) {
      if (expired.length) boards[role] = { ...board, targets, combo };
      continue;
    }
    const interval = Math.round((grid === 4 ? 760 : 865) - speed * 510);
    const nextAt = now + interval;
    const free = Array.from({ length: grid ** 2 }, (_, cell) => cell).filter(cell => !targets.some(target => target.cell === cell));
    if (board.giantUntil > now || !free.length || targets.length >= grid + 1) {
      boards[role] = { ...board, targets, combo, next: Math.max(board.giantUntil, nextAt) };
      continue;
    }
    const index = board.sequence + 1;
    const roll = randomAt(round.seed, index, 1);
    const kind: TargetKind = board.decoys ? 'trap'
      : index % 22 === 0 && board.until - now >= giantDuration + 1900 ? 'bonus'
        : index > 5 && roll < .12 + speed * .12 ? 'trap'
        : index > 6 && roll > .79 ? 'armored' : 'crew';
    const lifetime = Math.round((grid === 4 ? 1710 : 1590) - speed * 1200) + (kind === 'armored' ? 340 : kind === 'bonus' ? 200 : 0);
    const character = kind === 'trap' ? 4 : kind === 'bonus' ? 5 : kind === 'armored' ? 3 : Math.floor(randomAt(round.seed, index, 3) * 3);
    targets.push({ id: index, cell: free[Math.floor(randomAt(round.seed, index, 2) * free.length)], character, kind,
      hp: kind === 'armored' ? speed > .64 ? 3 : 2 : 1, from: now, until: now + lifetime });
    boards[role] = { ...board, targets, combo, sequence: index, next: nextAt, decoys: Math.max(0, board.decoys - 1) };
  }
  return changed(round, boards);
}

function sendAttack(round: MoleRound, boards: MoleRound['boards'], actor: Role, attack: AttackKind, now: number) {
  const at = round.players.indexOf(actor);
  for (let offset = 1; offset < round.players.length; offset++) {
    const role = round.players[(at + offset) % round.players.length];
    const rival = boards[role]!;
    if (rival.out || rival.until <= now) continue;
    boards[role] = attack === 'fog' ? { ...rival, fogUntil: Math.max(rival.fogUntil, now + 2200) }
      : { ...rival, decoys: Math.min(4, rival.decoys + 3) };
    return;
  }
}

export function strikeMole(round: MoleRound, actor: Role, targetId: unknown, now: number): MoleRound | undefined {
  const board = round.boards[actor];
  if (typeof targetId !== 'number' || !Number.isSafeInteger(targetId) || !round.start || round.winners
    || !board || board.out || !round.players.includes(actor) || now < round.start || now >= board.until
    || (board.strike && now - board.strike.at < strikeInterval)) return;
  const giant = targetId === 0 && board.giantUntil > now;
  const target = !giant ? board.targets.find(target => target.id === targetId && target.until > now) : undefined;
  if (!giant && !target) return;
  const kind: StrikeKind = giant ? 'giant' : target!.hp > 1 ? 'armor' : target!.kind;
  const scoredCatch = kind === 'crew' || kind === 'armored' || kind === 'bonus';
  const combo = kind === 'trap' ? 0 : board.combo + Number(scoredCatch);
  const triggersFever = scoredCatch && combo % feverThreshold === 0;
  const fever = board.feverUntil > now || triggersFever;
  const points = ({ crew: 10, armored: 25, bonus: 35, trap: -20, giant: 6, armor: 0 }[kind]) * (fever ? 2 : 1);
  let until = board.until;
  if (round.settings.mode === 'endless') {
    const speed = Math.min(1, (now - round.start) / 125_000);
    if (scoredCatch) until = Math.min(round.start + moleHardLimit, until + Math.round(90 + 1270 * (1 - speed) ** 2));
    if (kind === 'trap') until = Math.max(now, until - (fever ? 3200 : 1600));
  }
  const out = until <= now;
  const targets = out || kind === 'bonus' ? [] : board.targets.flatMap(item =>
    item !== target ? [item] : kind === 'armor' ? [{ ...item, hp: item.hp - 1 }] : []);
  const boards: MoleRound['boards'] = { ...round.boards, [actor]: {
    ...board, targets, out, until, combo, best: Math.max(board.best, combo), caught: board.caught + Number(scoredCatch),
    score: board.score + points, feverUntil: triggersFever ? now + feverDuration : board.feverUntil,
    giantUntil: kind === 'bonus' ? now + giantDuration : board.giantUntil,
    next: kind === 'bonus' ? now + giantDuration : board.next,
    strike: { id: (board.strike?.id ?? 0) + 1, at: now, kind, cell: target?.cell ?? -1, points, timeDelta: until - board.until, fever },
  } };
  if (triggersFever || kind === 'bonus') sendAttack(round, boards, actor, 'fog', now);
  if (kind === 'bonus' || scoredCatch && combo % 15 === 0) sendAttack(round, boards, actor, 'decoys', now);
  return changed(round, boards);
}

export function resignMole(round: MoleRound, actor: Role) {
  const board = round.boards[actor];
  if (!board || round.winners || board.resigned) return;
  return changed(round, { ...round.boards, [actor]: { ...board, out: true, resigned: true, targets: [] } });
}

export function moleOutcome(round: MoleRound, actor: Role) {
  if (!round.winners || !round.players.includes(actor)) return;
  return !round.winners.includes(actor) ? 'loss' : round.winners.length > 1 ? 'draw' : 'win';
}

export function shiftMoleClock(round: MoleRound, delay: number): MoleRound {
  if (!round.start) return round;
  const shift = (value: number) => value ? value + delay : 0;
  const boards = { ...round.boards };
  for (const role of round.players) {
    const board = boards[role]!;
    boards[role] = { ...board, next: shift(board.next), until: shift(board.until), feverUntil: shift(board.feverUntil),
      giantUntil: shift(board.giantUntil), fogUntil: shift(board.fogUntil),
      targets: board.targets.map(target => ({ ...target, from: shift(target.from), until: shift(target.until) })),
      strike: board.strike && { ...board.strike, at: shift(board.strike.at) } };
  }
  return { ...round, boards, start: shift(round.start) };
}

const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

export function readMoleRound(raw: unknown): MoleRound | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { players, boards, seed, start, revision, winners, settings } = raw as MoleRound;
  const config = readMoleSettings(settings);
  if (!config || !Array.isArray(players) || players.length < 2 || players.length > 4 || players[0] !== 'host'
    || !players.every(isRoomRole) || new Set(players).size !== players.length || !boards || typeof boards !== 'object'
    || !integer(seed, 0xffffffff) || !integer(start) || !integer(revision)) return;
  if (winners !== undefined && (!Array.isArray(winners) || new Set(winners).size !== winners.length
    || !winners.every(role => players.includes(role)))) return;
  const validated: MoleRound['boards'] = {};
  for (const role of players) {
    const board = boards[role];
    if (!board || !Number.isSafeInteger(board.score) || Math.abs(board.score) > 100_000
      || ![board.combo, board.best, board.caught, board.sequence, board.next, board.until, board.feverUntil,
        board.giantUntil, board.fogUntil].every(value => integer(value)) || board.combo > board.best || board.best > board.caught
      || !integer(board.decoys, 4) || typeof board.out !== 'boolean' || typeof board.resigned !== 'boolean'
      || !Array.isArray(board.targets) || board.targets.length > config.size + 1
      || new Set(board.targets.map(target => target?.cell)).size !== board.targets.length
      || new Set(board.targets.map(target => target?.id)).size !== board.targets.length
      || !board.targets.every(target => target && target.id > 0 && integer(target.id, board.sequence) && integer(target.cell, config.size ** 2 - 1)
        && integer(target.character, 5) && targetKinds.includes(target.kind) && integer(target.hp, 3) && target.hp > 0
        && integer(target.from) && integer(target.until) && target.until > target.from)
      || (board.strike && (!integer(board.strike.id) || !integer(board.strike.at)
        || (board.strike.cell !== -1 && !integer(board.strike.cell, config.size ** 2 - 1))
        || !(targetKinds.includes(board.strike.kind as TargetKind) || board.strike.kind === 'armor' || board.strike.kind === 'giant')
        || !Number.isSafeInteger(board.strike.points) || Math.abs(board.strike.points) > 70
        || !Number.isSafeInteger(board.strike.timeDelta) || Math.abs(board.strike.timeDelta) > 3200 || typeof board.strike.fever !== 'boolean'))) return;
    validated[role] = board;
  }
  return { players, boards: validated, seed, start, revision, winners, settings: config };
}
