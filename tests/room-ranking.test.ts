import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Participant, Role } from '../packages/protocol/rooms.ts';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';
import { applyLiarAction, defaultLiarSettings, makeLiarRound } from '../apps/web/src/games/liar/rules.ts';
import { inRound, lobbyMatch, mockSeatsFor, roundSeats } from '../apps/web/src/network/room-match.ts';
import { mergeRoomHistory, readRoomResult, roomRankChange, roomRankingEntries, roomStandings } from '../packages/protocol/room-history.ts';
import type { RoomResult } from '../packages/protocol/room-history.ts';
import { awardRoomPoints } from '../apps/web/src/network/room-scoring.ts';

test('room awards cap wins, preserve draws and reward losing progress', () => {
  const match = lobbyMatch('omok', defaultMatchSettings);
  assert.equal(awardRoomPoints(match, 'host', 'win').points, 50);
  assert.equal(awardRoomPoints(match, 'guest', 'draw').points, 30);
  assert.equal(awardRoomPoints(match, 'guest', 'loss').points, 10);
  assert.equal(awardRoomPoints({ ...match, history: [0, 15, 2, 16, 4, 17, 6, 18] }, 'guest', 'loss').points, 40);
});

test('room standings aggregate games and do not assign a guest replacement the previous guest’s points', () => {
  const departed = crypto.randomUUID();
  const replacement = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const first: RoomResult = {
    id: crypto.randomUUID(), game: 'omok', endedAt: 11, seconds: 5, players: [
      { role: 'host', profileId, outcome: 'win', points: 50 },
      { role: 'guest', memberId: departed, outcome: 'loss', points: 25 },
    ],
  };
  const second: RoomResult = {
    id: crypto.randomUUID(), game: 'chess', endedAt: 19, seconds: 6, players: [
      { role: 'host', profileId, outcome: 'loss', points: 30 },
      { role: 'guest', memberId: replacement, outcome: 'win', points: 50 },
    ],
  };
  assert.deepEqual(readRoomResult(second), second);
  assert.equal(readRoomResult({ ...second, players: [{ ...second.players[0], points: 51 }, second.players[1]] }), undefined);
  const entries = mergeRoomHistory([first], [first, second]);
  assert.deepEqual(roomStandings(entries, [{ role: 'guest', memberId: replacement }]).map(row => [row.key, row.points, row.current]),
    [[profileId, 80, false], [replacement, 50, true], [departed, 25, false]]);
  assert.deepEqual(roomStandings(entries, [{ role: 'guest2', memberId: departed }]).at(-1)?.role, 'guest2');
});

test('Liar awards private participation after completion and keeps its series score separate', () => {
  const roles = ['host', 'guest', 'guest2'] satisfies Role[];
  const settings = defaultLiarSettings;
  let liar = { ...makeLiarRound(roles, 'en', () => 0), deadline: 5000 };
  for (const role of roles) liar = applyLiarAction(liar, role, { kind: 'hint', text: 'clue' }, settings, 1000)!;
  liar = applyLiarAction(liar, 'host', { kind: 'vote', target: 'guest' }, settings, 1001)!;
  liar = applyLiarAction(liar, 'guest', { kind: 'vote', target: 'guest2' }, settings, 1002)!;
  liar = applyLiarAction(liar, 'guest2', { kind: 'vote', target: 'host' }, settings, 1003)!;
  const match = { ...lobbyMatch('liar', defaultMatchSettings), liar, finishedAt: 1003 };
  assert.deepEqual(awardRoomPoints(match, 'host', 'win'), { points: 50, liarPoints: 120 });
  assert.deepEqual(awardRoomPoints(match, 'guest2', 'loss'), { points: 40, liarPoints: 40 });
});

test('passive test seats respect room capacity and cannot be used by a network actor', () => {
  const host = [{ role: 'host' }] satisfies Participant[];
  assert.deepEqual(mockSeatsFor('omok', host, 3), ['guest']);
  const mocks = mockSeatsFor('liar', host, 2);
  assert.deepEqual(roundSeats('liar', mocks, host), ['host', 'guest', 'guest2']);
  const match = { ...lobbyMatch('liar', defaultMatchSettings), mockSeats: mocks };
  assert(inRound(match, 'host'));
  assert(!inRound(match, 'guest'));
  assert.equal(roomStandings([], [{ role: 'guest', mock: true }])[0].key, 'mock:guest');
});

test('mock results count in test rankings without taking the real guest’s identity or points', () => {
  const game = lobbyMatch('omok', defaultMatchSettings);
  const realGuest = { role: 'guest', memberId: crypto.randomUUID() } satisfies Participant;
  const mock = { role: 'guest', mock: true } satisfies Participant;
  const entry: RoomResult = {
    id: crypto.randomUUID(), game: 'omok', endedAt: 100, seconds: 5, test: true, players: [
      { role: 'host', outcome: 'win', ...awardRoomPoints(game, 'host', 'win') },
      { role: 'guest', mock: true, outcome: 'loss', ...awardRoomPoints(game, 'guest', 'loss') },
    ],
  };
  assert.deepEqual(readRoomResult(entry), entry);
  assert.equal(readRoomResult({ ...entry, test: undefined }), undefined);
  assert.deepEqual(roomStandings(roomRankingEntries([entry], true), [mock, realGuest]).map(row => [row.key, row.points]),
    [['host', 50], ['mock:guest', 10], [realGuest.memberId, 0]]);
  assert.deepEqual(roomStandings(roomRankingEntries([entry], false), [realGuest]).map(row => row.points), [0]);
});

test('a completed game reports the highest overtaking move against established rankings', () => {
  const initial: RoomResult = {
    id: crypto.randomUUID(), game: 'omok', endedAt: 100, seconds: 20, players: [
      { role: 'host', name: 'Blue', outcome: 'win', points: 50 },
      { role: 'guest', name: 'Green', outcome: 'loss', points: 25 },
    ],
  };
  const next: RoomResult = {
    ...initial, id: crypto.randomUUID(), endedAt: 150, players: [
      { role: 'host', name: 'Blue', outcome: 'loss', points: 10 },
      { role: 'guest', name: 'Green', outcome: 'win', points: 50 },
    ],
  };
  assert.equal(roomRankChange([initial], [], initial), undefined);
  const move = roomRankChange([next, initial], [], next);
  assert.deepEqual([move?.player.name, move?.passed.name, move?.rank], ['Green', 'Blue', 1]);
  const sameOrder = { ...initial, id: crypto.randomUUID(), endedAt: 120 };
  assert.equal(roomRankChange([sameOrder, initial], [], sameOrder), undefined);
});
