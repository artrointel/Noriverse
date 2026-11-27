import { companionCombatWeight, EncounterDirector, encounterRange, escortChase, partyEncounter, partyOutsideArrival,
  scaledPatrols, stageDefense } from '../apps/web/src/games/startrail/encounters.ts';
import { auroraStage, debrisStage, observatoryStage, outpostStage } from '../apps/web/src/games/startrail/expedition-maps.ts';
import type { ExpeditionMap } from '../apps/web/src/games/startrail/expedition-maps.ts';
import { finishReload, knife, makeGun, refillMagazine, startReload, swapDuration, weapons } from '../apps/web/src/games/startrail/gear.ts';
import type { Gun } from '../apps/web/src/games/startrail/gear.ts';
import { balance, distance, tileSize } from '../apps/web/src/games/startrail/outpost.ts';
import type { EnemyKind, Point } from '../apps/web/src/games/startrail/outpost.ts';

export const simulationStages = [outpostStage, observatoryStage, auroraStage, debrisStage] as const;
export const pilots = {
  deliberate: { accuracy: .60, evade: .55, pace: .65, aggression: .72, puzzleSeconds: 9 },
  practiced: { accuracy: .83, evade: .76, pace: .82, aggression: .88, puzzleSeconds: 5 },
} as const;

type Pilot = typeof pilots[keyof typeof pilots];
type Step = { length: number; seconds: number; alert: boolean; escort: boolean; defending?: boolean };
type Threat = { kind: EnemyKind; hp: number; reach: number; nextHit: number };
const step = .05;
const hz = 60;
const escortSpeed = .85;

function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function routeLength(stage: ExpeditionMap, from: Point, to: Point) {
  const columns = stage.floor[0].length;
  const tileIndex = (point: Point) => Math.floor(point.y / tileSize) * columns + Math.floor(point.x / tileSize);
  const start = tileIndex(from), goal = tileIndex(to);
  const open = [start], steps = new Map([[start, 0]]);
  for (let i = 0; i < open.length; i++) {
    const index = open[i];
    const walked = steps.get(index)!;
    if (index === goal) return Math.max(distance(from, to), walked * tileSize);
    const x = index % columns, y = Math.floor(index / columns);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (!stage.floor[ny]?.[nx]) continue;
      const next = ny * columns + nx;
      if (steps.has(next)) continue;
      steps.set(next, walked + 1);
      open.push(next);
    }
  }
  throw new Error(`No floor route between objectives in ${stage.id}`);
}

function routeFor(stage: ExpeditionMap, pilot: Pilot): Step[] {
  const steps: Step[] = [];
  let point = stage.landing;
  const walk = (to: Point, seconds = 0, alert = false, escort = false) => {
    steps.push({ length: routeLength(stage, point, to), seconds, alert, escort });
    point = to;
  };
  if (stage.id === '1-2') {
    walk(stage.shelter, 2);
    walk(stage.relayAccess, pilot.puzzleSeconds * .6);
    walk(stage.shelter, 2, true);
    walk(stage.lift, 0, true, true);
  } else {
    if ('stations' in stage) for (const station of stage.stations) if (station.required) walk(station, pilot.puzzleSeconds * .65);
    walk(stage.relayAccess, stage.id === '1-4' ? 1 : pilot.puzzleSeconds);
    steps.push({ length: 0, seconds: stageDefense[stage.id]?.duration ?? 0, alert: true, escort: false, defending: true });
    walk(stage.lift, 0, true);
  }
  return steps;
}

