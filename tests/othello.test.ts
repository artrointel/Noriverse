import assert from 'node:assert/strict';
import { test } from 'node:test';
import { othelloState, placeOthello, readOthelloHistory } from '../apps/web/src/games/othello/rules.ts';

test('Othello opens with four legal moves and flips the enclosed disc', () => {
  assert.deepEqual(othelloState([]).legal, [19, 26, 37, 44]);
  assert.equal(placeOthello([], 0), undefined);
  assert.equal(placeOthello([], 27), undefined);
  const first = othelloState([19]);
  assert.deepEqual(first.scores, [4, 1]);
  assert.equal(first.board[27], 1);
  assert.equal(first.turn, 2);
  assert.deepEqual(readOthelloHistory([19, 18]), [19, 18]);
  assert.equal(readOthelloHistory([19, 19]), undefined);
});

test('one move flips every enclosed line and a side without a move passes', () => {
  const opening = [19, 18, 17, 9, 1, 0, 26, 2, 10, 11];
  const state = othelloState([...opening, 3]);
  assert.deepEqual(state.scores, [10, 5]);
  assert.equal(state.board[10], 1);
  assert.equal(state.board[11], 1);

  const forcedPass = [...opening, 3, 4, 8, 16, 37, 12, 5, 6];
  assert.equal(othelloState(forcedPass.slice(0, -1)).turn, 2);
  const after = othelloState(forcedPass);
  assert.equal(after.passed, 1);
  assert.equal(after.turn, 2);
  assert.ok(after.legal.includes(13));
});

test('neither player can move when the game is finished and the larger count wins', () => {
  const history = [19, 18, 17, 9, 1, 0, 26, 2, 10, 11, 3, 4, 8, 16, 37, 12, 5, 6, 13, 20, 33, 25, 32, 24, 34, 40, 29, 21,
    22, 14, 15, 7, 23, 31, 30, 42, 38, 39, 41, 50, 43, 44, 45, 46, 47, 55, 48, 49, 56, 51, 52, 53, 54, 62, 57, 58, 59, 60, 61, 63];
  const last = othelloState(history);
  assert.deepEqual(last.scores, [19, 45]);
  assert.equal(last.winner, 2);
  assert.deepEqual(last.legal, []);
  assert.equal(placeOthello(history, 63), undefined);
  assert.equal(readOthelloHistory([...history, 63]), undefined);
});
