import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectTiles, createSichuanBoard, findTilePair, shuffleTiles, sichuanMotifs, sichuanSize } from '../apps/web/src/games/sichuan/rules.ts';
import type { Tile } from '../apps/web/src/games/sichuan/rules.ts';

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

test('shuffle preserves the holes and motifs and ensures a legal match', () => {
  const board: Tile[] = Array(sichuanSize ** 2).fill(null);
  board[at(2, 2)] = board[at(3, 3)] = 3;
  board[at(3, 2)] = board[at(2, 3)] = 8;
  assert.equal(findTilePair(board), undefined);
  const shuffled = shuffleTiles(board, () => .37);
  assert.deepEqual(shuffled.map(tile => tile === null), board.map(tile => tile === null));
  assert.deepEqual(shuffled.filter(tile => tile !== null).sort(), [3, 3, 8, 8]);
  assert.ok(findTilePair(shuffled));
});

test('a new board contains four copies of each atlas motif and can be cleared', () => {
  const board = createSichuanBoard(() => .37);
  for (let motif = 0; motif < sichuanMotifs; motif++) assert.equal(board.filter(tile => tile === motif).length, 4);
  let tiles = board;
  for (let index = 0; index < board.length / 2; index++) {
    const pair = findTilePair(tiles) ?? findTilePair(tiles = shuffleTiles(tiles, () => .37));
    assert.ok(pair);
    tiles[pair[0]] = tiles[pair[1]] = null;
  }
  assert.ok(tiles.every(tile => tile === null));
});
