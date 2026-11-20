import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableTileMatches, connectTiles, createSichuanBoard, isMatchTile, nextSichuanCombo, obstacle, shuffleTiles } from '../apps/web/src/games/sichuan/rules.ts';
import type { Tile } from '../apps/web/src/games/sichuan/rules.ts';
import { defaultSichuanSettings, maxSichuanObstacleDensity, motifCount, resolveSichuanSettings, sichuanSizes, sichuanThemes, sichuanTileCount, sichuanTimeLimits } from '../apps/web/src/games/sichuan/options.ts';
import type { SichuanMode } from '../apps/web/src/games/sichuan/options.ts';
import { applyPuzzleAction, makePuzzleRound, puzzleBoardFor, puzzleEnd, puzzleOutcome, readPuzzleRound, readyPuzzle } from '../apps/web/src/games/sichuan/multiplayer.ts';

const sichuanSize = 8;

const at = (x: number, y: number) => x + sichuanSize * y;
const occupied = () => Array<Tile>(sichuanSize ** 2).fill(9);

test('allows direct paths, two bends, and paths along the outside', () => {
  const board = occupied();
  board[at(1, 1)] = board[at(2, 1)] = 0;
  assert.deepEqual(connectTiles(board, at(1, 1), at(2, 1)), [[1, 1], [2, 1]]);
  board[at(3, 2)] = 0;
  board[at(2, 1)] = board[at(2, 2)] = null;
  assert.deepEqual(connectTiles(board, at(1, 1), at(3, 2)), [[1, 1], [2, 1], [2, 2], [3, 2]]);
  board[at(0, 0)] = board[at(7, 0)] = 1;
  assert.deepEqual(connectTiles(board, at(0, 0), at(7, 0)), [[0, 0], [0, -1], [7, -1], [7, 0]]);
});

test('rejects mismatched tiles and paths that need three bends', () => {
  const board = occupied();
  board[at(1, 1)] = board[at(4, 3)] = 0;
  for (const index of [at(2, 1), at(2, 2), at(3, 2), at(4, 2)]) board[index] = null;
  assert.equal(connectTiles(board, at(1, 1), at(0, 1)), undefined);
  assert.equal(connectTiles(board, at(1, 1), at(4, 3)), undefined);
});

test('shuffle changes occupied cells, preserves the motifs and ensures a legal match', () => {
  const board: Tile[] = Array(sichuanSize ** 2).fill(null);
  board[at(2, 2)] = board[at(3, 3)] = 3;
  board[at(3, 2)] = board[at(2, 3)] = 8;
  assert.equal(availableTileMatches(board).pair, undefined);
  const shuffled = shuffleTiles(board, () => .37);
  assert.ok(board.every((tile, index) => tile === null || shuffled[index] !== tile));
  assert.deepEqual(shuffled.filter(tile => tile !== null).sort(), [3, 3, 8, 8]);
  assert.ok(availableTileMatches(shuffled).pair);
});

test('a new board contains pairs of each atlas motif and can be cleared', () => {
  const board = createSichuanBoard(resolveSichuanSettings({ ...defaultSichuanSettings, size: 10, theme: 'numbers', obstacles: false }), () => .37);
  for (let motif = 0; motif < motifCount('numbers'); motif++) assert.equal(board.filter(tile => tile === motif).length, 8);
  const pairCount = board.filter(isMatchTile).length / 2;
  let tiles = board;
  for (let index = 0; index < pairCount; index++) {
    const pair = availableTileMatches(tiles).pair ?? availableTileMatches(tiles = shuffleTiles(tiles, () => .37)).pair;
    assert.ok(pair);
    tiles[pair[0]] = tiles[pair[1]] = null;
  }
  assert.ok(tiles.every(tile => tile === null));
});

test('obstacles cannot match and the legal move count is in pairs', () => {
  const board: Tile[] = Array(sichuanSize ** 2).fill(null);
  board[at(2, 3)] = board[at(4, 3)] = 0;
  board[at(3, 3)] = board[at(3, 5)] = obstacle;
  board[at(1, 3)] = 1;
  assert.equal(connectTiles(board, at(3, 3), at(3, 5)), undefined);
  assert.deepEqual(connectTiles(board, at(2, 3), at(4, 3)), [[2, 3], [2, 2], [4, 2], [4, 3]]);
  assert.equal(availableTileMatches(board).pairs, 1);
});

