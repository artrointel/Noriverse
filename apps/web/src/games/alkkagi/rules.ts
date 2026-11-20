import { tableSize } from '../table.ts';
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

export function isOffBoard(x: number, y: number) {
  const farEdge = tableSize - alkkagiEdge;
  return x < alkkagiEdge || x > farEdge || y < alkkagiEdge || y > farEdge;
}

export function canFlick(status: AlkkagiStatus, owner: Stone, practice: boolean) {
  return status.phase === 'aim' && (practice || owner === status.turn);
}

export function endShot(status: AlkkagiStatus): AlkkagiStatus {
  const [black, white] = status.remaining;
  const winner = black === 0 ? (white === 0 ? 'draw' : 2) : white === 0 ? 1 : undefined;
  if (winner) return { ...status, phase: 'finished', winner };
  return { ...status, phase: 'aim', turn: status.turn === 1 ? 2 : 1 };
}
