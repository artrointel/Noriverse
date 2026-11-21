import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRoomHistory, readRoomResult } from '../packages/protocol/room-history.ts';
import type { RoomResult } from '../packages/protocol/room-history.ts';

const first: RoomResult = {
  id: '12345678-1234-1234-1234-123456789001', game: 'omok', endedAt: 1_000, seconds: 20,
  players: [{ role: 'host', name: 'Mina', outcome: 'win' }, { role: 'guest', name: 'Jun', outcome: 'loss' }],
};
const second: RoomResult = { ...first, id: '12345678-1234-1234-1234-123456789002', game: 'sichuan', endedAt: 2_000 };

test('room history combines live results and rejoin batches in reverse chronological order', () => {
  assert.deepEqual(mergeRoomHistory([second], [first, { ...second, seconds: 99 }]), [second, first]);
});

test('room history rejects invalid times, duplicate seats and unsupported outcomes', () => {
  assert.deepEqual(readRoomResult(first), first);
  assert.equal(readRoomResult({ ...first, endedAt: Number.MAX_SAFE_INTEGER }), undefined);
  assert.equal(readRoomResult({ ...first, players: [first.players[0], first.players[0]] }), undefined);
  assert.equal(readRoomResult({ ...first, players: [{ role: 'host', outcome: 'unknown' }, first.players[1]] }), undefined);
});
