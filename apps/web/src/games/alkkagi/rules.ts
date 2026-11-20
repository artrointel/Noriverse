import { oppositeStone, tableSize } from '../table.ts';
import type { Stone } from '../table.ts';

export type AlkkagiWinner = Stone | 'draw';
export interface AlkkagiStatus {
  turn: Stone;
  remaining: readonly [number, number];
  phase: 'aim' | 'moving' | 'finished';
  winner?: AlkkagiWinner;
}

export const initialAlkkagi: AlkkagiStatus = { turn: 1, remaining: [5, 5], phase: 'aim' };
export const alkkagiEdge = 44;
export type StonePosition = [number, number] | null;
export type Flick = { stone: number; vx: number; vy: number };
export type FlickPower = 1 | 1.35;
export interface FlickRound { layout: StonePosition[]; revision: number; shot?: Flick }
const rows = [357, 331, 351, 331, 357];
export const initialFlickRound: FlickRound = {
  revision: 0,
  layout: rows.flatMap((y, index) => [[100 + index * 70, y], [100 + index * 70, tableSize - y]] as StonePosition[]),
};

export const pieceOwner = (index: number): Stone => index % 2 === 0 ? 1 : 2;
export const flickTurn = (revision: number): Stone => revision % 2 === 0 ? 1 : 2;

export function settledStatus(round: FlickRound): AlkkagiStatus {
  const remaining: [number, number] = [0, 0];
  round.layout.forEach((point, index) => { if (point) remaining[index % 2]++; });
  const turn = flickTurn(round.revision);
  const next = endShot({ turn: oppositeStone(turn), remaining, phase: 'moving' });
  return round.shot ? { ...next, phase: 'moving' } : next;
}

export function readFlick(raw: unknown, round: FlickRound, power: FlickPower): Flick | undefined {
  if (!raw || typeof raw !== 'object' || !('stone' in raw) || !('vx' in raw) || !('vy' in raw)) return;
  const { stone, vx, vy } = raw;
  if (typeof stone !== 'number' || !Number.isInteger(stone) || stone < 0 || !round.layout[stone]
    || pieceOwner(stone) !== flickTurn(round.revision) || typeof vx !== 'number' || typeof vy !== 'number') return;
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed < 55 || speed > Math.min(820, 740 * power) + 0.001) return;
  return { stone, vx, vy };
}

export function readLayout(value: unknown): StonePosition[] | undefined {
  if (!Array.isArray(value) || value.length !== initialFlickRound.layout.length) return;
  const layout: StonePosition[] = [];
  for (const point of value) {
    if (point === null) { layout.push(null); continue; }
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || isOffBoard(point[0], point[1])) return;
    layout.push([point[0], point[1]]);
  }
  return layout;
}

export function readFlickRound(value: unknown, power: FlickPower): FlickRound | undefined {
  if (!value || typeof value !== 'object' || !('layout' in value) || !('revision' in value)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0) return;
  const layout = readLayout(value.layout);
  if (!layout) return;
  const round: FlickRound = { layout, revision: value.revision };
  if ('shot' in value && value.shot !== undefined) {
    const shot = readFlick(value.shot, round, power);
    if (!shot || settledStatus(round).winner) return;
    round.shot = shot;
  }
  return round;
}

export function isOffBoard(x: number, y: number) {
  const farEdge = tableSize - alkkagiEdge;
  return x < alkkagiEdge || x > farEdge || y < alkkagiEdge || y > farEdge;
}

export function canFlick(status: AlkkagiStatus, owner: Stone) {
  return status.phase === 'aim' && owner === status.turn;
}

export function endShot(status: AlkkagiStatus): AlkkagiStatus {
  const [black, white] = status.remaining;
  const winner = black === 0 ? (white === 0 ? 'draw' : 2) : white === 0 ? 1 : undefined;
  if (winner) return { ...status, phase: 'finished', winner };
  return { ...status, phase: 'aim', turn: status.turn === 1 ? 2 : 1 };
}
