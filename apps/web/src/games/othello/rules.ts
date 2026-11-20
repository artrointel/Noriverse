import type { Stone } from '../table.ts';

export const othelloSize = 8;
type Cell = 0 | Stone;
export interface OthelloState {
  board: readonly Cell[];
  turn?: Stone;
  passed?: Stone;
  scores: readonly [number, number];
  legal: readonly number[];
  winner?: Stone | 'draw';
}

const other = (color: Stone): Stone => color === 1 ? 2 : 1;
const directions = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const seed = Array<Cell>(64).fill(0);
seed[27] = seed[36] = 2;
seed[28] = seed[35] = 1;

function flips(board: readonly Cell[], move: number, color: Stone) {
  if (board[move] !== 0) return [];
  const x = move % othelloSize;
  const y = Math.floor(move / othelloSize);
  const pieces: number[] = [];
  const opponent = other(color);
  for (const [dx, dy] of directions) {
    const line: number[] = [];
    let column = x + dx;
    let row = y + dy;
    while (column >= 0 && row >= 0 && column < othelloSize && row < othelloSize) {
      const index = row * othelloSize + column;
      if (board[index] !== opponent) {
        if (board[index] === color) pieces.push(...line);
        break;
      }
      line.push(index);
      column += dx;
      row += dy;
    }
  }
  return pieces;
}

function legalMoves(board: readonly Cell[], color: Stone) {
  return board.flatMap((cell, move) => !cell && flips(board, move, color).length ? [move] : []);
}

const initial: OthelloState = { board: seed, turn: 1, scores: [2, 2], legal: legalMoves(seed, 1) };

function apply(state: OthelloState, move: unknown): OthelloState | undefined {
  if (!state.turn || typeof move !== 'number' || !state.legal.includes(move)) return;
  const color = state.turn;
  const board = [...state.board];
  const captured = flips(board, move, color);
  board[move] = color;
  for (const index of captured) board[index] = color;
  const scores: [number, number] = [...state.scores];
  scores[color - 1] += 1 + captured.length;
  const opponent = other(color);
  scores[opponent - 1] -= captured.length;
  const opposingMoves = legalMoves(board, opponent);
  if (opposingMoves.length) return { board, scores, turn: opponent, legal: opposingMoves };
  const repeatMoves = legalMoves(board, color);
  if (repeatMoves.length) return { board, scores, turn: color, passed: opponent, legal: repeatMoves };
  const [black, white] = scores;
  return { board, scores, legal: [], winner: black === white ? 'draw' : black > white ? 1 : 2 };
}

function replay(history: readonly unknown[]) {
  let state = initial;
  for (const move of history) {
    const next = apply(state, move);
    if (!next) return;
    state = next;
  }
  return state;
}

export function othelloState(history: readonly number[]) {
  return replay(history) ?? initial;
}

export function placeOthello(history: readonly number[], move: unknown): number[] | undefined {
  const state = replay(history);
  if (state && typeof move === 'number' && state.legal.includes(move)) return [...history, move];
}

export function readOthelloHistory(value: unknown): number[] | undefined {
  if (Array.isArray(value) && value.length <= 60 && replay(value)) return [...value] as number[];
}
