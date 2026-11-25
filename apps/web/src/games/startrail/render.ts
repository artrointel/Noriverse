import { balance, cables, distance, explorerNames, floor, gate, gateCenter, isMetalFloor, landmarks, landing, lift, mapWallEdges, onRay, pulseLightDuration,
  rayDistance, relay, relayAccess, relayBody, screen, tileSize, world } from './outpost.ts';
import type { Box, EnemyKind, ExplorerKind, MapMode, Point } from './outpost.ts';
import { knife, slots, weapons } from './gear.ts';
import type { Bullet, Gun, Slot, SpentMetal, Weapon } from './gear.ts';
import { distanceToLight, flashlightLevel, makeVisibility, peripheralLight, surface, visibleSurface } from './visibility.ts';
import type { FlashLight } from './visibility.ts';
import { flareFalloff, flarePoseAt, supportKinds, supportSpecs, targetAlertSeconds } from './support.ts';
import type { SupportGear } from './support.ts';
import type { InteractionChallenge } from './challenge.ts';
import { drawStatuses } from './status-art.ts';
import { statusSpecs } from './status.ts';
import type { StatusEffect } from './status.ts';
import { gunArt, heldPose, projectBarrelPoint, supportPose, turretArt, turretBaseCenter, yawProjection } from './weapon-pose.ts';
import type { BarrelProjection } from './weapon-pose.ts';
import { drawGamePointer, isHudPointer } from './reticle.ts';
import { spriteCellSize } from './shadow.ts';
import type { ShadowLight, ShadowMode, SpriteShadows } from './shadow.ts';
import { enemyGroundRatio, explorerGroundRatio, fixtureGroundRatio } from './shadow-art.ts';
import { makePixelPostProcess } from './pixel-post.ts';
import { projectToScreen } from './camera.ts';
import type { IndirectLighting, LightingOptions } from './gi.ts';

export type Phase = 'approach' | 'defense' | 'evacuate' | 'cleared' | 'defeated';
export type ActorArt = Point & { kind: ExplorerKind | EnemyKind; aim: number; stride: number; pose?: number; hit: number; fallen?: number; poseTime?: number;
  statuses?: StatusEffect[]; medicSlow?: boolean };
export type Trace = { from: Point; to: Point; life: number; hit: boolean; color: string; lift: number };
export type MuzzleLight = { origin: Point; point: Point; emitter: Point; heading: number; life: number; duration: number;
  strength: number; color: string; wide: boolean; ballistic?: boolean };
export type Spark = Point & { vx: number; vy: number; life: number; color: string };
export type Warning = { from: Point; fill: number; color: string } & ({ to: Point; wide: boolean } | { radius: number });
export type EnemyBolt = Point & { heading: number; color: string; lift: number };
export type PropArt = Point & { kind: 'crate' | 'crystal'; bounds: Box; health: number; hit: number };
type GroundGun = Point & { gun: Gun };
export type StageInteraction = { kind: 'relay' | 'supply' | 'turret' | 'dummy'; point: Point } | { kind: 'weapon'; point: GroundGun };
export type Frame = {
  player: ActorArt & { kind: ExplorerKind }; actors: ActorArt[]; props: PropArt[]; blockers: Box[]; phase: Phase;
  ally?: ActorArt & { kind: ExplorerKind; hp: number };
  dummy?: Point & { hp: number; statuses: StatusEffect[] };
  hp: number; showHealth: boolean; roll?: { heading: number; frame: number }; walkFrame?: number;
  selected: Slot; guns: Record<Slot, Gun>; groundArms: GroundGun[]; reload?: number;
  swapping?: { progress: number; to: Slot }; slash?: { heading: number; progress: number };
  charge: number; gateTravel: number; time: number; actionTime: number; defeated: number;
  aim: Point; pointerInside: boolean; mapMode: MapMode; flashlightOn: boolean; traces: Trace[]; sparks: Spark[]; warnings: Warning[];
  selection?: StageInteraction; bullets: Bullet[]; spentMetal: SpentMetal[];
  bolts: EnemyBolt[]; rings: (Point & { radius: number; life: number })[];
  supplies: ReadonlySet<Point>; challenge?: InteractionChallenge; support: SupportGear; turretHold: number;
  turretDeploy?: { point: Point; heading: number; progress: number; valid: boolean };
  medicalBeam?: { point: Point; enemy: boolean; self: boolean };
  muzzleLights: MuzzleLight[];
  lighting: LightingOptions;
  shadowMode: ShadowMode;
};

type ActorAtlases = {
  crew: HTMLImageElement; locomotion: HTMLImageElement; verticalSolori: HTMLImageElement;
  verticalMonsters: HTMLImageElement; diagonalSolori: HTMLImageElement; diagonalMonsters: HTMLImageElement;
  enemyDirections: HTMLImageElement; enemies: HTMLImageElement; fallen: HTMLImageElement;
  kommi: HTMLImageElement; soloriArmed: HTMLImageElement; kommiArmed: HTMLImageElement;
};
type OutpostAtlases = ActorAtlases & {
  outpost: HTMLImageElement; tiles: HTMLImageElement; mural: HTMLImageElement; gear: HTMLImageElement; setpieces: HTMLImageElement;
  armory: HTMLImageElement; hands: HTMLImageElement; devices: HTMLImageElement; dummy: HTMLImageElement;
};

const { width, height } = screen;
const FONT = '"Sketch Jua", "Malgun Gothic", sans-serif';
const ICE = '#87e5f6', AMBER = '#ffd48b';
const PAD = spriteCellSize;
const sizes = { solori: 49, kommi: 52, mite: 43, boar: 61, scout: 43, sentinel: 53, spore: 43, grub: 51 } as const;
const explorerRows = [0, 1, 2, 1, 0, 3, 4, 3] as const;
const cuffPixels = {
  solori: [[[74, 94], [91, 91]], [[65, 94], [89, 92]], [[47, 93], [81, 92]], [[83, 82], [99, 79]], [[38, 86], [89, 86]]],
  kommi: [[[81, 88], [107, 86]], [[76, 90], [105, 86]], [[60, 88], [94, 88]], [[101, 81], [109, 77]], [[38, 77], [91, 78]]],
} as const;
const newKinds = ['scout', 'sentinel', 'spore', 'grub'] as const;
type RangedEnemy = 'scout' | 'sentinel';
const enemyMuzzleTips = {
  scout: [[.286, .17], [.25, .19], [.025, .235], [.25, .19], [.286, .17], [.26, .025], [.045, -.10], [.26, .025]],
  sentinel: [[.34, .055], [.24, .12], [.12, .16], [.24, .12], [.34, .055], [.24, -.015], [-.10, -.02], [.24, -.015]],
} as const;
export const restartArea = { x: 179, y: 157, width: 122, height: 29 };

function sprite(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, row: number, frame: number, x: number, y: number, w: number, h = w) {
  let left = x - w / 2, top = y - h / 2;
  const transform = ctx.getTransform();
  if (!ctx.imageSmoothingEnabled && !transform.b && !transform.c) {
    left = (Math.round(left * transform.a + transform.e) - transform.e) / transform.a;
    top = (Math.round(top * transform.d + transform.f) - transform.f) / transform.d;
    w = Math.max(1, Math.round(w * Math.abs(transform.a))) / Math.abs(transform.a);
    h = Math.max(1, Math.round(h * Math.abs(transform.d))) / Math.abs(transform.d);
  }
  ctx.drawImage(atlas, frame * PAD, row * PAD, PAD, PAD, left, top, w, h);
}

function projectedGun(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, row: number, frame: number,
  center: number, size: number, pose: BarrelProjection) {
  if (Math.abs(pose.depthPerPixel) < .00005) {
    sprite(ctx, atlas, row, frame, center * pose.scale, 0, size * pose.scale, size);
    return;
  }
  const stripWidth = 8, left = center - size / 2;
  for (let offset = 0; offset < PAD; offset += stripWidth) {
    const start = left + size * offset / PAD, end = start + size * stripWidth / PAD;
    const { x } = projectBarrelPoint(pose, start, 0), right = projectBarrelPoint(pose, end, 0).x;
    const halfHeight = projectBarrelPoint(pose, (start + end) / 2, size / 2).y;
    // A fraction of one output pixel closes raster seams between rotated strips.
    const overlap = offset + stripWidth < PAD ? .14 : 0;
    ctx.drawImage(atlas, frame * PAD + offset, row * PAD, stripWidth, PAD, x, -halfHeight, right - x + overlap, halfHeight * 2);
  }
}

function makeOutliner() {
  const cache = new WeakMap<CanvasImageSource, Map<number, { edge: HTMLCanvasElement; tinted: HTMLCanvasElement }>>();
  return (ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, row: number, frame: number, x: number, y: number, size: number) => {
    let frames = cache.get(atlas);
    if (!frames) { frames = new Map(); cache.set(atlas, frames); }
    const label = row * 16 + frame;
    let variants = frames.get(label);
    if (!variants) {
      const mask = surface(PAD, PAD);
      sprite(mask, atlas, row, frame, PAD / 2, PAD / 2, PAD);
      const tint = surface(PAD, PAD);
      tint.drawImage(mask.canvas, 0, 0);
      tint.globalCompositeOperation = 'source-atop';
      tint.fillStyle = '#ffe27c32'; tint.fillRect(0, 0, PAD, PAD);
      mask.globalCompositeOperation = 'source-in';
      mask.fillStyle = '#ffe27c'; mask.fillRect(0, 0, PAD, PAD);
      variants = { edge: mask.canvas, tinted: tint.canvas };
      frames.set(label, variants);
    }
    const radius = 2;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) {
      ctx.drawImage(variants.edge, x - size / 2 + dx * radius, y - size / 2 + dy * radius, size, size);
    }
    ctx.drawImage(variants.tinted, x - size / 2, y - size / 2, size, size);
  };
}

const cellMeasurements = new WeakMap<CanvasImageSource, Map<number, { width: number; height: number }>>();
let sampleCell: CanvasRenderingContext2D | undefined;