test('grid presets, random extremes, themed motif counts and fixed obstacles survive generation and shuffle', () => {
  let seed = 4;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  assert.equal(resolveSichuanSettings({ ...defaultSichuanSettings, density: 'random' }, () => 0).density, 50);
  assert.equal(resolveSichuanSettings({ ...defaultSichuanSettings, density: 'random' }, () => .999).density, 100);
  assert.equal(resolveSichuanSettings(defaultSichuanSettings, () => .999).theme, sichuanThemes.at(-1));
  for (const size of sichuanSizes) {
    for (const density of [50, 80, 100]) {
      const options = resolveSichuanSettings({ ...defaultSichuanSettings, size, density, theme: 'numbers' });
      assert.equal(options.timeLimit, sichuanTimeLimits[size]);
      const board = createSichuanBoard(options, random);
      assert.equal(board.length, size ** 2);
      const tiles = board.filter(isMatchTile);
      const blocks = board.filter(tile => tile === obstacle).length;
      assert.ok(Math.abs(tiles.length - Math.min(size ** 2 * density / 100, board.length - blocks)) <= 1);
      assert.ok(tiles.every(tile => tile < 10));
      const shuffled = shuffleTiles(board, random);
      assert.deepEqual(shuffled.map(tile => tile === obstacle), board.map(tile => tile === obstacle));
      assert.deepEqual(shuffled.filter(isMatchTile).sort(), tiles.sort());
      assert.ok(availableTileMatches(shuffled).pair);
    }
  }
  assert.equal(resolveSichuanSettings({ ...defaultSichuanSettings, timeLimit: 45 }).timeLimit, 45);
});

test('combo includes the one-second boundary and resets after it', () => {
  const first = nextSichuanCombo(undefined, 200);
  const second = nextSichuanCombo(first, 1200);
  assert.equal(second.count, 2);
  assert.equal(nextSichuanCombo(second, 2201).count, 1);
});

test('obstacle density counts all grid cells, accepts odd counts, and respects room for paired tiles', () => {
  assert.equal(maxSichuanObstacleDensity(10, 80), 20);
  assert.equal(maxSichuanObstacleDensity(10, 100), 0);
  for (const [size, density, requested, expected] of [[10, 80, 20, 20], [10, 90, 20, 10], [10, 80, 17, 17], [6, 80, 20, 7], [10, 100, 6, 0]] as const) {
    const options = resolveSichuanSettings({ ...defaultSichuanSettings, size, density, obstacleDensity: requested });
    const board = createSichuanBoard(options, () => .37);
    assert.equal(board.filter(tile => tile === obstacle).length, expected);
    assert.equal(board.filter(isMatchTile).length, sichuanTileCount(size, density));
    assert.ok(availableTileMatches(board).pair);
  }
  const random = resolveSichuanSettings({ ...defaultSichuanSettings, size: 10, density: 'random', obstacleDensity: 40 }, () => .97);
  assert.equal(random.density, 99);
  assert.equal(random.obstacleDensity, 0);
  const disabled = resolveSichuanSettings({ ...defaultSichuanSettings, obstacles: false, obstacleDensity: 20 });
  assert.equal(disabled.obstacleDensity, 0);
});

function onlinePuzzle(mode: SichuanMode) {
  const config = { mode, settings: { ...defaultSichuanSettings, size: 6, theme: 'numbers' } } as const;
  const lobby = makePuzzleRound(config, () => .37);
  const hostReady = readyPuzzle(lobby, 'host', 1000)!;
  assert.equal(hostReady.beginsAt, 0);
  return { config, round: readyPuzzle(hostReady, 'guest', 1000)! };
}

