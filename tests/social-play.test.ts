import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTurnLimit, nextDeadline, readPendingTimeout, resolveTurnTimeout } from '../apps/web/src/games/turn-clock.ts';
import { readResolution, renderFrameSize } from '../apps/web/src/games/render-resolution.ts';
import { readProfilePreferences } from '../packages/protocol/profile.ts';
import { readInvite, readTouch } from '../packages/protocol/rooms.ts';

test('custom turn limits accept whole seconds and keep zero unlimited', () => {
  for (const value of [0, 1, 37, 3600]) assert.equal(isTurnLimit(value), true);
  for (const value of [-1, 3601, 1.5, '37', Infinity]) assert.equal(isTurnLimit(value), false);
  assert.equal(nextDeadline(0, 100), 0);
  assert.equal(nextDeadline(37, 100), 37100);
});

test('graphics resolution matches the available display area and preserves the scene aspect ratio', () => {
  assert.equal(readResolution(null), 'auto');
  assert.equal(readResolution('960'), 960);
  assert.equal(readResolution('8000'), 'auto');
  assert.deepEqual(renderFrameSize('auto', 800, 600, 480), { width: 600, height: 600 });
  assert.deepEqual(renderFrameSize('auto', 2500, 2500, 480), { width: 1920, height: 1920 });
  assert.deepEqual(renderFrameSize('auto', 0, 100, 480), { width: 0, height: 0 });
  assert.deepEqual(renderFrameSize(720, 900, 850, 480), { width: 720, height: 720 });
  assert.deepEqual(renderFrameSize(720, 425, Infinity, 480), { width: 425, height: 425 });
  assert.deepEqual(renderFrameSize(720, 900, 640, 640), { width: 480, height: 640 });
  assert.deepEqual(renderFrameSize(720, 900, Infinity, 640), { width: 720, height: 960 });
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
