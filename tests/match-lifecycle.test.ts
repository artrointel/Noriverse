import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalBoard, decideLocalBoard, endLocalBoard, moveLocalBoard, rematchLocalBoard } from '../apps/web/src/games/local-round.ts';
import { blankMatch, matchInProgress, readMatchSnapshot, resumeMatchClock } from '../apps/web/src/network/room-match.ts';
import { countdownCue, countdownDuration, outcomeDuration, resultDelay } from '../apps/web/src/games/round-cues.ts';
import { resolveTurnTimeout } from '../apps/web/src/games/turn-clock.ts';
import { createFlickRound, defaultFlickSettings } from '../apps/web/src/games/alkkagi/rules.ts';

test('legacy snapshots retain defaults and a rejoin cannot roll the same round back', () => {
  const legacy = { type: 'snapshot', id: 'round-one', history: [112], startedAt: 10_000, finishedAt: 0, allowDoubleThree: false, sentAt: 10_150 };
  const joined = readMatchSnapshot(legacy, blankMatch, 10_375);
  assert(joined);
  assert.equal(joined.game, 'omok');
  assert.equal(joined.overline, 'freestyle');
  assert.equal(joined.clockOffset, 225);
  assert.deepEqual(joined.history, [112]);
  assert.equal(readMatchSnapshot({ ...legacy, history: [] }, joined, 11_000), undefined);
  assert.equal(readMatchSnapshot({ ...legacy, allowDoubleThree: true }, joined, 11_000), undefined);
  assert.equal(readMatchSnapshot({ ...legacy, history: [112, 112] }, joined, 11_000), undefined);
  const next = readMatchSnapshot({ ...legacy, id: 'round-two', history: [], allowDoubleThree: true, startedAt: 0 }, joined, 11_000);
  assert.equal(next?.id, 'round-two');
  assert.deepEqual(next?.history, []);
});

test('local moves respect deadlines, an extension resumes play, and the loser opens the rematch', () => {
  const initial = createLocalBoard(true, 1, 5, 'freestyle', 10_000);
  const played = moveLocalBoard('omok', initial, 112, 11_000);
  assert.equal(played.deadline, 16_000);
  assert.equal(moveLocalBoard('omok', played, 113, 16_000), played);
  assert.equal(endLocalBoard(played, 2, 16_000, initial.deadline), played);
  const pending = endLocalBoard(played, 2, 16_000, played.deadline);
  const extended = decideLocalBoard(pending, 'extend', played.deadline, 17_000);
  assert.equal(extended.deadline, 32_000);
  assert.deepEqual(moveLocalBoard('omok', extended, 113, 18_000).history, [112, 113]);
  const finished = endLocalBoard(extended, 2, 18_000);
  const rematch = rematchLocalBoard('omok', finished, 19_000);
  assert.notEqual(rematch.id, finished.id);
  assert.equal(rematch.firstPlayerColor, 2);
  assert.deepEqual(rematch.history, []);
  assert.equal(rematch.deadline, 24_000);
});

test('a synchronized round waits through all four cues and starts the turn clock at play time', () => {
  const snapshot = { ...blankMatch, type: 'snapshot', id: 'scheduled', startedAt: 1000, turnLimit: 5, beginsAt: 0 };
  const waiting = readMatchSnapshot(snapshot, blankMatch, 1050);
  assert(waiting);
  const beginsAt = 1500 + countdownDuration;
  const scheduled = readMatchSnapshot({ ...snapshot, beginsAt, deadline: beginsAt + 5000 }, waiting, 1550);
  assert(scheduled);
  assert.equal(matchInProgress(waiting, beginsAt), false);
  assert.equal(matchInProgress(scheduled, beginsAt - 1), false);
  assert.equal(matchInProgress(scheduled, beginsAt), true);
  assert.deepEqual([1500, 2500, 3500, 4500, beginsAt].map(at => countdownCue(beginsAt, at)?.cue), ['3', '2', '1', 'go', undefined]);
  assert.equal(readMatchSnapshot(snapshot, scheduled, beginsAt), undefined);
  assert.equal(outcomeDuration, 1500);
  assert.equal(resultDelay, 2000);
});

