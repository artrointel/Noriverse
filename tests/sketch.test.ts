import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceSketch, applySketchAction, defaultSketchSettings, drawer, inkLimit, makeSketchRound, readInk, readSketchRound, sketchDeck, sketchOutcome,
  visibleSketch } from '../apps/web/src/games/sketch/rules.ts';
import type { Ink } from '../apps/web/src/games/sketch/rules.ts';
import { blankMatch, lobbyMatch, readMatchSnapshot } from '../apps/web/src/network/room-match.ts';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';

test('only the artist receives the secret and can submit ink', () => {
  const round = { ...makeSketchRound(['host', 'guest'], 'hot air balloon'), deadline: 1000 };
  const lines: Ink[] = [[10, 20, 30, 40, 0, 1]];
  assert.equal(visibleSketch(round, 'guest').answer, undefined);
  assert.equal(visibleSketch(round, 'host').answer, 'hot air balloon');
  assert.equal(applySketchAction(round, 'guest', { kind: 'ink', lines }, 100), undefined);
  assert.equal(applySketchAction(round, 'host', { kind: 'guess', text: 'hot air balloon' }, 100), undefined);
  assert.equal(applySketchAction(round, 'guest', { kind: 'guess', text: 'balloon' }, 100), undefined);
  assert.deepEqual(applySketchAction(round, 'host', { kind: 'ink', lines }, 100)?.board, lines);
  assert.equal(applySketchAction(round, 'host', { kind: 'ink', lines }, 1000), undefined);
  assert.equal(readInk([[0, 0, 1001, 0, 0, 0]], inkLimit), undefined);
  assert.equal(readInk([[0, 0, 1000, 0, 8, 0]], inkLimit), undefined);
});

test('correct guesses score once, reveal the word and rotate all four artists', () => {
  const settings = { ...defaultSketchSettings, cycles: 1 as const };
  const deck = sketchDeck('en', () => .5);
  assert.equal(new Set(deck).size, deck.length);
  let round = { ...makeSketchRound(['host', 'guest', 'guest2', 'guest3'], 'hot air balloon'), deadline: 1000 };
  round = applySketchAction(round, 'guest', { kind: 'guess', text: ' HOT-AIR Balloon ' }, 100)!;
  assert.deepEqual(round.scores, [50, 100, 0, 0]);
  assert.equal(applySketchAction(round, 'guest', { kind: 'guess', text: 'hot air balloon' }, 101), undefined);
  for (const role of ['guest2', 'guest3'] as const) round = applySketchAction(round, role, { kind: 'guess', text: 'hot air balloon' }, 120)!;
  assert.equal(round.phase, 'reveal');
  assert.equal(visibleSketch(round, 'guest').answer, 'hot air balloon');
  assert.deepEqual(round.scores, [150, 100, 100, 100]);
  for (const next of ['guest', 'guest2', 'guest3'] as const) {
    round = advanceSketch(round, settings, deck, round.deadline)!;
    assert.equal(drawer(round), next);
    assert.deepEqual(round.board, []);
    round = advanceSketch(round, settings, deck, round.deadline)!;
    assert.equal(round.phase, 'reveal');
  }
  round = advanceSketch(round, settings, deck, round.deadline)!;
  assert.equal(round.phase, 'done');
  assert.equal(sketchOutcome(round, 'host'), 'win');
  assert.equal(sketchOutcome(round, 'guest3'), 'loss');
});

test('snapshots restore the board, reject stale revisions and close the round after a two-player resignation', () => {
  const initial = lobbyMatch('sketch', defaultMatchSettings);
  const round = { ...makeSketchRound(['host', 'guest'], '우산'), deadline: 68000 };
  const board: Ink[] = [[0, 0, 1000, 1000, 3, 2]];
  const snapshot = { type: 'snapshot', ...initial, startedAt: 1000, beginsAt: 8000, sketch: { ...visibleSketch(round, 'guest'), board, revision: 2 } };
  const recovered = readMatchSnapshot(snapshot, blankMatch, 2000)!;
  assert.deepEqual(recovered.sketch?.board, board);
  assert.equal(recovered.sketch?.answer, undefined);
  assert.equal(readMatchSnapshot({ ...snapshot, sketch: { ...snapshot.sketch, revision: 1 } }, recovered, 2100), undefined);
  const end = applySketchAction(round, 'host', { kind: 'resign' }, 8500)!;
  assert.equal(readSketchRound(end, defaultSketchSettings)?.phase, 'done');
  assert.equal(sketchOutcome(end, 'guest'), 'win');
});
