import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceSketch, applySketchAction, chooseSketchMap, defaultSketchSettings, drawer, makeSketchRound, nextSketchEvent,
  readSketchRound, readSketchSettings, sketchDeck, sketchOutcome, startSketchTurn, visibleSketch, wordIntroDuration } from '../apps/web/src/games/sketch/rules.ts';
import type { Prompt } from '../apps/web/src/games/sketch/rules.ts';
import { editInk, emptyInk, eraserBrush, inkLimit, maxEraserWidth, readInk } from '../apps/web/src/games/sketch/ink.ts';
import type { Ink } from '../apps/web/src/games/sketch/ink.ts';
import { maxRelayMessageLength } from '../packages/protocol/rooms.ts';
import type { Role } from '../packages/protocol/rooms.ts';
import { blankMatch, lobbyMatch, readMatchSnapshot } from '../apps/web/src/network/room-match.ts';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';

const answer: Prompt = { word: 'hot air balloon', category: 'object', color: 'red' };
const settings = { ...defaultSketchSettings, cycles: 1 } as const;
const initial = (players: Role[] = ['host', 'guest']) => startSketchTurn(makeSketchRound(players, answer, 'notebook'), settings, 1000);
const line: Ink = [10, 20, 30, 40, 0x872215, 32, 2, 1];

test('the prompt and future clues remain private and drawing starts after the intro', () => {
  const round = initial();
  assert.equal(round.opensAt, 1000 + wordIntroDuration);
  assert.equal(visibleSketch(round, 'guest').answer, undefined);
  assert.equal(visibleSketch(round, 'guest').prompt, undefined);
  assert.equal(visibleSketch(round, 'host').answer, answer.word);
  assert.equal(applySketchAction(round, 'host', { kind: 'ink', lines: [line] }, round.opensAt - 1), undefined);
  assert.equal(applySketchAction(round, 'guest', { kind: 'ink', lines: [line] }, round.opensAt), undefined);
  assert.equal(applySketchAction(round, 'host', { kind: 'guess', text: answer.word }, round.opensAt), undefined);
  assert.deepEqual(applySketchAction(round, 'host', { kind: 'ink', lines: [line] }, round.opensAt)?.board, [line]);
  assert.equal(readInk([[0, 0, 1001, 0, 0, 8, 0, 1]], inkLimit), undefined);
  assert.equal(readInk([[0, 0, 1000, 0, 0xffffff + 1, 8, 0, 1]], inkLimit), undefined);
});

test('hints are released on the configured clock without leaking the answer', () => {
  const round = initial();
  assert.equal(advanceSketch(round, settings, [], round.opensAt + 29_999), undefined);
  const first = advanceSketch(round, settings, [], round.opensAt + 30_000)!;
  assert.equal(nextSketchEvent(first, settings), round.opensAt + 60_000);
  assert.deepEqual(first.hints, [{ kind: 'length', value: 13 }]);
  const all = advanceSketch(first, settings, [], round.opensAt + 90_000)!;
  assert.deepEqual(visibleSketch(all, 'guest').hints, [
    { kind: 'length', value: 13 }, { kind: 'category', value: 'object' }, { kind: 'color', value: 'red' },
  ]);
  assert.equal(visibleSketch(all, 'guest').answer, undefined);
  assert.deepEqual(readSketchSettings({ language: 'en', seconds: 120, cycles: 2, hintSeconds: 3, map: 'random' }), {
    language: 'en', seconds: 120, cycles: 2, hintSeconds: 3, map: 'random',
  });
  assert.equal(readSketchSettings({ ...settings, hintSeconds: 0 }), undefined);
  assert.equal(chooseSketchMap('random', () => .97), 'postcard');
});

