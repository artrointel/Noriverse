import { dispersedHeading, finishReload, refillMagazine, startReload } from './gear.ts';
import type { BulletSpec, Magazine } from './gear.ts';
import { distance, floor, onRay, rayDistance, tileSize } from './outpost.ts';
import type { Box, Point } from './outpost.ts';

const machineGun = { damage: 1, impulse: 1.45, color: '#ffdfa5' };
const droneGun = { damage: 1, impulse: .8, color: '#9cf7df' };
export const supportSpecs = {
  turret: { name: '포탑', range: 172, accuracy: .92, health: 54, radius: 11, boot: .48, speed: 850, impact: machineGun, interval: .235, capacity: 20, magazines: 4, reload: 1.15, pickup: 1, deploy: 3, turnSpeed: 9, scanSpeed: .62 },
  drone: { name: '드론', range: 108, accuracy: .87, health: 34, radius: 9, boot: .46, speed: 720, impact: droneGun, interval: .34, capacity: 12, magazines: 4, reload: .86,
    duration: 24, recharge: 38, leash: 132, speedPerSecond: 220 },
  flare: { name: '조명탄', capacity: 12, duration: 180, radius: 115 },
} as const;

export const supportKinds = ['turret', 'drone', 'flare'] as const;
export const targetAlertSeconds = .48;
export type SupportKind = typeof supportKinds[number];
export type Device = 'turret' | 'drone';
type ShootTarget = Point & { active?: boolean };
export type Emplacement = Point & {
  kind: Device; hp: number; hitUntil: number; readyAt: number; heading: number; firedAt: number;
  acquired?: ShootTarget; alert?: { until: number; target: Point };
};
export type Flare = { from: Point; to: Point; fromAt: number; litAt: number; ground?: Point & { rotation: number } };
export function flareFalloff(reach: number, range: number = supportSpecs.flare.radius) {
  const ratio = Math.min(1, Math.max(0, reach / range));
  return (1 - ratio ** 1.32) ** 3.6;
}

export function flarePoseAt(flare: Flare, time: number) {
  const t = Math.min(1, Math.max(0, (time - flare.fromAt) / (flare.litAt - flare.fromAt)));
  const base = flare.ground ?? { x: flare.from.x + (flare.to.x - flare.from.x) * t, y: flare.from.y + (flare.to.y - flare.from.y) * t };
  return { base, lift: Math.sin(t * Math.PI) * 28, rotation: flare.ground?.rotation ?? t * 10, airborne: t < 1 };
}

function clearPath(from: Point, to: Point, blockers: readonly Box[], buffer = 0) {
  const heading = Math.atan2(to.y - from.y, to.x - from.x);
  const length = distance(from, to);
  const clear = rayDistance(from, Math.cos(heading), Math.sin(heading), length, blockers);
  return onRay(from, heading, clear < length ? Math.max(0, clear - buffer) : clear);
}

function canLand(point: Point, blockers: readonly Box[], radius: number) {
  return floor[Math.floor(point.y / tileSize)]?.[Math.floor(point.x / tileSize)] &&
    blockers.every(box => Math.hypot(Math.max(box.x - point.x, point.x - box.x - box.width, 0),
      Math.max(box.y - point.y, point.y - box.y - box.height, 0)) >= radius);
}

function nearest(from: Point, targets: ShootTarget[], range: number, blockers: readonly Box[]) {
  let best: ShootTarget | undefined;
  let limit = range;
  for (const target of targets) {
    if (target.active === false) continue;
    const reach = distance(from, target);
    if (reach >= limit || distance(clearPath(from, target, blockers), target) > .01) continue;
    best = target; limit = reach;
  }
  return best;
}

export function turretSite(player: Point, heading: number, blockers: readonly Box[], point = onRay(player, heading, 28)) {
  return { point, valid: !!canLand(point, blockers, 9) && distance(clearPath(player, point, blockers), point) < .01 };
}

function deployDevice(kind: Device, point: Point, heading: number, time: number): Emplacement {
  const spec = supportSpecs[kind];
  return { x: point.x, y: point.y, kind, hp: spec.health, heading, readyAt: time + spec.boot, firedAt: -Infinity, hitUntil: 0 };
}

export class SupportGear {
  selected: SupportKind = 'turret';
  turret?: Emplacement;
  drone?: Emplacement;
  battery = supportSpecs.drone.duration as number;
  flares: Flare[] = [];
  stock = supportSpecs.flare.capacity as number;
  readonly turretAmmo: Magazine = { ammo: 0, spare: 0 };
  readonly droneAmmo: Magazine = { ammo: 0, spare: 0 };
  private trail: Point[] = [];

  constructor() { this.refill(); }

  refill() {
    refillMagazine(this.turretAmmo, supportSpecs.turret);
    refillMagazine(this.droneAmmo, supportSpecs.drone);
    this.battery = supportSpecs.drone.duration;
    this.stock = supportSpecs.flare.capacity;
  }

