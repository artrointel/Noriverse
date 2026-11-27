import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balance, blockerClearance, caches, cliffs, distance, floor, gate, landing, lift, mapWallEdges, patrols,
  rayDistance, relayAccess, terrainOutlines, tileSize, walkable, weaponPickups, world } from '../apps/web/src/games/startrail/outpost.ts';
import type { Point } from '../apps/web/src/games/startrail/outpost.ts';
import { cameraView, playerHitFeedback, projectToScreen, projectToWorld } from '../apps/web/src/games/startrail/camera.ts';
import { dispersedHeading, finishReload, knife, knifeSwingDirection, makeGun, medical, outOfAmmo, refillMagazine, startReload, weapons } from '../apps/web/src/games/startrail/gear.ts';
import { createGridPuzzle } from '../apps/web/src/games/startrail/puzzle.ts';
import { flareFalloff, flarePoseAt, SupportGear, supportSpecs, targetAlertSeconds, turretSite } from '../apps/web/src/games/startrail/support.ts';
import { joinShadowFootprints, shadowBasis, shadowFootprint, shadowProjections } from '../apps/web/src/games/startrail/shadow.ts';
import { fixtureGroundRatio } from '../apps/web/src/games/startrail/shadow-art.ts';
import { activeStatuses, applyStatus, rollCombatStatus, shortenStatuses, statusModifiers, tickStatuses } from '../apps/web/src/games/startrail/status.ts';
import type { Statuses } from '../apps/web/src/games/startrail/status.ts';
import { gunArt, heldPose, projectBarrelPoint, supportPose, turretArt, turretBaseCenter } from '../apps/web/src/games/startrail/weapon-pose.ts';
import { flashlightLevel } from '../apps/web/src/games/startrail/visibility.ts';
import { auroraStage, debrisStage, nextStage, observatoryStage, outpostStage, requiredStationsRemaining } from '../apps/web/src/games/startrail/expedition-maps.ts';
import { arrivalRadius, companionCombatWeight, concealed, EncounterDirector, encounterRange, encounters, EnemyFlow,
  openPath, partyEncounter, partyOutsideArrival, scaledPatrols } from '../apps/web/src/games/startrail/encounters.ts';
import { LayerFade, SceneFade } from '../apps/web/src/games/startrail/scene-fade.ts';
import { pilots, simulateExpedition, simulationStages } from '../scripts/startrail-balance.ts';
import { blendTileBoundaries, terrainTextureScale } from '../apps/web/src/games/startrail/terrain-material.ts';
import { powerTransfer } from '../apps/web/src/games/startrail/power-transfer.ts';
import { routeSignal } from '../apps/web/src/games/startrail/route-signal.ts';

const cell = (point: Point) => [Math.floor(point.x / tileSize), Math.floor(point.y / tileSize)] as const;
const label = (x: number, y: number) => `${x}:${y}`;
const at = (point: Point) => label(...cell(point));

test('the wider camera keeps the same screen aspect, map bounds and aim projection', () => {
  const origin = { x: 121, y: 276 };
  assert.deepEqual(cameraView(origin, 1), { ...origin, width: 480, height: 270 });
  const wide = cameraView(origin, 1.5);
  assert.deepEqual(wide, { ...origin, width: 720, height: 405 });
  assert.deepEqual(projectToWorld({ x: 480, y: 270 }, wide), { x: 841, y: 681 });
  const cursor = { x: 165, y: 178 };
  assert.deepEqual(projectToScreen(projectToWorld(cursor, wide), wide), cursor);
  assert.deepEqual(cameraView({ x: -120, y: Infinity }, 1.5), { x: 0, y: world.height - 405, width: 720, height: 405 });
});

test('hit feedback rises as health drops, flickers briefly and respects reduced motion', () => {
  const { duration, shake } = balance.hitFeedback;
  const high = playerHitFeedback(0, 0, .9, false);
  const low = playerHitFeedback(0, 0, .2, false);
  assert.ok(low.offset.x > high.offset.x && low.offset.x <= shake[1]);
  assert.ok(low.tint > high.tint);
  const dip = playerHitFeedback(duration / 4, 0, .2, false);
  const rebound = playerHitFeedback(duration / 2, 0, .2, false);
  assert.ok(dip.offset.x < 0 && rebound.offset.x > 0);
  assert.ok(rebound.tint > dip.tint && rebound.tint < low.tint);
  const still = playerHitFeedback(duration / 4, 0, .2, true);
  assert.equal(Math.hypot(still.offset.x, still.offset.y), 0);
  assert.ok(still.tint < low.tint && still.tint > dip.tint);
  const finished = playerHitFeedback(duration, 0, .2, false);
  assert.equal(Math.hypot(finished.offset.x, finished.offset.y), 0);
  assert.equal(finished.tint, 0);
});

test('the last magazine suppresses the empty-ammo warning while it is being loaded', () => {
  const gun = makeGun('eagle');
  gun.ammo = 0;
  gun.spare = 1;
  assert.equal(outOfAmmo(gun), false);
  assert.equal(startReload(gun, weapons.eagle, 0), true);
  assert.equal(gun.spare, 0);
  assert.equal(outOfAmmo(gun), false);
  finishReload(gun, weapons.eagle);
  assert.equal(outOfAmmo(gun), false);
  gun.ammo = 0;
  assert.equal(outOfAmmo(gun), true);
});

test('knife swings alternate within one second and reset after a break', () => {
  const first = knifeSwingDirection(undefined, 0);
  const second = knifeSwingDirection({ at: 0, direction: first }, .55);
  assert.equal(first, 1);
  assert.equal(second, -1);
  assert.equal(knifeSwingDirection({ at: .55, direction: second }, 1.2), 1);
  assert.equal(knifeSwingDirection({ at: 0, direction: first }, 1), -1);
  assert.equal(knifeSwingDirection({ at: 0, direction: first }, 1.001), 1);
  assert.ok(Math.abs(knife.recovery - .169) < 1e-8);
});

test('both explorers roll at seventy percent of their prior speed for the same travel distance', () => {
  for (const spec of [balance.roll, balance.cometDash]) {
    const ratio = (spec.range / spec.duration) / (spec.range / (.30 / .70));
    assert.ok(Math.abs(ratio - .70) < 1e-8);
  }
  assert.equal(balance.roll.range, 74);
  assert.equal(balance.cometDash.range, 86);
});