test('race starts with identical boards, applies the deadline, and awards the first finisher', () => {
  const { config, round } = onlinePuzzle('race');
  assert.deepEqual(round.boards.host, round.boards.guest);
  const [first, second] = availableTileMatches(round.boards.host.tiles).pair!;
  const action = { kind: 'pair', first, second, generation: round.options.shuffles };
  assert.equal(applyPuzzleAction(round, 'race', 'host', action, round.beginsAt - 1), undefined);
  assert.equal(applyPuzzleAction(round, 'race', 'host', action, puzzleEnd(round)), undefined);
  let current = round;
  for (let pair = 0; pair < 14; pair++) {
    const [first, second] = availableTileMatches(current.boards.host.tiles).pair!;
    current = applyPuzzleAction(current, 'race', 'host', { ...action, first, second }, round.beginsAt + pair * 200)!;
  }
  assert.deepEqual(current.boards.guest, round.boards.guest);
  assert.equal(current.result, 'host');
  assert.equal(current.stats.host.removed, 28);
  assert.equal(current.stats.host.maxCombo, 14);
  assert.equal(puzzleOutcome(current.result, 'guest'), 'loss');
  assert.deepEqual(readPuzzleRound(current, config), current);
});

test('co-op shares removals and scores a tile pair only once across both players', () => {
  const { round } = onlinePuzzle('coop');
  const [first, second] = availableTileMatches(round.boards.host.tiles).pair!;
  const action = { kind: 'pair', first, second, generation: round.options.shuffles };
  let current = applyPuzzleAction(round, 'coop', 'guest', action, round.beginsAt)!;
  assert.equal(puzzleBoardFor(current, 'coop', 'host'), puzzleBoardFor(current, 'coop', 'guest'));
  assert.equal(applyPuzzleAction(current, 'coop', 'host', action, round.beginsAt), undefined);
  for (let pair = 1; pair < 14; pair++) {
    const [first, second] = availableTileMatches(puzzleBoardFor(current, 'coop', 'guest').tiles).pair!;
    current = applyPuzzleAction(current, 'coop', pair % 2 ? 'host' : 'guest', { ...action, first, second }, round.beginsAt + pair * 200)!;
  }
  assert.equal(current.result, 'team');
  for (const role of ['host', 'guest'] as const) {
    assert.equal(puzzleOutcome(current.result, role), 'win');
    assert.equal(current.stats[role].removed, 14);
    assert.equal(current.stats[role].maxCombo, 7);
  }
});

test('all four puzzle players must be ready, with independent race and shared co-op tools', () => {
  const players = ['host', 'guest', 'guest2', 'guest3'] as const;
  for (const mode of ['race', 'coop'] as const) {
    const config = { mode, settings: { ...defaultSichuanSettings, hints: 1, theme: 'numbers' } } as const;
    let round = makePuzzleRound(config, () => .37, players);
    for (const player of players.slice(0, 3)) round = readyPuzzle(round, player, 1000)!;
    assert.equal(round.beginsAt, 0);
    round = readyPuzzle(round, 'guest3', 1000)!;
    const before = puzzleBoardFor(round, mode, 'guest3')!;
    assert.ok(availableTileMatches(before.tiles).pair);
    const hint = { kind: 'hint', generation: before.shufflesLeft, hintsLeft: before.hintsLeft };
    const hinted = applyPuzzleAction(round, mode, 'guest3', hint, round.beginsAt)!;
    assert.equal(puzzleBoardFor(hinted, mode, 'guest3')?.hintsLeft, 0);
    assert.equal(puzzleBoardFor(hinted, mode, 'host')?.hintsLeft, mode === 'coop' ? 0 : 1);
    assert.equal(applyPuzzleAction(hinted, mode, 'guest3', hint, round.beginsAt), undefined);
    const shuffled = applyPuzzleAction(hinted, mode, 'guest3', { kind: 'shuffle', generation: before.shufflesLeft }, round.beginsAt, () => .37)!;
    const after = puzzleBoardFor(shuffled, mode, 'guest3')!;
    assert.equal(after.shufflesLeft, before.shufflesLeft - 1);
    assert.notDeepEqual(after.tiles, before.tiles);
    assert.equal(after.hint, undefined);
    assert.ok(availableTileMatches(after.tiles).pair);
    assert.ok(readPuzzleRound(JSON.parse(JSON.stringify(shuffled)), config));
    assert.equal(readPuzzleRound({ ...shuffled, players: ['host', 'guest', 'guest', 'guest3'] }, config), undefined);
  }
});
