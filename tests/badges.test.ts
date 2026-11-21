import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeBadges, reachedBadges, readEarnedBadge } from '../packages/protocol/badges.ts';
import { roomStreakBadges } from '../packages/protocol/room-badges.ts';
import type { RoomResult } from '../packages/protocol/room-history.ts';

const match = (outcome: 'win' | 'loss' | 'draw', endedAt: number): RoomResult => ({
  id: crypto.randomUUID(), game: endedAt % 2 ? 'omok' : 'chess', endedAt, seconds: 12,
  players: [{ role: 'host', profileId: 'example-host', outcome }],
});

test('streak thresholds use the first match that earns each badge across games in one room', () => {
  const results = Array.from({ length: 22 }, (_, i) => match('win', i + 1));
  const [host] = roomStreakBadges(results);
  assert.deepEqual(host.badges.map(({ id, earnedAt }) => [id, earnedAt]), [
    ['gamerGold', 5], ['gamerDiamond', 10], ['gamerMaster', 15], ['gamerChallenger', 20],
  ]);
  assert.deepEqual(roomStreakBadges(results.slice(0, 4)), []);
  assert.deepEqual(roomStreakBadges([...results.slice(0, 4), match('draw', 5), ...results.slice(5, 9)]), []);
});

test('comeback requires winning directly after three losses in the same room', () => {
  const losses = [1, 2, 3].map(i => match('loss', i));
  assert.deepEqual(roomStreakBadges([...losses, match('win', 4)])[0].badges, [{ id: 'comeback', earnedAt: 4 }]);
  assert.deepEqual(roomStreakBadges([...losses, match('draw', 4), match('win', 5)]), []);
  assert.deepEqual(roomStreakBadges([match('win', 5)]), []);
});

test('progress thresholds and duplicate notifications preserve the original earned date', () => {
  assert.deepEqual(reachedBadges('games', 4), []);
  assert.deepEqual(reachedBadges('games', 5), ['conquest1']);
  assert.deepEqual(reachedBadges('reactions', 10), ['goodSport']);
  assert.deepEqual(reachedBadges('roomLeads', 10), ['ranker1', 'ranker2', 'ranker3']);
  const first = { id: 'ranker1', earnedAt: 50 } as const;
  assert.deepEqual(readEarnedBadge(first), first);
  assert.deepEqual(mergeBadges([first], [{ ...first, earnedAt: 99 }]), [first]);
  assert.equal(readEarnedBadge({ id: 'invalid', earnedAt: 50 }), undefined);
});