test('the first correct guess scores by speed and selects the next eligible artist', () => {
  const deck = sketchDeck('en', () => .5);
  const first = initial(['host', 'guest', 'guest2', 'guest3']);
  const fast = applySketchAction(first, 'guest', { kind: 'guess', text: ' HOT-AIR Balloon ' }, first.opensAt + 1)!;
  const slow = applySketchAction(first, 'guest', { kind: 'guess', text: answer.word }, first.deadline - 1)!;
  assert.deepEqual(fast.scores, [0, 300, 0, 0]);
  assert.deepEqual(slow.scores, [0, 100, 0, 0]);
  assert.equal(fast.phase, 'reveal');
  assert.equal(applySketchAction(fast, 'guest2', { kind: 'guess', text: answer.word }, fast.opensAt + 2), undefined);
  let round = advanceSketch(fast, settings, deck, fast.deadline)!;
  assert.equal(drawer(round), 'guest');
  round = applySketchAction(round, 'host', { kind: 'guess', text: round.answer }, round.opensAt + 120_000 - 1)!;
  round = { ...round, scores: [100, 300, 50, 10] };
  round = advanceSketch(round, settings, deck, round.deadline)!;
  assert.equal(drawer(round), 'guest2');
  for (let i = 0; i < 2; i++) {
    round = advanceSketch(round, settings, deck, round.deadline)!;
    round = advanceSketch(round, settings, deck, round.deadline)!;
  }
  assert.equal(round.phase, 'done');
  assert.deepEqual(round.players.filter(player => sketchOutcome(round, player) === 'win'), ['guest']);
  assert.deepEqual(first.players.filter(player => sketchOutcome({ ...first, scores: [200, 200, 0, 0],
    responseMs: [900, 1100, 0, 0] }, player) === 'win'), ['host']);
});

test('undo and redo preserve whole strokes and drawing after undo clears redo', () => {
  const segment: Ink = [...line];
  segment[0] = 100;
  const other: Ink = [...line];
  other[7] = 2;
  const drawn = editInk(editInk(emptyInk(), [line, segment])!, [other])!;
  const undone = editInk(drawn, 'undo')!;
  assert.deepEqual(undone.board, [line, segment]);
  assert.deepEqual(editInk(undone, 'redo')?.board, drawn.board);
  assert.deepEqual(editInk(undone, [other])?.redo, []);
  assert.equal(editInk(drawn, [line]), undefined);
});

test('eraser widths travel in ink history and undo and redo preserve the eraser stroke', () => {
  const eraser: Ink = [100, 200, 200, 200, 0, maxEraserWidth, eraserBrush, 2];
  assert.deepEqual(readInk([eraser], 1), [eraser]);
  assert.equal(readInk([[...eraser.slice(0, 6), 0, 2]], 1), undefined);
  assert.equal(readInk([[...eraser.slice(0, 5), maxEraserWidth + 1, eraserBrush, 2]], 1), undefined);
  const erased = editInk(editInk(emptyInk(), [line])!, [eraser])!;
  const undone = editInk(erased, 'undo')!;
  assert.deepEqual(undone.board, [line]);
  assert.deepEqual(editInk(undone, 'redo')?.board, [line, eraser]);
});

test('snapshots fit the relay limit and restore board and redo availability without private data', () => {
  const initialLobby = lobbyMatch('sketch', defaultMatchSettings);
  const round = initial();
  const worst: Ink = [1000, 1000, 1000, 1000, 16777215, 36, 3, 999999];
  const board = Array<Ink>(inkLimit).fill(worst);
  const current = { ...round, board, revision: 2, redo: [[line]], redoCount: 1 };
  const snapshot = { type: 'snapshot', ...initialLobby, startedAt: 1000, beginsAt: 1000, sketch: visibleSketch(current, 'guest') };
  assert(JSON.stringify({ type: 'relay-data', peer: 'guest', data: snapshot }).length <= maxRelayMessageLength);
  const recovered = readMatchSnapshot(snapshot, blankMatch, 2000)!;
  assert.deepEqual(recovered.sketch?.board, board);
  assert.equal(recovered.sketch?.answer, undefined);
  assert.equal(recovered.sketch?.redo, undefined);
  assert.equal(recovered.sketch?.redoCount, 1);
  assert.equal(readMatchSnapshot({ ...snapshot, sketch: { ...snapshot.sketch, revision: 1 } }, recovered, 2100), undefined);
  const end = applySketchAction(round, 'host', { kind: 'resign' }, round.opensAt + 20)!;
  assert.equal(readSketchRound(end, settings)?.phase, 'done');
  assert.equal(sketchOutcome(end, 'guest'), 'win');
});
