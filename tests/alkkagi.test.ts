import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceFlickRound, alkkagiEdge, canFlick, createFlickRound, defaultFlickSettings, endShot, flickBoardSizes, flickDiameter, flickEdge, initialAlkkagi, initialFlickRound, isOffBoard, pieceOwner, readFlick, readFlickRound, settledStatus } from '../apps/web/src/games/alkkagi/rules.ts';
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

test('all presets have a 30 percent larger collision board', () => {
  const oldEdges = { small: 70, standard: 44, large: 23 };
  for (const board of flickBoardSizes) {
    const oldWidth = tableSize - 2 * oldEdges[board];
    const newWidth = tableSize - 2 * flickEdge({ ...defaultFlickSettings, board });
    assert(Math.abs(newWidth / oldWidth - 1.3) < 1e-10);
  }
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
  assert.equal(readFlickRound({ layout: [[alkkagiEdge - 1, 240], ...layout.slice(1)], revision: 1 }, 1), undefined);
});

test('four players have the configured stones and non-overlapping placements on every board size', () => {
  for (const board of flickBoardSizes) for (const stones of [3, 5, 7]) for (const random of [false, true]) {
    const settings = { board, stones, random };
    const round = createFlickRound(settings, 4, () => .37);
    assert.deepEqual(settledStatus(round).remaining, [stones, stones, stones, stones]);
    assert.ok(readFlickRound(round, 1));
    const diameter = flickDiameter(settings);
    round.layout.forEach((point, index) => {
      assert.ok(point && !isOffBoard(...point, flickEdge(settings)));
      for (const other of round.layout.slice(index + 1)) {
        assert.ok(other && Math.hypot(point[0] - other[0], point[1] - other[1]) >= diameter);
      }
    });
  }
});

test('eliminated flick players are skipped and the earliest elimination remains last place', () => {
  const initial = createFlickRound(defaultFlickSettings, 4);
  const remove = (round: typeof initial, player: 1 | 2 | 3 | 4) => advanceFlickRound(round,
    round.layout.map((point, index) => pieceOwner(index, round.players) === player ? null : point), player);
  const first = remove(initial, 2);
  assert.equal(settledStatus(first).turn, 1);
  const second = remove(first, 1);
  assert.equal(settledStatus(second).turn, 3);
  const final = remove(second, 4);
  assert.equal(settledStatus(final).winner, 3);
  assert.deepEqual(final.eliminated, [2, 1, 4]);
});
