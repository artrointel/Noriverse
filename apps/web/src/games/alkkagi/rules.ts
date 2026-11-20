import { tableSize } from '../table.ts';

export const flickPlayers = [1, 2, 3, 4] as const;
export type FlickPlayer = typeof flickPlayers[number];
export type AlkkagiWinner = FlickPlayer | 'draw';
export interface AlkkagiStatus {
  turn: FlickPlayer;
  remaining: readonly number[];
  phase: 'aim' | 'moving' | 'finished';
  winner?: AlkkagiWinner;
}

export const initialAlkkagi: AlkkagiStatus = { turn: 1, remaining: [5, 5], phase: 'aim' };
export const alkkagiEdge = 44;
export const flickBoardSizes = ['small', 'standard', 'large'] as const;
export type FlickSettings = { stones: number; board: typeof flickBoardSizes[number]; random: boolean };
export const defaultFlickSettings: FlickSettings = { stones: 5, board: 'standard', random: false };
const edges = { small: 70, standard: alkkagiEdge, large: 23 };
export const flickEdge = (settings: FlickSettings) => edges[settings.board];
export const flickDiameter = (settings: FlickSettings) => Math.min(42, (tableSize - 2 * flickEdge(settings)) * .51 / (settings.stones - 1));

export function readFlickSettings(raw: unknown): FlickSettings | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { stones, board, random } = raw as Partial<FlickSettings>;
  if (typeof stones !== 'number' || !Number.isInteger(stones) || stones < 3 || stones > 7
    || !board || !flickBoardSizes.includes(board) || typeof random !== 'boolean') return;
  return { stones, board, random };
}

export type StonePosition = [number, number] | null;
export type Flick = { stone: number; vx: number; vy: number };
export type FlickPower = 1 | 1.35;
export interface FlickRound {
  layout: StonePosition[]; revision: number; shot?: Flick;
  settings?: FlickSettings; players?: number; turn?: FlickPlayer; eliminated?: FlickPlayer[];
}

const rows = [357, 331, 351, 331, 357];
export const initialFlickRound: FlickRound = {
  revision: 0,
  layout: rows.flatMap((y, index) => [[100 + index * 70, y], [100 + index * 70, tableSize - y]] as StonePosition[]),
};

export function createFlickRound(settings: FlickSettings, players = 2, random = Math.random): FlickRound {
  if (players === 2 && settings.stones === 5 && settings.board === 'standard' && !settings.random) return { ...initialFlickRound, settings };
  const edge = flickEdge(settings);
  const position = (x: number, y: number): StonePosition => [edge + x * (tableSize - 2 * edge), edge + y * (tableSize - 2 * edge)];
  let layout: StonePosition[];
  if (settings.random) {
    // Sample a spaced grid without replacement so no two bodies start in contact.
    const grid = Array.from({ length: 36 }, (_, index) => position(.13 + index % 6 * .148, .13 + Math.floor(index / 6) * .148));
    for (let index = grid.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [grid[index], grid[other]] = [grid[other], grid[index]];
    }
    layout = grid.slice(0, players * settings.stones);
  } else {
    layout = Array.from({ length: settings.stones }, (_, index) => {
      const across = .24 + index * .52 / (settings.stones - 1);
      return [position(across, .86), position(across, .14), position(.14, across), position(.86, across)].slice(0, players);
    }).flat();
  }
  return { settings, players, layout, revision: 0, turn: 1, eliminated: [] };
}

export const pieceOwner = (index: number, players = 2): FlickPlayer => flickPlayers[index % players];
export const flickTurn = (revision: number): FlickPlayer => revision % 2 === 0 ? 1 : 2;
const countRemaining = (round: FlickRound) => {
  const counts = Array<number>(round.players ?? 2).fill(0);
  round.layout.forEach((point, index) => { if (point) counts[pieceOwner(index, round.players) - 1]++; });
  return counts;
};

function nextAlive(turn: FlickPlayer, remaining: readonly number[]) {
  for (let distance = 1; distance <= remaining.length; distance++) {
    const candidate = (turn - 1 + distance) % remaining.length;
    if (remaining[candidate]) return flickPlayers[candidate];
  }
  return turn;
}