  use(player: Point, aim: Point, heading: number, blockers: readonly Box[], time: number, planned?: Point) {
    if (this.selected === 'turret') {
      const site = turretSite(player, heading, blockers, planned);
      if (this.turret || !site.valid) return false;
      this.turret = deployDevice('turret', site.point, heading, time);
      return true;
    }
    if (this.selected === 'drone') {
      if (this.drone) { this.drone = undefined; return true; }
      if (this.battery <= 0) return false;
      this.drone = deployDevice('drone', player, heading, time);
      this.trail = [{ x: player.x, y: player.y }];
      return true;
    }
    if (this.stock <= 0) return false;
    const to = clearPath(player, aim, blockers, 7);
    if (!canLand(to, blockers, 3)) return false;
    this.flares.push({ from: { x: player.x, y: player.y }, to, fromAt: time,
      litAt: time + Math.min(.68, .21 + distance(player, to) / 510) });
    this.stock--;
    return true;
  }

  update(time: number, dt: number, player: Point, targets: ShootTarget[], blockers: readonly Box[],
    fire: (kind: Device, origin: Emplacement, heading: number, shot: BulletSpec) => void,
    detect?: (unit: Emplacement) => void) {
    const deployDrone = supportSpecs.drone;
    if (this.drone) {
      this.battery = Math.max(0, this.battery - dt);
      if (this.battery === 0) this.drone = undefined;
    } else this.battery = Math.min(deployDrone.duration, this.battery + dt * deployDrone.duration / deployDrone.recharge);

    this.flares = this.flares.filter(flare => time < flare.litAt + supportSpecs.flare.duration);
    for (const kind of ['turret', 'drone'] as const) {
      const magazine = kind === 'turret' ? this.turretAmmo : this.droneAmmo;
      const spec = supportSpecs[kind];
      if (magazine.reloadAt !== undefined && time - magazine.reloadAt >= spec.reload) finishReload(magazine, spec);
      const unit = this[kind];
      if (!unit || time < unit.readyAt) continue;
      if (kind === 'drone') this.fly(unit, player, targets, blockers, time, dt);
      const current = unit.acquired;
      const target = current && current.active !== false && targets.includes(current) && distance(unit, current) < spec.range &&
        distance(clearPath(unit, current, blockers), current) < .01 ? current : nearest(unit, targets, spec.range, blockers);
      if (!target) {
        unit.acquired = undefined;
        if (kind === 'turret') unit.heading = (unit.heading + dt * supportSpecs.turret.scanSpeed) % (2 * Math.PI);
        continue;
      }
      if (unit.acquired !== target) {
        unit.alert = { until: time + targetAlertSeconds, target: { x: target.x, y: target.y } };
        detect?.(unit);
      } else if (unit.alert && unit.alert.until > time) {
        unit.alert.target.x = target.x;
        unit.alert.target.y = target.y;
      }
      unit.acquired = target;
      const aim = Math.atan2(target.y - unit.y, target.x - unit.x);
      const turn = Math.atan2(Math.sin(aim - unit.heading), Math.cos(aim - unit.heading));
      const step = supportSpecs.turret.turnSpeed * dt;
      unit.heading = kind === 'turret' ? unit.heading + Math.min(step, Math.max(-step, turn)) : aim;
      if (kind === 'turret' && Math.abs(turn) > step + .115) continue;
      if (time - unit.firedAt < spec.interval) continue;
      if (magazine.ammo <= 0) { startReload(magazine, spec, time); continue; }
      magazine.ammo--;
      unit.firedAt = time;
      fire(kind, unit, dispersedHeading(unit.heading, spec.accuracy), spec);
    }
  }

  litFlares(time: number) { return this.flares.filter(flare => time >= flare.litAt).map(flare => flare.ground ?? flare.to); }

  private fly(unit: Emplacement, player: Point, targets: ShootTarget[], blockers: readonly Box[], time: number, dt: number) {
    const { leash, speedPerSecond } = supportSpecs.drone;
    if (!this.trail.length || distance(this.trail[0], player) > 18) {
      this.trail.unshift({ x: player.x, y: player.y });
      this.trail.length = Math.min(this.trail.length, 24);
    }
    const withinReach = targets.filter(target => target.active !== false && distance(player, target) < leash);
    const enemy = distance(unit, player) < leash ? nearest(unit, withinReach, leash, blockers) : undefined;
    let goal = enemy ? onRay(enemy, Math.atan2(unit.y - enemy.y, unit.x - enemy.x), 46)
      : onRay(player, time * 1.7, 26);
    if (!canLand(goal, blockers, 6) || distance(clearPath(unit, goal, blockers), goal) > .01) {
      goal = this.trail.find(point => distance(clearPath(unit, point, blockers), point) < .01) ?? player;
    }
    const heading = Math.atan2(goal.y - unit.y, goal.x - unit.x);
    const length = Math.min(distance(unit, goal), speedPerSecond * dt);
    for (const turn of [0, .75, -.75, 1.45, -1.45]) {
      const next = onRay(unit, heading + turn, length);
      if (!canLand(next, blockers, 5)) continue;
      unit.x = next.x;
      unit.y = next.y;
      if (!enemy) unit.heading = heading + turn;
      return;
    }
  }
}
