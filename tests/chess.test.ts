import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chessIndex, chessPosition, chessResult, chessTurn, encodeChessMove, placeChess, readChessHistory } from '../apps/web/src/games/chess/rules.ts';
import type { Promotion } from '../apps/web/src/games/chess/rules.ts';

type Square = Parameters<typeof chessIndex>[0];
const move = (from: Square, to: Square, promotion?: Promotion) => encodeChessMove(chessIndex(from), chessIndex(to), promotion);

test('chess replays legal moves and locks the board at checkmate and repetition', () => {
  const mate = [move('f2', 'f3'), move('e7', 'e5'), move('g2', 'g4'), move('d8', 'h4')];
  assert.equal(chessTurn([]), 1);
  assert.equal(placeChess([], move('e7', 'e5')), undefined);
  assert.deepEqual(readChessHistory(mate), mate);
  assert.equal(chessResult(mate), 2);
  assert.equal(chessTurn(mate), undefined);
  assert.equal(readChessHistory([...mate, move('a2', 'a3')]), undefined);
  const repeat = [move('g1', 'f3'), move('g8', 'f6'), move('f3', 'g1'), move('f6', 'g8')];
  assert.equal(chessResult([...repeat, ...repeat]), 'draw');
});

test('chess replay preserves castling, en passant and promotion', () => {
  const castle = [move('e2', 'e4'), move('e7', 'e5'), move('g1', 'f3'), move('b8', 'c6'), move('f1', 'e2'), move('g8', 'f6'), move('e1', 'g1')];
  assert.ok(readChessHistory(castle));
  assert.equal(chessPosition(castle).get('f1')?.type, 'r');
  const passant = [move('e2', 'e4'), move('a7', 'a6'), move('e4', 'e5'), move('d7', 'd5'), move('e5', 'd6')];
  assert.ok(readChessHistory(passant));
  assert.equal(chessPosition(passant).get('d5'), undefined);
  const advance = [move('a2', 'a4'), move('h7', 'h5'), move('a4', 'a5'), move('h5', 'h4'), move('a5', 'a6'), move('h4', 'h3'), move('a6', 'b7'), move('h3', 'g2')];
  assert.equal(placeChess(advance, move('b7', 'a8')), undefined);
  const promote = [...advance, move('b7', 'a8', 'n')];
  assert.ok(readChessHistory(promote));
  assert.equal(chessPosition(promote).get('a8')?.type, 'n');
});
