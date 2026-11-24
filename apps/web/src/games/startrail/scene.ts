import Phaser from 'phaser';
import crewUrl from '../../assets/startrail/crew.png';
import locomotionUrl from '../../assets/startrail/solori-locomotion.png';
import verticalSoloriUrl from '../../assets/startrail/solori-vertical.png';
import verticalMonstersUrl from '../../assets/startrail/monsters-vertical.png';
import diagonalSoloriUrl from '../../assets/startrail/solori-diagonal.png';
import diagonalMonstersUrl from '../../assets/startrail/monsters-diagonal.png';
import enemyDirectionsUrl from '../../assets/startrail/enemy-directions.png';
import enemiesUrl from '../../assets/startrail/outpost-enemies.png';
import fallenUrl from '../../assets/startrail/outpost-fallen.png';
import setpiecesUrl from '../../assets/startrail/outpost-setpieces.png';
import outpostUrl from '../../assets/startrail/outpost.png';
import floorTilesUrl from '../../assets/startrail/outpost-floor.jpg';
import muralUrl from '../../assets/startrail/outpost-1-1.jpg';
import weaponsUrl from '../../assets/startrail/weapons.png';
import { makeGun, reloadStages, slots, weapons } from './gear.ts';
import type { Bullet, Gun, Slot, SpentMetal, Weapon } from './gear.ts';
import { balance, caches, crates, crystals, distance, gate, landing, lift, maxPixelStep, obstacles, onRay, patrols, rayDistance, relayAccess, screen, waves, weaponPickup, world } from './outpost.ts';
import type { Box, EnemyKind, MapMode, Point } from './outpost.ts';
import { makeOutpostRenderer, restartArea } from './render.ts';
import type { ActorArt, EnemyBolt, Phase, Spark, Trace, Warning } from './render.ts';
import { createOutpostAudio } from './sound.ts';

const timestep = 1 / 60;
const TAU = Math.PI * 2;
const keys = ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E', 'R', 'TAB', 'ENTER'] as const;
type Keys = Record<typeof keys[number], Phaser.Input.Keyboard.Key>;
type Body = Phaser.Physics.Matter.Image;
type Enemy = {
  body: Body; kind: EnemyKind; hp: number; aim: number; state: 'chase' | 'windup' | 'dash' | 'recover';
  stateUntil: number; hitUntil: number; attackAt: number;
};
type PropKind = keyof typeof balance.props;
type Prop = { body: Body; kind: PropKind; hp: number; hitUntil: number };
type Fallen = Pick<ActorArt, 'x' | 'y' | 'aim'> & { kind: EnemyKind; at: number; knockback: Point };
type Bolt = EnemyBolt & { source: EnemyKind; speed: number; left: number };
type Trigger = { held: boolean; tapped: boolean };
type Roll = { stage: 'moving'; heading: number; origin: Point; startedAt: number }
  | { stage: 'recovering'; heading: number; startedAt: number };

const airFriction = .11;
const enemyColors = { mite: '#9af2e1', boar: '#c6bcff', scout: '#ffb28a', sentinel: '#c9e786', spore: '#a6e9ff', grub: '#ccd3ff' } as const;

function mouseSlot(button: number): Slot | undefined {
  return button === 0 ? 'primary' : button === 2 ? 'sidearm' : undefined;
}

function isPageControl(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, button, a, textarea, select, [contenteditable]');
}