function silhouette(atlas: CanvasImageSource, row: number, frame: number) {
  let cells = cellMeasurements.get(atlas);
  if (!cells) { cells = new Map(); cellMeasurements.set(atlas, cells); }
  const key = row * 16 + frame;
  const measured = cells.get(key);
  if (measured !== undefined) return measured;
  const sample = sampleCell ??= surface(PAD, PAD, true);
  sample.clearRect(0, 0, PAD, PAD);
  sample.drawImage(atlas, frame * PAD, row * PAD, PAD, PAD, 0, 0, PAD, PAD);
  const { data } = sample.getImageData(0, 0, PAD, PAD);
  let left = PAD, top = PAD, right = 0, bottom = 0;
  for (let y = 0; y < PAD; y++) for (let x = 0; x < PAD; x++) {
    if (data[(y * PAD + x) * 4 + 3] < 128) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const bounds = { width: Math.max(1, right - left + 1), height: Math.max(1, bottom - top + 1) };
  cells.set(key, bounds);
  return bounds;
}

function normalizedEnemyScale(atlases: ActorAtlases, species: number, atlas: CanvasImageSource, row: number, frame: number, squash: number) {
  const reference = silhouette(species < 2 ? atlases.crew : atlases.enemies, species < 2 ? species + 1 : species - 2, 0);
  const span = Math.max(reference.width, reference.height);
  const pose = silhouette(atlas, row, frame);
  return { span, scale: span / Math.max(pose.width, pose.height * squash) };
}

function enemyMuzzle(atlases: ActorAtlases, point: Point, kind: RangedEnemy, heading: number) {
  const direction = Math.round(heading / (Math.PI / 4)) & 7;
  const vertical = direction === 2 || direction === 6, diagonal = direction % 2 === 1;
  const directional = vertical || diagonal;
  const row = newKinds.indexOf(kind), squash = directional ? .86 : 1;
  const atlas = directional ? atlases.enemyDirections : atlases.enemies;
  const frame = directional ? (diagonal ? 2 : 0) + Number(direction >= 5) : 3;
  const { scale } = normalizedEnemyScale(atlases, row + 2, atlas, row, frame, squash);
  const size = sizes[kind] * scale, lift = size * .42 * squash;
  const [x, y] = enemyMuzzleTips[kind][direction];
  const ground = { x: point.x + x * size * (direction >= 3 && direction <= 5 ? -1 : 1), y: point.y + y * size * squash };
  return { ground, muzzle: { x: ground.x, y: ground.y - lift }, lift };
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color = '#effaff', align: CanvasTextAlign = 'left') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, stroke = '#31586a') {
  ctx.beginPath();
  ctx.moveTo(x + 5, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 5);
  ctx.lineTo(x + w - 5, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + 5);
  ctx.closePath();
  ctx.fillStyle = '#061626ee'; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
}

function polyline(ctx: CanvasRenderingContext2D, path: Point[]) {
  ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
  for (const point of path.slice(1)) ctx.lineTo(point.x, point.y);
}

