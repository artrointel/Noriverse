import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';
import { blankMatch, lobbyMatch, matchOutcome, readMatchSnapshot, roundSeats } from '../apps/web/src/network/room-match.ts';
import { advanceLiar, applyLiarAction, defaultLiarSettings, liarOutcome, liarSpeaker, makeLiarRound, visibleLiar } from '../apps/web/src/games/liar/rules.ts';
import type { LiarRound } from '../apps/web/src/games/liar/rules.ts';
import type { Role } from '../packages/protocol/rooms.ts';

const settings = { ...defaultLiarSettings, language: 'en' } as const;
const seats = ['host', 'guest', 'guest2'] satisfies Role[];

function roundForVoting(): LiarRound {
  let round = { ...makeLiarRound(seats, 'en', () => 0), deadline: 5000 };
  assert.equal(liarSpeaker(round), 'host');
  assert.equal(applyLiarAction(round, 'guest', { kind: 'hint', text: 'too early' }, settings, 1000), undefined);
  round = applyLiarAction(round, 'host', { kind: 'hint', text: 'common' }, settings, 1000)!;
  round = advanceLiar(round, settings, round.deadline)!;
  assert.deepEqual(round.hints[1], { player: 'guest' });
  round = applyLiarAction(round, 'guest2', { kind: 'hint', text: 'warm' }, settings, round.deadline - 1)!;
  assert.equal(round.phase, 'vote');
  return round;
}

const cast = (round: LiarRound, from: Role, to: Role) =>
  applyLiarAction(round, from, { kind: 'vote', target: to }, settings, round.deadline - 101);

test('a liar round needs three connected players and assigns one private role', () => {
  const participants = seats.map(role => ({ role }));
  assert.equal(roundSeats('liar', ['guest'], participants.slice(0, 2)), undefined);
  assert.deepEqual(roundSeats('liar', ['guest', 'guest2'], participants), seats);
  const round = makeLiarRound(seats, 'en', () => 0);
  assert.deepEqual(visibleLiar(round, 'host').card, { side: 'liar' });
  assert(!JSON.stringify(visibleLiar(round, 'host')).includes(round.secret.word));
  assert.deepEqual(visibleLiar(round, 'guest').card, { side: 'citizens', word: round.secret.word });
  assert.equal(visibleLiar(round, 'guest3').card, undefined);
});

test('only the voter sees their choice before the tally and ties favor the liar', () => {
  let round = roundForVoting();
  assert.equal(cast(round, 'guest', 'guest'), undefined);
  round = cast(round, 'host', 'guest')!;
  assert.equal(cast(round, 'host', 'guest2'), undefined);
  assert.equal(visibleLiar(round, 'host').selected, 'guest');
  assert.equal(visibleLiar(round, 'guest').selected, undefined);
  assert.equal(visibleLiar(round, 'guest').tally, undefined);
  assert(!('secret' in visibleLiar(round, 'guest')));
  round = cast(round, 'guest', 'guest2')!;
  round = cast(round, 'guest2', 'host')!;
  assert.equal(round.result?.winner, 'liar');
  assert.equal(liarOutcome(round, 'host'), 'win');
  assert.equal(liarOutcome(round, 'guest'), 'loss');
});

test('a caught liar has one guess and a timeout awards the citizens the match', () => {
  let round = roundForVoting();
  round = cast(round, 'host', 'guest')!;
  round = cast(round, 'guest', 'host')!;
  round = cast(round, 'guest2', 'host')!;
  assert.equal(round.phase, 'guess');
  assert.equal(round.accused, 'host');
  assert.equal(visibleLiar(round, 'host').result, undefined);
  assert.equal(applyLiarAction(round, 'guest', { kind: 'guess', text: round.secret.word }, settings, round.deadline - 1), undefined);
  const win = applyLiarAction(round, 'host', { kind: 'guess', text: ' SPICY-rice cakes ' }, settings, round.deadline - 1)!;
  assert.equal(win.result?.winner, 'liar');
  assert.equal(applyLiarAction(win, 'host', { kind: 'guess', text: 'again' }, settings, 1), undefined);
  assert.equal(advanceLiar(round, settings, round.deadline)?.result?.winner, 'citizens');
  const lost = applyLiarAction(round, 'host', { kind: 'guess', text: 'wrong' }, settings, round.deadline - 1)!;
  assert.equal(lost.result?.winner, 'citizens');
  assert.equal(matchOutcome({ ...lobbyMatch('liar', defaultMatchSettings), liar: lost, finishedAt: 100 }, 'guest'), 'win');
});

test('snapshots preserve the assigned card and current ballot without the authority payload', () => {
  const initial = lobbyMatch('liar', defaultMatchSettings);
  const round = cast(roundForVoting(), 'guest', 'host')!;
  const liar = visibleLiar(round, 'guest');
  const snapshot = { ...initial, type: 'snapshot', startedAt: 100, beginsAt: 500, liar };
  const resumed = readMatchSnapshot(snapshot, blankMatch, 1000);
  assert.deepEqual(resumed?.liar?.card, liar.card);
  assert.equal(resumed?.liar?.selected, 'host');
  assert(!('secret' in resumed!.liar!));
  assert.equal(readMatchSnapshot({ ...snapshot, liar: { ...liar, revision: liar.revision - 1 } }, resumed!, 1000), undefined);
});
