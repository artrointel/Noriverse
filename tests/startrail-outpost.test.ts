import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caches, distance, floor, gate, landing, lift, patrols, relayAccess, tileSize, waves, world } from '../apps/web/src/games/startrail/outpost.ts';
import type { Point } from '../apps/web/src/games/startrail/outpost.ts';

const cell = (point: Point) => [Math.floor(point.x / tileSize), Math.floor(point.y / tileSize)] as const;
const label = (x: number, y: number) => `${x}:${y}`;
const at = (point: Point) => label(...cell(point));

function explore(from: Point, blocked: (x: number, y: number) => boolean) {
  const queue = [cell(from)];
  const seen = new Set([at(from)]);
  for (const [x, y] of queue) {
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (!floor[ny]?.[nx] || seen.has(label(nx, ny)) || blocked(nx, ny)) continue;
      seen.add(label(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

test('the outpost triples the map area and has two approaches to the generator', () => {
  assert.equal(world.width * world.height, 3 * 24 * 14 * tileSize ** 2);
  assert.ok(explore(landing, (x, y) => x >= 8 && x <= 9 && y >= 15 && y < 22).has(at(relayAccess)));
  assert.ok(explore(landing, (x, y) => x >= 14 && x <= 15 && y >= 18 && y <= 20).has(at(relayAccess)));
  for (const cache of caches) assert.ok(explore(landing, () => false).has(at(cache)));
});

test('the lift requires the gate and its junction has a northern and an eastern route', () => {
  const closed = explore(landing, (x, y) => x === Math.floor(gate.x / tileSize) &&
    y >= gate.y / tileSize && y < (gate.y + gate.height) / tileSize);
  assert.ok(closed.has(at(relayAccess)));
  assert.ok(!closed.has(at(lift)));
  assert.ok(explore(relayAccess, (x, y) => x >= 24 && y >= 13).has(at(lift)));
  assert.ok(explore(relayAccess, (x, y) => x <= 24 && y < 10).has(at(lift)));
  for (const spawn of [...patrols, ...waves.flatMap(wave => wave.spawns)]) {
    const [x, y] = cell(spawn);
    assert.ok(floor[y]?.[x], `${spawn.kind} spawns off the floor at ${x},${y}`);
    assert.ok(distance(spawn, landing) > 170, 'enemies should not start within firing range of the landing pad');
  }
});