export function settledStatus(round: FlickRound): AlkkagiStatus {
  const remaining = countRemaining(round);
  const turn = round.turn ?? flickTurn(round.revision);
  const active = flickPlayers.slice(0, remaining.length).filter(player => remaining[player - 1] > 0);
  if (round.shot) return { turn, remaining, phase: 'moving' };
  return active.length <= 1 ? { turn, remaining, phase: 'finished', winner: active[0] ?? 'draw' }
    : { turn, remaining, phase: 'aim' };
}

export function advanceFlickRound(round: FlickRound, layout: StonePosition[], forfeited?: FlickPlayer): FlickRound {
  const before = settledStatus(round);
  const next = { ...round, layout, revision: round.revision + 1, shot: undefined };
  const remaining = countRemaining(next);
  const eliminated = [...round.eliminated ?? []];
  for (let step = 0; step < remaining.length; step++) {
    const index = (before.turn - 1 + step) % remaining.length;
    if (before.remaining[index] > 0 && !remaining[index]) eliminated.push(flickPlayers[index]);
  }
  return { ...next, eliminated, turn: forfeited && forfeited !== before.turn ? before.turn : nextAlive(before.turn, remaining) };
}

export function readFlick(raw: unknown, round: FlickRound, power: FlickPower): Flick | undefined {
  if (!raw || typeof raw !== 'object' || !('stone' in raw) || !('vx' in raw) || !('vy' in raw)) return;
  const { stone, vx, vy } = raw;
  if (typeof stone !== 'number' || !Number.isInteger(stone) || stone < 0 || !round.layout[stone]
    || pieceOwner(stone, round.players) !== (round.turn ?? flickTurn(round.revision)) || typeof vx !== 'number' || typeof vy !== 'number') return;
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed < 55 || speed > Math.min(820, 740 * power) + 0.001) return;
  return { stone, vx, vy };
}

export function readLayout(value: unknown, settings = defaultFlickSettings, players = 2): StonePosition[] | undefined {
  if (!Array.isArray(value) || value.length !== settings.stones * players) return;
  const layout: StonePosition[] = [];
  for (const point of value) {
    if (point === null) { layout.push(null); continue; }
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || isOffBoard(point[0], point[1], flickEdge(settings))) return;
    layout.push([point[0], point[1]]);
  }
  return layout;
}

export function readFlickRound(value: unknown, power: FlickPower): FlickRound | undefined {
  if (!value || typeof value !== 'object' || !('layout' in value) || !('revision' in value)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0) return;
  const raw = value as Partial<FlickRound>;
  const settings = raw.settings === undefined ? defaultFlickSettings : readFlickSettings(raw.settings);
  const players = raw.players ?? 2;
  if (!settings || !Number.isInteger(players) || players < 2 || players > 4) return;
  if (raw.turn !== undefined && !flickPlayers.slice(0, players).includes(raw.turn)) return;
  if (players > 2 && raw.turn === undefined) return;
  const layout = readLayout(raw.layout, settings, players);
  if (!layout) return;
  const eliminated = raw.eliminated;
  if (eliminated !== undefined && (!Array.isArray(eliminated) || new Set(eliminated).size !== eliminated.length
    || eliminated.some(player => !flickPlayers.slice(0, players).includes(player) || layout.some((point, index) => point && pieceOwner(index, players) === player)))) return;
  const round: FlickRound = { layout, revision: value.revision, settings, players, turn: raw.turn, eliminated };
  const status = settledStatus(round);
  if (!status.winner && !status.remaining[status.turn - 1]) return;
  if (raw.shot !== undefined) {
    const shot = readFlick(raw.shot, round, power);
    if (!shot || status.winner) return;
    round.shot = shot;
  }
  return round;
}

export function isOffBoard(x: number, y: number, edge = alkkagiEdge) {
  const farEdge = tableSize - edge;
  return x < edge || x > farEdge || y < edge || y > farEdge;
}

export function canFlick(status: AlkkagiStatus, owner: FlickPlayer) {
  return status.phase === 'aim' && owner === status.turn;
}

export function endShot(status: AlkkagiStatus): AlkkagiStatus {
  const live = flickPlayers.slice(0, status.remaining.length).filter(player => status.remaining[player - 1] > 0);
  if (live.length <= 1) return { ...status, phase: 'finished', winner: live[0] ?? 'draw' };
  return { ...status, phase: 'aim', turn: nextAlive(status.turn, status.remaining) };
}
