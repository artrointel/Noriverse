import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceMole, createMoleRound, defaultMoleSettings, feverDuration, giantDuration,
  moleHardLimit, moleOutcome, nextMoleAt, readMoleRound, readMoleSettings, resignMole, shiftMoleClock, startMoleRound, strikeMole } from '../apps/web/src/games/mole/rules.ts';
import type { MoleRound, MoleTarget } from '../apps/web/src/games/mole/rules.ts';

const begins = 10_000;

function withTarget(round: MoleRound, kind: MoleTarget['kind'], at: number, hp = 1) {
  const host = round.boards.host!;
  return { ...round, boards: { ...round.boards, host: {
    ...host, targets: [{ id: 1, cell: 0, kind, character: 0, hp, from: at - 110, until: at + 400 }],
    sequence: Math.max(1, host.sequence),
  } } };
}

test('3 x 3, 4 x 4 and timed settings share a seeded opening across players', () => {
  for (const size of [3, 4] as const) {
    const config = { size, mode: 'timed', seconds: 30 } as const;
    assert.deepEqual(readMoleSettings(config), config);
    const waiting = createMoleRound(config, ['host', 'guest', 'guest2', 'guest3'], 12);
    const playing = startMoleRound(waiting, begins);
    assert.equal(playing.boards.host!.until, begins + 30_000);
    const first = advanceMole(playing, nextMoleAt(playing)!);
    assert(first);
    assert.deepEqual(first.boards.host!.targets, first.boards.guest3!.targets);
    assert(first.boards.host!.targets.every(target => target.cell < size ** 2));
    assert.deepEqual(readMoleRound(JSON.parse(JSON.stringify(first))), first);
  }
  assert.equal(readMoleSettings({ size: 5, seconds: 10, mode: 'timed' }), undefined);
});

test('30-combo fever doubles gains and penalties for five seconds and attacks a rival', () => {
  const on = startMoleRound(createMoleRound({ ...defaultMoleSettings, mode: 'endless' }, ['host', 'guest'], 1), begins);
  Object.assign(on.boards.host!, { combo: 29, best: 29, caught: 29 });
  const now = begins + 1000;
  const fever = strikeMole(withTarget(on, 'crew', now), 'host', 1, now);
  assert(fever);
  assert.equal(fever.boards.host!.score, 20);
  assert.equal(fever.boards.host!.feverUntil, now + feverDuration);
  assert(fever.boards.guest!.fogUntil > now);
  assert.equal(fever.boards.guest!.decoys, 3);
  const trap = strikeMole(withTarget(fever, 'trap', now + 100), 'host', 1, now + 100);
  assert(trap);
  assert.equal(trap.boards.host!.score, -20);
  assert.equal(trap.boards.host!.combo, 0);
  assert.equal(trap.boards.host!.until, fever.boards.host!.until - 3_200);
  const expired = strikeMole(withTarget(trap, 'crew', now + feverDuration), 'host', 1, now + feverDuration);
  assert.equal(expired?.boards.host!.strike?.points, 10);
});

test('armor needs multiple hits and the bonus opens a three-second giant streak', () => {
  const on = startMoleRound(createMoleRound(defaultMoleSettings, ['host', 'guest', 'guest2'], 1), begins);
  const now = begins + 1000;
  const armor = strikeMole(withTarget(on, 'armored', now, 2), 'host', 1, now);
  assert(armor);
  assert.equal(armor.boards.host!.score, 0);
  assert.equal(armor.boards.host!.targets[0].hp, 1);
  assert.equal(strikeMole(armor, 'host', 1, now + 10), undefined);
  const caught = strikeMole(armor, 'host', 1, now + 105);
  assert(caught);
  assert.equal(caught.boards.host!.score, 25);
  const bonusAt = now + 250;
  const bonus = strikeMole(withTarget(caught, 'bonus', bonusAt), 'host', 1, bonusAt);
  assert(bonus);
  assert.equal(bonus.boards.host!.giantUntil, bonusAt + giantDuration);
  const giant = strikeMole(bonus, 'host', 0, bonusAt + 100);
  assert(giant);
  assert.equal(giant.boards.host!.score, 66);
  assert.equal(strikeMole(giant, 'host', 0, bonusAt + giantDuration), undefined);
  assert.notEqual(giant.boards.guest!.fogUntil, 0);
  assert.equal(giant.boards.guest2!.fogUntil, 0);
});

function simulateEndless(delay: number) {
  const config = { ...defaultMoleSettings, mode: 'endless' } as const;
  let round = startMoleRound(createMoleRound(config, ['host'], 7), begins);
  for (let now = begins; now <= begins + moleHardLimit; now += 100) {
    round = advanceMole(round, now) ?? round;
    if (round.winners) return now - begins;
    const board = round.boards.host!;
    const target = board.targets.find(target => target.kind !== 'trap' && now - target.from >= delay);
    if (target) round = strikeMole(round, 'host', target.id, now) ?? round;
    if (!target && board.giantUntil > now) round = strikeMole(round, 'host', 0, now) ?? round;
  }
  return Infinity;
}

test('even a scripted player ends within three minutes and slower reactions shorten survival', () => {
  const fast = simulateEndless(100);
  const moderate = simulateEndless(600);
  assert(fast <= moleHardLimit);
  assert(moderate >= 60_000 && moderate < fast);
});

test('score decides timed and endless winners, with explicit draws and resignations', () => {
  const round = startMoleRound(createMoleRound(defaultMoleSettings, ['host', 'guest', 'guest2'], 1), begins);
  Object.assign(round.boards.host!, { score: 80 });
  Object.assign(round.boards.guest!, { score: 80 });
  Object.assign(round.boards.guest2!, { score: 91 });
  const forfeited = resignMole(round, 'guest2');
  assert(forfeited);
  const ended = advanceMole(forfeited, begins + 60_000);
  assert(ended);
  assert.equal(moleOutcome(ended, 'host'), 'draw');
  assert.equal(moleOutcome(ended, 'guest2'), 'loss');
  const shifted = shiftMoleClock(round, 3000);
  assert.equal(shifted.start, begins + 3000);
  assert.equal(shifted.boards.host!.until, round.boards.host!.until + 3000);
});
