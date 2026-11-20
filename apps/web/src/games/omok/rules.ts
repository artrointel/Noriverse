import type { Stone } from '../table.ts';

export const boardSize = 15;
export type Cell = Stone | 0;

const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function nextStone(history: readonly number[]): Stone {
  return history.length % 2 === 0 ? 1 : 2;
}

export function boardFrom(history: readonly number[]): Cell[] {
  const board = Array<Cell>(boardSize * boardSize).fill(0);
  history.forEach((index, turn) => { board[index] = turn % 2 === 0 ? 1 : 2; });
  return board;
}

export function result(history: readonly number[]): Stone | 'draw' | undefined {
  const last = history.at(-1);
  if (last === undefined) return;
  const board = boardFrom(history);
  const stone = board[last];
  const x = last % boardSize;
  const y = Math.floor(last / boardSize);
  for (const [dx, dy] of directions) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let column = x + dx * sign;
      let row = y + dy * sign;
      while (column >= 0 && column < boardSize && row >= 0 && row < boardSize
        && board[row * boardSize + column] === stone) {
        count++;
        column += dx * sign;
        row += dy * sign;
      }
    }
    if (count >= 5 && stone) return stone;
  }
  if (history.length === boardSize * boardSize) return 'draw';
}

export function doubleThreeAxes(history: readonly number[], index: number): (readonly [number, number])[] {
  if (!Number.isInteger(index) || index < 0 || index >= boardSize ** 2 || history.includes(index)) return [];
  const board = boardFrom(history);
  const stone = nextStone(history);
  const x = index % boardSize;
  const y = Math.floor(index / boardSize);
  return directions.filter(([dx, dy]) => {
    const cell = (step: number) => {
      const col = x + dx * step;
      const row = y + dy * step;
      if (col < 0 || row < 0 || col >= boardSize || row >= boardSize) return undefined;
      return step === 0 ? stone : board[row * boardSize + col];
    };
    for (let start = -3; start <= 0; start++) {
      if (cell(start - 1) !== 0 || cell(start + 4) !== 0) continue;
      const line = [0, 1, 2, 3].map(offset => cell(start + offset));
      if (line.filter(value => value === stone).length === 3 && line.includes(0)) return true;
    }
    return false;
  }).map(([dx, dy]) => [dx, dy] as const);
}

export function isForbiddenDoubleThree(history: readonly number[], index: number, allowed: boolean): boolean {
  return !allowed && nextStone(history) === 1 && doubleThreeAxes(history, index).length >= 2
    && result([...history, index]) !== 1;
}

export function place(history: readonly number[], index: unknown, allowDoubleThree = true): number[] | undefined {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0
    || index >= boardSize * boardSize || history.includes(index) || result(history)) return;
  if (isForbiddenDoubleThree(history, index, allowDoubleThree)) return;
  return [...history, index];
}

export function readHistory(value: unknown, allowDoubleThree = true): number[] | undefined {
  if (!Array.isArray(value) || value.length > boardSize * boardSize) return;
  let history: number[] = [];
  for (const index of value) {
    const next = place(history, index, allowDoubleThree);
    if (!next) return;
    history = next;
  }
  return history;
}