function buildTerrain(mural: HTMLImageElement, tiles: HTMLImageElement) {
  const density = 2;
  const land = surface(world.width * density, world.height * density);
  land.scale(density, density);
  land.drawImage(mural, 0, 0, world.width, world.height);
  const detail = surface(world.width * density, world.height * density);
  detail.scale(density, density);
  const tileSource = tiles.naturalHeight;
  floor.forEach((row, y) => row.forEach((open, x) => {
    if (!open) return;
    const dx = x * tileSize, dy = y * tileSize;
    const interior = isMetalFloor(x, y);
    detail.save();
    detail.translate(dx + tileSize / 2, dy + tileSize / 2);
    if (!interior) detail.scale(x % 2 ? -1 : 1, y % 2 ? -1 : 1);
    detail.drawImage(tiles, interior ? tileSource : 0, 0, tileSource, tileSource, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
    detail.restore();
  }));
  detail.globalCompositeOperation = 'destination-out';
  floor.forEach((row, y) => row.forEach((open, x) => {
    if (!open) return;
    const dx = x * tileSize, dy = y * tileSize;
    const edges = [
      [floor[y]?.[x - 1], dx, dy, 1, 0], [floor[y]?.[x + 1], dx + tileSize, dy, -1, 0],
      [floor[y - 1]?.[x], dx, dy, 0, 1], [floor[y + 1]?.[x], dx, dy + tileSize, 0, -1],
    ] as const;
    for (const [adjacent, startX, startY, vx, vy] of edges) {
      if (adjacent) continue;
      const feather = 21;
      const fade = detail.createLinearGradient(startX, startY, startX + vx * feather, startY + vy * feather);
      fade.addColorStop(0, '#000'); fade.addColorStop(1, '#0000');
      detail.fillStyle = fade; detail.fillRect(dx, dy, tileSize, tileSize);
    }
  }));
  land.globalAlpha = .48; land.drawImage(detail.canvas, 0, 0, world.width, world.height); land.globalAlpha = 1;
  detail.canvas.width = 0;
  land.lineJoin = 'round';
  for (const [index, cable] of cables.entries()) {
    for (const [lineWidth, color] of [[7, '#131e2f'], [4, '#244350'], [1, index < 2 ? '#609e9a' : '#806c51']] as const) {
      polyline(land, cable); land.lineWidth = lineWidth; land.strokeStyle = color; land.stroke();
    }
    for (let i = 1; i < cable.length; i++) {
      const a = cable[i - 1], b = cable[i];
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      for (let step = 29; step < length - 13; step += 65) {
        const marker = onRay(a, heading, step);
        land.save(); land.translate(Math.round(marker.x), Math.round(marker.y)); land.rotate(heading);
        land.fillStyle = '#a0d2c491'; land.fillRect(-3, -6, 3, 12);
        land.restore();
      }
    }
  }
  return land.canvas;
}

function actorPose(atlases: ActorAtlases, actor: ActorArt, time: number, animation?: { walk?: number; roll?: Frame['roll']; armed?: boolean }) {
  const kind = actor.kind;
  const size = sizes[kind];
  const heading = animation?.roll?.heading ?? actor.aim;
  const direction = Math.round(heading / (Math.PI / 4)) & 7;
  const vertical = direction === 2 || direction === 6;
  const diagonal = direction % 2 === 1;
  const north = direction >= 5 ? 1 : 0;
  const flip = direction >= 3 && direction <= 5;
  const moving = actor.stride > .17;
  let atlas = atlases.crew, row = 0, frame = actor.pose ?? 0;
  let squash = 1, tint = actor.hit > 0 ? 1.6 : 1;
  const strideFrame = Math.floor((actor.poseTime ?? time) * 9) % 2;
  const roll = animation?.roll;
  const walk = animation?.walk;
  if (animation?.armed && (kind === 'solori' || kind === 'kommi')) {
    atlas = kind === 'solori' ? atlases.soloriArmed : atlases.kommiArmed;
    row = explorerRows[direction];
    frame = walk === undefined || walk % 3 === 0 ? 0 : walk < 3 ? 1 : 2;
  } else if (kind === 'solori') {
    if (diagonal) {
      atlas = atlases.diagonalSolori; row = north + (roll ? 2 : 0);
      frame = roll ? [0, 1, 1, 2, 2, 3][roll.frame] : actor.pose ? 3 : walk === undefined ? 0 : [0, 1, 1, 0, 2, 2][walk];
    } else if (vertical) {
      atlas = atlases.verticalSolori;
      row = north + (roll ? 2 : 0);
      frame = roll?.frame ?? (actor.pose ? 5 : walk === undefined ? 0 : [1, 2, 2, 3, 4, 4][walk]);
    } else if (roll || (!actor.pose && walk !== undefined)) {
      atlas = atlases.locomotion;
      row = roll ? 1 : 0;
      frame = roll?.frame ?? walk ?? 0;
    }
  } else if (kind === 'kommi') {
    atlas = atlases.kommi;
    row = explorerRows[direction];
    frame = roll ? 3 : walk !== undefined ? (walk < 3 ? 1 : 2) : moving ? 1 + strideFrame : 0;
    if (actor.pose && !roll) squash = .88;
  } else if (kind === 'mite' || kind === 'boar') {
    const species = kind === 'mite' ? 0 : 1;
    atlas = diagonal ? atlases.diagonalMonsters : vertical ? atlases.verticalMonsters : atlases.crew;
    row = diagonal || vertical ? species * 2 + north : species + 1;
    frame = actor.pose ?? (moving ? (kind === 'boar' && !diagonal ? 0 : 1) + strideFrame : 0);
  } else {
    row = newKinds.indexOf(kind);
    atlas = atlases.enemies;
    frame = actor.pose ?? (moving ? strideFrame + 1 : 0);
    if (diagonal || vertical) {
      atlas = atlases.enemyDirections;
      frame = (diagonal ? 2 : 0) + north;
      if (actor.pose) { squash = .86; tint *= 1.18; }
    }
  }
  let artScale = 1;
  if (kind !== 'solori' && kind !== 'kommi') {
    const species = kind === 'mite' ? 0 : kind === 'boar' ? 1 : 2 + newKinds.indexOf(kind);
    const { span, scale } = normalizedEnemyScale(atlases, species, atlas, row, frame, squash);
    artScale = scale;
    if (actor.fallen !== undefined) {
      const widest = Math.max(...[0, 1, 2, 3].map(i => {
        const measure = silhouette(atlases.fallen, species, i);
        return Math.max(measure.width, measure.height);
      }));
      artScale = Math.min(1, span / widest);
      atlas = atlases.fallen; row = species;
      frame = Math.min(3, Math.floor(actor.fallen / balance.fallen.collapse * 4));
      squash = 1; tint = 1;
    }
  }
  const steady = (kind === 'scout' || kind === 'sentinel') && actor.pose === 3;
  const lift = steady || roll || walk !== undefined || actor.fallen !== undefined ? 0 : moving ? Math.abs(Math.sin(time * 15)) * 2 : Math.sin(time * 4) * .65;
  const anchor = kind === 'mite' ? 15 : size * .42;
  const angle = kind === 'kommi' && roll ? Math.sin((roll.frame + .5) / 6 * Math.PI) * .36 : 0;
  const groundRatio = kind === 'solori' || kind === 'kommi'
    ? explorerGroundRatio[kind][roll && (kind === 'kommi' || roll.frame < 5) ? 'roll' : 'upright']
    : enemyGroundRatio[kind][actor.fallen === undefined ? 'upright' : 'falling'];
  return { atlas, row, frame, size: size * artScale, anchor: anchor * artScale, lift, flip, squash, angle, tint, groundRatio };
}

type ActorPose = ReturnType<typeof actorPose>;

function actorCenter(actor: ActorArt, pose: ActorPose) {
  return { x: actor.x + Math.sin(pose.angle) * pose.anchor * (pose.flip ? -1 : 1),
    y: actor.y - pose.lift - Math.cos(pose.angle) * pose.anchor * pose.squash };
}

function drawActor(ctx: CanvasRenderingContext2D, actor: ActorArt, pose: ActorPose, light = 1) {
  const center = actorCenter(actor, pose);
  ctx.save(); ctx.translate(center.x, center.y);
  ctx.scale(pose.flip ? -1 : 1, pose.squash);
  if (pose.angle) ctx.rotate(pose.angle);
  ctx.globalAlpha *= corpseOpacity(actor);
  const tint = pose.tint * light;
  if (tint !== 1) ctx.filter = `brightness(${tint})`;
  sprite(ctx, pose.atlas, pose.row, pose.frame, 0, 0, pose.size);
  ctx.restore();
}

function drawActorShadow(shadows: SpriteShadows, actor: ActorArt, pose: ActorPose, alpha = 1) {
  const facing = pose.flip ? -1 : 1;
  const lyingDown = actor.fallen !== undefined && pose.frame >= 2;
  shadows.sprite(pose.atlas, actorCenter(actor, pose), pose.size, [pose.row, pose.frame], {
    angle: pose.angle, scaleX: facing, scaleY: pose.squash, scaleInScreenAxes: true, flat: lyingDown,
    opacity: .7 * alpha * corpseOpacity(actor), groundRatio: pose.groundRatio,
  });
}

function corpseOpacity(actor: ActorArt) {
  const { duration, collapse } = balance.fallen;
  return actor.fallen === undefined ? 1 : Math.max(0, Math.min(1, (duration - actor.fallen) / (duration - collapse)));
}

function drawHealth(ctx: CanvasRenderingContext2D, player: Point, hp: number) {
  const x = player.x - 17, y = player.y + 10;
  ctx.fillStyle = '#091728'; ctx.fillRect(x, y, 34, 6);
  ctx.fillStyle = '#435971'; ctx.fillRect(x + 1, y + 1, 32, 4);
  ctx.fillStyle = hp > 28 ? '#86ddbf' : '#ff937a';
  ctx.fillRect(x + 1, y + 1, Math.round(32 * hp / balance.player.health), 4);
}

function gunPose(atlases: OutpostAtlases, frame: Frame) {
  const { player, reload, swapping, slash } = frame;
  const gun = frame.guns[swapping && swapping.progress >= .5 ? swapping.to : frame.selected];
  const stats = weapons[gun.weapon];
  const lean = slash || reload === undefined ? 0 : Math.sin(reload * Math.PI);
  const bob = player.stride > .17 ? Math.sin(frame.time * 17) * .85 : 0;
  const drawn = swapping ? Math.abs(1 - swapping.progress * 2) : 1;
  const swing = slash ? -knife.arc * 1.35 + (1 - (1 - slash.progress) ** 2) * knife.arc * 2.8 : 0;
  const [atlas, row, cell] = slash ? [atlases.armory, ...knife.cell] as const : inventoryArt(atlases, gun.weapon);
  const size = slash ? 28 : gunArt[gun.weapon].size;
  const age = frame.actionTime - gun.firedAt;
  const pose = heldPose(player, player.aim, gun.weapon, slash ? Infinity : age, lean, drawn, bob);
  const projection = slash ? { ...yawProjection(player.aim + swing), depthPerPixel: 0 } : pose;
  const center = slash ? size * .29 + 3 : pose.center;
  return { atlas, row, cell, size, pose, projection, drawn, stats, center, weapon: gun.weapon };
}

function drawGun(ctx: CanvasRenderingContext2D, frame: Frame, art: ReturnType<typeof gunPose>) {
  const { reload, slash } = frame;
  const { atlas, row, cell, size, pose, projection, drawn, stats, center } = art;
  ctx.save();
  ctx.globalAlpha = drawn;
  ctx.translate(pose.mount.x, pose.mount.y);
  ctx.rotate(projection.angle); ctx.scale(1, pose.side);
  projectedGun(ctx, atlas, row, cell, center, size, projection);
  if (!slash && stats.mode === 'ballistic' && pose.recoil > .35) {
    ctx.globalAlpha *= Math.min(1, pose.recoil * 1.15);
    const receiver = pose.center - size * .15 - pose.recoil * 1.65;
    const point = projectBarrelPoint(pose, receiver, -2);
    ctx.fillStyle = '#241d26'; ctx.fillRect(point.x, point.y, Math.max(2, size * .13) * pose.scale, 2.5);
    ctx.fillStyle = stats.color; ctx.fillRect(point.x + .7, point.y + .6, Math.max(1, size * .065) * pose.scale, .9);
    ctx.globalAlpha = drawn;
  }
  if (!slash && reload !== undefined && reload > .17 && reload < .78) {
    const eject = (reload - .17) / .37;
    const outgoing = eject < 1;
    const travel = outgoing ? Math.min(1, eject * 1.3) : Math.max(0, 1 - (reload - .54) / .24);
    const point = projectBarrelPoint(pose, 9 - travel * 6, 4 + travel * 12);
    ctx.translate(point.x, point.y); ctx.rotate(travel * (outgoing ? -.8 : .4));
    ctx.globalAlpha = outgoing ? 1 - travel * .75 : 1;
    ctx.fillStyle = '#243340'; ctx.fillRect(-2, -1, 4, 8);
    ctx.fillStyle = outgoing ? '#8c9ca4' : stats.color; ctx.fillRect(-1, 0, 2, 5);
  }
  ctx.restore();
}

function drawArmedPlayer(ctx: CanvasRenderingContext2D, frame: Frame, body: ActorPose, weapon: ReturnType<typeof gunPose>, hands: HTMLImageElement) {
  const { player, slash } = frame;
  const { size, pose, projection, center } = weapon;
  const bodyPoint = actorCenter(player, body);
  const cuffs = cuffPixels[player.kind][body.row as 0 | 1 | 2 | 3 | 4].map(([x, y]) => ({
    x: bodyPoint.x + (x - PAD / 2) * body.size / PAD * (body.flip ? -1 : 1),
    y: bodyPoint.y + (y - PAD / 2) * body.size / PAD,
  }));
  const gripPoint = ([x, y]: readonly [number, number]) => {
    const local = projectBarrelPoint(projection, center + (x - PAD / 2) * size / PAD, (y - PAD / 2) * size / PAD * pose.side);
    return onRay(onRay(pose.mount, projection.angle, local.x), projection.angle + Math.PI / 2, local.y);
  };
  const main = gripPoint(slash ? [28, 64] : gunArt[weapon.weapon].grip);
  const other = gripPoint(slash ? [4, 67] : gunArt[weapon.weapon].support);
  const switchHands = distance(cuffs[1], main) + distance(cuffs[0], other) < distance(cuffs[0], main) + distance(cuffs[1], other);
  const wrist = cuffs[switchHands ? 1 : 0], farWrist = cuffs[switchHands ? 0 : 1];
  const support = slash ? onRay(farWrist, Math.PI / 2, 3.4) : other;
  const handCell = (player.kind === 'kommi' ? 1 : 0) * PAD;

  function arm(from: Point, to: Point, thickness: number) {
    const reach = distance(from, to);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const seam = Math.max(.5, reach - thickness * .42);
    ctx.save(); ctx.translate(from.x, from.y); ctx.rotate(angle);
    // Stretch the sleeve to meet the grip while preserving the hand proportions.
    ctx.drawImage(hands, handCell + 8, 24, 37, 80, -1.5, -thickness / 2, seam + 1.5, thickness);
    ctx.drawImage(hands, handCell + 45, 24, 75, 80, seam, -thickness / 2, thickness * .94, thickness);
    ctx.restore();
  }

  arm(farWrist, support, 6.2);
  drawGun(ctx, frame, weapon);
  arm(wrist, main, 7);
}

function drawSlash(ctx: CanvasRenderingContext2D, frame: Frame) {
  if (!frame.slash) return;
  const { heading, progress } = frame.slash;
  const trail = progress - knife.windup / knife.duration;
  if (trail < 0 || trail > .56) return;
  const { x, y } = frame.player;
  const radius = 32 + Math.min(1, trail * 3) * 10;
  const angle = heading - knife.arc + Math.min(1, trail * 3.6) * knife.arc * 2;
  ctx.save();
  ctx.globalAlpha = (1 - trail / .56) * .8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(x, y - 5, radius - i * 3, heading - knife.arc, angle);
    ctx.strokeStyle = i === 0 ? '#e3fff9' : '#61eedd';
    ctx.lineWidth = i === 0 ? 2 : 1;
    ctx.stroke();
  }
  ctx.restore();
}

function inventoryArt(atlases: OutpostAtlases, weapon: Weapon): [HTMLImageElement, number, number] {
  if (weapon === 'medical') return [atlases.devices, 1, 0];
  const [row, cell] = weapons[weapon].cell;
  return [row === 0 ? atlases.gear : atlases.armory, 0, cell];
}

function propSprite(prop: PropArt) {
  const crate = prop.kind === 'crate';
  return { x: prop.x, y: prop.y - (crate ? 7 : 14), size: crate ? 42 : 41, cell: [crate ? 0 : 1, crate ? 3 : 2] as const };
}

