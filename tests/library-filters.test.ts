import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameIds, supportsPlayerCount } from '../packages/protocol/games.ts';

test('the player-count filter respects solo support and both room limits', () => {
  assert(gameIds.filter(game => supportsPlayerCount(game, 1)).includes('sketch'));
  assert(!supportsPlayerCount('liar', 1));
  assert(!supportsPlayerCount('liar', 2));
  assert(supportsPlayerCount('liar', 3));
  assert.deepEqual(gameIds.filter(game => supportsPlayerCount(game, 4)), ['physics', 'sichuan', 'memory', 'sketch', 'liar', 'slime']);
  assert(!supportsPlayerCount('sketch', 5));
  assert(!supportsPlayerCount('sketch', 2.5));
});
