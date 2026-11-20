import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTurnLimit, nextDeadline, readPendingTimeout, resolveTurnTimeout } from '../apps/web/src/games/turn-clock.ts';
import { readProfilePreferences } from '../packages/protocol/profile.ts';
import { readInvite, readTouch } from '../packages/protocol/rooms.ts';

test('custom turn limits accept whole seconds and keep zero unlimited', () => {
  for (const value of [0, 1, 37, 3600]) assert.equal(isTurnLimit(value), true);
  for (const value of [-1, 3601, 1.5, '37', Infinity]) assert.equal(isTurnLimit(value), false);
  assert.equal(nextDeadline(0, 100), 0);
  assert.equal(nextDeadline(37, 100), 37100);
});

test('turn timeouts wait for a decision and extensions resume the same turn clock', () => {
  const pending = readPendingTimeout({ color: 2, at: 2200 }, 1000);
  assert.ok(pending);
  assert.equal(readPendingTimeout({ color: 3, at: 2200 }, 1000), undefined);
  assert.equal(readPendingTimeout({ color: 2, at: 999 }, 1000), undefined);
  assert.deepEqual(resolveTurnTimeout(pending, 'extend', 3000), {
    timeoutPending: undefined, timedOut: undefined, deadline: 18000, finishedAt: 0,
  });
  assert.deepEqual(resolveTurnTimeout(pending, 'claim', 3000), {
    timeoutPending: undefined, timedOut: 2, deadline: 0, finishedAt: 3000,
  });
});

test('touch and invite messages validate only supported public fields', () => {
  assert.deepEqual(readTouch({ x: 0, y: 1000 }), { x: 0, y: 1000 });
  for (const [x, y] of [[-1, 0], [0, 1001], [0.5, 0], ['0', 0]]) assert.equal(readTouch({ x, y }), undefined);
  assert.deepEqual(readProfilePreferences({ touchEffect: 'soft' }), { touchEffect: 'soft' });
  assert.equal(readProfilePreferences({ touchEffect: 'unknown' }), undefined);

  const invite = { id: crypto.randomUUID(), sender: crypto.randomUUID(), name: 'Noriverse', game: 'chess', code: '23456789', expires: Date.now() + 60000 };
  assert.deepEqual(readInvite({ ...invite, seat: 'not a public field' }), invite);
  assert.equal(readInvite({ ...invite, code: 'abcdefgh' }), undefined);
  assert.equal(readInvite({ ...invite, game: 'unsupported' }), undefined);
});