function boxFor(prop: Prop, center: Point = prop.body): Box {
  const { width, height } = balance.props[prop.kind];
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

export class OutpostScene extends Phaser.Scene {
  constructor(private readonly hud: CanvasRenderingContext2D) { super(); }

  private keyboard!: Keys;
  private renderOutpost!: ReturnType<typeof makeOutpostRenderer>;
  private player!: Body;
  private props: Prop[] = [];
  private enemies: Enemy[] = [];
  private securityGate?: ReturnType<Phaser.Physics.Matter.Factory['rectangle']>;
  private traces: Trace[] = [];
  private sparks: Spark[] = [];
  private bullets: Bullet[] = [];
  private spentMetal: SpentMetal[] = [];
  private fallen: Fallen[] = [];
  private bolts: Bolt[] = [];
  private rings: { x: number; y: number; radius: number; life: number }[] = [];
  private supplies = new Set(caches);
  private pixelStep = 1;
  private phase: Phase = 'approach';
  private cameraPosition = { x: 0, y: 0 };
  private previousCamera = { x: 0, y: 0 };
  private previousPositions = new WeakMap<Body, Point>();
  private readonly audio = createOutpostAudio();
  private elapsed = 0;
  private accumulator = 0;
  private facing = 0;
  private hp: number = balance.player.health;
  private healthBar?: Phaser.Time.TimerEvent;
  private roll?: Roll;
  private rollRequested = false;
  private gaitDistance = 0;
  private walkFrame?: number;
  private guns: Record<Slot, Gun> = { primary: makeGun('pulse'), sidearm: makeGun('scout') };
  private triggers: Record<Slot, Trigger> = { primary: { held: false, tapped: false }, sidearm: { held: false, tapped: false } };
  private selected: Slot = 'primary';
  private drop: Gun = makeGun('eagle');
  private invulnerableUntil = 0;
  private relayTime = 0;
  private gateOpenedAt = 0;
  private channel = 0;
  private wave = 0;
  private defeated = 0;
  private mapMode: MapMode = 'off';
  private pointerSeen = false;
  private restartRequested = false;

  preload() {
    this.load.image('crew', crewUrl);
    this.load.image('solori-locomotion', locomotionUrl);
    this.load.image('solori-vertical', verticalSoloriUrl);
    this.load.image('monsters-vertical', verticalMonstersUrl);
    this.load.image('solori-diagonal', diagonalSoloriUrl);
    this.load.image('monsters-diagonal', diagonalMonstersUrl);
    this.load.image('enemy-directions', enemyDirectionsUrl);
    this.load.image('outpost-enemies', enemiesUrl);
    this.load.image('outpost-fallen', fallenUrl);
    this.load.image('outpost-setpieces', setpiecesUrl);
    this.load.image('outpost', outpostUrl);
    this.load.image('floor-tiles', floorTilesUrl);
    this.load.image('mural', muralUrl);
    this.load.image('weapons', weaponsUrl);
  }

  create() {
    this.reset();
    this.game.canvas.tabIndex = 0;
    this.keyboard = this.input.keyboard!.addKeys(keys.join(','), false) as Keys;
    this.input.on('pointermove', () => { this.pointerSeen = true; });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.pointerSeen = true;
      this.game.canvas.focus({ preventScroll: true });
      this.audio.unlock();
      if (this.finished()) {
        const button = restartArea;
        const point = this.pointerPosition(pointer);
        if (pointer.button === 0 && point.x >= button.x && point.x <= button.x + button.width && point.y >= button.y && point.y <= button.y + button.height) this.restartRequested = true;
        return;
      }
      const slot = mouseSlot(pointer.button);
      if (slot) this.triggers[slot] = { held: true, tapped: true };
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const slot = mouseSlot(pointer.button);
      if (slot) this.triggers[slot].held = false;
    });
    this.input.on('gameout', () => this.stopFiring());
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (isPageControl(event.target)) return;
      this.audio.unlock();
      if (event.code === 'Tab' || event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
      if (event.code === 'Space' && !event.repeat) this.rollRequested = true;
    });
    this.game.events.on(Phaser.Core.Events.BLUR, this.clearInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.clearInput, this);
      this.events.off(Phaser.Scenes.Events.RENDER, this.paint, this);
      this.audio.end();
    });
    this.events.off(Phaser.Scenes.Events.DESTROY, this.audio.dispose);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.audio.dispose);

    const { gameContext } = this.game.renderer as Phaser.Renderer.Canvas.CanvasRenderer;
    this.renderOutpost = makeOutpostRenderer(gameContext, this.hud, {
      crew: this.texture('crew'), locomotion: this.texture('solori-locomotion'), verticalSolori: this.texture('solori-vertical'),
      verticalMonsters: this.texture('monsters-vertical'), outpost: this.texture('outpost'), tiles: this.texture('floor-tiles'),
      diagonalSolori: this.texture('solori-diagonal'), enemies: this.texture('outpost-enemies'), fallen: this.texture('outpost-fallen'), setpieces: this.texture('outpost-setpieces'),
      diagonalMonsters: this.texture('monsters-diagonal'), enemyDirections: this.texture('enemy-directions'),
      mural: this.texture('mural'), gear: this.texture('weapons'),
    });
    for (const box of obstacles) this.addBarrier(box);
    this.securityGate = this.addBarrier(gate);
    for (const point of crates) this.spawnProp('crate', point);
    for (const point of crystals) this.spawnProp('crystal', point);
    this.player = this.makeBody(landing, balance.player.mass, { type: 'circle', radius: balance.player.radius });
    for (const point of patrols) this.spawn(point.kind, point);
    this.follow(1);
    this.previousCamera = { ...this.cameraPosition };
    this.events.on(Phaser.Scenes.Events.RENDER, this.paint, this);
  }

  private reset() {
    this.props = []; this.enemies = []; this.traces = []; this.sparks = []; this.bullets = []; this.spentMetal = [];
    this.fallen = []; this.bolts = []; this.rings = []; this.supplies = new Set(caches);
    this.phase = 'approach'; this.cameraPosition = { x: 0, y: 0 }; this.previousPositions = new WeakMap();
    this.elapsed = 0; this.accumulator = 0; this.facing = 0; this.hp = balance.player.health;
    this.healthBar = undefined; this.roll = undefined; this.rollRequested = false; this.gaitDistance = 0; this.walkFrame = undefined;
    this.guns = { primary: makeGun('pulse'), sidearm: makeGun('scout') };
    this.selected = 'primary'; this.drop = makeGun('eagle');
    this.invulnerableUntil = 0; this.relayTime = 0; this.gateOpenedAt = 0;
    this.channel = 0; this.wave = 0; this.defeated = 0; this.mapMode = 'off';
    this.stopFiring(); this.pointerSeen = false; this.restartRequested = false;
    this.audio.begin();
  }

  setPixelStep(value: number) {
    this.pixelStep = Number.isFinite(value) ? Phaser.Math.Clamp(Math.round(value), 1, maxPixelStep) : 1;
  }

  isMuted() { return this.audio.isMuted(); }

  setMuted(value: boolean) { this.audio.setMuted(value); }

  private texture(key: string) {
    return this.textures.get(key).getSourceImage() as HTMLImageElement;
  }

  private addBarrier(box: Box) {
    return this.matter.add.rectangle(box.x + box.width / 2, box.y + box.height / 2, box.width, box.height, { isStatic: true, friction: .025 });
  }

  private makeBody(point: Point, mass: number, shape: Phaser.Types.Physics.Matter.MatterSetBodyConfig) {
    const body = this.matter.add.image(point.x, point.y, '__WHITE');
    return body.setBody(shape).setMass(mass).setFixedRotation().setFriction(.023, airFriction, .05).setBounce(.11).setVisible(false);
  }

  private spawnProp(kind: PropKind, point: Point) {
    const stats = balance.props[kind];
    const body = this.makeBody(point, stats.mass, { type: 'rectangle', width: stats.width, height: stats.height });
    if (stats.anchored) body.setStatic(true);
    this.props.push({ body, kind, hp: stats.hp, hitUntil: 0 });
  }

  private spawn(kind: EnemyKind, position: Point) {
    const stats = balance[kind];
    const body = this.makeBody(position, stats.mass, { type: 'circle', radius: stats.radius });
    this.enemies.push({ body, kind, hp: stats.health, aim: Math.PI, state: 'chase', stateUntil: 0, hitUntil: 0, attackAt: this.elapsed + .42 });
    this.burst(position, enemyColors[kind], 6);
  }

  private clearInput() {
    this.stopFiring();
    this.rollRequested = false;
    this.input.keyboard?.resetKeys();
  }

  private stopFiring() {
    for (const slot of slots) this.triggers[slot] = { held: false, tapped: false };
  }

  private finished() { return this.phase === 'defeated' || this.phase === 'cleared'; }

  private walls() { return this.securityGate ? [...obstacles, gate] : obstacles; }

  private blockerBoxes(): Box[] { return [...this.walls(), ...this.props.map(prop => boxFor(prop))]; }

  private get mapOpen() { return this.mapMode === 'panel'; }

  private follow(weight: number) {
    const targetX = Phaser.Math.Clamp(this.player.x - screen.width / 2, 0, world.width - screen.width);
    const targetY = Phaser.Math.Clamp(this.player.y - screen.height / 2, 0, world.height - screen.height);
    this.cameraPosition.x = Phaser.Math.Linear(this.cameraPosition.x, targetX, weight);
    this.cameraPosition.y = Phaser.Math.Linear(this.cameraPosition.y, targetY, weight);
  }

  private displayCamera() {
    return this.interpolate(this.previousCamera, this.cameraPosition);
  }

  private interpolate(previous: Point, current: Point) {
    const alpha = Math.min(1, this.accumulator / timestep);
    return { x: Phaser.Math.Linear(previous.x, current.x, alpha), y: Phaser.Math.Linear(previous.y, current.y, alpha) };
  }

  private visualPosition(body: Body): Point {
    const previous = this.previousPositions.get(body);
    return previous ? this.interpolate(previous, body) : { x: body.x, y: body.y };
  }

  private pointerPosition(pointer: Phaser.Input.Pointer): Point {
    return { x: pointer.x * screen.width / this.scale.width, y: pointer.y * screen.height / this.scale.height };
  }

  private worldAim() {
    const pointer = this.input.activePointer;
    const camera = this.displayCamera();
    return this.pointerSeen ? this.pointerPosition(pointer) : { x: this.player.x - camera.x + 94, y: this.player.y - camera.y };
  }

  private impulse(body: Body, heading: number, strength: number, mass: number) {
    const velocity = body.getVelocity();
    const push = onRay(velocity, heading, strength / mass);
    body.setVelocity(push.x, push.y);
  }

  private steer(body: Body, angle: number, speed: number, response: number) {
    const velocity = body.getVelocity();
    body.setVelocity(Phaser.Math.Linear(velocity.x, Math.cos(angle) * speed, response), Phaser.Math.Linear(velocity.y, Math.sin(angle) * speed, response));
  }

  private beginRoll(x: number, y: number) {
    const heading = Math.atan2(y, x);
    const origin = { x: this.player.x, y: this.player.y };
    this.roll = { stage: 'moving', heading, origin, startedAt: this.elapsed };
    this.audio.play('roll');
    this.burst(origin, '#bbd8e4', 7);
  }

  private recoverRoll(heading: number) {
    const speed = this.player.getVelocity();
    this.player.setVelocity(speed.x * .16, speed.y * .16);
    this.roll = { stage: 'recovering', heading, startedAt: this.elapsed };
  }

  private advanceRoll(blockers: Box[]) {
    const roll = this.roll;
    if (!roll) return false;
    const time = this.elapsed - roll.startedAt;
    if (roll.stage === 'recovering') {
      if (time >= balance.roll.recovery) { this.roll = undefined; return false; }
      this.steer(this.player, roll.heading, 0, .24);
      return true;
    }
    if (time >= balance.roll.duration) { this.recoverRoll(roll.heading); return true; }

    const dx = Math.cos(roll.heading), dy = Math.sin(roll.heading);
    const traveled = (this.player.x - roll.origin.x) * dx + (this.player.y - roll.origin.y) * dy;
    const next = Math.min(1, (time + timestep) / balance.roll.duration);
    const desired = balance.roll.range * (1 - (1 - next) ** 2.65);
    const step = Phaser.Math.Clamp(desired - traveled, 0, 12);
    const radius = balance.player.radius;
    const clearance = rayDistance(this.player, dx, dy, step, blockers.map(box => ({
      x: box.x - radius, y: box.y - radius, width: box.width + radius * 2, height: box.height + radius * 2,
    })));
    const speed = clearance / (1 - airFriction);
    this.player.setVelocity(dx * speed, dy * speed);
    if (clearance < .4 && step > .4) this.recoverRoll(roll.heading);
    return true;
  }

  private shoot(gun: Gun, slot: Slot) {
    const stats = weapons[gun.weapon];
    this.selected = slot;
    gun.ammo--; gun.firedAt = this.elapsed;
    this.audio.play(gun.weapon);
    const origin = { x: this.player.x, y: this.player.y };
    const heading = this.facing;
    const from = onRay(origin, heading, 21);
    if (gun.weapon !== 'pulse') {
      this.bullets.push({ ...origin, heading, traveled: 0, weapon: gun.weapon });
      this.dropMetal(onRay(onRay(origin, heading, 10), heading + Math.PI / 2, 4), heading + .96, 'case');
      this.burst(from, stats.color, gun.weapon === 'eagle' ? 7 : 4);
      return;
    }
    const collision = this.shotCollision(origin, heading, stats.range);
    const hit = collision.travel < stats.range;
    const to = onRay(origin, heading, collision.travel);
    this.traces.push({ from: collision.travel < 21 ? origin : from, to, life: .115, hit, color: stats.color });
    this.burst(collision.travel < 21 ? to : from, stats.color, 4);
    if (hit) this.impactShot(to, heading, gun.weapon, collision.target);
  }

  private shotCollision(origin: Point, heading: number, range: number) {
    const dx = Math.cos(heading), dy = Math.sin(heading);
    let travel = rayDistance(origin, dx, dy, range, this.walls());
    let target: Enemy | Prop | undefined;
    for (const prop of this.props) {
      const box = boxFor(prop);
      const inside = origin.x >= box.x && origin.x <= box.x + box.width && origin.y >= box.y && origin.y <= box.y + box.height;
      const entry = inside ? 0 : rayDistance(origin, dx, dy, travel, [box]);
      if (entry < travel) { target = prop; travel = entry; }
    }
    for (const enemy of this.enemies) {
      const ox = enemy.body.x - origin.x, oy = enemy.body.y - origin.y;
      const projection = ox * dx + oy * dy;
      const perpendicular = ox * dy - oy * dx;
      const radius = balance[enemy.kind].radius;
      if (Math.abs(perpendicular) >= radius) continue;
      const half = Math.sqrt(radius ** 2 - perpendicular ** 2);
      if (projection + half < 0) continue;
      const entry = Math.max(0, projection - half);
      if (entry < travel) { target = enemy; travel = entry; }
    }
    return { travel, target };
  }

  private impactShot(point: Point, heading: number, weapon: Weapon, target?: Enemy | Prop) {
    const stats = weapons[weapon];
    this.burst(point, target?.kind === 'boar' ? '#e6c3ff' : stats.color, 7);
    if (!target) return;
    this.audio.play('hit');
    target.hp -= stats.damage;
    target.hitUntil = this.elapsed + .14;
    if ('state' in target) {
      this.impulse(target.body, heading, stats.impulse, balance[target.kind].mass);
      if (target.hp > 0) return;
      this.burst(target.body, enemyColors[target.kind], 18);
      this.fallen.push({ x: target.body.x, y: target.body.y, kind: target.kind, aim: target.aim, at: this.elapsed,
        knockback: onRay({ x: 0, y: 0 }, heading, Math.min(14, stats.impulse * 3 / balance[target.kind].mass)) });
      this.audio.play('fall', target.body, this.player);
      target.body.destroy(); this.enemies.splice(this.enemies.indexOf(target), 1);
      this.defeated++;
    } else {
      const prop = balance.props[target.kind];
      if (!prop.anchored) this.impulse(target.body, heading, stats.impulse, prop.mass);
      if (target.hp > 0) return;
      this.audio.play('break'); this.burst(target.body, prop.color, 27);
      target.body.destroy(); this.props.splice(this.props.indexOf(target), 1);
    }
  }

  private dropMetal(point: Point, heading: number, kind: SpentMetal['kind']) {
    const isCase = kind === 'case';
    const velocity = onRay({ x: 0, y: 0 }, heading, isCase ? 44 + Math.random() * 11 : 12);
    this.spentMetal.push({ ...point, kind, vx: velocity.x, vy: velocity.y, z: isCase ? 8 : 4, vz: isCase ? 58 : 25,
      angle: heading, spin: (isCase ? 1 : -1) * (10 + Math.random() * 7), age: 0 });
  }

  private updateBallistics() {
    if (!this.bullets.length && !this.spentMetal.length) return;
    this.bullets = this.bullets.filter(bullet => {
      const stats = weapons[bullet.weapon];
      const step = Math.min(stats.speed * timestep, stats.range - bullet.traveled);
      const { travel, target } = this.shotCollision(bullet, bullet.heading, step);
      const point = onRay(bullet, bullet.heading, travel);
      const hit = travel < step;
      if (hit || bullet.traveled + travel >= stats.range - .01) {
        if (hit) this.impactShot(point, bullet.heading, bullet.weapon, target);
        this.dropMetal(onRay(point, bullet.heading + Math.PI, 2), bullet.heading + Math.PI * .67, 'slug');
        return false;
      }
      bullet.x = point.x; bullet.y = point.y; bullet.traveled += travel;
      return true;
    });
    const blockers = this.blockerBoxes();
    this.spentMetal = this.spentMetal.filter(piece => {
      piece.age += timestep;
      if (piece.age >= 2.4) return false;
      if (piece.z <= 0 && piece.vz <= 0) return true;
      const step = Math.hypot(piece.vx, piece.vy) * timestep;
      const travel = step > 0 ? rayDistance(piece, piece.vx * timestep / step, piece.vy * timestep / step, step, blockers) : 0;
      if (travel < step) { piece.vx *= -.24; piece.vy *= -.24; }
      else { piece.x += piece.vx * timestep; piece.y += piece.vy * timestep; }
      piece.z += piece.vz * timestep; piece.vz -= 550 * timestep; piece.angle += piece.spin * timestep;
      if (piece.z <= 0) {
        if (piece.kind === 'case') this.audio.play('casing', piece, this.player, piece.age > .32 ? .36 : 1);
        piece.z = 0;
        piece.vz = piece.vz < -30 ? -piece.vz * .23 : 0;
        piece.vx *= .38; piece.vy *= .38; piece.spin *= .5;
      }
      return true;
    });
  }

  private reload(slot: Slot) {
    const gun = this.guns[slot];
    if (gun.reloadAt !== undefined || gun.ammo === weapons[gun.weapon].capacity) return;
    this.selected = slot;
    gun.reloadAt = this.elapsed;
    gun.reloadStage = 0;
  }

  private reloadProgress(gun: Gun) {
    return gun.reloadAt === undefined ? undefined : Math.min(1, (this.elapsed - gun.reloadAt) / weapons[gun.weapon].reload);
  }

  private updateGuns(canFire: boolean) {
    for (const slot of slots) {
      const gun = this.guns[slot];
      const progress = this.reloadProgress(gun);
      if (progress !== undefined) {
        while (gun.reloadStage < reloadStages.length && progress >= reloadStages[gun.reloadStage]) {
          this.audio.reload(gun.reloadStage++, gun.weapon === 'eagle');
        }
        if (progress >= 1) { gun.ammo = weapons[gun.weapon].capacity; gun.reloadAt = undefined; }
      }
      const trigger = this.triggers[slot];
      const firing = trigger.held || trigger.tapped;
      trigger.tapped = false;
      if (!canFire || !firing || gun.reloadAt !== undefined || this.elapsed - gun.firedAt < weapons[gun.weapon].interval) continue;
      if (gun.ammo) this.shoot(gun, slot);
      else this.reload(slot);
    }
  }

  private interact() {
    const cache = this.nearbySupply();
    if (this.selection() === 'supply' && cache) {
      this.hp = Math.min(balance.player.health, this.hp + 35);
      this.showHealthBar();
      for (const gun of Object.values(this.guns)) { gun.ammo = weapons[gun.weapon].capacity; gun.reloadAt = undefined; }
      this.supplies.delete(cache); this.audio.play('swap');
      return;
    }
    if (this.selection() !== 'drop') return;
    const previous = this.guns.primary;
    previous.reloadAt = undefined;
    this.guns.primary = this.drop;
    this.drop = previous;
    this.selected = 'primary';
    this.audio.play('swap');
  }

  private nearbySupply() { return caches.find(point => this.supplies.has(point) && distance(this.player, point) < 31); }

  private selection() {
    if (this.mapOpen || this.roll || this.finished()) return;
    if (this.phase === 'approach' && distance(this.player, relayAccess) < balance.relay.radius) return 'relay';
    if (distance(this.player, weaponPickup) < 31) return 'drop';
    if (this.nearbySupply()) return 'supply';
  }

  private burst(point: Point, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const velocity = onRay({ x: 0, y: 0 }, Math.random() * TAU, 10 + Math.random() * 58);
      this.sparks.push({ x: point.x, y: point.y, vx: velocity.x, vy: velocity.y, life: .16 + Math.random() * .4, color });
    }
  }

  private showHealthBar() {
    this.healthBar?.remove();
    this.healthBar = this.time.delayedCall(1000, () => { this.healthBar = undefined; });
  }

  private takeHit(kind: EnemyKind, heading: number) {
    if (this.elapsed < this.invulnerableUntil) return;
    const stats = balance[kind];
    this.hp = Math.max(0, this.hp - stats.damage);
    this.showHealthBar();
    this.invulnerableUntil = this.elapsed + .52;
    if (this.roll?.stage === 'moving') this.recoverRoll(this.roll.heading);
    this.impulse(this.player, heading, stats.impulse, balance.player.mass);
    this.audio.play('hurt'); this.burst(this.player, '#ff9f7e', 9);
    if (!this.hp) this.complete('defeated');
  }

  private advanceEnemy(enemy: Enemy, blockers: Box[]) {
    const { body, kind } = enemy;
    const stats = balance[kind];
    const separation = distance(this.player, body);
    const aggroRange = this.phase === 'approach' ? balance.approachAggro : balance.defenseAggro;
    if (separation > aggroRange && enemy.state === 'chase') return;
    const range = balance.player.radius + stats.radius;
    const heading = Math.atan2(this.player.y - body.y, this.player.x - body.x);
    const sight = rayDistance(body, Math.cos(heading), Math.sin(heading), separation, blockers) >= separation;
    const attack = kind === 'mite' ? undefined : balance.attacks[kind];
    if (enemy.state === 'windup' && attack && this.elapsed >= enemy.stateUntil) {
      if (attack.style === 'dash') {
        enemy.state = 'dash'; enemy.stateUntil = this.elapsed + attack.duration;
        this.audio.play('dash', body, this.player);
      } else {
        if (attack.style === 'shot') {
          for (const offset of attack.spread) {
            const aim = enemy.aim + offset;
            this.bolts.push({ ...onRay(body, aim, stats.radius), heading: aim, source: kind, color: enemyColors[kind], speed: attack.speed, left: attack.range + 78 });
          }
          this.audio.play('bolt', body, this.player, .65);
        } else {
          this.rings.push({ x: body.x, y: body.y, radius: attack.radius, life: .4 });
          this.burst(body, enemyColors[kind], 21);
          if (sight && separation <= attack.radius) this.takeHit(kind, heading);
          this.audio.play('burst', body, this.player);
        }
        enemy.state = 'recover'; enemy.stateUntil = this.elapsed + attack.recovery;
      }
    } else if (enemy.state === 'recover' && this.elapsed >= enemy.stateUntil) {
      enemy.state = 'chase'; enemy.attackAt = this.elapsed + .55;
    }
    if (enemy.state === 'dash' && attack?.style === 'dash') {
      const clear = rayDistance(body, Math.cos(enemy.aim), Math.sin(enemy.aim), stats.radius + attack.speed + 2, blockers);
      if (sight && separation <= range + 6) this.takeHit(kind, enemy.aim);
      if (this.elapsed >= enemy.stateUntil || clear < stats.radius + attack.speed + 1 || (sight && separation <= range + 6)) {
        enemy.state = 'recover'; enemy.stateUntil = this.elapsed + attack.recovery;
      } else {
        this.steer(body, enemy.aim, attack.speed, .39);
        return;
      }
    }
    if (enemy.state !== 'chase') { this.steer(body, enemy.aim, 0, .26); return; }
    if (attack && sight && separation < attack.range && this.elapsed > enemy.attackAt) {
      enemy.aim = heading; enemy.state = 'windup'; enemy.stateUntil = this.elapsed + attack.windup;
      this.audio.play('warning', body, this.player, .72);
      return;
    }
    if (!attack && sight && separation <= range + 3 && enemy.attackAt < this.elapsed) {
      this.takeHit(kind, heading);
      enemy.attackAt = this.elapsed + .72;
    }
    if (this.elapsed < enemy.hitUntil || separation > aggroRange || (!sight && this.phase === 'approach')) return;
    const retreat = attack?.style === 'shot' && sight && separation < attack.keepDistance;
    if (attack?.style === 'shot' && sight && !retreat && separation < attack.range) return;
    const steeringAngles = [0, .67, -.67, 1.26, -1.26];
    for (const turn of steeringAngles) {
      const angle = heading + (retreat ? Math.PI : 0) + turn;
      if (rayDistance(body, Math.cos(angle), Math.sin(angle), stats.radius + 11, blockers) < stats.radius + 9) continue;
      enemy.aim = retreat ? heading : angle; this.steer(body, angle, stats.speed, .18); break;
    }
  }

  private advanceBolts(blockers: Box[]) {
    this.bolts = this.bolts.filter(bolt => {
      const step = Math.min(bolt.left, bolt.speed * timestep);
      const dx = Math.cos(bolt.heading), dy = Math.sin(bolt.heading);
      const wall = rayDistance(bolt, dx, dy, step, blockers);
      const offset = { x: this.player.x - bolt.x, y: this.player.y - bolt.y };
      const projected = offset.x * dx + offset.y * dy;
      const radius = balance.player.radius + 2;
      const normal = offset.x * dy - offset.y * dx;
      if (Math.abs(normal) < radius && projected >= -radius) {
        const reach = Math.sqrt(radius ** 2 - normal ** 2);
        if (projected + reach >= 0 && projected - reach <= wall) {
          this.takeHit(bolt.source, bolt.heading);
          return false;
        }
      }
      if (wall < step || bolt.left <= step) {
        this.burst(onRay(bolt, bolt.heading, wall), bolt.color, 5);
        return false;
      }
      bolt.x += dx * step; bolt.y += dy * step; bolt.left -= step;
      return true;
    });
  }

  private complete(phase: 'cleared' | 'defeated') {
    this.phase = phase; this.stopFiring(); this.mapMode = 'off';
    this.rollRequested = false;
    this.audio.end();
    this.audio.play(phase === 'cleared' ? 'win' : 'loss');
  }

  private updateRelay() {
    const near = distance(this.player, relayAccess);
    if (this.phase === 'approach') {
      const working = this.selection() === 'relay' && this.keyboard.E.isDown;
      this.channel = working ? this.channel + timestep : 0;
      if (this.channel >= balance.relay.activation) {
        this.phase = 'defense'; this.audio.play('power');
      }
      return working;
    }
    if (this.phase === 'defense') {
      if (near <= balance.relay.defenseRadius) this.relayTime += timestep;
      const wave = waves[this.wave];
      if (wave && this.relayTime >= wave.at) {
        for (const position of wave.spawns) this.spawn(position.kind, position);
        this.wave++;
      }
      if (this.relayTime >= balance.relay.duration) {
        if (this.securityGate) this.matter.world.remove(this.securityGate);
        this.securityGate = undefined; this.phase = 'evacuate'; this.gateOpenedAt = this.elapsed; this.audio.play('gate');
      }
    }
    if (this.phase === 'evacuate' && distance(this.player, lift) < 23) this.complete('cleared');
    return false;
  }

  private simulate() {
    this.elapsed += timestep;
    const key = this.keyboard;
    const camera = this.displayCamera(), aim = this.worldAim();
    const cursor = { x: aim.x + camera.x, y: aim.y + camera.y };
    this.facing = Math.atan2(cursor.y - this.player.y, cursor.x - this.player.x);
    const working = this.updateRelay();
    if (this.finished()) return;
    const x = Number(key.D.isDown || key.RIGHT.isDown) - Number(key.A.isDown || key.LEFT.isDown);
    const y = Number(key.S.isDown || key.DOWN.isDown) - Number(key.W.isDown || key.UP.isDown);
    if (this.rollRequested && !this.roll && !working && !this.mapOpen && (x || y)) this.beginRoll(x, y);
    this.rollRequested = false;
    const speed = working || this.mapOpen || (!x && !y) ? 0 : balance.player.speed;
    const rolling = this.advanceRoll(this.roll?.stage === 'moving' ? this.blockerBoxes() : []);
    if (!rolling) this.steer(this.player, Math.atan2(y, x), speed, this.elapsed + .32 < this.invulnerableUntil ? .075 : .24);

    this.traces = this.traces.filter(trace => (trace.life -= timestep) > 0);
    this.sparks = this.sparks.filter(spark => {
      spark.x += spark.vx * timestep; spark.y += spark.vy * timestep;
      return (spark.life -= timestep) > 0;
    });
    this.updateGuns(!rolling && !working && !this.mapOpen);
    this.updateBallistics();
    const blockers = this.blockerBoxes();
    this.advanceBolts(blockers);
    this.rings = this.rings.filter(ring => (ring.life -= timestep) > 0);
    this.fallen = this.fallen.filter(enemy => this.elapsed - enemy.at < balance.fallen.duration);
    for (const enemy of this.enemies) {
      if (this.finished()) break;
      this.advanceEnemy(enemy, blockers);
    }
    const before = { x: this.player.x, y: this.player.y };
    this.previousPositions.set(this.player, before);
    for (const { body } of this.enemies) this.previousPositions.set(body, { x: body.x, y: body.y });
    for (const { body } of this.props) this.previousPositions.set(body, { x: body.x, y: body.y });
    this.matter.world.step(timestep * 1000);
    const step = distance(this.player, before);
    if (!rolling && speed && step > .18) {
      this.gaitDistance += step;
      this.walkFrame = Math.floor(this.gaitDistance / 5.2) % 6;
    } else this.walkFrame = undefined;
    this.previousCamera = { ...this.cameraPosition };
    this.follow(.16);
  }

  private paint() {
    const props = this.props.map(prop => {
      const point = this.visualPosition(prop.body);
      return { ...point, kind: prop.kind, bounds: boxFor(prop, point),
        health: prop.hp / balance.props[prop.kind].hp, hit: Math.max(0, prop.hitUntil - this.elapsed) };
    });
    const blockers = [...this.walls(), ...props.map(prop => prop.bounds)];
    const warnings: Warning[] = [];
    const actors: ActorArt[] = this.enemies.map(enemy => {
      const { body, aim, state } = enemy;
      const point = this.visualPosition(body);
      const attack = enemy.kind === 'mite' ? undefined : balance.attacks[enemy.kind];
      if (state === 'windup' && attack) {
        const fill = 1 - (enemy.stateUntil - this.elapsed) / attack.windup;
        const color = enemyColors[enemy.kind];
        if (attack.style === 'burst') warnings.push({ from: point, radius: attack.radius, fill, color });
        else {
          const angles = attack.style === 'shot' ? attack.spread : [0];
          for (const offset of angles) {
            const heading = aim + offset;
            const range = rayDistance(point, Math.cos(heading), Math.sin(heading), attack.range + 20, blockers);
            warnings.push({ from: point, to: onRay(point, heading, range), fill, color, wide: attack.style === 'dash' });
          }
        }
      }
      const velocity = body.getVelocity();
      const hit = Math.max(0, enemy.hitUntil - this.elapsed);
      const pose = enemy.kind === 'mite' ? hit > 0 ? 3 : undefined
        : state === 'windup' ? enemy.kind === 'boar' ? 2 : 3 : state === 'dash' ? 3 : undefined;
      return { ...point, kind: enemy.kind, aim, stride: Math.hypot(velocity.x, velocity.y), hit, pose };
    });
    for (const enemy of this.fallen) {
      const age = this.elapsed - enemy.at;
      const slide = 1 - Math.max(0, 1 - age / balance.fallen.collapse) ** 2;
      actors.push({ kind: enemy.kind, x: enemy.x + enemy.knockback.x * slide, y: enemy.y + enemy.knockback.y * slide,
        aim: enemy.aim, stride: 0, hit: 0, fallen: age });
    }
    const velocity = this.player.getVelocity();
    const held = this.guns[this.selected];
    const recoil = Math.max(0, 1 - (this.elapsed - held.firedAt) / .12);
    const roll = this.roll;
    const rollTime = roll ? this.elapsed - roll.startedAt : 0;
    const rollPose = roll ? {
      heading: roll.heading,
      frame: roll.stage === 'moving' ? Math.min(4, Math.floor(rollTime / balance.roll.duration * 5)) : rollTime < balance.roll.recovery * .47 ? 4 : 5,
    } : undefined;
    this.renderOutpost({
      player: { ...this.visualPosition(this.player), kind: 'solori', aim: this.facing, hit: Math.max(0, this.invulnerableUntil - this.elapsed - .26),
        stride: Math.hypot(velocity.x, velocity.y), pose: recoil > .4 ? 3 : undefined },
      actors, props,
      blockers, warnings, aim: this.worldAim(), mapMode: this.mapMode,
      phase: this.phase, hp: this.hp, showHealth: !!this.healthBar, roll: rollPose, walkFrame: this.walkFrame,
      selected: this.selected, guns: this.guns, drop: this.drop.weapon, recoil,
      reload: this.reloadProgress(held),
      gateTravel: this.gateOpenedAt ? Phaser.Math.Clamp((this.elapsed - this.gateOpenedAt) / .36, 0, 1) : 0,
      charge: this.phase === 'approach' ? this.channel / balance.relay.activation : Math.min(1, this.relayTime / balance.relay.duration),
      time: this.elapsed, defeated: this.defeated, sparks: this.sparks, traces: this.traces, selection: this.selection(),
      bullets: this.bullets, spentMetal: this.spentMetal, bolts: this.bolts, rings: this.rings,
      supplies: this.supplies, nearbySupply: this.nearbySupply(),
    }, this.displayCamera(), this.pixelStep);
  }

  update(_time: number, delta: number) {
    const justDown = Phaser.Input.Keyboard.JustDown;
    if (isPageControl(document.activeElement)) this.clearInput();
    if (this.finished()) {
      if (this.restartRequested || justDown(this.keyboard.ENTER)) this.scene.restart();
      return;
    }
    if (justDown(this.keyboard.TAB)) {
      this.mapMode = this.mapMode === 'off' ? 'panel' : this.mapMode === 'panel' ? 'overlay' : 'off';
      if (this.mapOpen) this.stopFiring();
    }
    if (justDown(this.keyboard.E)) this.interact();
    if (!this.mapOpen && !this.roll && justDown(this.keyboard.R)) this.reload(this.selected);
    this.accumulator += Math.min(.05, delta / 1000);
    while (this.accumulator >= timestep && !this.finished()) {
      this.simulate();
      this.accumulator -= timestep;
    }
  }
}
