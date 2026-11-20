import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avatarIds, elapsedPlaySeconds, levelFromPlayTime, readProfilePreferences, winRate } from '../packages/protocol/profile.ts';
import { randomPlayerName } from '../apps/web/src/platform/player-names.ts';

test('only supported avatars and explicit favorite updates are accepted', () => {
  for (const avatar of avatarIds) assert.deepEqual(readProfilePreferences({ avatar }), { avatar });
  assert.equal(readProfilePreferences({ avatar: 'custom' }), undefined);
  assert.equal(readProfilePreferences({ favorite: { game: 'omok', selected: 'false' } }), undefined);
  assert.equal(readProfilePreferences({ favorite: { game: 'unknown', selected: true } }), undefined);
  assert.deepEqual(readProfilePreferences({ favorite: { game: 'omok', selected: false } }),
    { favorite: { game: 'omok', selected: false } });
});

test('generated names use the selected language and differ from the preceding roll', () => {
  const korean = randomPlayerName('ko-KR');
  assert.match(korean, /^[가-힣]+ [가-힣]+$/u);
  assert.notEqual(randomPlayerName('ko', korean), korean);
  const english = randomPlayerName('en');
  assert.match(english, /^[A-Za-z]+ [A-Za-z]+$/);
  assert.notEqual(randomPlayerName('en', english), english);
});

test('levels use complete hours and win rate counts decisions and draws', () => {
  assert.equal(levelFromPlayTime(0), 1);
  assert.equal(levelFromPlayTime(3599), 1);
  assert.equal(levelFromPlayTime(3600), 2);
  assert.equal(levelFromPlayTime(7260), 3);
  assert.equal(elapsedPlaySeconds(1000, 1999), 0);
  assert.equal(elapsedPlaySeconds(1000, 3000), 2);
  assert.equal(winRate({ wins: 2, losses: 1, draws: 1 }), 0.5);
  assert.equal(winRate({ wins: 0, losses: 0, draws: 0 }), null);
});
