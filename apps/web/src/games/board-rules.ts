import type { ProfileGame } from '../../../../packages/protocol/profile.ts';
import { nextStone, place, readHistory, result } from './omok/rules.ts';
import { othelloState, placeOthello, readOthelloHistory } from './othello/rules.ts';
import type { Stone } from './table.ts';

export type BoardGame = Exclude<ProfileGame, 'physics'>;
export const isBoardGame = (id: unknown): id is BoardGame => id === 'omok' || id === 'othello';

interface BoardRules {
  turn(history: readonly number[]): Stone | undefined;
  place(history: readonly number[], move: unknown, allowDoubleThree: boolean): number[] | undefined;
  readHistory(value: unknown, allowDoubleThree: boolean): number[] | undefined;
  result(history: readonly number[]): Stone | 'draw' | undefined;
}

export const boardRules: Record<BoardGame, BoardRules> = {
  omok: { turn: nextStone, place, readHistory, result },
  othello: {
    turn: history => othelloState(history).turn,
    place: placeOthello,
    readHistory: readOthelloHistory,
    result: history => othelloState(history).winner,
  },
};