function drawProp(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, prop: PropArt, light: number) {
  const { x, y, size, cell } = propSprite(prop);
  ctx.save();
  ctx.filter = `brightness(${prop.hit > 0 ? Math.min(1.54, light * 1.9) : light})`;
  sprite(ctx, atlas, ...cell, x, y, size);
  ctx.restore();
}

function drawPropHealth(ctx: CanvasRenderingContext2D, prop: PropArt, camera: Box) {
  if (prop.health === 1) return;
  const { x, y } = projectToScreen(prop, camera);
  ctx.fillStyle = '#141e2cb0'; ctx.fillRect(x - 10, y + 8, 20, 3);
  ctx.fillStyle = prop.kind === 'crate' ? '#eeb584' : '#acecfa'; ctx.fillRect(x - 10, y + 8, Math.round(20 * prop.health), 2);
}

function drawMap(ctx: CanvasRenderingContext2D, frame: Frame, camera: Box, wasSeen: (point: Point) => boolean) {
  const overlay = frame.mapMode === 'overlay';
  ctx.save();
  if (overlay) ctx.globalAlpha = .20;
  else {
    ctx.fillStyle = '#020b1dad'; ctx.fillRect(0, 0, width, height);
    panel(ctx, 95, 23, 290, 225);
    text(ctx, '지표 중계소 · 지형도', 109, 39, 13);
  }
  const scale = overlay ? .205 : Math.min(260 / world.width, 177 / world.height);
  const anchor = projectToScreen(frame.player, camera);
  const x = overlay ? anchor.x - frame.player.x * scale : (width - world.width * scale) / 2;
  const y = overlay ? anchor.y - frame.player.y * scale : 55;
  floor.forEach((row, r) => row.forEach((open, c) => {
    if (!open || !wasSeen({ x: (c + .5) * tileSize, y: (r + .5) * tileSize })) return;
    ctx.fillStyle = overlay ? '#96dbf3' : '#254b62';
    ctx.fillRect(x + c * tileSize * scale, y + r * tileSize * scale, tileSize * scale, tileSize * scale);
  }));
  const project = (point: Point) => ({ x: x + point.x * scale, y: y + point.y * scale });
  ctx.strokeStyle = overlay ? '#ffe4b4' : '#eac395';
  ctx.lineWidth = overlay ? 1.45 : 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const edge of mapWallEdges) {
    if (!wasSeen(edge.face)) continue;
    const from = project(edge.from), to = project(edge.to);
    ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();
  if (frame.gateTravel < 1) {
    ctx.strokeStyle = '#ff9779';
    ctx.beginPath();
    for (let y0 = gate.y; y0 < gate.y + gate.height; y0 += 16) {
      const y1 = Math.min(y0 + 12, gate.y + gate.height);
      const faceY = (y0 + y1) / 2;
      if (!wasSeen({ x: gate.x + 1, y: faceY }) && !wasSeen({ x: gate.x + gate.width - 1, y: faceY })) continue;
      const top = project({ x: gateCenter.x, y: y0 }), bottom = project({ x: gateCenter.x, y: y1 });
      ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y);
    }
    ctx.stroke();
  }
  const markers: [Point, string, string][] = [[frame.player, explorerNames[frame.player.kind], '#ffb46b']];
  if (frame.ally && frame.ally.hp > 0) markers.push([frame.ally, explorerNames[frame.ally.kind], '#9ef3c4']);
  markers.push([landing, '착륙대', ICE], [relay, '발전기', AMBER], [lift, '승강기', ICE]);
  for (const point of frame.supplies) markers.push([point, '보급품', '#9ef3c4']);
  const labels: Box[] = [];
  ctx.font = `8px ${FONT}`;
  for (const [point, label, color] of markers) {
    if (point !== frame.player && !wasSeen(point)) continue;
    const pos = project(point);
    ctx.fillStyle = color; ctx.fillRect(pos.x - 2.5, pos.y - 2.5, 5, 5);
    if (overlay) continue;
    const breadth = ctx.measureText(label).width + 4;
    const options = point === frame.player ? [12, -9, 21, -18] : [-9, 12, -18, 21];
    for (const offset of options) {
      const labelY = pos.y + offset, left = pos.x - breadth / 2;
      if (labelY < 49 || labelY > 225 || labels.some(box => Math.abs(box.y - labelY) < 9 &&
        left < box.x + box.width && left + breadth > box.x)) continue;
      labels.push({ x: left, y: labelY, width: breadth, height: 9 });
      text(ctx, label, pos.x, labelY, 8, color, 'center');
      break;
    }
  }
  if (!overlay) {
    text(ctx, '실선 벽 · 빈 공간 미탐험', 109, 236, 9, '#eac395');
    text(ctx, 'TAB · 오버레이', 371, 236, 9, '#89aebf', 'right');
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, frame: Frame, camera: Box, atlases: OutpostAtlases, wasSeen: (point: Point) => boolean) {
  const powered = frame.phase === 'evacuate' || frame.phase === 'cleared';
  panel(ctx, 9, 9, 132, 23);
  text(ctx, '1-1', 17, 20, 12, ICE); text(ctx, '지표 중계소', 43, 20, 14);
  const lamp = frame.flashlightOn ? '#a1eced' : '#7895a3';
  panel(ctx, 145, 9, 40, 23, frame.flashlightOn ? '#53868e' : '#31586a');
  text(ctx, 'F', 151, 20.5, 10, lamp);
  ctx.fillStyle = lamp; ctx.fillRect(162, 19, 6, 4);
  if (frame.flashlightOn) {
    ctx.beginPath(); ctx.moveTo(168, 20); ctx.lineTo(179, 15); ctx.lineTo(179, 26); ctx.lineTo(168, 22);
    ctx.closePath(); ctx.fillStyle = '#a1eced8c'; ctx.fill();
  }
  let effectX = 9;
  for (const status of frame.player.statuses ?? []) {
    const spec = statusSpecs[status.kind];
    panel(ctx, effectX, 37, 56, 16, spec.color);
    text(ctx, `${spec.name} ${status.level} · ${Math.ceil(status.until - frame.time)}초`, effectX + 4, 45, 8, spec.color);
    effectX += 59;
  }

  panel(ctx, 312, 9, 159, frame.phase === 'defense' ? 47 : 38);
  text(ctx, '복구 임무', 324, 19, 9, '#9ab9ca');
  const goal = powered ? '지하 관측소행 승강기로 이동' : frame.phase === 'defense' ? '전력 복구 중 · 발전기 방어' : '중앙 발전기의 회로 복구';
  text(ctx, goal, 324, 33, 12, powered ? '#92ecc9' : '#f4fbfb');
  if (frame.phase === 'defense') {
    ctx.fillStyle = '#263f51'; ctx.fillRect(324, 46, 135, 3);
    ctx.fillStyle = AMBER; ctx.fillRect(324, 46, Math.round(135 * frame.charge), 3);
  }

  for (const [i, kind] of supportKinds.entries()) {
    const x = 9 + i * 71, y = height - 43;
    const selected = frame.support.selected === kind;
    const spec = supportSpecs[kind];
    panel(ctx, x, y, 68, 33, selected ? '#8ee4c9' : '#31586a');
    sprite(ctx, atlases.armory, 1, i, x + 14, y + 14, 19);
    text(ctx, `${i + 1} ${spec.name}`, x + 26, y + 10, 8, selected ? '#c4f8e8' : '#e5f1f6');
    const status = kind === 'flare' ? `×${frame.support.stock}` : kind === 'drone' ?
      `${Math.ceil(frame.support.battery / supportSpecs.drone.duration * 100)}%` :
      frame.turretDeploy ? `설치 ${Math.floor(frame.turretDeploy.progress * 100)}%` :
      frame.support.turret ? '설치됨' : `${frame.support.turretAmmo.ammo} · ${frame.support.turretAmmo.spare}`;
    text(ctx, status, x + 26, y + 22, 8, '#a5c7d4');
  }
  for (const [index, slot] of slots.entries()) {
    const gun = frame.guns[slot], stats = weapons[gun.weapon];
    const x = 227 + index * 125, y = height - 43;
    panel(ctx, x, y, 119, 33, (frame.swapping?.to ?? frame.selected) === slot ? stats.color : '#31586a');
    const [atlas, row, cell] = inventoryArt(atlases, gun.weapon);
    sprite(ctx, atlas, row, cell, x + 15, y + 14, 21);
    text(ctx, index === 0 ? '좌' : '우', x + 15, y + 27, 7, '#a5bbc6', 'center');
    text(ctx, stats.name, x + 29, y + 11, 10, stats.color);
    text(ctx, `예비 ${gun.spare}`, x + 112, y + 11, 7, '#9ebccb', 'right');
    if (frame.swapping?.to === slot) {
      text(ctx, '전환 중', x + 29, y + 23, 8, '#cfe3ef');
      ctx.fillStyle = stats.color; ctx.fillRect(x + 61, y + 23, 47 * frame.swapping.progress, 2);
    } else if (gun.reloadAt !== undefined) {
      const progress = (frame.actionTime - gun.reloadAt) / stats.reload;
      text(ctx, '재장전', x + 29, y + 23, 8, '#cfe3ef');
      ctx.fillStyle = '#26495d'; ctx.fillRect(x + 59, y + 23, 49, 3);
      ctx.fillStyle = stats.color; ctx.fillRect(x + 59, y + 23, Math.round(49 * progress), 3);
    } else {
      const gap = Math.min(7, 79 / stats.capacity);
      for (let i = 0; i < stats.capacity; i++) {
        ctx.fillStyle = i < gun.ammo ? stats.color : '#26495d'; ctx.fillRect(x + 30 + i * gap, y + 19, gap * .59, 7);
      }
    }
  }

  if (frame.mapMode !== 'off') drawMap(ctx, frame, camera, wasSeen);
  if (frame.phase !== 'cleared' && frame.phase !== 'defeated') return;
  ctx.fillStyle = '#01091cc9'; ctx.fillRect(0, 0, width, height);
  panel(ctx, 112, 65, 256, 134, frame.phase === 'cleared' ? '#95dfcc' : '#be766f');
  text(ctx, '별길 탐사대  /  1-1', 240, 85, 11, ICE, 'center');
  text(ctx, frame.phase === 'cleared' ? '중계소 탈환 완료!' : '탐사 종료', 240, 106, 23, '#ffffff', 'center');
  text(ctx, `${Math.floor(frame.time)}초  ·  퇴치 ${frame.defeated}마리`, 240, 134, 12, '#b8d6e2', 'center');
  const { x, y, width: w, height: h } = restartArea;
  panel(ctx, x, y, w, h, '#7bd2dd'); text(ctx, '다시 탐사   ↵', x + w / 2, y + h / 2, 13, ICE, 'center');
}

