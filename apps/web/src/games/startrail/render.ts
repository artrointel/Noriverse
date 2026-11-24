import { balance, cables, distance, floor, gate, gateCenter, isMetalFloor, landmarks, landing, lift, onRay, relay, relayAccess, relayBody, screen, tileSize, weaponPickup, world } from './outpost.ts';
import type { Box, EnemyKind, MapMode, Point } from './outpost.ts';
import { slots, weapons } from './gear.ts';
import type { Bullet, Gun, Slot, SpentMetal, Weapon } from './gear.ts';
import { flashlightLevel, makeVisibility, peripheralLight, surface, visibleSurface } from './visibility.ts';

export type Phase = 'approach' | 'defense' | 'evacuate' | 'cleared' | 'defeated';
export type ActorArt = Point & { kind: 'solori' | EnemyKind; aim: number; stride: number; pose?: number; hit: number; fallen?: number };
export type Trace = { from: Point; to: Point; life: number; hit: boolean; color: string };
export type Spark = Point & { vx: number; vy: number; life: number; color: string };
export type Warning = { from: Point; fill: number; color: string } & ({ to: Point; wide: boolean } | { radius: number });
export type EnemyBolt = Point & { heading: number; color: string };
export type PropArt = Point & { kind: 'crate' | 'crystal'; bounds: Box; health: number; hit: number };
export type Frame = {
  player: ActorArt; actors: ActorArt[]; props: PropArt[]; blockers: Box[]; phase: Phase;
  hp: number; showHealth: boolean; roll?: { heading: number; frame: number }; walkFrame?: number;
  selected: Slot; guns: Record<Slot, Gun>; drop: Weapon; recoil: number; reload?: number;
  charge: number; gateTravel: number; time: number; defeated: number;
  aim: Point; mapMode: MapMode; traces: Trace[]; sparks: Spark[]; warnings: Warning[];
  selection?: 'relay' | 'drop' | 'supply'; bullets: Bullet[]; spentMetal: SpentMetal[];
  bolts: EnemyBolt[]; rings: (Point & { radius: number; life: number })[];
  supplies: ReadonlySet<Point>; nearbySupply?: Point;
};

type ActorAtlases = {
  crew: CanvasImageSource; locomotion: CanvasImageSource; verticalSolori: CanvasImageSource;
  verticalMonsters: CanvasImageSource; diagonalSolori: CanvasImageSource; diagonalMonsters: CanvasImageSource;
  enemyDirections: CanvasImageSource; enemies: CanvasImageSource; fallen: CanvasImageSource;
};
type OutpostAtlases = ActorAtlases & { outpost: CanvasImageSource; tiles: HTMLImageElement; mural: CanvasImageSource; gear: CanvasImageSource; setpieces: CanvasImageSource };

const { width, height } = screen;
const FONT = '"Sketch Jua", "Malgun Gothic", sans-serif';
const ICE = '#87e5f6', AMBER = '#ffd48b';
const PAD = 128;
const sizes = { solori: 49, mite: 43, boar: 61, scout: 43, sentinel: 53, spore: 43, grub: 51 } as const;
const newKinds = ['scout', 'sentinel', 'spore', 'grub'] as const;
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

function makeOutliner() {
  const cache = new WeakMap<CanvasImageSource, Map<number, { edge: HTMLCanvasElement; tinted: HTMLCanvasElement }>>();
  return (ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, row: number, frame: number, x: number, y: number, size: number, pixelStep: number) => {
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
    const radius = Math.max(2, Math.ceil(pixelStep / 2));
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) {
      ctx.drawImage(variants.edge, x - size / 2 + dx * radius, y - size / 2 + dy * radius, size, size);
    }
    ctx.drawImage(variants.tinted, x - size / 2, y - size / 2, size, size);
  };
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

function shadow(ctx: CanvasRenderingContext2D, point: Point, w: number, h: number) {
  for (const scale of [1, .78, .56]) {
    ctx.beginPath();
    ctx.ellipse(point.x + 3, point.y + 3, w * scale, h * scale, -.13, 0, Math.PI * 2);
    ctx.fillStyle = '#020b1f53'; ctx.fill();
  }
}

