import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rematchFirstColor } from '../apps/web/src/games/board-rules.ts';
import { doubleThreeAxes, nextStone, place, readHistory, result } from '../apps/web/src/games/omok/rules.ts';
import { createRoomCode, readSignal, roomCodePattern } from '../packages/protocol/rooms.ts';

test('alternates players and stops on a completed five', () => {
  const winningHistory = [0, 15, 1, 16, 2, 17, 3, 18, 4];
  assert.equal(nextStone(winningHistory.slice(0, -1)), 1);
  assert.equal(result(winningHistory.slice(0, -1)), undefined);
  assert.equal(result(winningHistory), 1);
  assert.equal(place(winningHistory, 19), undefined);
  assert.equal(readHistory([...winningHistory, 19]), undefined);
  assert.deepEqual(readHistory(winningHistory), winningHistory);
});

test('rejects invalid coordinates and repeated intersections', () => {
  for (const index of [-1, 225, 2.5, '3', 0]) {
    assert.equal(place([0], index), undefined);
  }
  assert.deepEqual(place([0], 1), [0, 1]);
});

test('an overline ends the game only when five or more stones count', () => {
  const blackSix = [0, 15, 1, 17, 2, 19, 4, 21, 5, 30, 3];
  const whiteSix = [15, 0, 17, 1, 19, 2, 21, 4, 30, 5, 32, 3];
  for (const [history, winner] of [[blackSix, 1], [whiteSix, 2]] as const) {
    assert.equal(result(history), undefined);
    assert.equal(result(history, 'freestyle'), winner);
    assert.deepEqual(readHistory([...history, 45]), [...history, 45]);
    assert.deepEqual(readHistory(history, true, 'freestyle'), history);
    assert.equal(readHistory([...history, 45], true, 'freestyle'), undefined);
  }
  assert.equal(rematchFirstColor('omok', 1, blackSix, undefined, 'freestyle'), 2);
});

test('Omok rematches assign black to the previous loser', () => {
  const blackWin = [0, 15, 1, 16, 2, 17, 3, 18, 4];
  const whiteWin = [15, 0, 16, 1, 17, 2, 18, 3, 30, 4];
  assert.equal(result(whiteWin), 2);
  assert.equal(rematchFirstColor('omok', 1, blackWin), 2);
  assert.equal(rematchFirstColor('omok', 2, blackWin), 1);
  assert.equal(rematchFirstColor('omok', 2, whiteWin), 2);
  assert.equal(rematchFirstColor('omok', 1, [], 2), 2);
  assert.equal(rematchFirstColor('omok', 2, [], 1), 2);
  assert.equal(rematchFirstColor('omok', 2, []), 2);
  assert.equal(rematchFirstColor('othello', 1, [], 2), 1);
});

test('room codes and signals conform to the two-seat protocol', () => {
  assert.match(createRoomCode(), roomCodePattern);
  assert.equal(readSignal({ type: 'answer', sdp: 'sdp' }, 'host'), undefined);
  assert.deepEqual(readSignal({ type: 'answer', sdp: 'sdp' }, 'guest'), { type: 'answer', sdp: 'sdp' });
  assert.equal(readSignal({ type: 'ice', candidate: { candidate: 'test', sdpMLineIndex: 0.5 } }, 'guest'), undefined);
});

test('Black can make an open double three only when the room allows it', () => {
  const at = (x: number, y: number) => y * 15 + x;
  const history = [at(6, 7), at(0, 0), at(8, 7), at(2, 0), at(7, 6), at(4, 0), at(7, 8), at(6, 0)];
  const center = at(7, 7);
  assert.equal(doubleThreeAxes(history, center).length, 2);
  assert.deepEqual(place(history, center, true), [...history, center]);
  assert.equal(place(history, center, false), undefined);
  assert.equal(readHistory([...history, center], false), undefined);
  const blocked = [...history.slice(0, 7), at(5, 7)];
  assert.equal(doubleThreeAxes([...blocked.slice(0, 3), at(9, 7), ...blocked.slice(4)], center).length, 1);
});
