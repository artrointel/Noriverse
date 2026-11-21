import assert from 'node:assert/strict';
import test from 'node:test';
import { roomRoles } from '../packages/protocol/rooms.ts';
import { advanceOrbit, applyOrbitInput, createOrbitRound, nextOrbitAt, orbitClearMs, orbitGravityMs, orbitHeight, orbitLanding, orbitOutcome,
  orbitWidth, readOrbitRound, resignOrbit, resolveOrbitTiles } from '../apps/web/src/games/slime/rules.ts';
import type { OrbitCell } from '../apps/web/src/games/slime/rules.ts';
import { orbitKeys, resolveOrbitControl } from '../apps/web/src/games/slime/controls.ts';
import { blankMatch, readMatchSnapshot } from '../apps/web/src/network/room-match.ts';
import { awardRoomPoints } from '../apps/web/src/network/room-scoring.ts';

const at = (x: number, fromBottom = 0) => x + (orbitHeight - fromBottom - 1) * orbitWidth;

function chainTiles() {
  const cells = Array<OrbitCell>(orbitWidth * orbitHeight).fill(0);
  cells[at(0)] = cells[at(1)] = cells[at(1, 1)] = cells[at(1, 2)] = 1;
  cells[at(0, 1)] = cells[at(1, 3)] = cells[at(2)] = cells[at(3)] = 2;
  cells[at(4)] = 5;
  return cells;
}

test('four jellies can form a bent group but a diagonal cannot complete a group of three', () => {
  const cells = Array<OrbitCell>(orbitWidth * orbitHeight).fill(0);
  cells[at(0)] = cells[at(1)] = cells[at(1, 1)] = 1;
  assert.equal(resolveOrbitTiles(cells).cleared, 0);
  cells[at(2)] = cells[at(2, 1)] = 5;
  cells[at(2, 2)] = 1;
  assert.equal(resolveOrbitTiles(cells).cleared, 0);
  cells[at(2, 2)] = 0;
  cells[at(1, 2)] = 1;
  assert.equal(resolveOrbitTiles(cells).cleared, 4);
});

test('orthogonal groups of four clear in waves and remove adjacent meteors', () => {
  const grid = chainTiles();
  const resolved = resolveOrbitTiles(grid);
  assert.equal(resolved.cleared, 8);
  assert.deepEqual(resolved.waves.map(wave => wave.map(cell => cell.color).sort()), [[1, 1, 1, 1], [2, 2, 2, 2, 5]]);
  assert.ok(resolved.cells.every(value => value === 0));
  assert.equal(grid[at(4)], 5);
});

test('pairs use the same seed, gravity opens on schedule, and commands cannot carry to the next pair', () => {
  const started = { ...createOrbitRound(['host', 'guest'], 72), tickAt: 100 };
  assert.deepEqual(started.boards.host, started.boards.guest);
  assert.notEqual(started.boards.host, started.boards.guest);
  assert.equal(advanceOrbit(started, 99), undefined);
  const ticked = advanceOrbit(started, 100)!;
  assert.equal(ticked.tickAt, 100 + orbitGravityMs);
  assert.equal(ticked.boards.guest!.piece.y, 1);
  const moved = applyOrbitInput(ticked, 'guest', { serial: 0, input: 'left' })!;
  const rotated = applyOrbitInput(moved, 'guest', { serial: 0, input: 'rotate' })!;
  assert.equal(rotated.boards.guest!.piece.x, 1);
  assert.equal(rotated.boards.guest!.piece.rotation, 1);
  const dropped = applyOrbitInput(rotated, 'guest', { serial: 0, input: 'drop' })!;
  assert.equal(dropped.boards.guest!.serial, 1);
  assert.deepEqual(dropped.boards.guest!.piece.pair, moved.boards.host!.next);
  assert.equal(applyOrbitInput(dropped, 'guest', { serial: 0, input: 'drop' }), undefined);
  assert.equal(applyOrbitInput(dropped, 'guest', { serial: 1, input: 'teleport' }), undefined);
});

test('the landing preview places each half of a horizontal pair in its settling column', () => {
  const round = createOrbitRound(['host'], 55);
  const board = round.boards.host!;
  board.cells[at(2)] = 5;
  assert.deepEqual(orbitLanding(board), [[2, orbitHeight - 2], [3, orbitHeight - 1]]);
  assert.deepEqual(applyOrbitInput(round, 'host', { serial: 0, input: 'drop' })!.boards.host!.event?.landed, [at(2, 1), at(3)]);
});

test('down drops only on consecutive presses within 500 ms on the same pair and round', () => {
  const press = { id: 'jelly', serial: 3, at: 100 };
  const first = resolveOrbitControl('down', press);
  assert.deepEqual(first, { input: 'down', down: press });
  assert.deepEqual(resolveOrbitControl('down', { ...press, at: 600 }, first.down), { input: 'drop' });
  assert.equal(resolveOrbitControl('down', { ...press, at: 601 }, first.down).input, 'down');
  assert.equal(resolveOrbitControl('down', { ...press, at: 101, serial: 4 }, first.down).input, 'down');
  assert.equal(resolveOrbitControl('down', { ...press, at: 101, id: 'rematch' }, first.down).input, 'down');
  assert.deepEqual(resolveOrbitControl('rotate', { ...press, at: 102 }, first.down), { input: 'rotate' });
  assert.equal(orbitKeys.get('ArrowUp'), 'rotate');
  assert.equal(orbitKeys.get(' '), undefined);
});