function drawBallistics(ctx: CanvasRenderingContext2D, frame: Frame) {
  for (const bullet of frame.bullets) {
    const head = { x: bullet.x, y: bullet.y - bullet.lift };
    const trail = onRay(head, bullet.heading + Math.PI, Math.min(bullet.traveled, 21));
    const streak = ctx.createLinearGradient(trail.x, trail.y, head.x, head.y);
    streak.addColorStop(0, '#f5b75c00'); streak.addColorStop(.38, '#f5b75c62'); streak.addColorStop(1, '#ffe1ad');
    ctx.lineWidth = 1.65; ctx.strokeStyle = streak;
    polyline(ctx, [trail, head]); ctx.stroke();
    const rear = onRay(head, bullet.heading + Math.PI, Math.min(bullet.traveled, 2.8));
    ctx.lineWidth = 1.65; ctx.strokeStyle = bullet.impact.color;
    polyline(ctx, [rear, head]); ctx.stroke();
    if (bullet.traveled < 2.8) {
      ctx.fillStyle = bullet.impact.color; ctx.fillRect(head.x - .75, head.y - .75, 1.5, 1.5);
    }
  }
  for (const piece of frame.spentMetal) {
    const casing = piece.kind === 'case';
    ctx.save();
    ctx.globalAlpha = Math.min(1, (2.4 - piece.age) * 2);
    ctx.translate(Math.round(piece.x), Math.round(piece.y - piece.z)); ctx.rotate(piece.angle);
    ctx.fillStyle = casing ? '#bd8950' : '#a99a89'; ctx.fillRect(-1, -1, casing ? 4 : 3, 2);
    ctx.fillStyle = casing ? '#f1cb85' : '#d3c9b0'; ctx.fillRect(-1, -1, casing ? 3 : 2, 1);
    ctx.restore();
  }
}

function drawSupport(ctx: CanvasRenderingContext2D, frame: Frame, atlases: OutpostAtlases,
  visible: (point: Point) => boolean, outline: ReturnType<typeof makeOutliner>) {
  const preview = frame.turretDeploy;
  if (preview) {
    const { point, heading, progress, valid } = preview;
    const pose = supportPose(point, heading, 'turret', frame.time, -Infinity);
    ctx.save();
    ctx.globalAlpha = .32 + progress * .25;
    if (!valid) ctx.filter = 'sepia(1) saturate(4) hue-rotate(306deg)';
    const base = turretBaseCenter(point);
    sprite(ctx, atlases.devices, 0, 0, base.x, base.y, turretArt.baseSize);
    drawTurretBarrel(ctx, atlases.devices, pose);
    ctx.restore();
    ctx.fillStyle = '#101d2c'; ctx.fillRect(point.x - 16, point.y + 7, 32, 5);
    ctx.fillStyle = '#435b64'; ctx.fillRect(point.x - 15, point.y + 8, 30, 3);
    ctx.fillStyle = valid ? '#a1f5ce' : '#ff9885'; ctx.fillRect(point.x - 15, point.y + 8, 30 * progress, 3);
  }
  for (const kind of ['turret', 'drone'] as const) {
    const unit = frame.support[kind];
    if (!unit || !visible(unit)) continue;
    const turret = kind === 'turret';
    const pose = supportPose(unit, unit.heading, kind, frame.time, unit.firedAt);
    ctx.save();
    if (unit.hitUntil > frame.time) ctx.filter = 'brightness(1.32) saturate(1.25)';
    if (turret) {
      const base = turretBaseCenter(unit);
      if (frame.selection?.kind === 'turret') outline(ctx, atlases.devices, 0, 0, base.x, base.y, turretArt.baseSize);
      else sprite(ctx, atlases.devices, 0, 0, base.x, base.y, turretArt.baseSize);
      drawTurretBarrel(ctx, atlases.devices, pose);
    } else {
      ctx.translate(pose.mount.x, pose.mount.y);
      ctx.rotate(pose.angle);
      ctx.scale(pose.scale, 1);
      ctx.translate(pose.center, 0);
      ctx.rotate(-Math.PI / 2);
      sprite(ctx, atlases.devices, 0, 2, 0, 0, 34);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 10.5, -1);
        ctx.rotate(side * frame.time * (frame.time < unit.readyAt ? 10 : 27));
        sprite(ctx, atlases.devices, 0, 3, 0, 0, 12);
        ctx.restore();
      }
      if (frame.time >= unit.readyAt) {
        const glow = ctx.createRadialGradient(0, 6.7, 1, 0, 6.7, 8);
        glow.addColorStop(0, '#c5fff787'); glow.addColorStop(1, '#82f3ff00');
        ctx.fillStyle = glow; ctx.fillRect(-8, -2, 16, 17);
      }
    }
    ctx.restore();
    if (unit.hp < supportSpecs[kind].health) {
      const y = unit.y + 6;
      ctx.fillStyle = '#111d2e'; ctx.fillRect(unit.x - 12, y, 24, 4);
      ctx.fillStyle = '#efb975'; ctx.fillRect(unit.x - 11, y + 1, 22 * unit.hp / supportSpecs[kind].health, 2);
    }
  }
  for (const flare of frame.support.flares) {
    const { base: point, lift, rotation, airborne } = flarePoseAt(flare, frame.time);
    if (!visible(point)) continue;
    ctx.save(); ctx.translate(point.x, point.y - 2 - lift);
    ctx.rotate(rotation);
    sprite(ctx, atlases.armory, 1, 2, 0, 0, 14);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 11 + Math.sin(frame.time * 9) * 2);
    glow.addColorStop(0, airborne ? '#eaffc9ec' : '#efffd7be'); glow.addColorStop(1, '#baffb500');
    ctx.fillStyle = glow; ctx.fillRect(-14, -14, 28, 28);
    ctx.restore();
  }
}

function drawSupportShadows(shadows: SpriteShadows, frame: Frame, atlases: OutpostAtlases, visible: (point: Point) => boolean) {
  const { turret, drone, flares } = frame.support;
  if (turret && visible(turret)) {
    const pose = supportPose(turret, turret.heading, 'turret', frame.time, turret.firedAt);
    shadows.attachedSprite(atlases.devices, {
      point: turretBaseCenter(turret), size: turretArt.baseSize, frame: [0, 0], socket: turretArt.baseSocket,
      pose: { groundRatio: fixtureGroundRatio.turretBase },
    }, {
      point: onRay(pose.mount, pose.angle, projectBarrelPoint(pose, pose.center, 0).x),
      size: turretArt.barrelSize, frame: [0, 1], socket: turretArt.barrelSocket,
      pose: { angle: pose.angle, scaleX: pose.scale, scaleY: .5, flat: true },
    });
  }
  if (drone && visible(drone)) {
    const pose = supportPose(drone, drone.heading, 'drone', frame.time, drone.firedAt);
    const angle = pose.angle - Math.PI / 2;
    const center = onRay(pose.mount, pose.angle, pose.center * pose.scale);
    shadows.sprite(atlases.devices, center, 34, [0, 2], { angle, scaleY: pose.scale, flat: true, elevation: pose.lift, opacity: .56 });
    for (const side of [-1, 1]) {
      const point = onRay(onRay(center, pose.angle, -pose.scale), angle, side * 10.5);
      shadows.sprite(atlases.devices, point, 12, [0, 3],
        { angle: angle + side * frame.time * (frame.time < drone.readyAt ? 10 : 27), flat: true, elevation: pose.lift, opacity: .42 });
    }
  }
  for (const flare of flares) {
    const pose = flarePoseAt(flare, frame.time);
    if (visible(pose.base)) shadows.sprite(atlases.armory, { x: pose.base.x, y: pose.base.y - 2 - pose.lift }, 14, [1, 2],
      { angle: pose.rotation, flat: true, elevation: pose.lift });
  }
}

function drawTurretBarrel(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, pose: ReturnType<typeof supportPose>) {
  ctx.save();
  ctx.translate(pose.mount.x, pose.mount.y);
  ctx.rotate(pose.angle); ctx.scale(1, .5);
  projectedGun(ctx, atlas, 0, 1, pose.center, turretArt.barrelSize, pose);
  ctx.restore();
}

const ballisticMuzzle = { reachScale: 2, intensityScale: 1.5 };

function drawMuzzleFlash(ctx: CanvasRenderingContext2D, flash: MuzzleLight) {
  const fade = flash.life / flash.duration;
  ctx.save();
  ctx.translate(flash.point.x, flash.point.y);
  const yaw = yawProjection(flash.heading);
  ctx.rotate(yaw.angle); ctx.scale(yaw.scale, 1);
  const reach = (flash.wide ? 23 : 16) * (1.11 - fade * .11);
  const spread = flash.wide ? 5.5 : 3;
  const glowRadius = reach * (flash.ballistic ? ballisticMuzzle.reachScale : 1);
  const glowStrength = fade * flash.strength * 1.6 * (flash.ballistic ? ballisticMuzzle.intensityScale : 1);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowRadius);
  glow.addColorStop(0, `rgba(${flash.color},${Math.min(1, glowStrength)})`);
  glow.addColorStop(1, `rgba(${flash.color},0)`);
  ctx.fillStyle = glow; ctx.fillRect(-glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);
  ctx.globalAlpha = Math.min(1, fade * 1.65);
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(4, -spread); ctx.lineTo(6, -spread * .35);
  ctx.lineTo(reach, -1); ctx.lineTo(7, 1); ctx.lineTo(4, spread); ctx.closePath();
  ctx.fillStyle = `rgba(${flash.color},.88)`; ctx.fill();
  ctx.fillStyle = '#fff3d5'; ctx.fillRect(-1, -1, 6, 2);
  ctx.restore();
}

