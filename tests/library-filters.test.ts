import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogGameIds, gameIds, supportsPlayerCount } from '../packages/protocol/games.ts';
import { isRoomGame } from '../packages/protocol/rooms.ts';

test('the player-count filter respects solo support and both room limits', () => {
  assert(gameIds.filter(game => supportsPlayerCount(game, 1)).includes('sketch'));
  assert(!supportsPlayerCount('liar', 1));
  assert(!supportsPlayerCount('liar', 2));
  assert(supportsPlayerCount('liar', 3));
  assert.deepEqual(gameIds.filter(game => supportsPlayerCount(game, 4)), ['physics', 'sichuan', 'memory', 'sketch', 'liar', 'slime', 'mole', 'burger']);
  assert(!supportsPlayerCount('sketch', 5));
  assert(!supportsPlayerCount('sketch', 2.5));
});

test('Startrail is listed for solo play and cannot be selected in a room', () => {
  assert(catalogGameIds.includes('startrail'));
  assert(supportsPlayerCount('startrail', 1));
  assert(!supportsPlayerCount('startrail', 2));
  assert(!isRoomGame('startrail'));
});
