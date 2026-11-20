import type { RoomGame } from '../../../../packages/protocol/rooms.ts';
import { nextStone, place, readHistory, result } from './omok/rules.ts';
import type { OmokOverline } from './omok/rules.ts';
import { othelloState, placeOthello, readOthelloHistory } from './othello/rules.ts';
import type { Stone } from './table.ts';
import { chessResult, chessTurn, placeChess, readChessHistory } from './chess/rules.ts';

export type BoardGame = Exclude<RoomGame, 'physics' | 'sichuan'>;
export const isBoardGame = (id: unknown): id is BoardGame => typeof id === 'string' && Object.hasOwn(boardRules, id);
export const isTurnBasedGame = (id: unknown): id is BoardGame | 'physics' => isBoardGame(id) || id === 'physics';

interface BoardRules {
  turn(history: readonly number[]): Stone | undefined;
  place(history: readonly number[], move: unknown, allowDoubleThree: boolean, overline?: OmokOverline): number[] | undefined;
  readHistory(value: unknown, allowDoubleThree: boolean, overline?: OmokOverline): number[] | undefined;
  result(history: readonly number[], overline?: OmokOverline): Stone | 'draw' | undefined;
}

export const boardRules: Record<BoardGame, BoardRules> = {
  omok: { turn: nextStone, place, readHistory, result },
  chess: { turn: chessTurn, place: placeChess, readHistory: readChessHistory, result: chessResult },
  othello: {
    turn: history => othelloState(history).turn,
    place: placeOthello,
    readHistory: readOthelloHistory,
    result: history => othelloState(history).winner,
  },
};