function drawMedicalBeam(ctx: CanvasRenderingContext2D, frame: Frame) {
  const beam = frame.medicalBeam;
  if (!beam) return;
  const { player, time } = frame;
  const bob = player.stride > .17 ? Math.sin(time * 17) * .85 : 0;
  const source = heldPose(player, player.aim, 'medical', Infinity, 0, 1, bob).muzzle;
  const target = { x: beam.point.x, y: beam.point.y - (beam.self ? 17 : 13) };
  const heading = Math.atan2(target.y - source.y, target.x - source.x) - Math.PI / 2;
  const sway = Math.min(27, distance(source, target) * .36) * (.72 + Math.sin(time * 8) * .24);
  const lead = onRay(source, player.aim, beam.self ? 18 : Math.min(49, distance(source, target) * .55));
  const bend = onRay({ x: source.x + (target.x - source.x) * .7, y: source.y + (target.y - source.y) * .7 }, heading, sway);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(source.x, source.y);
  ctx.bezierCurveTo(lead.x, lead.y, bend.x, bend.y, target.x, target.y);
  const palette = beam.enemy ? ['#60aaff35', '#8adeffb8', '#e7fbff'] : ['#43e5a843', '#75ffccc8', '#e8fff3'];
  for (const [index, lineWidth] of [10, 4, 1.3].entries()) {
    ctx.lineWidth = lineWidth * (1 + Math.sin(time * 12) * .13);
    ctx.strokeStyle = palette[index]; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(target.x, target.y, 3 + Math.sin(time * 12), 0, Math.PI * 2);
  ctx.fillStyle = palette[1]; ctx.fill();
  ctx.restore();
}

function drawPulseTraces(ctx: CanvasRenderingContext2D, traces: readonly Trace[]) {
  ctx.save();
  for (const trace of traces) {
    ctx.globalAlpha = Math.min(1, trace.life / pulseLightDuration);
    const start = { x: trace.from.x, y: trace.from.y - trace.lift }, end = { x: trace.to.x, y: trace.to.y - trace.lift };
    polyline(ctx, [start, end]); ctx.lineWidth = 5.5; ctx.strokeStyle = `${trace.color}70`; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = trace.color; ctx.stroke();
    if (trace.hit) { ctx.fillStyle = '#fff4c8'; ctx.fillRect(end.x - 2, end.y - 2, 4, 4); }
  }
  ctx.restore();
}

function drawOverlay(ctx: CanvasRenderingContext2D, frame: Frame, camera: Box) {
  const playerOnScreen = projectToScreen(frame.player, camera);
  if (!frame.challenge && frame.mapMode !== 'panel' && frame.phase !== 'cleared' && frame.phase !== 'defeated') {
    const selection = frame.selection;
    if (selection?.kind === 'relay') {
      const { x, y: anchorY } = projectToScreen(relay, camera);
      const y = anchorY - 43;
      panel(ctx, x - 52, y - 9, 104, 18, '#ad9c75'); text(ctx, 'E  회로 퍼즐 열기', x, y, 10, AMBER, 'center');
    }
    if (selection?.kind === 'weapon') {
      const { x, y: anchorY } = projectToScreen(selection.point, camera);
      let y = anchorY - 22;
      if (frame.showHealth && Math.abs(y - playerOnScreen.y - 13) < 13) y = playerOnScreen.y + 35;
      panel(ctx, x - 65, y - 9, 130, 18, '#ad9c75'); text(ctx, `E  교체 · ${weapons[selection.point.gun.weapon].name}`, x, y, 10, AMBER, 'center');
    }
    if (selection?.kind === 'supply' || selection?.kind === 'turret' || selection?.kind === 'dummy') {
      const { x, y: anchorY } = projectToScreen(selection.point, camera);
      const y = anchorY - 40;
      panel(ctx, x - 54, y - 9, 108, 18, '#75bfaa');
      const label = selection.kind === 'turret' ? 'E 길게 · 포탑 회수' : selection.kind === 'dummy' ? 'E · 치료 대상 초기화' : 'E  체력·장비 보급';
      text(ctx, label, x, y, 10, '#adf5d1', 'center');
      if (selection.kind === 'turret' && frame.turretHold) {
        ctx.fillStyle = '#9eeac9'; ctx.fillRect(x - 49, y + 6, 98 * frame.turretHold, 2);
      }
    }
    if (frame.gateTravel === 0 && distance(frame.player, gateCenter) < 72) {
      const { x, y: anchorY } = projectToScreen(gateCenter, camera);
      const y = anchorY - 24;
      panel(ctx, x - 55, y - 9, 110, 18, '#ad9c75'); text(ctx, '발전기 전력 필요', x, y, 10, AMBER, 'center');
    }
  }
  if (frame.showHealth) drawHealth(ctx, playerOnScreen, frame.hp);
  if (frame.player.hit > 0) { ctx.strokeStyle = '#fa8d7c90'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, width - 2, height - 2); }
}

function drawDanger(ctx: CanvasRenderingContext2D, frame: Frame) {
  if (!frame.hp || frame.hp > balance.player.health * .32 || frame.phase === 'cleared') return;
  const urgency = 1 - frame.hp / (balance.player.health * .34);
  const pulse = (.5 + .5 * Math.sin(frame.time * (5.4 + urgency * 2))) ** 3;
  const edge = (.15 + urgency * .36) * (.82 + pulse * .4);
  const gradient = ctx.createRadialGradient(width / 2, height / 2, height * .22, width / 2, height / 2, width * .55);
  gradient.addColorStop(0, 'rgba(150,15,35,0)');
  gradient.addColorStop(.47, `rgba(93,13,33,${edge * .28})`);
  gradient.addColorStop(1, `rgba(175,11,40,${Math.min(.65, edge)})`);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
}

