import { boardRules } from './board-rules.ts';
import type { BoardGame } from './board-rules.ts';
import { defaultOmokOverline } from './omok/rules.ts';
import type { OmokOverline } from './omok/rules.ts';
import { rematchPlayerColor } from './table.ts';
import type { Stone } from './table.ts';
import { nextDeadline, resolveTurnTimeout } from './turn-clock.ts';
import type { PendingTimeout, TimeoutChoice, TurnLimit } from './turn-clock.ts';

export interface LocalRound {
  id: string;
  startedAt: number;
  prepared?: boolean;
  finishedAt: number;
  surrendered?: Stone;
  timedOut?: Stone;
  timeoutPending?: PendingTimeout;
  turnLimit: TurnLimit;
  deadline: number;
  firstPlayerColor: Stone;
}

export interface LocalBoard extends LocalRound {
  history: number[];
  allowDoubleThree: boolean;
  overline: OmokOverline;
}

export function createLocalRound(turnLimit: TurnLimit = 0, firstPlayerColor: Stone = 1, now = Date.now()): LocalRound {
  return { id: crypto.randomUUID(), startedAt: now, finishedAt: 0, turnLimit, deadline: nextDeadline(turnLimit, now), firstPlayerColor };
}

export function setLocalStart<T extends LocalRound>(round: T, id: string, beginsAt: number): T {
  if (round.id !== id || round.prepared || round.finishedAt) return round;
  return { ...round, prepared: true, startedAt: beginsAt, deadline: nextDeadline(round.turnLimit, beginsAt) };
}

export function createLocalBoard(allowDoubleThree = true, firstPlayerColor: Stone = 1, turnLimit: TurnLimit = 0,
  overline: OmokOverline = defaultOmokOverline, now = Date.now()): LocalBoard {
  return { ...createLocalRound(turnLimit, firstPlayerColor, now), history: [], allowDoubleThree, overline };
}

export function rematchLocalBoard(id: BoardGame, board: LocalBoard, now: number) {
  if (!board.finishedAt) return board;
  const winner = boardRules[id].result(board.history, board.overline);
  const first = rematchPlayerColor(board.firstPlayerColor, winner, board.surrendered ?? board.timedOut);
  return createLocalBoard(board.allowDoubleThree, first, board.turnLimit, board.overline, now);
}

export function moveLocalBoard(id: BoardGame, board: LocalBoard, index: number, now: number) {
  if (board.finishedAt || board.timeoutPending || (board.deadline && now >= board.deadline)) return board;
  const rules = boardRules[id];
  const history = rules.place(board.history, index, board.allowDoubleThree, board.overline);
  if (!history) return board;
  const finishedAt = rules.result(history, board.overline) ? now : 0;
  return { ...board, history, finishedAt, deadline: finishedAt ? 0 : nextDeadline(board.turnLimit, now) };
}

export function endLocalBoard(board: LocalBoard, color: Stone, now: number, expiredDeadline?: number) {
  if (board.finishedAt) return board;
  if (expiredDeadline !== undefined) {
    if (board.deadline !== expiredDeadline || now < expiredDeadline) return board;
    return { ...board, timeoutPending: { color, at: expiredDeadline }, deadline: 0 };
  }
  if (board.deadline && now >= board.deadline) return board;
  return { ...board, finishedAt: now, surrendered: color, deadline: 0, timeoutPending: undefined };
}

export function decideLocalBoard(board: LocalBoard, choice: TimeoutChoice, at: number, now: number) {
  if (!board.timeoutPending || board.timeoutPending.at !== at || board.finishedAt) return board;
  return { ...board, ...resolveTurnTimeout(board.timeoutPending, choice, now) };
}
