import assert from 'node:assert/strict';
import test from 'node:test';
import { profileGames } from '../packages/protocol/profile.ts';
import { getMusicTrack, setLobbyMusic, setMatchMusic } from '../apps/web/src/platform/audio.ts';

test('every game changes music for a new match and restores the same track when resuming it', () => {
  for (const game of profileGames) {
    setMatchMusic(game, game + '-first');
    const first = getMusicTrack();
    setMatchMusic(game, game + '-second');
    const second = getMusicTrack();
    assert.notEqual(second, first);
    setLobbyMusic();
    setMatchMusic(game, game + '-second');
    assert.equal(getMusicTrack(), second);
  }
});
