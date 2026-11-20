import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alkkagiEdge, canFlick, endShot, initialAlkkagi, initialFlickRound, isOffBoard, readFlick, readFlickRound, settledStatus } from '../apps/web/src/games/alkkagi/rules.ts';
import { tableSize } from '../apps/web/src/games/table.ts';

test('only the current player can shoot, and moving discs lock the board', () => {
  assert.equal(canFlick(initialAlkkagi, 1), true);
  assert.equal(canFlick(initialAlkkagi, 2), false);
  assert.equal(canFlick({ ...initialAlkkagi, phase: 'moving' }, 1), false);
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
  assert.equal(canFlick(tie, 1), false);
});

test('online flicks validate owner and speed, and settled layouts decide the winner', () => {
  const shot = { stone: 0, vx: 0, vy: -740 };
  assert.deepEqual(readFlick(shot, initialFlickRound, 1), shot);
  assert.equal(readFlick({ ...shot, stone: 1 }, initialFlickRound, 1), undefined);
  assert.equal(readFlick({ ...shot, vy: -820 }, initialFlickRound, 1), undefined);
  assert.equal(readFlick({ ...shot, vy: -820 }, initialFlickRound, 1.35)?.vy, -820);
  assert.equal(readFlick({ ...shot, vx: Number.NaN }, initialFlickRound, 1), undefined);
  const moving = readFlickRound({ ...initialFlickRound, shot }, 1);
  assert.equal(settledStatus(moving!).phase, 'moving');
  const layout = initialFlickRound.layout.map((point, index) => index % 2 === 0 ? point : null);
  const settled = readFlickRound({ layout, revision: 1 }, 1);
  assert.equal(settledStatus(settled!).winner, 1);
  assert.equal(readFlickRound({ layout: [[10, 10], ...layout.slice(1)], revision: 1 }, 1), undefined);
});
