import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultMatchSettings } from '../apps/web/src/games/match-settings.ts';
import { createMemoryBoard, defaultMemorySettings, memoryPair, memoryPreviewMs } from '../apps/web/src/games/memory/rules.ts';
import { applyPuzzleAction, makePuzzleRound, puzzleEnd, readyPuzzle } from '../apps/web/src/games/sichuan/multiplayer.ts';
import { blankMatch, lobbyMatch, readMatchSnapshot } from '../apps/web/src/network/room-match.ts';

test('memory boards fill every cell with paired motifs and accept matches without a connecting path', () => {
  for (const size of [4, 6]) {
    const deck = createMemoryBoard(size, 'animals', () => .37);
    assert.equal(deck.length, size ** 2);
    const counts = new Map<number, number>();
    for (const value of deck) {
      assert(value !== null && value >= 0);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    assert([...counts.values()].every(count => count % 2 === 0));
  }
  const board = Array(16).fill(1);
  board[0] = board[15] = 7;
  assert.deepEqual(memoryPair(board, 0, 15), [[0, 0], [3, 3]]);
  assert.equal(memoryPair(board, 0, 0), undefined);
  assert.equal(memoryPair(board, 0, 2), undefined);
});

test('memory room races lock input during preview and snapshot equal independent decks', () => {
  const game = lobbyMatch('memory', defaultMatchSettings);
  let round = makePuzzleRound(defaultMemorySettings, () => .37, ['host', 'guest'], true);
  round = readyPuzzle(round, 'host', 100)!;
  round = readyPuzzle(round, 'guest', 100)!;
  assert.deepEqual(round.boards.host?.tiles, round.boards.guest?.tiles);
  const board = round.boards.host!.tiles;
  const other = board.findIndex((tile, i) => i > 0 && tile === board[0]);
  const action = { kind: 'pair', first: 0, second: other, generation: 0 };
  const unlocked = round.beginsAt + memoryPreviewMs;
  assert.equal(applyPuzzleAction(round, 'race', 'host', action, unlocked - 1), undefined);
  assert.equal(puzzleEnd(round), unlocked + 90_000);
  const next = applyPuzzleAction(round, 'race', 'host', action, unlocked)!;
  assert.equal(next.boards.host?.tiles[0], null);
  assert.equal(next.boards.guest?.tiles[0], board[0]);
  const recovered = readMatchSnapshot({ ...game, type: 'snapshot', startedAt: 100, puzzle: next }, blankMatch, unlocked);
  assert.equal(recovered?.puzzle?.memory, true);
  assert.deepEqual(recovered?.puzzle?.boards.host?.tiles, next.boards.host?.tiles);
});
