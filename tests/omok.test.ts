import assert from 'node:assert/strict';
import { test } from 'node:test';
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
