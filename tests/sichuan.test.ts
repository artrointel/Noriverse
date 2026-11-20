import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableTileMatches, connectTiles, createSichuanBoard, isMatchTile, nextSichuanCombo, obstacle, shuffleTiles } from '../apps/web/src/games/sichuan/rules.ts';
import type { Tile } from '../apps/web/src/games/sichuan/rules.ts';
import { defaultSichuanSettings, motifCount, resolveSichuanSettings, sichuanSizes, sichuanThemes, sichuanTimeLimits } from '../apps/web/src/games/sichuan/options.ts';

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

test('a new board contains four copies of each atlas motif and can be cleared', () => {
  const board = createSichuanBoard(resolveSichuanSettings({ ...defaultSichuanSettings, theme: 'classic', density: 100, obstacles: false }), () => .37);
  for (let motif = 0; motif < motifCount('classic'); motif++) assert.equal(board.filter(tile => tile === motif).length, 4);
  let tiles = board;
  for (let index = 0; index < board.length / 2; index++) {
    const pair = availableTileMatches(tiles).pair ?? availableTileMatches(tiles = shuffleTiles(tiles, () => .37)).pair;
    assert.ok(pair);
    tiles[pair[0]] = tiles[pair[1]] = null;
  }
  assert.ok(tiles.every(tile => tile === null));
});

test('obstacles cannot match and count only the tiles participating in legal pairs', () => {
  const board: Tile[] = Array(sichuanSize ** 2).fill(null);
  board[at(2, 3)] = board[at(4, 3)] = 0;
  board[at(3, 3)] = board[at(3, 5)] = obstacle;
  board[at(1, 3)] = 1;
  assert.equal(connectTiles(board, at(3, 3), at(3, 5)), undefined);
  assert.deepEqual(connectTiles(board, at(2, 3), at(4, 3)), [[2, 3], [2, 2], [4, 2], [4, 3]]);
  assert.equal(availableTileMatches(board).count, 2);
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