test('late clock snapshots cannot restore an expired deadline after an online extension', () => {
  const first = { ...blankMatch, type: 'snapshot', id: 'timed-round', startedAt: 1000, beginsAt: 5000, turnLimit: 10, deadline: 15_000 };
  const pending = { color: 1 as const, at: first.deadline };
  const expired = { ...first, deadline: 0, timeoutPending: pending };
  const waiting = readMatchSnapshot(expired, blankMatch, 15_000);
  assert(waiting);
  assert.equal(readMatchSnapshot(first, waiting, 15_010), undefined);
  const extended = readMatchSnapshot({ ...expired, ...resolveTurnTimeout(pending, 'extend', 16_000) }, waiting, 16_050);
  assert(extended);
  assert.equal(extended.deadline, 31_000);
  assert.equal(readMatchSnapshot(expired, extended, 16_100), undefined);
  const moved = readMatchSnapshot({ ...first, history: [112], deadline: 27_000 }, extended, 17_010);
  assert.deepEqual(moved?.history, [112]);
  assert.equal(moved?.deadline, 27_000);
});

test('recovery freezes the round and preserves remaining time without changing match identity', () => {
  const initial = { ...blankMatch, type: 'snapshot', id: 'recovery', startedAt: 1000, beginsAt: 5000,
    turnLimit: 10 as const, deadline: 15_000, sentAt: 5100 };
  const guest = readMatchSnapshot(initial, blankMatch, 5300);
  assert(guest);
  const stopped = { ...initial, pausedAt: 12_000, disconnectedSeats: ['guest'], sentAt: 12_000 };
  const pausedGuest = readMatchSnapshot(stopped, guest, 12_200);
  assert(pausedGuest);
  assert.deepEqual(pausedGuest.disconnectedSeats, ['guest']);
  assert.equal(matchInProgress(pausedGuest, 13_000), false);
  assert.equal(readMatchSnapshot(initial, pausedGuest, 13_000), undefined);

  const resumed = resumeMatchClock(stopped, 19_000);
  assert.equal(resumed.startedAt, initial.startedAt);
  assert.equal(resumed.disconnectedSeats, undefined);
  assert.equal(resumed.beginsAt, 12_000);
  assert.equal(resumed.deadline, 22_000);
  assert.equal(resumed.deadline - 19_000, initial.deadline - stopped.pausedAt);
  const recoveredGuest = readMatchSnapshot({ ...resumed, type: 'snapshot', sentAt: 19_000 }, pausedGuest, 19_500);
  assert(recoveredGuest);
  assert.equal(recoveredGuest.clockOffset, 200);
  assert.equal(matchInProgress(recoveredGuest, 19_000), true);
  assert.equal(readMatchSnapshot(stopped, recoveredGuest, 19_600), undefined);
});

test('an existing multiplayer pause updates its disconnected seats without restarting the clock', () => {
  const initial = { ...blankMatch, type: 'snapshot', id: 'multiplayer-recovery', game: 'physics', startedAt: 1000,
    physics: createFlickRound(defaultFlickSettings, 4), physicsSeats: ['host', 'guest', 'guest2', 'guest3'] };
  const first = readMatchSnapshot({ ...initial, pausedAt: 6_000, disconnectedSeats: ['guest', 'guest2'] }, blankMatch, 6_000);
  assert(first);
  const partial = readMatchSnapshot({ ...initial, pausedAt: 6_000, disconnectedSeats: ['guest2'] }, first, 12_000);
  assert.equal(partial?.pausedAt, 6_000);
  assert.deepEqual(partial?.disconnectedSeats, ['guest2']);
  assert.equal(readMatchSnapshot({ ...initial, pausedAt: 6_000, disconnectedSeats: ['host'] }, first, 12_000), undefined);
  assert.equal(readMatchSnapshot({ ...initial, pausedAt: 6_000, disconnectedSeats: ['guest2', 'guest2'] }, first, 12_000), undefined);
});
