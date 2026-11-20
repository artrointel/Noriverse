import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alkkagiEdge, canFlick, endShot, initialAlkkagi, isOffBoard } from '../apps/web/src/games/alkkagi/rules.ts';
import { tableSize } from '../apps/web/src/games/table.ts';

test('only the current player can shoot, and moving discs lock the board', () => {
  assert.equal(canFlick(initialAlkkagi, 1, false), true);
  assert.equal(canFlick(initialAlkkagi, 2, false), false);
  assert.equal(canFlick(initialAlkkagi, 2, true), true);
  assert.equal(canFlick({ ...initialAlkkagi, phase: 'moving' }, 1, false), false);
  assert.equal(endShot({ ...initialAlkkagi, phase: 'moving', remaining: [4, 2] }).turn, 2);
});

test('board edges count stones out on all four sides', () => {
  const opposite = tableSize - alkkagiEdge;
  for (const [x, y] of [[alkkagiEdge - 1, 240], [opposite + 1, 240], [240, alkkagiEdge - 1], [240, opposite + 1]]) {
    assert.equal(isOffBoard(x, y), true);
  }
  assert.equal(isOffBoard(alkkagiEdge, opposite), false);
});

test('an empty side loses and simultaneous elimination is a draw', () => {
  assert.equal(endShot({ ...initialAlkkagi, remaining: [5, 0] }).winner, 1);
  assert.equal(endShot({ ...initialAlkkagi, remaining: [0, 2] }).winner, 2);
  const tie = endShot({ ...initialAlkkagi, remaining: [0, 0] });
  assert.equal(tie.winner, 'draw');
  assert.equal(tie.phase, 'finished');
  assert.equal(canFlick(tie, 1, false), false);
});