export function makeOutpostRenderer(output: CanvasRenderingContext2D, hud: CanvasRenderingContext2D, atlases: OutpostAtlases, shadows: SpriteShadows, gi: IndirectLighting) {
  const { outpost, mural, tiles, setpieces } = atlases;
  const terrain = buildTerrain(mural, tiles);
  const terrainScale = terrain.width / world.width;
  const floorFeatures: Array<Point & {
    source: HTMLImageElement; cell: readonly [number, number]; size: number; flat: boolean; groundRatio?: number;
  }> = [
    ...landmarks.map(point => ({
      x: point.x, y: point.y - 16, source: setpieces, cell: [1, point.frame - 3] as const,
      size: point.frame === 5 ? 35 : 46, flat: false,
      groundRatio: point.frame === 5 ? fixtureGroundRatio.antenna : fixtureGroundRatio.vent,
    })),
    { x: landing.x, y: landing.y - 4, source: outpost, cell: [1, 3] as const, size: 107, flat: true },
    { x: lift.x, y: lift.y - 3, source: outpost, cell: [1, 1] as const, size: 81, flat: true },
  ];
  const relaySprite = { x: relay.x, y: relay.y - 26 };
  const liftSprite = { x: lift.x + 5, y: lift.y - 44 };
  function ground(ctx: CanvasRenderingContext2D, camera: Box) {
    const { x, y, width, height } = camera;
    ctx.drawImage(terrain, x * terrainScale, y * terrainScale, width * terrainScale, height * terrainScale, 0, 0, width, height);
  }
  function floorArt(ctx: CanvasRenderingContext2D, camera: Box) {
    for (const feature of floorFeatures) {
      const { source, cell, size } = feature;
      const x = feature.x - camera.x, y = feature.y - camera.y;
      if (x < -size || y < -size || x > camera.width + size || y > camera.height + size) continue;
      sprite(ctx, source, ...cell, x, y, size);
    }
  }
  const sight = makeVisibility((ctx, camera) => { floorArt(ctx, camera); ground(ctx, camera); });
  const outline = makeOutliner();
  const fixtures = [landing, ...landmarks, relayAccess, lift];
  const post = makePixelPostProcess(output);

  const paint = (frame: Frame, camera: Box, pixelStep: number) => {
    const actualWidth = output.canvas.width, actualHeight = output.canvas.height;
    const rasterScaleX = actualWidth / camera.width, rasterScaleY = actualHeight / camera.height;
    const ctx = post.target(pixelStep);
    ctx.resetTransform();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(rasterScaleX, 0, 0, rasterScaleY, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ground(ctx, camera);
    const powered = frame.phase === 'evacuate' || frame.phase === 'cleared';
    const lampSpace = rayDistance(frame.player, Math.cos(frame.player.aim), Math.sin(frame.player.aim), 8, frame.blockers);
    const lamp = onRay(frame.player, frame.player.aim, Math.max(0, lampSpace - .15));
    const flares = frame.support.flares.map(flare => flarePoseAt(flare, frame.time));
    const pulses: FlashLight[] = frame.traces.map(trace => ({
      from: trace.from, to: trace.to, radius: 19, amount: Math.min(1, trace.life / pulseLightDuration) * .85, color: '109,222,255', passes: 2,
      opensFog: true, emitter: trace.from, source: trace,
    }));
    const flashes = [...pulses];
    for (const flash of frame.muzzleLights) {
      const scale = flash.ballistic ? ballisticMuzzle.reachScale : 1;
      const reach = rayDistance(flash.origin, Math.cos(flash.heading), Math.sin(flash.heading), (flash.wide ? 61 : 46) * scale, frame.blockers);
      if (reach < 1) continue;
      const fade = Math.min(1, flash.life / flash.duration);
      flashes.push({ from: flash.origin, to: onRay(flash.origin, flash.heading, reach), spread: true,
        radius: (flash.wide ? 14 : 9) * scale, amount: Math.min(1, flash.strength * 1.5) * fade ** 2.15,
        intensityScale: flash.ballistic ? ballisticMuzzle.intensityScale : undefined,
        color: flash.color, additive: true, emitter: flash.emitter, source: flash });
    }
    const alerts: { from: Point; to: Point; amount: number }[] = [];
    const { turret, drone } = frame.support;
    for (const unit of [turret, drone]) {
      const alert = unit?.alert;
      if (!unit || !alert || alert.until <= frame.time) continue;
      const progress = Math.min(1, (alert.until - frame.time) / targetAlertSeconds);
      const doubleFlash = progress > .66 || progress < .44 ? 1 : .34;
      const amount = Math.min(1, progress * 2.3) * doubleFlash;
      const target = alert.target;
      const pose = supportPose(unit, unit.heading, unit.kind, frame.time, unit.firedAt);
      const heading = Math.atan2(target.y - pose.ground.y, target.x - pose.ground.x);
      const reach = Math.min(distance(pose.ground, target), 74);
      const end = onRay(pose.ground, heading, rayDistance(pose.ground, Math.cos(heading), Math.sin(heading), reach, frame.blockers));
      flashes.push({ from: pose.ground, to: end, radius: 12, amount, color: '255,46,65',
        passes: 2, spill: .38, emitter: unit, source: alert });
      alerts.push({ from: pose.muzzle, to: { x: end.x, y: end.y - pose.lift }, amount });
    }
    const flareIntensity = (point: Point, ownBody?: Box) => {
      let amount = 0;
      const range = supportSpecs.flare.radius;
      for (const flare of flares) {
        if (visibleSurface(flare.base, point, frame.blockers, ownBody, range))
          amount = Math.max(amount, flareFalloff(distance(flare.base, point), range) * (flare.airborne ? .86 : 1));
      }
      return amount;
    };
    const pulseLit = (point: Point, ownBody?: Box) => pulses.some(pulse =>
      pulse.amount > .07 && distanceToLight(point, pulse.from, pulse.to) < pulse.radius * .84 &&
      visibleSurface(pulse.from, point, frame.blockers, ownBody, Infinity));
    const visible = (point: Point, ownBody?: Box) => visibleSurface(frame.player, point, frame.blockers, ownBody) ||
      flareIntensity(point, ownBody) > 0 || pulseLit(point, ownBody);
    const flashAt = (point: Point, ownBody?: Box) => flashes.reduce((most, flash) => {
      const amount = flash.amount * (flash.intensityScale ?? 1) * (1 - distanceToLight(point, flash.from, flash.to) / flash.radius);
      if (amount <= most) return most;
      if (flash.spread && (point.x - flash.from.x) * (flash.to.x - flash.from.x) +
        (point.y - flash.from.y) * (flash.to.y - flash.from.y) < 0) return most;
      return flash.emitter && !visibleSurface(flash.emitter, point, frame.blockers, ownBody, Infinity) ? most : amount;
    }, 0);
    const lit = (point: Point, ownBody?: Box) => Math.max(frame.flashlightOn ? flashlightLevel(lamp, frame.player.aim, point) : 0,
      flareIntensity(point, ownBody), flashAt(point, ownBody));
    const { directStrength } = frame.lighting;
    const sideLight = (point: Point, ownBody?: Box) => {
      const ambient = peripheralLight(frame.player, frame.player.aim, point, false);
      const illuminated = Math.max(peripheralLight(frame.player, frame.player.aim, point, frame.flashlightOn),
        flareIntensity(point, ownBody) * 1.3, flashAt(point, ownBody) * 1.25);
      return ambient + (illuminated - ambient) * directStrength;
    };
    const relayVisible = visible(relay, relayBody);
    const visiblePickups = frame.groundArms.filter(point => visible(point)).map(pickup => ({ pickup,
      center: { x: pickup.x, y: pickup.y - 3 - Math.sin(frame.time * 3) * 2 }, art: inventoryArt(atlases, pickup.gun.weapon) }));
    const visibleProps = frame.props.filter(prop => visible(prop, prop.bounds));
    const visibleActors = frame.actors.filter(actor => visible(actor)).map(actor => {
      const opacity = balance.beam.unlitEnemyOpacity;
      return { actor, pose: actorPose(atlases, actor, frame.time), alpha: opacity + (1 - opacity) * Math.min(1, lit(actor) / .19) };
    });
    const ally = frame.ally && visible(frame.ally) ? frame.ally : undefined;
    const dummy = frame.dummy && visible(frame.dummy) ? frame.dummy : undefined;
    const allyPose = ally && actorPose(atlases, ally, frame.time);
    const held = !frame.roll && !frame.challenge && !frame.player.statuses?.some(effect => effect.kind === 'stun') ?
      gunPose(atlases, frame) : undefined;
    const playerPose = actorPose(atlases, frame.player, frame.time, { walk: frame.walkFrame, roll: frame.roll, armed: !!held });
    const visibleSupplies = [...frame.supplies].filter(point => visible(point)).map(cache => ({ cache, x: cache.x, y: cache.y - 14 }));
    const liftVisible = visible(lift);
    const lights: ShadowLight[] = [...fixtures.map(origin => ({
      origin, range: origin === landing ? 98 : origin === relayAccess || origin === lift ? 83 : 59,
      elevation: origin === landing ? 84 : 62,
      amount: origin === landing || powered ? .38 : frame.phase === 'defense' && origin === relayAccess ? .23 + Math.sin(frame.time * 9) * .09 : .17,
      color: origin === landing ? '157,219,253' : powered ? '163,245,233' : origin === relayAccess ? '247,164,111' : '120,198,221',
    })), ...flares.map(flare => ({
      origin: flare.base, range: supportSpecs.flare.radius, amount: flare.airborne ? .73 : .83, elevation: 15 + flare.lift,
      color: '255,241,158', reveals: true,
    })),
    ...(turret && frame.time >= turret.readyAt ? [{ origin: turret, ...balance.turretBeam,
      color: '190,226,249', heading: turret.heading }] : []),
    ...(drone && frame.time >= drone.readyAt ? [{ origin: drone, range: 49, amount: .38,
      elevation: supportPose(drone, drone.heading, 'drone', frame.time, drone.firedAt).lift, color: '146,236,217' }] : [])]
      .filter(({ origin, range }) => origin.x >= camera.x - range && origin.x <= camera.x + camera.width + range &&
        origin.y >= camera.y - range && origin.y <= camera.y + camera.height + range);
    const castingLights = [...lights];
    if (frame.flashlightOn) castingLights.push({ origin: lamp, range: balance.beam.range, amount: .96, elevation: 33,
      color: '248,239,214', heading: frame.player.aim, halfAngle: balance.beam.halfAngle });
    for (const flash of flashes) {
      if (flash.spread) castingLights.push({ origin: flash.from, range: distance(flash.from, flash.to), amount: flash.amount * (flash.intensityScale ?? 1),
        elevation: 22, color: flash.color, heading: Math.atan2(flash.to.y - flash.from.y, flash.to.x - flash.from.x), halfAngle: .29 });
      else castingLights.push({ origin: flash.from, end: flash.to, range: flash.radius, amount: flash.amount,
        elevation: 19, color: flash.color });
    }
    for (const feature of floorFeatures) {
      shadows.sprite(feature.source, feature, feature.size, feature.cell, { flat: feature.flat, opacity: .55, groundRatio: feature.groundRatio });
    }
    const shift = Math.round(frame.gateTravel * gate.height / 2);
    const panelLength = gate.height / 2 - shift;
    if (panelLength > 0) {
      const gateShadow = { blocker: gate, flat: false, opacity: .62, groundRatio: fixtureGroundRatio.gate };
      shadows.rectangle({ x: gateCenter.x, y: gate.y + panelLength / 2 }, gate.width + 4, panelLength, gateShadow);
      shadows.rectangle({ x: gateCenter.x, y: gate.y + gate.height - panelLength / 2 }, gate.width + 4, panelLength, gateShadow);
    }
    if (relayVisible) shadows.sprite(setpieces, relaySprite, 77, [0, 0], { blocker: relayBody, groundRatio: fixtureGroundRatio.relay });
    if (liftVisible) shadows.sprite(setpieces, liftSprite, 88, [0, powered ? 2 : 1],
      { opacity: .6, groundRatio: powered ? fixtureGroundRatio.liftOpen : fixtureGroundRatio.liftClosed });
    for (const cache of visibleSupplies) shadows.sprite(setpieces, cache, 44, [1, 0], { groundRatio: fixtureGroundRatio.supplies });
    drawActorShadow(shadows, frame.player, playerPose);
    if (held) {
      const { pose, projection, size } = held;
      const reach = projectBarrelPoint(projection, held.center, 0).x;
      const center = onRay(pose.mount, projection.angle, reach);
      shadows.sprite(held.atlas, center, size, [held.row, held.cell],
        { angle: projection.angle, scaleX: projection.scale, scaleY: pose.side, flat: true, elevation: pose.lift, opacity: held.drawn * .4 });
    }
    if (ally && allyPose) drawActorShadow(shadows, ally, allyPose, ally.hp > 0 ? 1 : .55);
    if (dummy) shadows.sprite(atlases.dummy, { x: dummy.x, y: dummy.y - 14 }, 42, undefined, { groundRatio: fixtureGroundRatio.medicalDummy });
    for (const { actor, pose, alpha } of visibleActors) drawActorShadow(shadows, actor, pose, alpha);
    for (const prop of visibleProps) {
      const art = propSprite(prop);
      shadows.sprite(outpost, art, art.size, art.cell, { blocker: prop.bounds, groundRatio: fixtureGroundRatio[prop.kind] });
    }
    for (const { center, art: [atlas, row, cell] } of visiblePickups) {
      shadows.sprite(atlas, center, 32, [row, cell], { flat: true, opacity: .57 });
    }
    for (const piece of frame.spentMetal) {
      const width = piece.kind === 'case' ? 4 : 3;
      const center = onRay({ x: Math.round(piece.x), y: Math.round(piece.y - piece.z) }, piece.angle, width / 2 - 1);
      shadows.rectangle(center, width, 2,
        { angle: piece.angle, elevation: piece.z, opacity: Math.min(.5, 2.4 - piece.age) });
    }
    drawSupportShadows(shadows, frame, atlases, visible);
    shadows.paint(ctx, camera, castingLights, frame.blockers, frame.shadowMode);
    floorArt(ctx, camera);

    ctx.save(); ctx.translate(-camera.x, -camera.y);
    if (panelLength > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(gate.x - 2, gate.y, gate.width + 4, gate.height); ctx.clip();
      ctx.fillStyle = '#0c1d2c';
      ctx.fillRect(gate.x - 2, gate.y - shift, gate.width + 4, gate.height / 2);
      ctx.fillRect(gate.x - 2, gate.y + gate.height / 2 + shift, gate.width + 4, gate.height / 2);
      ctx.fillStyle = '#44667c';
      ctx.fillRect(gate.x + 3, gate.y - shift, 7, gate.height / 2);
      ctx.fillRect(gate.x + 3, gate.y + gate.height / 2 + shift, 7, gate.height / 2);
      ctx.fillStyle = '#cc9276';
      for (let i = 0; i < 4; i++) ctx.fillRect(gate.x + 5, gate.y + 9 + i * 24 + (i < 2 ? -shift : shift), 3, 12);
      ctx.restore();
    }
    if (powered) {
      ctx.strokeStyle = '#98ffda'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(lift.x, lift.y, 24 + Math.sin(frame.time * 4) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    for (const warning of frame.warnings) {
      if (!visible(warning.from)) continue;
      if ('radius' in warning) {
        ctx.beginPath(); ctx.arc(warning.from.x, warning.from.y, warning.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${warning.color}aa`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(warning.from.x, warning.from.y, warning.radius * warning.fill, 0, Math.PI * 2);
        ctx.fillStyle = `${warning.color}39`; ctx.fill();
      } else {
        polyline(ctx, [warning.from, warning.to]);
        ctx.strokeStyle = `rgba(244,115,102,${.16 + warning.fill * .29})`; ctx.lineWidth = warning.wide ? 27 : 4; ctx.stroke();
        ctx.strokeStyle = warning.wide ? '#ffab82' : warning.color; ctx.lineWidth = 1;
        ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
    const captureIncident = gi.capture(ctx.canvas, camera, frame.blockers, frame.lighting.strength > 0 ? frame.lighting.mode : 'direct',
      [...flashes.map(flash => flash.source ?? flash.from), ...frame.support.flares], frame.flashlightOn);
    const incidentLight = sight.lightScene(ctx, frame.player, frame.player.aim, camera, frame.blockers, lights, flashes,
      frame.flashlightOn, lamp, captureIncident, directStrength);
    const indirect = gi.paint(incidentLight, camera);

    ctx.save(); ctx.translate(-camera.x, -camera.y);
    for (const pulse of alerts) {
      ctx.globalAlpha = pulse.amount; polyline(ctx, [pulse.from, pulse.to]);
      ctx.lineWidth = 6; ctx.strokeStyle = '#ff234a58'; ctx.stroke();
      ctx.lineWidth = 2.8; ctx.strokeStyle = '#ff3756'; ctx.stroke();
      ctx.lineWidth = .95; ctx.strokeStyle = '#fff0cf'; ctx.stroke();
    }
    for (const spark of frame.sparks) {
      ctx.globalAlpha = Math.min(1, spark.life * 3);
      ctx.fillStyle = spark.color; ctx.fillRect(spark.x, spark.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    drawBallistics(ctx, frame);
    drawSlash(ctx, frame);
    drawMedicalBeam(ctx, frame);
    for (const bolt of frame.bolts) {
      const head = { x: bolt.x, y: bolt.y - bolt.lift };
      const rear = onRay(head, bolt.heading + Math.PI, 8);
      polyline(ctx, [rear, head]); ctx.lineWidth = 4; ctx.strokeStyle = `${bolt.color}88`; ctx.stroke();
      ctx.fillStyle = bolt.color; ctx.fillRect(head.x - 1.5, head.y - 1.5, 3, 3);
    }
    for (const ring of frame.rings) {
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius * (1 - ring.life / .4), 0, Math.PI * 2);
      ctx.globalAlpha = ring.life / .4; ctx.strokeStyle = '#b9eeff'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.restore();
    const indirectMask = sight.coverUnseen(ctx, frame.player, camera, frame.blockers, lights, pulses, pixelStep, !!indirect);

    // Test visibility at each foot or footprint. A raised sprite cannot be cut by its ground shadow.
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    drawPulseTraces(ctx, frame.traces);
    for (const { cache, x, y } of visibleSupplies) {
      if (frame.selection?.kind === 'supply' && frame.selection.point === cache) outline(ctx, setpieces, 1, 0, x, y, 44);
      else sprite(ctx, setpieces, 1, 0, x, y, 44);
    }
    if (liftVisible) sprite(ctx, setpieces, 0, powered ? 2 : 1, liftSprite.x, liftSprite.y, 88);
    for (const { pickup, center: { x, y }, art: [atlas, row, cell] } of visiblePickups) {
      ctx.filter = `brightness(${sideLight(pickup)})`;
      if (frame.selection?.kind === 'weapon' && frame.selection.point === pickup) outline(ctx, atlas, row, cell, x, y, 32);
      else sprite(ctx, atlas, row, cell, x, y, 32);
      ctx.filter = 'none';
    }
    if (relayVisible) {
      ctx.filter = `brightness(${(.87 + lit(relay, relayBody) * .19 * directStrength) * Math.max(.68, sideLight(relay, relayBody))})`;
      if (frame.selection?.kind === 'relay') outline(ctx, setpieces, 0, 0, relaySprite.x, relaySprite.y, 77);
      else sprite(ctx, setpieces, 0, 0, relaySprite.x, relaySprite.y, 77);
      ctx.filter = 'none';
      ctx.fillStyle = powered ? '#b8ffe8' : frame.phase === 'defense' ? AMBER : '#709cb0';
      ctx.fillRect(Math.round(relay.x - 8), Math.round(relay.y - 34), Math.round(6 + frame.charge * 10), 3);
    }
    if (dummy) {
      const { x, y } = dummy;
      ctx.drawImage(atlases.dummy, x - 21, y - 35, 42, 42);
      drawStatuses(ctx, dummy, frame.time, dummy.statuses);
    }
    const objects = [...visibleActors.map(data => ({ y: data.actor.y, ...data })), ...visibleProps.map(prop => ({ y: prop.y, prop }))];
    if (ally && allyPose) objects.push({ actor: ally, pose: allyPose, alpha: ally.hp > 0 ? 1 : .36, y: ally.y });
    objects.sort((a, b) => a.y - b.y);
    for (const object of objects) {
      ctx.save();
      if ('actor' in object) {
        ctx.globalAlpha = object.alpha;
        drawActor(ctx, object.actor, object.pose, sideLight(object.actor));
        drawStatuses(ctx, object.actor, frame.time, object.actor.statuses ?? [], object.actor.medicSlow);
      } else {
        const { prop } = object;
        drawProp(ctx, outpost, prop, (.62 + lit(prop, prop.bounds) * .68 * directStrength) * sideLight(prop, prop.bounds));
      }
      ctx.restore();
    }
    drawSupport(ctx, frame, atlases, visible, outline);
    const gunBehind = Math.sin(frame.player.aim) < -.55;
    if (held && gunBehind) drawArmedPlayer(ctx, frame, playerPose, held, atlases.hands);
    drawActor(ctx, frame.player, playerPose);
    if (held && !gunBehind) drawArmedPlayer(ctx, frame, playerPose, held, atlases.hands);
    drawStatuses(ctx, frame.player, frame.time, frame.player.statuses ?? []);
    for (const flash of frame.muzzleLights) if (visible(flash.emitter)) drawMuzzleFlash(ctx, flash);
    ctx.restore();

    if (indirect && indirectMask) {
      if (frame.lighting.preview) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, camera.width, camera.height); }
      sight.addIndirect(ctx, camera, indirect, indirectMask, frame.lighting.strength);
    }
    ctx.fillStyle = `rgba(0,0,0,${1 - balance.sight.visibleLight})`; ctx.fillRect(0, 0, camera.width, camera.height);
    post.present(pixelStep);
    hud.resetTransform(); hud.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
    hud.setTransform(hud.canvas.width / width, 0, 0, hud.canvas.height / height, 0, 0);
    hud.imageSmoothingEnabled = true;
    hud.imageSmoothingQuality = 'medium';
    drawDanger(hud, frame);
    for (const prop of visibleProps) drawPropHealth(hud, prop, camera);
    if (ally && ally.hp > 0 && ally.hp < balance.player.health) drawHealth(hud, projectToScreen(ally, camera), ally.hp);
    if (dummy) drawHealth(hud, projectToScreen(dummy, camera), dummy.hp);
    drawOverlay(hud, frame, camera);
    drawHud(hud, frame, camera, atlases, sight.wasSeen);
    if (frame.challenge) {
      frame.challenge.draw(hud, frame.time);
      text(hud, '체력', 334, 50, 8, '#acd0d5');
      drawHealth(hud, { x: 376, y: 37 }, frame.hp);
    }
    if (frame.pointerInside) {
      const ui = frame.challenge || frame.mapMode === 'panel' || frame.phase === 'cleared' || frame.phase === 'defeated' || isHudPointer(frame.aim);
      const gun = frame.guns[frame.swapping?.to ?? frame.selected];
      drawGamePointer(hud, frame.aim, ui ? undefined : gun.weapon, frame.actionTime - gun.firedAt);
    }
  };
  return Object.assign(paint, { enemyMuzzle: (point: Point, kind: RangedEnemy, heading: number) => enemyMuzzle(atlases, point, kind, heading) });
}