function polyline(ctx: CanvasRenderingContext2D, path: Point[]) {
  ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
  for (const point of path.slice(1)) ctx.lineTo(point.x, point.y);
}

function buildTerrain(atlas: CanvasImageSource, mural: CanvasImageSource, tiles: HTMLImageElement, pieces: CanvasImageSource) {
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
  for (const object of landmarks) {
    shadow(land, object, 15, 7);
    sprite(land, pieces, 1, object.frame - 3, object.x, object.y - 16, object.frame === 5 ? 35 : 46);
  }
  shadow(land, landing, 46, 33); sprite(land, atlas, 1, 3, landing.x, landing.y - 4, 107);
  shadow(land, lift, 36, 27); sprite(land, atlas, 1, 1, lift.x, lift.y - 3, 81);
  return land.canvas;
}

function drawActor(ctx: CanvasRenderingContext2D, atlases: ActorAtlases, actor: ActorArt, time: number, animation?: { walk?: number; roll?: Frame['roll'] }, light = 1) {
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
  let squash = 1, tint = light * (actor.hit > 0 ? 1.6 : 1);
  const strideFrame = Math.floor(time * 9) % 2;
  const roll = animation?.roll;
  const walk = animation?.walk;
  if (kind === 'solori') {
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
  } else if (actor.fallen !== undefined) {
    atlas = atlases.fallen;
    row = kind === 'mite' ? 0 : kind === 'boar' ? 1 : 2 + newKinds.indexOf(kind);
    frame = Math.min(3, Math.floor(actor.fallen / balance.fallen.collapse * 4));
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
  const lift = roll || walk !== undefined || actor.fallen !== undefined ? 0 : moving ? Math.abs(Math.sin(time * 15)) * 2 : Math.sin(time * 4) * .65;
  const anchor = kind === 'mite' ? 15 : size * .42;
  ctx.save(); ctx.translate(actor.x, actor.y - lift);
  ctx.scale(flip ? -1 : 1, squash);
  if (actor.fallen !== undefined && actor.fallen > balance.fallen.collapse) {
    ctx.globalAlpha *= (balance.fallen.duration - actor.fallen) / (balance.fallen.duration - balance.fallen.collapse);
  }
  if (tint !== 1) ctx.filter = `brightness(${tint})`;
  sprite(ctx, atlas, row, frame, 0, -anchor, size);
  ctx.restore();
}

function drawHealth(ctx: CanvasRenderingContext2D, player: Point, hp: number) {
  const x = player.x - 17, y = player.y + 10;
  ctx.fillStyle = '#091728'; ctx.fillRect(x, y, 34, 6);
  ctx.fillStyle = '#435971'; ctx.fillRect(x + 1, y + 1, 32, 4);
  ctx.fillStyle = hp > 28 ? '#86ddbf' : '#ff937a';
  ctx.fillRect(x + 1, y + 1, Math.round(32 * hp / balance.player.health), 4);
}

function drawGun(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, frame: Frame) {
  const { player, reload, recoil } = frame;
  const gun = frame.guns[frame.selected];
  const stats = weapons[gun.weapon];
  const lean = reload === undefined ? 0 : Math.sin(reload * Math.PI);
  const towardY = Math.sin(player.aim);
  const heldHeight = Math.abs(towardY) > Math.SQRT1_2 ? towardY < 0 ? 24 : 15 : 3;
  const left = Math.cos(player.aim) < 0 ? -1 : 1;
  const bob = player.stride > .17 ? Math.sin(frame.time * 17) * .85 : 0;
  ctx.save();
  ctx.translate(player.x, player.y - heldHeight + bob);
  ctx.rotate(player.aim - left * (lean * .72 + recoil * .13)); ctx.scale(1, left);
  sprite(ctx, atlas, 0, stats.frame, 15 - recoil * 5 - lean * 4, 0, gun.weapon === 'scout' ? 19 : 25);
  if (reload !== undefined && reload > .17 && reload < .78) {
    const eject = (reload - .17) / .37;
    const outgoing = eject < 1;
    const travel = outgoing ? Math.min(1, eject * 1.3) : Math.max(0, 1 - (reload - .54) / .24);
    ctx.translate(9 - travel * 6, 4 + travel * 12); ctx.rotate(travel * (outgoing ? -.8 : .4));
    ctx.globalAlpha = outgoing ? 1 - travel * .75 : 1;
    ctx.fillStyle = '#243340'; ctx.fillRect(-2, -1, 4, 8);
    ctx.fillStyle = outgoing ? '#8c9ca4' : stats.color; ctx.fillRect(-1, 0, 2, 5);
  }
  ctx.restore();
}

function drawProp(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, prop: PropArt, light: number) {
  const crate = prop.kind === 'crate';
  const heightOffset = crate ? 7 : 14;
  ctx.save();
  ctx.filter = `brightness(${prop.hit > 0 ? Math.min(1.54, light * 1.9) : light})`;
  sprite(ctx, atlas, crate ? 0 : 1, crate ? 3 : 2, prop.x, prop.y - heightOffset, crate ? 42 : 41);
  ctx.restore();
}

function drawPropHealth(ctx: CanvasRenderingContext2D, prop: PropArt) {
  if (prop.health === 1) return;
  ctx.fillStyle = '#141e2cb0'; ctx.fillRect(prop.x - 10, prop.y + 8, 20, 3);
  ctx.fillStyle = prop.kind === 'crate' ? '#eeb584' : '#acecfa'; ctx.fillRect(prop.x - 10, prop.y + 8, Math.round(20 * prop.health), 2);
}

function drawMap(ctx: CanvasRenderingContext2D, frame: Frame, camera: Point, wasSeen: (point: Point) => boolean) {
  const overlay = frame.mapMode === 'overlay';
  ctx.save();
  if (overlay) ctx.globalAlpha = .20;
  else {
    ctx.fillStyle = '#020b1dad'; ctx.fillRect(0, 0, width, height);
    panel(ctx, 95, 23, 290, 225);
    text(ctx, '지표 중계소 · 지형도', 109, 39, 13);
  }
  const scale = overlay ? .205 : Math.min(260 / world.width, 177 / world.height);
  const x = overlay ? frame.player.x - camera.x - frame.player.x * scale : (width - world.width * scale) / 2;
  const y = overlay ? frame.player.y - camera.y - frame.player.y * scale : 55;
  floor.forEach((row, r) => row.forEach((open, c) => {
    if (!open || !wasSeen({ x: (c + .5) * tileSize, y: (r + .5) * tileSize })) return;
    ctx.fillStyle = overlay ? '#96dbf3' : '#254b62';
    ctx.fillRect(x + c * tileSize * scale, y + r * tileSize * scale, tileSize * scale, tileSize * scale);
  }));
  const project = (point: Point) => ({ x: x + point.x * scale, y: y + point.y * scale });
  const markers: [Point, string, string][] = [[landing, '착륙대', ICE], [relay, '발전기', AMBER], [lift, '승강기', ICE]];
  for (const point of frame.supplies) markers.push([point, '보급품', '#9ef3c4']);
  markers.push([frame.player, '솔오리', '#ffb46b']);
  for (const [point, label, color] of markers) {
    if (point !== frame.player && !wasSeen(point)) continue;
    const pos = project(point);
    ctx.fillStyle = color; ctx.fillRect(pos.x - 2.5, pos.y - 2.5, 5, 5);
    if (!overlay) text(ctx, label, pos.x, pos.y + (label === '솔오리' ? 13 : -10), 8, color, 'center');
  }
  if (!overlay) text(ctx, 'TAB · 오버레이', 371, 236, 9, '#89aebf', 'right');
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, frame: Frame, camera: Point, atlas: CanvasImageSource, wasSeen: (point: Point) => boolean) {
  const powered = frame.phase === 'evacuate' || frame.phase === 'cleared';
  panel(ctx, 9, 9, 132, 23);
  text(ctx, '1-1', 17, 20, 12, ICE); text(ctx, '지표 중계소', 43, 20, 14);

  panel(ctx, 312, 9, 159, frame.phase === 'defense' ? 47 : 38);
  text(ctx, '복구 임무', 324, 19, 9, '#9ab9ca');
  const goal = powered ? '지하 관측소행 승강기로 이동' : frame.phase === 'defense' ? '전력 복구 중 · 발전기 방어' : '탐색하여 중앙 발전기를 가동';
  text(ctx, goal, 324, 33, 12, powered ? '#92ecc9' : '#f4fbfb');
  if (frame.phase === 'defense') {
    ctx.fillStyle = '#263f51'; ctx.fillRect(324, 46, 135, 3);
    ctx.fillStyle = AMBER; ctx.fillRect(324, 46, Math.round(135 * frame.charge), 3);
  }

  panel(ctx, 9, height - 32, 212, 22);
  text(ctx, 'WASD 이동 · SPACE 구르기 · E 상호작용 · TAB 지도', 17, height - 21, 9, '#cfe3ef');
  for (const [index, slot] of slots.entries()) {
    const gun = frame.guns[slot], stats = weapons[gun.weapon];
    const x = 227 + index * 125, y = height - 43;
    panel(ctx, x, y, 119, 33, frame.selected === slot ? stats.color : '#31586a');
    sprite(ctx, atlas, 0, stats.frame, x + 15, y + 15, 21);
    text(ctx, index === 0 ? '좌' : '우', x + 15, y + 27, 7, '#a5bbc6', 'center');
    text(ctx, stats.name, x + 29, y + 11, 10, stats.color);
    if (gun.reloadAt !== undefined) {
      const progress = (frame.time - gun.reloadAt) / stats.reload;
      text(ctx, '재장전', x + 76, y + 11, 8, '#cfe3ef');
      ctx.fillStyle = '#26495d'; ctx.fillRect(x + 29, y + 22, 76, 3);
      ctx.fillStyle = stats.color; ctx.fillRect(x + 29, y + 22, Math.round(76 * progress), 3);
    } else {
      for (let i = 0; i < stats.capacity; i++) {
        ctx.fillStyle = i < gun.ammo ? stats.color : '#26495d'; ctx.fillRect(x + 30 + i * 7, y + 19, 4, 7);
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
    if (bullet.traveled < 13) continue;
    const trail = onRay(bullet, bullet.heading + Math.PI, Math.min(bullet.traveled - 9, 21));
    const streak = ctx.createLinearGradient(trail.x, trail.y, bullet.x, bullet.y);
    streak.addColorStop(0, '#f5b75c00'); streak.addColorStop(.38, '#f5b75c62'); streak.addColorStop(1, '#ffe1ad');
    ctx.lineWidth = 1.65; ctx.strokeStyle = streak;
    polyline(ctx, [trail, bullet]); ctx.stroke();
    const rear = onRay(bullet, bullet.heading + Math.PI, 2.8);
    ctx.lineWidth = 1.65; ctx.strokeStyle = weapons[bullet.weapon].color;
    polyline(ctx, [rear, bullet]); ctx.stroke();
  }
  for (const piece of frame.spentMetal) {
    const casing = piece.kind === 'case';
    ctx.save();
    ctx.globalAlpha = Math.min(1, (2.4 - piece.age) * 2);
    ctx.fillStyle = '#06132092'; ctx.fillRect(Math.round(piece.x - 1), Math.round(piece.y + 1), casing ? 4 : 3, 2);
    ctx.translate(Math.round(piece.x), Math.round(piece.y - piece.z)); ctx.rotate(piece.angle);
    ctx.fillStyle = casing ? '#bd8950' : '#a99a89'; ctx.fillRect(-1, -1, casing ? 4 : 3, 2);
    ctx.fillStyle = casing ? '#f1cb85' : '#d3c9b0'; ctx.fillRect(-1, -1, casing ? 3 : 2, 1);
    ctx.restore();
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, frame: Frame, camera: Point) {
  const playerOnScreen = { x: frame.player.x - camera.x, y: frame.player.y - camera.y };
  if (frame.mapMode !== 'panel' && frame.phase !== 'cleared' && frame.phase !== 'defeated') {
    if (frame.selection === 'relay') {
      const x = relay.x - camera.x, y = relay.y - camera.y - 43;
      panel(ctx, x - 52, y - 9, 104, 18, '#ad9c75'); text(ctx, 'E 길게 눌러 복구 시작', x, y, 10, AMBER, 'center');
      if (frame.charge > 0) { ctx.fillStyle = AMBER; ctx.fillRect(x - 50, y + 7, 100 * frame.charge, 2); }
    }
    if (frame.selection === 'drop') {
      const x = weaponPickup.x - camera.x;
      let y = weaponPickup.y - camera.y - 22;
      if (frame.showHealth && Math.abs(y - playerOnScreen.y - 13) < 13) y = playerOnScreen.y + 35;
      panel(ctx, x - 65, y - 9, 130, 18, '#ad9c75'); text(ctx, `E  교체 · ${weapons[frame.drop].name}`, x, y, 10, AMBER, 'center');
    }
    if (frame.selection === 'supply' && frame.nearbySupply) {
      const x = frame.nearbySupply.x - camera.x, y = frame.nearbySupply.y - camera.y - 40;
      panel(ctx, x - 49, y - 9, 98, 18, '#75bfaa'); text(ctx, 'E  체력·탄창 보급', x, y, 10, '#adf5d1', 'center');
    }
    if (frame.gateTravel === 0 && distance(frame.player, gateCenter) < 72) {
      const x = gateCenter.x - camera.x, y = gateCenter.y - camera.y - 24;
      panel(ctx, x - 55, y - 9, 110, 18, '#ad9c75'); text(ctx, '발전기 전력 필요', x, y, 10, AMBER, 'center');
    }
    const x = Math.round(frame.aim.x), y = Math.round(frame.aim.y);
    ctx.strokeStyle = '#d3fbf4'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 5.5, y - 5.5, 11, 11); ctx.fillStyle = '#d3fbf4'; ctx.fillRect(x, y, 1, 1);
  }
  if (frame.showHealth) drawHealth(ctx, playerOnScreen, frame.hp);
  if (frame.player.hit > 0) { ctx.strokeStyle = '#fa8d7c90'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, width - 2, height - 2); }
}

export function makeOutpostRenderer(output: CanvasRenderingContext2D, hud: CanvasRenderingContext2D, atlases: OutpostAtlases) {
  const { outpost, mural, tiles, gear, setpieces } = atlases;
  const terrain = buildTerrain(outpost, mural, tiles, setpieces);
  const terrainScale = terrain.width / world.width;
  function ground(ctx: CanvasRenderingContext2D, camera: Point) {
    ctx.drawImage(terrain, camera.x * terrainScale, camera.y * terrainScale, width * terrainScale, height * terrainScale, 0, 0, width, height);
  }
  const sight = makeVisibility(ground);
  const outline = makeOutliner();
  const fixtures = [landing, ...landmarks, relayAccess, lift];
  let pixelated: CanvasRenderingContext2D | undefined;

  return (frame: Frame, view: Point, pixelStep: number) => {
    const actualWidth = output.canvas.width, actualHeight = output.canvas.height;
    const rasterScaleX = actualWidth / (width * pixelStep), rasterScaleY = actualHeight / (height * pixelStep);
    const camera = {
      x: Math.round(view.x * rasterScaleX) / rasterScaleX,
      y: Math.round(view.y * rasterScaleY) / rasterScaleY,
    };
    if (pixelStep > 1) {
      const pixelsWide = Math.ceil(actualWidth / pixelStep), pixelsHigh = Math.ceil(actualHeight / pixelStep);
      if (pixelated?.canvas.width !== pixelsWide || pixelated?.canvas.height !== pixelsHigh) pixelated = surface(pixelsWide, pixelsHigh);
    }
    const ctx = pixelStep > 1 ? pixelated! : output;
    ctx.resetTransform();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(rasterScaleX, 0, 0, rasterScaleY, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ground(ctx, camera);
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    const powered = frame.phase === 'evacuate' || frame.phase === 'cleared';
    const visible = (point: Point, ownBody?: Box) => visibleSurface(frame.player, point, frame.blockers, ownBody);
    const lit = (point: Point) => flashlightLevel(frame.player, frame.player.aim, point);
    const sideLight = (point: Point) => peripheralLight(frame.player, frame.player.aim, point);
    const relayVisible = visible(relay, relayBody);
    const pickupVisible = visible(weaponPickup);
    const visibleProps = frame.props.filter(prop => visible(prop, prop.bounds));
    const visibleActors = frame.actors.filter(actor => visible(actor)).map(actor => {
      const opacity = actor.fallen !== undefined ? .35 : balance.beam.unlitEnemyOpacity;
      return { actor, alpha: opacity + (1 - opacity) * Math.min(1, lit(actor) / .19) };
    });
    if (frame.gateTravel < 1) {
      ctx.save(); ctx.beginPath(); ctx.rect(gate.x - 2, gate.y, gate.width + 4, gate.height); ctx.clip();
      const shift = Math.round(frame.gateTravel * gate.height / 2);
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
    if (relayVisible) shadow(ctx, relay, 24, 12);
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
    shadow(ctx, frame.player, 13, 6);
    for (const { actor, alpha } of visibleActors) {
      if (actor.fallen !== undefined) continue;
      ctx.globalAlpha = alpha; shadow(ctx, actor, actor.kind === 'boar' ? 23 : 13, 6);
    }
    ctx.globalAlpha = 1;
    for (const prop of visibleProps) shadow(ctx, prop, prop.kind === 'crate' ? 20 : 16, prop.kind === 'crate' ? 12 : 6);
    if (pickupVisible) {
      shadow(ctx, weaponPickup, 12, 5);
      const shimmer = Math.sin(frame.time * 4) * .13 + .3;
      ctx.fillStyle = `rgba(253,211,128,${shimmer})`;
      ctx.beginPath(); ctx.ellipse(weaponPickup.x, weaponPickup.y, 17, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const lights = fixtures.map(origin => ({
      origin, range: origin === landing ? 98 : origin === relayAccess || origin === lift ? 83 : 59,
      amount: origin === landing || powered ? .38 : frame.phase === 'defense' && origin === relayAccess ? .23 + Math.sin(frame.time * 9) * .09 : .17,
      color: origin === landing ? '157,219,253' : powered ? '163,245,233' : origin === relayAccess ? '247,164,111' : '120,198,221',
    })).filter(({ origin, range }) => origin.x >= camera.x - range && origin.x <= camera.x + width + range &&
      origin.y >= camera.y - range && origin.y <= camera.y + height + range);
    sight.lightScene(ctx, frame.player, frame.player.aim, camera, frame.blockers, lights);

    ctx.save(); ctx.translate(-camera.x, -camera.y);
    for (const trace of frame.traces) {
      ctx.globalAlpha = Math.min(1, trace.life * 12);
      polyline(ctx, [trace.from, trace.to]); ctx.lineWidth = 4; ctx.strokeStyle = `${trace.color}50`; ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = trace.color; ctx.stroke();
      if (trace.hit) { ctx.fillStyle = '#fff4c8'; ctx.fillRect(trace.to.x - 2, trace.to.y - 2, 4, 4); }
    }
    for (const spark of frame.sparks) {
      ctx.globalAlpha = Math.min(1, spark.life * 3);
      ctx.fillStyle = spark.color; ctx.fillRect(spark.x, spark.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    drawBallistics(ctx, frame);
    for (const bolt of frame.bolts) {
      const rear = onRay(bolt, bolt.heading + Math.PI, 8);
      polyline(ctx, [rear, bolt]); ctx.lineWidth = 4; ctx.strokeStyle = `${bolt.color}88`; ctx.stroke();
      ctx.fillStyle = bolt.color; ctx.fillRect(bolt.x - 1.5, bolt.y - 1.5, 3, 3);
    }
    for (const ring of frame.rings) {
      ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius * (1 - ring.life / .4), 0, Math.PI * 2);
      ctx.globalAlpha = ring.life / .4; ctx.strokeStyle = '#b9eeff'; ctx.lineWidth = 4; ctx.stroke();
    }
    ctx.restore();
    sight.coverUnseen(ctx, frame.player, camera, frame.blockers);

    // Test visibility at each foot or footprint. A raised sprite cannot be cut by its ground shadow.
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    for (const cache of frame.supplies) {
      if (!visible(cache)) continue;
      shadow(ctx, cache, 18, 9);
      if (frame.selection === 'supply' && frame.nearbySupply === cache) outline(ctx, setpieces, 1, 0, cache.x, cache.y - 14, 44, pixelStep);
      else sprite(ctx, setpieces, 1, 0, cache.x, cache.y - 14, 44);
    }
    if (visible(lift)) sprite(ctx, setpieces, 0, powered ? 2 : 1, lift.x + 5, lift.y - 44, 88);
    if (pickupVisible) {
      const art = weapons[frame.drop].frame;
      const y = weaponPickup.y - 3 - Math.sin(frame.time * 3) * 2;
      ctx.filter = `brightness(${sideLight(weaponPickup)})`;
      if (frame.selection === 'drop') outline(ctx, gear, 0, art, weaponPickup.x, y, 28, pixelStep);
      else sprite(ctx, gear, 0, art, weaponPickup.x, y, 28);
      ctx.filter = 'none';
    }
    if (relayVisible) {
      ctx.filter = `brightness(${(.87 + lit(relay) * .19) * Math.max(.68, sideLight(relay))})`;
      if (frame.selection === 'relay') outline(ctx, setpieces, 0, 0, relay.x, relay.y - 26, 77, pixelStep);
      else sprite(ctx, setpieces, 0, 0, relay.x, relay.y - 26, 77);
      ctx.filter = 'none';
      ctx.fillStyle = powered ? '#b8ffe8' : frame.phase === 'defense' ? AMBER : '#709cb0';
      ctx.fillRect(Math.round(relay.x - 8), Math.round(relay.y - 34), Math.round(6 + frame.charge * 10), 3);
    }
    const objects = [...visibleActors.map(data => ({ y: data.actor.y, ...data })), ...visibleProps.map(prop => ({ y: prop.y, prop }))];
    objects.sort((a, b) => a.y - b.y);
    for (const object of objects) {
      ctx.save();
      if ('actor' in object) {
        ctx.globalAlpha = object.alpha;
        drawActor(ctx, atlases, object.actor, frame.time, undefined, sideLight(object.actor));
      } else drawProp(ctx, outpost, object.prop, (.62 + lit(object.prop) * .68) * sideLight(object.prop));
      ctx.restore();
    }
    const gunBehind = Math.sin(frame.player.aim) < -Math.SQRT1_2;
    if (!frame.roll && gunBehind) drawGun(ctx, gear, frame);
    drawActor(ctx, atlases, frame.player, frame.time, { walk: frame.walkFrame, roll: frame.roll });
    if (!frame.roll && !gunBehind) drawGun(ctx, gear, frame);
    ctx.restore();

    ctx.fillStyle = `rgba(0,0,0,${1 - balance.sight.visibleLight})`; ctx.fillRect(0, 0, width, height);
    if (pixelStep > 1 && pixelated) {
      // Render directly to the fixed raster, then replicate each sample onto physical screen pixels.
      output.resetTransform(); output.imageSmoothingEnabled = false;
      output.drawImage(pixelated.canvas, 0, 0, pixelated.canvas.width * pixelStep, pixelated.canvas.height * pixelStep);
    }
    hud.resetTransform(); hud.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
    hud.setTransform(hud.canvas.width / width, 0, 0, hud.canvas.height / height, 0, 0);
    hud.imageSmoothingEnabled = true;
    hud.imageSmoothingQuality = 'medium';
    hud.save(); hud.translate(-camera.x, -camera.y);
    for (const prop of visibleProps) drawPropHealth(hud, prop);
    hud.restore();
    drawOverlay(hud, frame, camera);
    drawHud(hud, frame, camera, gear, sight.wasSeen);
  };
}