function explore(from: Point, blocked: (x: number, y: number) => boolean, terrain: readonly (readonly boolean[])[] = floor) {
  const queue = [cell(from)];
  const seen = new Set([at(from)]);
  for (const [x, y] of queue) {
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (!terrain[ny]?.[nx] || seen.has(label(nx, ny)) || blocked(nx, ny)) continue;
      seen.add(label(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

test('the observatory is about thirty percent larger and both routes reach the shelter', () => {
  const stage = observatoryStage;
  const area = (map: { width: number; height: number }) => map.width * map.height;
  const open = (terrain: readonly (readonly boolean[])[]) => terrain.flat().filter(Boolean).length;
  assert.ok(Math.abs(area(stage.world) / area(outpostStage.world) - 1.3) < .01);
  assert.ok(Math.abs(open(stage.floor) / open(outpostStage.floor) - 1.3) < .05);
  const gateClosed = (x: number, y: number) => x === Math.floor(stage.gate.x / tileSize) && y >= 9 && y <= 10;
  const west = explore(stage.landing, (x, y) => gateClosed(x, y) || x === 14 && y >= 24, stage.floor);
  const south = explore(stage.landing, (x, y) => gateClosed(x, y) || y === 17 && x >= 9 && x <= 12, stage.floor);
  for (const route of [west, south]) {
    assert.ok(route.has(at(stage.shelter)) && route.has(at(stage.relayAccess)));
    assert.ok(!route.has(at(stage.lift)));
  }
  assert.ok(explore(stage.shelter, () => false, stage.floor).has(at(stage.lift)));
  assert.equal(new Set(stage.floor.flatMap((row, y) => row.flatMap((walkable, x) => [walkable ? stage.material(x, y).cell : stage.outsideMaterial(x, y).cell]))).size, 8);
  for (const anchor of [stage.landing, stage.shelter, stage.relayAccess, stage.lift, ...stage.caches, ...stage.patrols]) {
    assert.ok(stage.walkable(anchor), JSON.stringify(anchor));
  }
});

test('each landing area can supply reachable reinforcements concealed from the player', () => {
  for (const stage of [outpostStage, observatoryStage, auroraStage, debrisStage]) {
    const flow = new EnemyFlow(stage);
    const walls = [...stage.obstacles, stage.gate];
    const blockers = [...walls];
    for (const [kind, points] of [['crate', stage.crates], ['crystal', stage.crystals]] as const) {
      const { width, height } = balance.props[kind];
      blockers.push(...points.map(point => ({ x: point.x - width / 2, y: point.y - height / 2, width, height })));
    }
    const camera = cameraView({ x: stage.landing.x - 240, y: stage.landing.y - 135 }, 1, stage.world);
    flow.update(stage.landing, true, walls);
    assert.equal(flow.spawnPoint(stage.landing, 0, Infinity, point => at(point) === at(stage.lift), () => 0), undefined);
    const valid = (point: Point) => blockers.every(box => blockerClearance(point, box) > 11) &&
      concealed(point, camera, stage.landing, blockers, () => false);
    const point = flow.spawnPoint(stage.landing, encounterRange.safe, encounterRange.approach, valid, () => 0);
    assert.ok(point, stage.id);
    assert.ok(stage.walkable(point) && valid(point));
    assert.ok(distance(stage.landing, point) >= encounterRange.safe);
    assert.ok(distance(stage.landing, point) <= encounterRange.approach);
  }
});

test('party pressure keeps the two-explorer baseline and reduces solo waves and patrols', () => {
  for (const stage of [outpostStage, observatoryStage, auroraStage, debrisStage]) {
    const solo = partyEncounter(stage.id, 1), pair = partyEncounter(stage.id, 2);
    const base = encounters[stage.id];
    assert.deepEqual(pair, { ...base, enemies: 1 });
    assert.ok(solo.cap < pair.cap && solo.packSize < pair.packSize);
    assert.ok(solo.interval > pair.interval && solo.alertInterval > pair.alertInterval);
    assert.equal(scaledPatrols(stage.patrols, solo.enemies).length, Math.round(stage.patrols.length * solo.enemies));
    assert.equal(scaledPatrols(stage.patrols, pair.enemies), stage.patrols);
    const accompanied = partyEncounter(stage.id, 1 + companionCombatWeight);
    assert.ok(accompanied.enemies > solo.enemies && accompanied.enemies < pair.enemies);
  }
});

test('patrol activation and waves wait for everyone, including after a return to the landing area', () => {
  const director = new EncounterDirector();
  const table = partyEncounter('1-1', 1);
  const outside = { x: landing.x + arrivalRadius + 1, y: landing.y };
  assert.equal(partyOutsideArrival(landing, [outside, landing]), false);
  assert.equal(partyOutsideArrival(landing, [outside, outside]), true);
  const spawned: string[] = [];
  const spawn = (kind: string) => { spawned.push(kind); return true; };
  assert.equal(director.updateArrival(60, false, table.firstAt), false);
  director.queue(60, ['mite']);
  director.spawnWave(120, 0, table, false, spawn);
  assert.deepEqual(spawned, []);
  assert.equal(director.updateArrival(120, true, table.firstAt), true);
  director.spawnWave(120, 0, table, false, spawn);
  assert.equal(spawned.length, 0);
  director.spawnWave(120 + table.firstAt, 0, table, false, spawn);
  assert.equal(spawned[0], 'mite');
  assert.equal(spawned.length, table.packSize);
  director.updateArrival(122, false, table.firstAt);
  director.spawnWave(130, 0, table, false, spawn);
  assert.equal(spawned.length, table.packSize);
  assert.equal(director.updateArrival(130, true, table.firstAt), false);
});

test('escort cancels queued heavy enemies and applies its own capacity and cadence', () => {
  const director = new EncounterDirector();
  const normal = partyEncounter('1-2', 1), escort = partyEncounter('1-2', 1, true);
  assert.ok(escort.cap < normal.cap && escort.interval > normal.interval);
  director.updateArrival(0, true, normal.firstAt);
  director.queue(1, ['sentinel']);
  director.beginEscort(1, escort.firstAt);
  const spawned: string[] = [];
  const spawn = (kind: string) => { spawned.push(kind); return true; };
  director.spawnWave(2, 0, escort, true, spawn);
  assert.equal(spawned.length, 0);
  director.spawnWave(4, escort.cap, escort, true, spawn);
  assert.equal(spawned.length, 0);
  director.spawnWave(4 + escort.alertInterval, escort.cap - 1, escort, true, spawn);
  assert.deepEqual(spawned, ['starTick']);
});

test('scene swaps once at full opacity and overlay fades keep the outgoing view until hidden', () => {
  const fade = new SceneFade();
  fade.advance(240, false);
  let swapped = 0;
  assert.equal(fade.opacity, 0);
  assert.equal(fade.switchTo(() => swapped++), true);
  fade.advance(120, false);
  assert.equal(fade.opacity, .5);
  assert.equal(swapped, 0);
  assert.equal(fade.switchTo(() => { throw new Error('duplicate swap'); }), false);
  fade.advance(120, false);
  assert.equal(swapped, 1);
  assert.equal(fade.opacity, 1);
  fade.advance(240, false);
  assert.equal(fade.active, false);
  const layer = new LayerFade<'panel' | 'overlay'>();
  layer.advance('panel', 150, false);
  layer.advance('overlay', 75, false);
  assert.deepEqual(layer.layer, { content: 'panel', opacity: .5 });
  layer.advance('overlay', 75, false);
  assert.equal(layer.layer, undefined);
  layer.advance('overlay', 75, false);
  assert.deepEqual(layer.layer, { content: 'overlay', opacity: .5 });
});

test('the balance simulation clears the escort and shows sustained combat across the later stages', () => {
  const run = simulateExpedition(observatoryStage, pilots.deliberate, 2, 4);
  assert.deepEqual(run, simulateExpedition(observatoryStage, pilots.deliberate, 2, 4));
  assert.ok(run.cleared && run.escortKills > 0 && run.escortDamage < 30);
  for (const stage of simulationStages) {
    const skilled = simulateExpedition(stage, pilots.practiced, 1, 4);
    assert.ok(skilled.cleared && skilled.kills > 20, stage.id);
  }
});

test('both aurora routes reach the transmitter while the launch gate protects the shuttle', () => {
  const stage = auroraStage;
  assert.equal(nextStage['1-2'], stage);
  assert.equal(nextStage['1-3'], debrisStage);
  const gateClosed = (x: number, y: number) => x === Math.floor(stage.gate.x / tileSize) && y >= 15 && y <= 17;
  const northRoute = explore(stage.landing, (x, y) => gateClosed(x, y) || x === 16 && y >= 23, stage.floor);
  const southRoute = explore(stage.landing, (x, y) => gateClosed(x, y) || y === 18 && x >= 9 && x <= 13, stage.floor);
  assert.ok(northRoute.has(at(stage.stations[0])) && northRoute.has(at(stage.relayAccess)));
  assert.ok(southRoute.has(at(stage.stations[1])) && southRoute.has(at(stage.relayAccess)));
  assert.ok(!northRoute.has(at(stage.lift)) && !southRoute.has(at(stage.lift)));
  assert.ok(explore(stage.relayAccess, () => false, stage.floor).has(at(stage.lift)));
  for (const point of [...stage.stations, stage.relayAccess, stage.lift, ...stage.patrols, ...stage.caches, ...stage.weaponPickups]) {
    assert.ok(stage.walkable(point), JSON.stringify(point));
  }
});

test('the debris ring extends the main route and gives each objective two approaches', () => {
  const stage = debrisStage;
  assert.equal(nextStage['1-4'], undefined);
  assert.ok(Math.abs(stage.world.width / auroraStage.world.width - 1.3) < .01);
  assert.ok(Math.abs((stage.lift.x - stage.landing.x) / (auroraStage.lift.x - auroraStage.landing.x) - 1.3) < .01);
  const gateClosed = (x: number, y: number) => x === Math.floor(stage.gate.x / tileSize) && y >= 16 && y <= 18;
  const blockEntry = [(x: number, y: number) => y === 13 && x >= 14 && x <= 17,
    (x: number, y: number) => y === 21 && x >= 21 && x <= 26, (x: number, y: number) => y === 12 && x >= 34 && x <= 37];
  for (const [i, point] of stage.stations.entries()) {
    const reached = explore(stage.landing, (x, y) => gateClosed(x, y) || blockEntry[i](x, y), stage.floor);
    assert.ok(reached.has(at(point)) && reached.has(at(stage.relayAccess)) && !reached.has(at(stage.lift)), point.name);
    assert.ok(stage.walkable(point));
  }
  assert.ok(explore(stage.relayAccess, () => false, stage.floor).has(at(stage.lift)));
  const [greenhouse, salvage, scan] = stage.stations;
  assert.equal(requiredStationsRemaining(stage.stations, new Set([scan])), 2);
  assert.equal(requiredStationsRemaining(stage.stations, new Set([greenhouse, scan])), 1);
  assert.equal(requiredStationsRemaining(stage.stations, new Set([greenhouse, salvage])), 0);
  assert.ok(stage.scenery.every(item => stage.walkable(item) && stage.obstacles.includes(item.bounds)));
  for (const { polygon } of stage.obstacles) {
    if (!polygon) continue;
    const points = polygon.vertices;
    const turns = points.map((a, i) => {
      const b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    });
    assert.ok(Number.isFinite(polygon.center.x) && turns.every(turn => turn < 1e-6), 'wall should be a convex Matter body');
  }
});

test('the debris ring halves the chance that two floor cells show the same base tile', () => {
  const duplicationRate = (stage: typeof auroraStage | typeof debrisStage) => {
    const counts = new Map<number, number>();
    let total = 0;
    for (const [y, row] of stage.floor.entries()) for (const [x, open] of row.entries()) {
      if (!open) continue;
      const { cell } = stage.material(x, y);
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
      total++;
    }
    return [...counts.values()].reduce((sum, count) => sum + count * (count - 1), 0) / (total * (total - 1));
  };
  assert.ok(duplicationRate(debrisStage) <= duplicationRate(auroraStage) * .5);
});

test('tile seams blend both directions without changing the tile centers or erasing their alpha', () => {
  const size = tileSize * terrainTextureScale, width = size * 2, height = size * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  const index = (x: number, y: number) => (y * width + x) * 4;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = index(x, y);
    data[i] = x < size ? 35 : 215;
    data[i + 1] = y < size ? 50 : 180;
    data[i + 3] = 255;
  }
  blendTileBoundaries({ data, width, height } as ImageData, [[true, true], [true, true]], true);
  assert.ok(Math.abs(data[index(size - 1, 20)] - data[index(size, 20)]) <= 2);
  assert.ok(Math.abs(data[index(20, size - 1) + 1] - data[index(20, size) + 1]) <= 2);
  assert.deepEqual(Array.from(data.slice(index(20, 20), index(20, 20) + 4)), [35, 50, 0, 255]);
});

test('aurora signal waits for playback and repeats the full pattern after a wrong input', () => {
  const panel = routeSignal(10);
  const press = (x: number, time: number) => panel.pointerDown(1, { x, y: 139 }, time);
  assert.equal(press(240, 11), undefined);
  assert.equal(press(240, 14), 'placed');
  assert.equal(press(368, 14.1), 'miss');
  assert.equal(press(240, 16), undefined);
  assert.equal(press(240, 18), 'placed');
  assert.equal(press(112, 18.2), 'placed');
  assert.equal(press(368, 18.4), 'placed');
  assert.equal(press(240, 18.6), 'solved');
  assert.equal(panel.solved, true);
});

test('reinforcements avoid open lines and illuminated cells in the view and can pursue around a wall', () => {
  const start = { x: 24, y: 24 }, corner = { x: 24, y: 72 }, player = { x: 120, y: 72 };
  const obstacle = { x: 48, y: 0, width: 48, height: 48 };
  const camera = { x: 0, y: 0, width: 144, height: 96 };
  const flow = new EnemyFlow({ floor: [[true, false, true], [true, true, true]], obstacles: [obstacle],
    gate: { x: 95, y: 48, width: 2, height: 48 }, walkable: () => true });
  assert.equal(concealed(corner, camera, player, [obstacle], () => false), false);
  assert.equal(concealed(start, camera, player, [obstacle], () => false), true);
  assert.equal(concealed(start, camera, player, [obstacle], () => true), false);
  assert.equal(concealed({ x: 200, y: 72 }, camera, player, [], () => false), true);
  assert.equal(openPath(start, player, [obstacle]), false);
  flow.update(player, false, [obstacle]);
  assert.deepEqual(flow.waypoint(start, [obstacle], 9), corner);
  flow.update(player, true, [obstacle, { x: 95, y: 48, width: 2, height: 48 }]);
  assert.equal(flow.waypoint(start, [obstacle], 9), undefined);
});

test('the observatory panel connects the emergency lift in sequence', () => {
  const panel = powerTransfer();
  const switchAt = (x: number) => panel.pointerDown(1, { x, y: 142 }, 0);
  assert.equal(switchAt(368), 'miss');
  assert.equal(switchAt(112), 'placed');
  assert.equal(switchAt(368), 'miss');
  assert.equal(switchAt(240), 'placed');
  assert.equal(switchAt(368), 'solved');
  assert.equal(panel.solved, true);
});

test('the outpost triples the map area and has two approaches to the generator', () => {
  assert.equal(world.width * world.height, 3 * 24 * 14 * tileSize ** 2);
  assert.ok(explore(landing, (x, y) => x >= 8 && x <= 9 && y >= 15 && y < 22).has(at(relayAccess)));
  assert.ok(explore(landing, (x, y) => x >= 14 && x <= 15 && y >= 18 && y <= 20).has(at(relayAccess)));
  for (const cache of caches) assert.ok(explore(landing, () => false).has(at(cache)));
  for (const pickup of weaponPickups) assert.ok(explore(landing, () => false).has(at(pickup)));
});

test('a grid puzzle starts half full and only correctly matched pieces can complete it', () => {
  const puzzle = createGridPuzzle(4, () => .31);
  assert.equal(puzzle.progress, 8);
  assert.equal(new Set(puzzle.rack).size, 8);
  for (const piece of puzzle.rack) {
    assert.equal(puzzle.place(piece, (piece + 1) % 16), false);
    assert.equal(puzzle.place(piece, piece), true);
    assert.equal(puzzle.place(piece, piece), false);
  }
  assert.equal(puzzle.solved, true);
  assert.equal(createGridPuzzle(5).progress, 12);
});

test('partial reload replaces the whole magazine and resupply restores loaded and reserve stock', () => {
  for (const weapon of ['pulse', 'eagle', 'ak', 'shotgun'] as const) {
    const stats = weapons[weapon], gun = makeGun(weapon);
    assert.equal(gun.spare + 1, stats.magazines);
    gun.ammo = 2;
    assert.equal(startReload(gun, stats, 1), true);
    assert.equal(gun.ammo, 0);
    assert.equal(gun.spare, stats.magazines - 2);
    assert.equal(startReload(gun, stats, 1.1), false);
    finishReload(gun, stats);
    assert.equal(gun.ammo, stats.capacity);
    gun.ammo = 0; gun.spare = 0;
    assert.equal(startReload(gun, stats, 2), false);
    refillMagazine(gun, stats);
    assert.equal(gun.spare + 1, stats.magazines);
  }
  assert.equal(weapons.eagle.magazines, 6);
  assert.equal(weapons.pulse.magazines, 6);
});

test('support equipment limits deployments and blocks shots through walls', () => {
  const gear = new SupportGear();
  const target = { x: landing.x + 80, y: landing.y };
  assert.equal(gear.use(landing, target, 0, [], 0), true);
  const turret = gear.turret!;
  assert.equal(gear.use(landing, target, 0, [], 0), false);
  const wall = { x: turret.x + 15, y: turret.y - 15, width: 10, height: 30 };
  let shots = 0;
  const fire = () => { shots++; };
  gear.update(1, .1, landing, [target], [wall], fire);
  assert.equal(shots, 0);
  gear.update(1.5, .1, landing, [target], [], fire);
  assert.equal(shots, 1);
  assert.equal(turret.x, landing.x + 28);
  assert.equal(gear.turretAmmo.ammo, supportSpecs.turret.capacity - 1);
  assert.equal(supportSpecs.turret.deploy, 3);
  assert.equal(supportSpecs.turret.pickup, 1);
});

test('both devices spend their charge on active time and damage, recall and recharge', () => {
  for (const kind of ['turret', 'drone'] as const) {
    const gear = new SupportGear();
    const spec = supportSpecs[kind];
    let recalls = 0;
    gear.selected = kind;
    assert.equal(gear.use(landing, landing, 0, [], 0), true);
    const device = gear[kind]!;
    assert.equal('hp' in device, false);
    gear.update(1, 1, landing, [], [], () => {});
    assert.equal(gear.hit(device, 1, 10), 'hit');
    assert.equal(gear.hit(device, 1.1, 10), undefined);
    const remaining = spec.duration - 1 - 10 * spec.secondsPerDamage;
    assert.equal(gear.chargeRatio(kind), remaining / spec.duration);
    gear.update(1 + remaining, remaining, landing, [], [], () => {}, undefined, unit => { assert.equal(unit, device); recalls++; });
    assert.equal(recalls, 1);
    assert.equal(gear[kind], undefined);
    assert.equal(gear.chargeRatio(kind), 0);
    assert.equal(gear.use(landing, landing, 0, [], 1 + remaining), false);
    gear.update(2 + remaining, 1, landing, [], [], () => {});
    assert.ok(Math.abs(gear.chargeRatio(kind) - 1 / spec.recharge) < 1e-8);
    assert.equal(gear.use(landing, landing, 0, [], 2 + remaining), true);
    assert.equal(gear.hit(gear[kind]!, 2 + remaining, 10), 'recalled');
    assert.equal(gear[kind], undefined);
    assert.equal(gear.chargeRatio(kind), 0);
    gear.update(2 + remaining + spec.recharge, spec.recharge, landing, [], [], () => {});
    assert.equal(gear.chargeRatio(kind), 1);
  }
});

test('an emplaced turret uses the marked deployment site and only scans and acquires after startup', () => {
  const gear = new SupportGear();
  const { point, valid } = turretSite(landing, 0, []);
  assert.equal(valid, true);
  const wall = { x: point.x - 7, y: point.y - 7, width: 15, height: 15 };
  assert.equal(turretSite(landing, 0, [wall], point).valid, false);
  assert.equal(gear.use(landing, point, 0, [], 10, point), true);
  assert.deepEqual({ x: gear.turret?.x, y: gear.turret?.y }, point);
  let detections = 0;
  const detect = () => { detections++; }, noShot = () => {};
  const target = { x: point.x + 60, y: point.y + 15, active: true };
  gear.update(10.2, .1, landing, [target], [], noShot, detect);
  assert.equal(detections, 0);
  gear.update(10.6, .1, landing, [], [], noShot, detect);
  assert.ok(gear.turret!.heading > 0);
  gear.update(10.7, .1, landing, [target], [], noShot, detect);
  gear.update(10.8, .1, landing, [target], [], noShot, detect);
  assert.equal(detections, 1);
  assert.deepEqual(gear.turret?.alert?.target, { x: target.x, y: target.y });
  assert.equal(gear.turret?.alert?.until, 10.7 + targetAlertSeconds);
  gear.selected = 'drone';
  assert.equal(gear.use(landing, landing, 0, [], 11), true);
  gear.update(11.6, .1, landing, [target], [], noShot, detect);
  assert.deepEqual(gear.drone?.alert?.target, { x: target.x, y: target.y });
  assert.equal(detections, 2);
  const last = { x: target.x, y: target.y };
  target.active = false;
  target.x = NaN;
  gear.update(11.7, .1, landing, [target], [], noShot, detect);
  assert.equal(gear.turret?.acquired, undefined);
  assert.equal(gear.drone?.acquired, undefined);
  assert.deepEqual(gear.drone?.alert?.target, last);
});

test('aim dispersion widens for lower accuracy and projected muzzles share the projectile origin', () => {
  const baseline = .21;
  assert.equal(dispersedHeading(baseline, 1, () => .99), baseline);
  const left = dispersedHeading(baseline, weapons.ak.accuracy, () => 0);
  const right = dispersedHeading(baseline, weapons.ak.accuracy, () => 1);
  assert.ok(left < baseline && right > baseline);
  assert.ok(Math.abs(right - baseline - (baseline - left)) < 1e-9);
  assert.ok(dispersedHeading(baseline, weapons.pulse.accuracy, () => 1) < right);
  assert.equal(weapons.pulse.range, 540);
  for (const weapon of ['pulse', 'eagle', 'scout', 'ak', 'shotgun', 'medical'] as const) {
    const side = heldPose(landing, 0, weapon, Infinity);
    const idle = heldPose(landing, Math.PI / 2, weapon, Infinity);
    const away = heldPose(landing, -Math.PI / 2, weapon, Infinity);
    const fired = heldPose(landing, Math.PI / 2, weapon, 0);
    const tip = (pose: typeof side) => projectBarrelPoint(pose, pose.center + gunArt[weapon].size * gunArt[weapon].tip, 1);
    assert.ok(tip(idle).x > tip(side).x && tip(side).x > tip(away).x);
    assert.ok(tip(idle).y > tip(side).y && tip(side).y > tip(away).y);
    assert.equal(projectBarrelPoint(idle, 0, 1).y, 1);
    assert.equal(fired.muzzle.x, fired.ground.x);
    assert.ok(Math.abs(fired.ground.y - fired.lift - fired.muzzle.y) < 1e-8);
    if (weapon !== 'medical') assert.ok(distance(idle.mount, fired.mount) > 0);
  }
  const turretTip = (yaw: number) => {
    const pose = supportPose(landing, yaw, 'turret', 1, -Infinity);
    return projectBarrelPoint(pose, turretArt.muzzleReach, 1);
  };
  assert.ok(turretTip(Math.PI / 2).y > turretTip(0).y && turretTip(0).y > turretTip(-Math.PI / 2).y);
});

test('the turret receiver stays on the base socket through rotation and recoil', () => {
  const base = turretBaseCenter(landing);
  const socket = { x: base.x, y: base.y + (turretArt.baseSocket.y - .5) * turretArt.baseSize };
  for (let i = 0; i < 32; i++) {
    const heading = i * Math.PI / 16;
    const idle = supportPose(landing, heading, 'turret', 1, -Infinity);
    const shot = supportPose(landing, heading, 'turret', 1, 1);
    assert.deepEqual(idle.mount, socket);
    assert.deepEqual(shot.mount, socket);
    assert.deepEqual(projectBarrelPoint(shot, shot.center + (turretArt.barrelSocket.x - .5) * turretArt.barrelSize, 0), { x: 0, y: 0 });
    assert.ok(distance(shot.muzzle, socket) < distance(idle.muzzle, socket));
  }
});

test('a flare consumes one unit, lights from landing for three minutes, and supplies restore its bundle', () => {
  const gear = new SupportGear();
  gear.selected = 'flare';
  const to = { x: landing.x + 60, y: landing.y };
  assert.equal(gear.use(landing, to, 0, [], 0), true);
  assert.equal(gear.stock, 11);
  assert.equal(gear.litFlares(0).length, 0);
  const flare = gear.flares[0];
  assert.deepEqual(gear.litFlares(flare.litAt), [to]);
  const flying = flarePoseAt(flare, flare.litAt / 2);
  assert.equal(flying.airborne, true);
  assert.equal(flying.lift, 28);
  assert.equal(flying.base.x, landing.x + 30);
  flare.ground = { x: to.x + 16, y: to.y - 6, rotation: 1.2 };
  assert.deepEqual(gear.litFlares(flare.litAt), [flare.ground]);
  assert.equal(flareFalloff(0), 1);
  assert.ok(flareFalloff(supportSpecs.flare.radius / 2) < .17);
  assert.equal(flareFalloff(supportSpecs.flare.radius), 0);
  const expire = flare.litAt + 180;
  gear.update(expire - .01, 0, landing, [], [], () => {});
  assert.equal(gear.litFlares(expire - .01).length, 1);
  gear.update(expire, 0, landing, [], [], () => {});
  assert.equal(gear.litFlares(expire).length, 0);
  gear.refill();
  assert.equal(gear.stock, 12);
});

test('curved terrain shares the same boundaries for walkability, ray casts and map wall faces', () => {
  assert.ok(mapWallEdges.length > 100);
  assert.ok(terrainOutlines.some(outline => outline.length > 100));
  assert.ok(mapWallEdges.some(({ from, to }) => from.x !== to.x && from.y !== to.y));
  assert.ok(cliffs.some(({ polygon }) => {
    const [from, to] = polygon!.vertices;
    return Math.min(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) >= tileSize;
  }));
  for (const { from, to, face } of mapWallEdges) {
    const inside = { x: from.x + to.x - face.x, y: from.y + to.y - face.y };
    assert.ok(!walkable(face));
    assert.ok(walkable(inside));
    assert.ok(distance(from, to) <= tileSize / 4 + 1e-8);
    assert.ok(Math.abs(rayDistance(inside, (face.x - inside.x) / 8, (face.y - inside.y) / 8, 8, cliffs) - 4) < 1e-7);
  }
  for (const cliff of cliffs) {
    const { center, vertices, planes } = cliff.polygon!;
    assert.ok(vertices.every(p => planes.every(n => n.x * p.x + n.y * p.y <= n.limit + 1e-8)));
    assert.equal(blockerClearance(center, cliff), 0);
  }
  assert.ok([landing, relayAccess, lift, ...weaponPickups, ...caches, ...patrols].every(walkable));
});

test('the player headlamp reaches farther in a narrower, gentler beam', () => {
  const origin = { x: 0, y: 0 };
  assert.equal(flashlightLevel(origin, 0, origin), .7);
  assert.ok(flashlightLevel(origin, 0, { x: 250, y: 0 }) > 0);
  assert.equal(flashlightLevel(origin, 0, { x: 268, y: 0 }), 0);
  assert.equal(flashlightLevel(origin, 0, { x: 100, y: 100 * Math.tan(.75) }), 0);
});

test('sprite shadows respond to light position, height, cone and wall occlusion', () => {
  const caster = { x: 210, y: 115 };
  const left = { origin: { x: 144, y: 115 }, range: 200, amount: 1, elevation: 24, color: '255,240,201' };
  const right = { ...left, origin: { x: 276, y: 115 } };
  const [, east] = shadowProjections(caster, [left], []);
  const [, west] = shadowProjections(caster, [right], []);
  const [, high] = shadowProjections(caster, [{ ...left, elevation: 80 }], []);
  assert.equal(east.direction.x, 1);
  assert.equal(west.direction.x, -1);
  assert.ok(east.stretch > high.stretch);
  const wall = { x: 178, y: 90, width: 12, height: 60 };
  const cone = { ...left, heading: Math.PI, halfAngle: .55 };
  assert.deepEqual(shadowProjections(caster, [left], [wall]), shadowProjections(caster, [], []));
  assert.deepEqual(shadowProjections(caster, [cone], []), shadowProjections(caster, [], []));
  assert.equal(shadowProjections(caster, [left, right], []).length, 3);
});

test('shadow casts keep the light-facing sprite edge fixed and extend only away from the light', () => {
  const center = { x: 150, y: 110 }, size = { x: 40, y: 54 }, bounds = [.1, .2, .91, .82] as const;
  const slope = { direction: { x: 0, y: 1 }, stretch: .8, opacity: 1, softness: 1 };
  const anchor = { x: .42, y: .785 };
  const basis = shadowBasis(center, size, bounds, anchor, {});
  const base = shadowFootprint(basis, { ...slope, stretch: 0 });
  const south = shadowFootprint(basis, slope);
  const north = shadowFootprint(basis, { ...slope, direction: { x: 0, y: -1 } });
  const atY = (quad: typeof base, v: number) => quad.origin.y + quad.vertical.y * v;
  const spriteY = (v: number) => center.y + size.y * (v - .5);
  assert.ok(Math.abs(atY(base, anchor.y) - (center.y + size.y * (anchor.y - .5))) < 1e-8);
  assert.ok(Math.abs(atY(south, bounds[1]) - spriteY(bounds[1])) < 1e-8);
  assert.ok(Math.abs(atY(north, bounds[3]) - spriteY(bounds[3])) < 1e-8);
  assert.ok(atY(south, bounds[3]) > spriteY(bounds[3]));
  assert.ok(atY(north, bounds[1]) < spriteY(bounds[1]));
  const silhouette = [{ x: .44, y: .2 }, { x: .91, y: .54 }, { x: .31, y: .82 }, { x: .1, y: .53 }];
  for (let i = 0; i < 360; i += 15) {
    const rad = i * Math.PI / 180;
    const projection = { ...slope, direction: { x: Math.cos(rad), y: Math.sin(rad) } };
    for (const flip of [false, true]) {
      const pose = shadowBasis(center, size, bounds, anchor,
        { scaleX: flip ? -1 : 1, scaleY: .74, scaleInScreenAxes: true, angle: .45 }, silhouette);
      const { horizontal: h, vertical: v, origin } = shadowFootprint(pose, projection);
      assert.equal(Math.sign(h.x * v.y - h.y * v.x), flip ? -1 : 1);
      const axis = projection.direction;
      const displacement = silhouette.map(point => {
        const spriteX = center.x + pose.h.x * (point.x - .5) + pose.v.x * (point.y - .5);
        const spriteY = center.y + pose.h.y * (point.x - .5) + pose.v.y * (point.y - .5);
        const dx = origin.x + h.x * point.x + v.x * point.y - spriteX;
        const dy = origin.y + h.y * point.x + v.y * point.y - spriteY;
        assert.ok(Math.abs(dx * axis.y - dy * axis.x) < 1e-8);
        return dx * axis.x + dy * axis.y;
      });
      assert.ok(Math.abs(Math.min(...displacement)) < 1e-8);
      assert.ok(Math.max(...displacement) > 10);
    }
  }
  const flat = shadowBasis(center, size, bounds, { x: .5, y: .5 }, { flat: true });
  const hovering = shadowBasis(center, size, bounds, { x: .5, y: .5 }, { flat: true, elevation: 16 });
  assert.deepEqual(flat.point, center);
  assert.deepEqual(hovering.point, { x: center.x, y: center.y + 16 });
});

test('turret shadow sockets stay joined through a full turn, recoil and both mirrored poses', () => {
  const position = { x: 100, y: 120 };
  const size = { x: 34, y: 34 };
  const { baseSocket, barrelSocket } = turretArt;
  const baseBasis = shadowBasis(turretBaseCenter(position), size, [.09, .14, .96, .86], { x: .44, y: .8 },
    { groundRatio: fixtureGroundRatio.turretBase }, undefined, [.34, .53]);
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
  const at = ({ origin, horizontal, vertical }: ReturnType<typeof shadowFootprint>, uv: Point): Point => ({
    x: origin.x + horizontal.x * uv.x + vertical.x * uv.y, y: origin.y + horizontal.y * uv.x + vertical.y * uv.y,
  });
  for (const type of ['basic', 'rotated'] as const) {
    for (let angle = 0; angle < 360; angle++) {
      const heading = angle * Math.PI / 180;
      const cast = { direction: { x: Math.cos(heading), y: Math.sin(heading) }, stretch: .64, softness: 1, opacity: 1 };
      const base = shadowFootprint(baseBasis, cast, type);
      const reflectedSocket = base.crossfade ? {
        x: 2 * base.crossfade.anchorX - baseSocket.x,
        y: baseSocket.y + base.crossfade.shear * (base.crossfade.anchorX - baseSocket.x),
      } : baseSocket;
      for (const firedAt of [0, -Infinity]) {
        const pose = supportPose(position, heading * 3, 'turret', 0, firedAt);
        const barrelBasis = shadowBasis(pose.mount, size, [.08, .23, .95, .71], barrelSocket,
          { flat: true, angle: pose.angle, scaleX: pose.scale, scaleY: .5 });
        const barrel = shadowFootprint(barrelBasis, cast);
        const placement = joinShadowFootprints(base, baseSocket, barrel, barrelSocket);
        const { origin, reflectedOrigin: mirrored, horizontal, vertical, bounds } = placement;
        const pivotOffset = { x: horizontal.x * barrelSocket.x + vertical.x * barrelSocket.y,
          y: horizontal.y * barrelSocket.x + vertical.y * barrelSocket.y };
        assert.ok(near(at(base, { x: origin.x + pivotOffset.x, y: origin.y + pivotOffset.y }), at(base, baseSocket)));
        assert.ok(near(at(base, { x: mirrored.x + pivotOffset.x, y: mirrored.y + pivotOffset.y }), at(base, reflectedSocket)));
        const start = at(base, origin);
        const tip = at(base, { x: origin.x + horizontal.x, y: origin.y + horizontal.y });
        assert.ok(near({ x: tip.x - start.x, y: tip.y - start.y }, barrel.horizontal));
        for (const partOrigin of [origin, mirrored]) {
          for (const corner of [partOrigin, { x: partOrigin.x + horizontal.x, y: partOrigin.y + horizontal.y },
            { x: partOrigin.x + vertical.x, y: partOrigin.y + vertical.y },
            { x: partOrigin.x + horizontal.x + vertical.x, y: partOrigin.y + horizontal.y + vertical.y }]) {
            assert.ok(corner.x >= bounds[0] - 1e-8 && corner.x <= bounds[0] + bounds[2] + 1e-8);
            assert.ok(corner.y >= bounds[1] - 1e-8 && corner.y <= bounds[1] + bounds[3] + 1e-8);
          }
        }
      }
    }
  }
});

test('rotated shadows with the default ratio hold one sixth width and lift their bottom edge linearly', () => {
  const anchor = { x: .46, y: .76 };
  const groundSpan = [.25, .65] as const;
  const size = { x: 44, y: 60 };
  const bounds = [.15, .18, .9, .8] as const;
  const contact = { direction: { x: 0, y: 1 }, stretch: 0, opacity: 1, softness: 1 };
  const center = { x: 100, y: 120 };
  const minimumWidthRatio = 1 / 6;
  const thresholdAngle = Math.asin(minimumWidthRatio);
  const fadeAngle = 10 * Math.PI / 180;
  const maxRise = (bounds[2] - bounds[0]) * size.x * minimumWidthRatio;
  const angles = [...Array.from({ length: 360 }, (_, degree) => degree * Math.PI / 180),
    -thresholdAngle, -thresholdAngle / 2, thresholdAngle / 4, thresholdAngle / 2,
    thresholdAngle * 3 / 4, thresholdAngle, Math.PI - thresholdAngle / 2, Math.PI + thresholdAngle / 2];
  for (const flip of [1, -1]) {
    const basis = shadowBasis(center, size, bounds, anchor, { scaleX: flip, scaleY: .78 }, undefined, groundSpan);
    assert.deepEqual(shadowFootprint(basis, contact, 'rotated'), shadowFootprint(basis, contact, 'basic'));
    const cast = (angle: number) => shadowFootprint(basis,
      { ...contact, direction: { x: Math.cos(angle), y: Math.sin(angle) }, stretch: .65 }, 'rotated');
    for (const angle of angles) {
      const { origin, horizontal: h, vertical: v, crossfade } = cast(angle);
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const width = Math.abs(h.x * direction.y - h.y * direction.x);
      const expectedWidth = size.x * Math.max(minimumWidthRatio, Math.abs(direction.y));
      assert.ok(Math.abs(width - expectedWidth) < 1e-8);
      assert.ok(Math.abs(v.x * direction.y - v.y * direction.x) < 1e-8);
      assert.ok(v.x * direction.x + v.y * direction.y < 0);
      assert.ok(Math.hypot(v.x, v.y) > Math.hypot(basis.v.x, basis.v.y));
      assert.equal(Math.sign(h.x * v.y - h.y * v.x), crossfade || direction.y < 0 ? flip : -flip);
      const bottom = groundSpan.map(x => ({
        x: origin.x + h.x * x + v.x * bounds[3],
        y: origin.y + h.y * x + v.y * bounds[3],
      }));
      const riseRatio = Math.max(0, Math.min(1, .5 + Math.asin(direction.y) / (2 * thresholdAngle)));
      const expectedY = basis.groundPoint.y - maxRise * riseRatio;
      assert.ok(Math.abs((bottom[0].x + bottom[1].x) / 2 - basis.groundPoint.x) < 1e-8);
      assert.ok(Math.abs((bottom[0].y + bottom[1].y) / 2 - expectedY) < 1e-8);
      if (!crossfade && Math.abs(direction.y) >= minimumWidthRatio) {
        const expectedX = groundSpan.map(x => center.x + size.x * flip * (x - .5));
        const actualX = bottom.map(p => p.x);
        assert.ok(bottom.every(p => Math.abs(p.y - expectedY) < 1e-8));
        assert.ok(actualX.every((x, i) => Math.abs(x - expectedX[i]) < 1e-8));
      }
    }
    for (const [angle, turn] of [[0, 1], [Math.PI, -1]]) {
      const { horizontal: h, vertical: v, crossfade } = cast(angle);
      assert.ok(Math.abs(h.x * v.x + h.y * v.y) < 1e-8);
      assert.ok(Math.abs(Math.hypot(h.x, h.y) - size.x * minimumWidthRatio) < 1e-8);
      assert.ok(crossfade && Math.abs(crossfade.weight - .5) < 1e-8);
      assert.ok(Math.abs(crossfade.anchorX - .45) < 1e-8);
      assert.ok(Math.abs(crossfade.shear) < 1e-8);
      assert.ok(Math.abs(crossfade.bounds[0] + .1) < 1e-8);
      assert.equal(cast(angle - turn * fadeAngle).crossfade, undefined);
      assert.ok(Math.abs((cast(angle - turn * fadeAngle / 2).crossfade?.weight ?? 0) - .25) < 1e-8);
      assert.ok(Math.abs((cast(angle + turn * fadeAngle / 2).crossfade?.weight ?? 0) - .75) < 1e-8);
      const after = cast(angle + turn * fadeAngle);
      assert.equal(after.crossfade, undefined);
      assert.equal(Math.sign(after.horizontal.x * after.vertical.y - after.horizontal.y * after.vertical.x), -flip);
    }
    for (const angle of [-thresholdAngle, thresholdAngle, Math.PI - thresholdAngle, Math.PI + thresholdAngle]) {
      const left = cast(angle - 1e-5).horizontal, right = cast(angle + 1e-5).horizontal;
      assert.ok(Math.hypot(left.x - right.x, left.y - right.y) < .01);
    }
  }
  const tilt = .32;
  const tilted = shadowBasis(center, size, bounds, anchor, { angle: tilt });
  const heading = tilt - thresholdAngle / 2;
  const { origin, horizontal: h, vertical: v } = shadowFootprint(tilted,
    { ...contact, direction: { x: Math.cos(heading), y: Math.sin(heading) }, stretch: .65 }, 'rotated');
  assert.ok(Math.abs(origin.x + h.x * tilted.groundAnchor.x + v.x * bounds[3] - tilted.groundPoint.x - Math.sin(tilt) * maxRise / 4) < 1e-8);
  assert.ok(Math.abs(origin.y + h.y * tilted.groundAnchor.x + v.y * bounds[3] - tilted.groundPoint.y + Math.cos(tilt) * maxRise / 4) < 1e-8);
});

test('sprite ground ratios set side width and anchor lift independently of the mirror crossfade', () => {
  const position = { x: 100, y: 120 };
  const size = { x: 44, y: 60 };
  const bounds = [0, 0, 1, 1] as const;
  const anchor = { x: .5, y: 1 };
  const defaultBasis = shadowBasis(position, size, bounds, anchor, {});
  const light = { direction: { x: 1, y: 0 }, stretch: .65, opacity: 1, softness: 1 };
  for (const groundRatio of [fixtureGroundRatio.crate, fixtureGroundRatio.vent, .5, .06]) {
    const basis = shadowBasis(position, size, bounds, anchor, { groundRatio });
    const cast = (radians: number) => shadowFootprint(basis, {
      ...light, direction: { x: Math.cos(radians), y: Math.sin(radians) },
    }, 'rotated');
    const expectedWidth = size.x * groundRatio;
    const threshold = Math.asin(groundRatio);
    for (const angle of [-threshold, -threshold / 2, 0, threshold / 2, threshold]) {
      const { origin, horizontal, vertical } = cast(angle);
      const width = Math.abs(horizontal.x * Math.sin(angle) - horizontal.y * Math.cos(angle));
      const bottom = origin.y + horizontal.y * basis.groundAnchor.x + vertical.y * basis.groundAnchor.y;
      assert.ok(Math.abs(width - expectedWidth) < 1e-8);
      assert.ok(Math.abs(bottom - basis.groundPoint.y + expectedWidth * (angle + threshold) / (2 * threshold)) < 1e-8);
    }
    assert.equal(cast(0).crossfade?.weight, .5);
    assert.ok(Math.abs((cast(-9 * Math.PI / 180).crossfade?.weight ?? 0) - .05) < 1e-8);
    assert.ok(Math.abs((cast(9 * Math.PI / 180).crossfade?.weight ?? 0) - .95) < 1e-8);
    assert.equal(cast(-10 * Math.PI / 180).crossfade, undefined);
    assert.equal(cast(10 * Math.PI / 180).crossfade, undefined);
    assert.deepEqual(shadowFootprint(basis, light, 'basic'), shadowFootprint(defaultBasis, light, 'basic'));
  }
});

test('combat status procs roll independently and only successful hits refresh a status', () => {
  const statuses: Statuses = {};
  rollCombatStatus(statuses, 'pulse', 0, false, () => .33);
  assert.deepEqual(statuses, {});
  rollCombatStatus(statuses, 'pulse', .3, false, () => .32);
  assert.equal(statuses.ignition?.until, 5.3);
  rollCombatStatus(statuses, 'pulse', 1, false, () => .9);
  assert.equal(statuses.ignition?.until, 5.3);
  rollCombatStatus(statuses, 'spore', 2, false, () => .5);
  assert.equal(statuses.freeze, undefined);
  rollCombatStatus(statuses, 'spore', 2, true, () => .5);
  assert.equal(statuses.freeze?.level, 2);
  rollCombatStatus(statuses, 'mite', 3, false, () => { throw new Error('Non-proc attack used RNG'); });
});

test('damage effects stack and finish their last whole second', () => {
  const statuses: Statuses = {};
  applyStatus(statuses, 'ignition', 2, 0);
  applyStatus(statuses, 'poison', 2, 0);
  assert.equal(tickStatuses(statuses, 1, 100, 100), 85.5);
  assert.equal(statusModifiers(statuses, 2).support, false);
  assert.equal(statusModifiers(statuses, 2).supportBlock, 'poison');
  assert.equal(statusModifiers(statuses, 2).attackBlock, undefined);
  assert.ok(Math.abs(tickStatuses(statuses, 5, 85.5, 100) - 34.396471875) < 1e-8);
  assert.deepEqual(activeStatuses(statuses, 5).map(effect => effect.kind), ['poison']);
  assert.equal(statuses.poison?.until, 20);
});

test('medical pulses shorten active effects while stronger status levels are preserved', () => {
  const statuses: Statuses = {};
  applyStatus(statuses, 'freeze', 2, 0);
  assert.equal(applyStatus(statuses, 'freeze', 1, .5), false);
  applyStatus(statuses, 'stun', 1, 0);
  applyStatus(statuses, 'shock', 2, 0);
  shortenStatuses(statuses, 0, medical.cleanse);
  assert.equal(statuses.stun?.until, 2.5);
  assert.equal(statuses.shock?.until, 4.5);
  assert.equal(statusModifiers(statuses, 1).speed, 0);
  assert.equal(statusModifiers(statuses, 1).attackBlock, 'stun');
  assert.equal(statusModifiers(statuses, 1).supportBlock, 'stun');
  assert.equal(statusModifiers(statuses, 3).speed, .5);
  assert.equal(statusModifiers(statuses, 3).attack, false);
  assert.equal(statusModifiers(statuses, 3).roll, false);
  assert.equal(statusModifiers(statuses, 3).attackBlock, 'shock');
  assert.equal(statusModifiers(statuses, 3).supportBlock, undefined);
  assert.equal(statusModifiers(statuses, 3).outgoing, .5);
  assert.equal(weapons.medical.interval, .5);
  shortenStatuses(statuses, 4.25, medical.cleanse);
  assert.equal(activeStatuses(statuses, 4.25).length, 0);
});

test('the lift requires the gate and its junction has a northern and an eastern route', () => {
  const closed = explore(landing, (x, y) => x === Math.floor(gate.x / tileSize) &&
    y >= gate.y / tileSize && y < (gate.y + gate.height) / tileSize);
  assert.ok(closed.has(at(relayAccess)));
  assert.ok(!closed.has(at(lift)));
  assert.ok(explore(relayAccess, (x, y) => x >= 24 && y >= 13).has(at(lift)));
  assert.ok(explore(relayAccess, (x, y) => x <= 24 && y < 10).has(at(lift)));
  for (const spawn of patrols) {
    const [x, y] = cell(spawn);
    assert.ok(floor[y]?.[x], `${spawn.kind} spawns off the floor at ${x},${y}`);
    assert.ok(distance(spawn, landing) > 170, 'enemies should not start within firing range of the landing pad');
  }
});
