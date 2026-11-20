import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import type { Stone } from '../table.ts';

export const chessSize = 8;
export const promotions = ['q', 'r', 'b', 'n'] as const;
export const chessPieceFrames = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 } as const;
export const capturablePieces = [...promotions, 'p'] as const;
export type Promotion = typeof promotions[number];
const files = 'abcdefgh';

export function chessSquare(index: number): Square {
  return (files[index % 8] + (8 - Math.floor(index / 8))) as Square;
}

export function chessIndex(square: Square) {
  return (8 - Number(square[1])) * 8 + files.indexOf(square[0]);
}

export function encodeChessMove(from: number, to: number, promotion?: Promotion) {
  return (from * 64 + to) * 5 + (promotion ? promotions.indexOf(promotion) + 1 : 0);
}

function apply(game: Chess, encoded: unknown) {
  if (typeof encoded !== 'number' || !Number.isInteger(encoded) || encoded < 0 || encoded >= 64 * 64 * 5) return false;
  const squares = Math.floor(encoded / 5);
  const promotion = promotions[encoded % 5 - 1];
  const from = chessSquare(Math.floor(squares / 64));
  const to = chessSquare(squares % 64);
  const legal = game.moves({ square: from, verbose: true }).some(move => move.to === to && move.promotion === promotion);
  if (!legal) return false;
  game.move({ from, to, promotion });
  return true;
}

const positions = new WeakMap<readonly number[], Chess>();

export function chessPosition(history: readonly number[]) {
  const previous = positions.get(history);
  if (previous) return previous;
  const game = new Chess();
  for (const move of history) if (!apply(game, move)) break;
  positions.set(history, game);
  return game;
}

export function chessLosses(history: readonly number[]) {
  const counts = () => ({ k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 });
  const losses = { w: counts(), b: counts() };
  for (const { captured, color } of chessPosition(history).history({ verbose: true })) {
    if (captured) losses[color === 'w' ? 'b' : 'w'][captured]++;
  }
  return losses;
}

export function chessTurn(history: readonly number[]): Stone | undefined {
  const game = chessPosition(history);
  return game.isGameOver() ? undefined : game.turn() === 'w' ? 1 : 2;
}

export function chessResult(history: readonly number[]): Stone | 'draw' | undefined {
  const game = chessPosition(history);
  if (game.isCheckmate()) return game.turn() === 'w' ? 2 : 1;
  if (game.isDraw()) return 'draw';
}

export function placeChess(history: readonly number[], move: unknown) {
  const position = chessPosition(history);
  if (position.isGameOver() || !apply(new Chess(position.fen()), move)) return;
  return [...history, move as number];
}

export function readChessHistory(value: unknown) {
  if (!Array.isArray(value) || value.length > 8192) return;
  const game = new Chess();
  for (const move of value) if (game.isGameOver() || !apply(game, move)) return;
  const history = [...value] as number[];
  positions.set(history, game);
  return history;
}