test('chains queue meteors on the next live board and the last survivor receives the win', () => {
  let round = { ...createOrbitRound([...roomRoles], 77), tickAt: 1_000 };
  round = resignOrbit(round, 'guest')!;
  const host = round.boards.host!;
  host.cells = chainTiles();
  host.piece = { ...host.piece, x: 5 };
  round = applyOrbitInput(round, 'host', { serial: 0, input: 'drop' }, 100)!;
  const first = round.boards.host!.resolution!;
  assert.equal(first.kind, 'clear');
  assert.equal(first.until, 100 + orbitClearMs);
  assert.equal(nextOrbitAt(round), first.until);
  assert.equal(round.boards.host!.cells[at(1, 2)], 1);
  assert.equal(round.boards.host!.serial, 0);
  assert.equal(applyOrbitInput(round, 'host', { serial: 0, input: 'drop' }, 101), undefined);
  assert.equal(advanceOrbit(round, first.until - 1), undefined);
  round = advanceOrbit(round, first.until)!;
  const fall = round.boards.host!.resolution!;
  assert.equal(fall.kind, 'fall');
  assert.equal(round.boards.host!.cells[at(1)], 0);
  assert.equal(round.boards.host!.cells[at(1, 3)], 2);
  assert.equal(round.boards.host!.cleared, 4);
  assert.equal(round.boards.guest2!.incoming, 0);
  assert.deepEqual(readOrbitRound(JSON.parse(JSON.stringify(round)))?.boards.host?.resolution, fall);
  round = advanceOrbit(round, fall.until)!;
  const second = round.boards.host!.resolution!;
  assert.equal(second.kind, 'clear');
  assert.equal(second.chain, 2);
  assert.equal(second.until, fall.until + orbitClearMs);
  assert.equal(round.boards.host!.cells[at(1)], 2);
  assert.equal(round.boards.host!.serial, 0);
  assert.equal(round.boards.guest2!.incoming, 0);
  round = advanceOrbit(round, second.until)!;
  assert.equal(round.boards.host!.resolution, undefined);
  assert.equal(round.boards.host!.serial, 1);
  assert.deepEqual(round.boards.host!.piece.pair, host.next);
  assert.equal(round.boards.host!.cleared, 8);
  assert.equal(round.boards.host!.bestChain, 2);
  assert.equal(round.boards.guest2!.incoming, 2);
  assert.equal(round.boards.guest3!.incoming, 0);
  round = applyOrbitInput(round, 'guest2', { serial: 0, input: 'drop' })!;
  assert.equal(round.boards.guest2!.incoming, 0);
  assert.equal(round.boards.guest2!.cells.filter(cell => cell === 5).length, 2);
  round = resignOrbit(resignOrbit(round, 'guest3')!, 'guest2')!;
  assert.equal(orbitOutcome(round, 'host'), 'win');
  assert.equal(orbitOutcome(round, 'guest'), 'loss');
  const match = { ...blankMatch, game: 'slime' as const, slime: round };
  assert.equal(awardRoomPoints(match, 'host', 'win').points, 50);
  assert.equal(awardRoomPoints(match, 'guest', 'loss').points, 10);
});

test('the last player finishes their chain before the result, even after the opponent resigns', () => {
  const start = { ...createOrbitRound(['host', 'guest'], 77), tickAt: 1_000 };
  start.boards.host!.cells = chainTiles();
  start.boards.host!.piece.x = 5;
  let round = applyOrbitInput(start, 'host', { serial: 0, input: 'drop' }, 100)!;
  round = resignOrbit(round, 'guest')!;
  assert.equal(round.winner, undefined);
  assert.ok(readOrbitRound(JSON.parse(JSON.stringify(round))));
  while (round.boards.host!.resolution) round = advanceOrbit(round, nextOrbitAt(round))!;
  assert.equal(orbitOutcome(round, 'host'), 'win');
});

test('a blocked spawn loses, including a draw when all survivors top out on the same gravity tick', () => {
  const round = { ...createOrbitRound(['host', 'guest'], 129), tickAt: 10 };
  for (const board of Object.values(round.boards)) {
    for (let y = 1; y < orbitHeight; y++) board.cells[y * orbitWidth + 2] = 5;
  }
  const done = advanceOrbit(round, 10)!;
  assert.equal(done.tickAt, 0);
  assert.equal(orbitOutcome(done, 'host'), 'draw');
  assert.equal(readOrbitRound(done)?.winner, 'draw');
});

test('room snapshots restore separate boards and reject a rollback or invalid piece', () => {
  const slime = { ...createOrbitRound([...roomRoles], 9), tickAt: 400 + orbitGravityMs };
  const snapshot = { ...blankMatch, type: 'snapshot', id: 'orbit', game: 'slime', startedAt: 100, beginsAt: 400, slime };
  const updated = applyOrbitInput(slime, 'guest2', { serial: 0, input: 'drop' })!;
  const read = readMatchSnapshot({ ...snapshot, slime: updated }, blankMatch, 500)!;
  assert.equal(read.slime?.boards.guest2?.serial, 1);
  assert.equal(read.slime?.boards.guest?.serial, 0);
  assert.equal(readMatchSnapshot(snapshot, read, 501), undefined);
  assert.equal(readOrbitRound({ ...slime, boards: { ...slime.boards, host: { ...slime.boards.host, piece: { x: 10 } } } }), undefined);
});