export function simulateExpedition(stage: ExpeditionMap, pilot: Pilot, explorers: 1 | 2, seed: number) {
  const random = seeded(seed);
  const director = new EncounterDirector();
  const threats: Threat[] = [];
  const route = routeFor(stage, pilot);
  const supplies = [stage.id === '1-2' ? .44 : .57, stage.id === '1-2' ? .85 : .82];
  const walkedRoute = route.reduce((sum, segment) => sum + segment.length, 0);
  let hp = balance.player.health, time = 0, walked = 0, kills = 0, shots = 0, hitShots = 0, peak = 0, spawned = 0;
  let damageAt = 0, gunReady = 0, nextPatrol = 0, escortKills = 0, escortDamage = 0, ammoStops = 0;
  const primary = makeGun('pulse'), sidearm = makeGun('scout');
  let selected: Gun = primary;
  const partySize = 1 + (explorers - 1) * companionCombatWeight;
  const patrols = scaledPatrols(stage.patrols, partyEncounter(stage.id, partySize).enemies);
  const add = (kind: EnemyKind, reach: number) => {
    threats.push({ kind, reach, hp: balance[kind].health, nextHit: time + .5 });
    spawned++;
  };

  for (const segment of route) {
    let remaining = segment.length, work = segment.seconds, wave = 0;
    const table = partyEncounter(stage.id, partySize, segment.escort);
    const defense = segment.defending ? stageDefense[stage.id] : undefined;
    if (segment.escort) director.beginEscort(time, table.firstAt);
    while ((remaining > 0 || work > 1e-7) && hp > 0 && time < 180) {
      time += step;
      const fighting = threats.some(enemy => enemy.reach <= 235);
      const danger = threats.some(enemy => enemy.reach < escortChase.dangerRadius);
      const task = remaining <= 0 && !segment.defending;
      const move = (remaining > 0 && (!segment.escort || !danger)) ?
        Math.min(remaining, balance.player.speed * hz * pilot.pace * step * (fighting ? .64 : 1) * (segment.escort ? escortSpeed : 1)) : 0;
      remaining -= move;
      walked += move;
      if (remaining <= 0 && (!task || !danger)) work -= step;
      if (supplies.length && walked >= supplies[0] * walkedRoute) {
        supplies.shift();
        hp = Math.min(balance.player.health, hp + 35);
        refillMagazine(primary, weapons[primary.weapon]); refillMagazine(sidearm, weapons[sidearm.weapon]);
      }

      const lead = { x: stage.landing.x + walked, y: stage.landing.y };
      const party = explorers === 1 ? [lead] : [lead, { ...lead, x: lead.x - 47 }];
      const departed = partyOutsideArrival(stage.landing, party);
      director.updateArrival(time, departed, table.firstAt);
      if (departed && nextPatrol < patrols.length) {
        const at = walkedRoute * (.15 + .75 * nextPatrol / patrols.length);
        if (walked >= at) add(patrols[nextPatrol++].kind, 190);
      }
      const pending = defense?.waves[wave];
      if (defense && pending && defense.duration - work >= pending.at) {
        director.queue(time, scaledPatrols(pending.kinds, table.enemies)); wave++;
      }
      director.spawnWave(time, threats.length, table, segment.alert, kind => {
        // Approximate intermittent blind corners and the space occupied by approaching packs.
        if (random() > .84) return false;
        add(kind, encounterRange.safe + random() * ((segment.alert ? encounterRange.alert : encounterRange.approach) - encounterRange.safe));
        return true;
      });
      peak = Math.max(peak, threats.length);
      for (const enemy of threats) {
        const stats = balance[enemy.kind];
        const attack = enemy.kind in balance.attacks ? balance.attacks[enemy.kind as keyof typeof balance.attacks] : undefined;
        const ranged = attack?.style === 'shot';
        const reach = ranged ? attack.range : balance.player.radius + stats.radius + 3;
        enemy.reach = Math.max(reach, enemy.reach - stats.speed * hz * step + move * .52);
        if (enemy.reach > reach || time < enemy.nextHit) continue;
        enemy.nextHit = time + (attack ? attack.windup + attack.recovery : .72);
        if (time >= damageAt && random() > pilot.evade && (explorers === 1 || random() > .22)) {
          hp = Math.max(0, hp - stats.damage);
          if (segment.escort) escortDamage += stats.damage;
          damageAt = time + .52;
        }
      }
      if (hp <= 0) break;
      const stats = weapons[selected.weapon];
      if (selected.reloadAt !== undefined && time >= selected.reloadAt + stats.reload) finishReload(selected, stats);
      if (time < gunReady || selected.reloadAt !== undefined || task && !danger) continue;
      const enemy = threats.filter(target => target.reach <= Math.min(235, stats.range)).sort((a, b) => a.reach - b.reach)[0];
      if (!enemy) continue;
      if (!selected.ammo) {
        if (startReload(selected, stats, time)) continue;
        if (selected === primary && (sidearm.ammo || sidearm.spare)) {
          selected = sidearm; gunReady = time + swapDuration;
        } else {
          ammoStops++;
          if (enemy.reach <= knife.reach) {
            enemy.hp -= knife.damage;
            gunReady = time + knife.duration + knife.recovery;
          }
        }
      } else {
        selected.ammo--; shots++;
        gunReady = time + stats.interval / pilot.aggression;
        if (random() < pilot.accuracy * stats.accuracy) {
          enemy.hp -= stats.damage;
          hitShots++;
        }
      }
      if (enemy.hp <= 0) {
        kills++;
        if (segment.escort) escortKills++;
        threats.splice(threats.indexOf(enemy), 1);
      }
    }
    if (hp <= 0 || time >= 180) break;
  }
  return { cleared: hp > 0 && time < 180, time, hp, kills, shots, hitShots, spawned, peak, escortKills, escortDamage, ammoStops };
}
