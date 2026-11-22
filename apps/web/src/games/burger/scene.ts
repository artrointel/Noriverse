import { gameFontFamily } from '../game-font.ts';
import { burgerLine, shooLines } from './dialogue.ts';
import Phaser from 'phaser';
import { kitchenActionSound, kitchenSound } from './sounds.ts';
import type { SceneFactory } from '../scene-loader.ts';
import { burgerLayerSpacing, burgerSceneHeight, orderBubbleSize } from './layout.ts';
import { diningReplyMs, diningSatisfaction } from './dining.ts';
import { createFootprintReader, createKitchenArt, cupTexture, kitchenShade, pattyOilGlint, pattyOilTexture, pattyShadowTexture } from './art.ts';
import { breads, burgerFacility, burgerPreparationMs, burgerRank, burgerSerial, burgerShooAnimationMs, burgerStorageSize, burgerSupplyUnlocked, burgerTables, burgerUnlockLevel, cupAmount, cupOverflow, cupSize,
  drinkKinds, grillColumns, grillCount, grillRows, ingredients, pattyAt, pattyDoneness, pattyFaces, pattyFrame, pattyKinds, storedPattyFrame } from './rules.ts';
import type { Bread, BurgerAction, Counter, Ingredient, Order, PattyKind, PattyLocation } from './rules.ts';
import { ordersPerLevel } from './cards.ts';
import { cardDeck, cardsPerPage, drawCardHud, loadCardArt } from './card-hud.ts';
import type { CardHud } from './card-hud.ts';
import shop from '../../assets/burger/shop.png';
import food from '../../assets/burger/food.webp';
import patties from '../../assets/burger/patties.webp';
import stations from '../../assets/burger/stations.webp';
import guests from '../../assets/burger/guests.png';
import icons from '../../assets/burger/icons.png';
import furniture from '../../assets/burger/furniture.png';
import eating from '../../assets/burger/eating.png';
import tablesArt from '../../assets/burger/tables.webp';
import paper from '../../assets/burger/paper.webp';
import lid from '../../assets/burger/lid.webp';
import reactions from '../../assets/burger/reactions.webp';
import broom from '../../assets/burger/broom.webp';
import spatula from '../../assets/burger/spatula.webp';
import rawBins from '../../assets/burger/raw-patty-bins.webp';

type Item = Bread | Ingredient | 'paper';
export type BurgerView = { id: string; seed: number; counter: Counter; start: number; opensAt?: number; end: number; clockOffset: number; finishedAt: number; pausedAt: number;
  active: boolean; action: (action: BurgerAction) => boolean; cardHud?: CardHud; labels: Record<string, string>; language?: string;
  rivals: { name: string; money: number }[] };
type Zone = { x: number; y: number; w: number; h: number };
type Hit = { type: 'item' | 'grill' | 'burger' | 'tray' | 'tray-choice' | 'guest' | 'nozzle' | 'cup' | 'service' | 'staged-burger' | 'staged-drink' | 'submit' | 'storage' | 'trash' | 'cards' | 'bubble' | 'card-choice' | 'card-page' | 'card-close';
  index: number; zone: Zone };
type Sprite = { texture: string; frame?: number };
type OilGlint = { at: number; life: number; gap: number; u: number; v: number; angle: number; travel: number; bend: number; size: number; shine: number };
type Placement = { surface?: 'floor' | 'grill' | 'tray' | 'worktop' | 'paper' | 'cup'; base?: number; alpha?: number; angle?: number; stretch?: boolean; lift?: number };

const width = 480;
const menu: Item[] = ['paper', ...breads, ...ingredients];
const ingredientEdges = [10, 54, 93, 130, 168, 206, 243, 280, 318, 355, 393, 431, 473];
const tally = { bunTop: 0, bun: 1, riceTop: 2, rice: 3, cheese: 4, lettuce: 5, onion: 6,
  pickle: 7, tomato: 8, egg: 9, bacon: 10, wrap: 11 } as const;
const atlas = (frame: number): Sprite => ({ texture: 'burger-food', frame });
const pattySprite = (kind: string, frame: number): Sprite => ({ texture: 'burger-patties', frame: (kind === 'chicken' ? 5 : 0) + frame });
const stationArt = { steam: 1, cola: 2, soda: 3 } as const;
const prop = (name: keyof typeof stationArt): Sprite => ({ texture: 'burger-stations', frame: stationArt[name] });
const chef = (guest: number, frame: number): Sprite => ({ texture: 'burger-guests', frame: (guest % 4) * 6 + frame });
const furnitureArt = (frame: number): Sprite => ({ texture: 'burger-furniture', frame });
const paperSprite = { texture: 'burger-paper', frame: 0 };
const foods = (item: Item, cooked = 0): Sprite => {
  if (item === 'paper') return paperSprite;
  if (item === 'beef' || item === 'chicken') return pattySprite(item, cooked);
  return atlas(tally[item]);
};
const icon = (frame: number): Sprite => ({ texture: 'burger-ingredient-icons', frame });
const walkFrame = (age: number) => 2 + Math.floor(Math.max(0, age) / 118) % 4;
const grillZone = { x: 15, y: 234, w: 162, h: 38 };
const trayZone = (i: number): Zone => ({ x: 188 + i * 27, y: 237, w: 26, h: 35 });
const serviceZone = { x: 403, y: 231, w: 73, h: 44 };
const serveZone = { x: 424, y: 258, w: 30, h: 17 };
const stagedBurgerZone = { x: 405, y: 231, w: 33, h: 27 };
const stagedDrinkZone = { x: 439, y: 231, w: 31, h: 26 };
const bowlZone = (i: number): Zone => ({ x: 249 + i * 45, y: 235, w: 42, h: 38 });
const drinkZone = (i: number): Zone => ({ x: 347 + i * 22, y: 249, w: 22, h: 22 });
const nozzleZone = (i: number): Zone => ({ ...drinkZone(i), y: 219, h: 30 });
const trashZone = { x: 8, y: 282, w: 62, h: 35 };
const rackZone = { x: 85, y: 289, w: 385, h: 18 };
const storageZone = (i: number): Zone => ({
  x: rackZone.x + i * rackZone.w / burgerStorageSize, y: rackZone.y,
  w: rackZone.w / burgerStorageSize, h: rackZone.h,
});
const grillPattySize = { w: 28, h: 22 };
const trayPattySize = { w: 23, h: 18 };
const trayPattyY = (index: number) => 260 - index * 2.15;
const shownTrayPatties = 5;
const dragDistance = 7;
const assemblyFoodY = 256;
const wrapperSize = { width: 43, height: 29 };
const assemblyBurgerSize = 31;
const slotWidth = (grillZone.w - 6) / grillColumns;
const slotHeight = (grillZone.h - 10) / grillRows;
const kitchenSlots = Array.from({ length: grillCount }, (_, i) =>
  ({ x: grillZone.x + 4 + (i % grillColumns) * slotWidth, y: grillZone.y + 3 + Math.floor(i / grillColumns) * slotHeight,
    w: slotWidth - 2, h: slotHeight - 2 }));
const center = (zone: Zone) => ({ x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 });
const contains = (zone: Zone, x: number, y: number) => x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h;
const ease = (n: number) => 1 - Math.max(0, Math.min(1, 1 - n)) ** 3;
const topBread = (bread: Bread) => atlas(bread === 'bun' ? tally.bunTop : tally.riceTop);
const cookFrame = { rare: 1, medium: 2, well: 3 };
const trayPanel = { x: 100, y: 51, w: 280, h: 222 };
const pickerTrash = { x: 115, y: 239, w: 35, h: 27 };
const grillTapWindow = 260;
const flightMs = 180;
const ingredientArt = (item: Item, stack: Counter['burgers'][number]) =>
  (item === 'bun' || item === 'rice') && stack.bread === item && stack.layers.some(layer => layer.patty)
    ? topBread(item) : foods(item);
const duration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};

export const burgerScene: SceneFactory = view => {
  const images: Phaser.GameObjects.Image[] = [];
  const footprint = createFootprintReader();
  const captions: { view: Phaser.GameObjects.Text; size: number; color: string; text?: string; density?: number; outlined?: boolean }[] = [];
  let density = 1;
  const pixel = (value: number) => Math.round(value * density) / density;
  let imageIndex = 0, captionIndex = 0, layout: Hit[] = [];
  let slot = 0;
  let lastRound = '', seenFeedback = 0;
  const unlockTimes = new Map<string, number | null>();
  const assemblies = [{ signature: '', changedAt: 0 }, { signature: '', changedAt: 0 }];
  const guestMotion = new Map<number, { from: number; to: number; at: number; ms: number; order: Order }>();
  const departing = new Map<number, { x: number; order: Order; at: number; copy?: string; shooed?: boolean }>();
  const flights: { sprite: Sprite; from: Zone; x: number; y: number; at: number; slot: number; part: number; serial?: number; trash?: boolean }[] = [];
  let ink: Phaser.GameObjects.Graphics;
  let feverInk: Phaser.GameObjects.Graphics;
  let feverTime = 0, feverGlow = 0, seenFever = 0;
  let balloons: Phaser.GameObjects.Graphics;
  let enlargedBalloon: Phaser.GameObjects.Graphics;
  let expandedBubble: number | undefined;
  let cardInk: Phaser.GameObjects.Graphics;
  let historyPage: number | undefined;
  let pickerInk: Phaser.GameObjects.Graphics;
  let trayPicker: { kind: PattyKind; slot: number; at: number } | undefined;
  let spatulaMotion: { zone: Zone; at: number; phase: 'ready' | 'flip' | 'carry'; x?: number; y?: number } | undefined;
  let pickerSlots: { zone: Zone; serial?: number }[] = [];
  const grillBurns = new Map<number, { serial?: number; burnt: boolean }>();
  const grillOil = new Map<number, { serial?: number; glints: OilGlint[] }>();
  let stopSizzle: (() => void) | undefined;
  let stopPour: (() => void) | undefined;

  let gesture: { from: Hit; x: number; y: number; startX: number; startY: number; id: number; moved: boolean; serial?: number } | undefined;
  let pending: { key: string; at: number; timer: number; single: () => void } | undefined;
  const progress = (view: BurgerView) => Math.min(view.counter.closed ? view.end : Infinity,
    view.counter.draft?.at ?? Infinity, view.finishedAt || Infinity, (view.pausedAt || Date.now()) - view.clockOffset);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function picture(scene: Phaser.Scene, sprite: Sprite, x: number, y: number, w: number, h: number, depth = 2, alpha = 1, angle = 0, stretch = false) {
    const index = imageIndex++;
    const image = images[index] ?? (images[index] = scene.add.image(x, y, sprite.texture, sprite.frame));
    if (image.texture.key !== sprite.texture || (sprite.frame !== undefined && Number(image.frame.name) !== sprite.frame)) {
      image.setTexture(sprite.texture, sprite.frame);
    }
    const scale = Math.min(w / image.width, h / image.height);
    image.setPosition(pixel(x), pixel(y)).setDisplaySize(
      Math.max(1 / density, pixel(stretch ? w : image.width * scale)), Math.max(1 / density, pixel(stretch ? h : image.height * scale)))
      .setDepth(depth).setVisible(true).setOrigin(.5).setAlpha(alpha).setAngle(angle).setFlipX(false);
    return image;
  }

  function label(scene: Phaser.Scene, text: string, x: number, y: number, size = 11, color = '#fff0da', width = 0, depth = 5, outlined = false) {
    const index = captionIndex++;
    const cached = captions[index] ?? (captions[index] = {
      view: scene.add.text(x, y, text, { fontFamily: gameFontFamily, color, fontSize: size + 2, resolution: density, fontStyle: 'normal' }).setOrigin(.5), color, size,
    });
    const value = cached.view;
    if (cached.size !== size || cached.color !== color || cached.text !== text || cached.density !== density || cached.outlined !== outlined) {
      cached.size = size; cached.color = color; cached.text = text; cached.density = density; cached.outlined = outlined;
      value.setText(text).setStyle({ fontFamily: gameFontFamily, color, fontSize: size + 2, fontStyle: 'normal',
        resolution: density, stroke: '#372236', strokeThickness: outlined ? 2.7 : 0 });
      const texture = value.texture as Phaser.Textures.CanvasTexture;
      const { context, width: w, height: h } = texture;
      if (w && h) {
        const glyphs = context.getImageData(0, 0, w, h);
        for (let i = 3; i < glyphs.data.length; i += 4) glyphs.data[i] = glyphs.data[i] >= 110 ? 255 : 0;
        context.putImageData(glyphs, 0, 0);
        texture.refresh();
      }
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    value.setPosition(pixel(x), pixel(y)).setDepth(depth).setVisible(true);
    value.setScale(width ? Math.min(1, width / Math.max(1, value.width)) : 1, 1);
    return value;
  }

  function place(scene: Phaser.Scene, sprite: Sprite, x: number, y: number, w: number, h: number, depth = 2,
    { surface = 'worktop', base, alpha = 1, angle = 0, stretch = false, lift = 0 }: Placement = {}) {
    const body = picture(scene, sprite, x, y, w, h, depth, alpha, angle, stretch);
    const bounds = footprint(body.frame);
    const span = body.displayWidth * bounds.width;
    const foot = base ?? y + body.displayHeight * (bounds.bottom - .5);
    if (surface === 'grill' || surface === 'tray') {
      const texture = pattyShadowTexture(scene, body.frame);
      picture(scene, { texture }, x + .7, foot - .7, body.displayWidth * 1.24 + lift * .1,
        Math.max(5 / density, body.displayHeight * .55), depth - .025,
        (surface === 'grill' ? .9 : .58) * alpha * Math.max(.3, 1 - lift / 36), 0, true);
      return body;
    }
    const flat = surface === 'paper';
    const strength = surface === 'floor' ? .65 : flat ? .54 : .76;
    const minHeight = surface === 'cup' ? Math.max(3, 2 / density) : 3;
    picture(scene, { texture: kitchenShade }, x + span * .055, foot + (flat ? .1 : span * .02),
      span * (flat ? 1.02 : 1.17) + lift * .14, Math.max(minHeight, span * (flat ? .37 : .31)) + lift * .055,
      depth - .025, strength * alpha * Math.max(.24, 1 - lift / 42), 0, true);
    return body;
  }

  function isDragging(type: Hit['type'], index: number) {
    return gesture?.moved && gesture.from.type === type && gesture.from.index === index;
  }

  function unlockProgress(item: Parameters<typeof burgerUnlockLevel>[0], unlocked: boolean, now: number, stagger = 0) {
    if (!unlocked) { unlockTimes.set(item, null); return 0; }
    const previous = unlockTimes.get(item);
    const started = previous === null ? now : previous ?? -Infinity;
    unlockTimes.set(item, started);
    return reduced.matches ? 1 : Phaser.Math.Clamp((now - started - stagger) / 580, 0, 1);
  }

  function drawSupplyLid(scene: Phaser.Scene, zone: Zone, progress: number, tilt = 0) {
    if (progress >= 1) return;
    const lift = 39 * ease(progress);
    const { x, y } = center(zone);
    place(scene, { texture: 'burger-lid' }, x + lift * .14, y - lift, zone.w + 2, zone.h - 4, 2.2,
      { base: zone.y + zone.h - 5, lift, alpha: 1 - progress ** 1.45, angle: tilt + 16 * progress, stretch: true });
  }

  const traySlide = (openedAt: number, now: number) => reduced.matches ? 0 : 7 * (1 - ease((now - openedAt) / 170));

  function spot(type: Hit['type'], index: number, zone: Zone) { layout.push({ type, index, zone }); }
  const find = (x: number, y: number) => layout.find(item => contains(item.zone, x, y));
  const location = (hit: Hit): PattyLocation => hit.type === 'tray' ? pattyKinds[hit.index] : hit.index;

  function apply(action: BurgerAction) {
    const accepted = view().burger?.action(action);
    if (accepted) kitchenActionSound(action);
    return accepted;
  }

  function ingredient(item: Item, target: number, grill?: number, source?: Zone) {
    const data = view().burger;
    if (!data) return;
    const now = progress(data);
    if (item === 'beef' || item === 'chicken') {
      const empty = grill ?? data.counter.grill.findIndex(value => !value);
      if (empty < 0 || data.counter.grill[empty]) return;
      if (apply({ type: 'grill', kind: item, slot: empty }) && source && !reduced.matches) {
        const { x, y } = center(kitchenSlots[empty]);
        flights.push({ sprite: foods(item), from: source, x, y, at: now, slot: -1, part: empty });
      }
      return;
    }
    const stack = data.counter.burgers[target];
    if (!apply({ type: 'add', item, slot: target }) || !source || reduced.matches) return;
    const part = item === 'paper' ? -3 : item === 'bun' || item === 'rice' ? (stack.bread ? -1 : -2) : stack.layers.length;
    const y = part < -1 ? assemblyFoodY : assemblyFoodY - (part === -1 ? stack.layers.length + 1 : part + 1) * 3.5;
    flights.push({ sprite: item === 'paper' ? paperSprite : ingredientArt(item, stack), from: source,
      x: center(bowlZone(target)).x, y, at: now, slot: target, part });
  }

  function submit(data: BurgerView) {
    const order = data.counter.orders[0];
    if (data.counter.service?.burger && order) apply({ type: 'serve', order: order.id });
  }

  function chooseTray(data: BurgerView, kind: PattyKind, index: number, target: number, source: Zone, serial?: number) {
    const tray = data.counter.tray.filter(item => item.kind === kind);
    const patty = serial === undefined ? tray[index] : tray.find(item => item.serial === serial);
    if (!patty) return;
    if (storedPattyFrame(patty.faces) === 4) {
      if (apply({ type: 'discard-tray', kind, index, serial: patty.serial })) {
        trayPicker = undefined;
        tossPatty(kind, source, progress(data));
      }
      return;
    }
    if (!apply({ type: 'stack-tray', kind, index, serial: patty.serial, slot: target })) return;
    trayPicker = undefined;
    if (reduced.matches || !pattyDoneness(patty.faces)) return;
    const part = data.counter.burgers[target].layers.length;
    flights.push({ sprite: pattySprite(patty.kind, storedPattyFrame(patty.faces)),
      from: source, x: center(bowlZone(target)).x, y: assemblyFoodY - (part + 1) * 3.5, at: progress(data), slot: target, part });
  }

  function tossPatty(kind: PattyKind, source: Zone, at: number, part = -1, serial?: number) {
    if (reduced.matches) return;
    flights.push({ sprite: pattySprite(kind, 4), from: source, ...center(trashZone), at, slot: -2, part, serial, trash: true });
  }

  function cancelTap() {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pending = undefined;
  }

  function chooseCard(data: BurgerView, index: number) {
    const card = data.cardHud?.showDraft ? data.counter.draft?.offers[index] : undefined;
    if (card) apply({ type: 'choose-card', card, level: burgerRank(data.counter.served) });
  }

  function pageCards(data: BurgerView, delta: number) {
    if (historyPage === undefined) return;
    const pages = Math.max(1, Math.ceil(new Set(data.counter.cards).size / cardsPerPage));
    historyPage = Phaser.Math.Clamp(historyPage + delta, 0, pages - 1);
  }

  function tap(hit: Hit, data: BurgerView, serial?: number) {
    const key = hit.type + ':' + hit.index;
    const at = performance.now();
    const double = pending?.key === key && at - pending.at <= grillTapWindow;
    if (pending) {
      const previous = pending;
      cancelTap();
      if (!double) previous.single();
    }
    function defer(action: () => void) {
      const timer = window.setTimeout(() => {
        pending = undefined;
        const current = view().burger;
        if (current?.active && current.id === data.id) action();
      }, grillTapWindow);
      pending = { key, at, timer, single: action };
    }
    switch (hit.type) {
      case 'cards': if (data.cardHud) historyPage = 0; break;
      case 'card-close': historyPage = undefined; break;
      case 'card-page': pageCards(data, hit.index); break;
      case 'card-choice': chooseCard(data, hit.index); break;
      case 'bubble': expandedBubble = expandedBubble === hit.index ? undefined : hit.index; kitchenSound('touch', .24); break;
      case 'item': ingredient(menu[hit.index], slot, undefined, hit.zone); break;
      case 'grill': {
        const previousPatty = data.counter.grill[hit.index];
        if (!previousPatty || (serial !== undefined && previousPatty.serial !== serial)) break;
        function discardBurnt(patty: NonNullable<typeof previousPatty>, now: number) {
          if (pattyFrame(pattyFaces(patty, now), patty.side) !== 4) return false;
          spatulaMotion = undefined;
          if (apply({ type: 'move', from: hit.index, to: 'trash', serial: patty.serial })) tossPatty(patty.kind, hit.zone, now, hit.index, patty.serial);
          return true;
        }
        if (discardBurnt(previousPatty, progress(data))) break;
        if (double) {
          if (apply({ type: 'flip', slot: hit.index, side: previousPatty.side, serial: previousPatty.serial })) {
            spatulaMotion = { zone: hit.zone, at: progress(data), phase: 'flip' };
          }
        }
        else {
          spatulaMotion = { zone: hit.zone, at: progress(data), phase: 'ready' };
          defer(() => {
            const current = view().burger;
            if (!current) return;
            const patty = current.counter.grill[hit.index];
            if (!patty || patty.serial !== previousPatty.serial) return;
            const now = progress(current);
            if (discardBurnt(patty, now)) return;
            const faces = pattyFaces(patty, now);
            const count = current.counter.tray.filter(item => item.kind === patty.kind).length;
            if (!pattyDoneness(faces) || !apply({ type: 'hold', slot: hit.index, serial: patty.serial }) || reduced.matches) return;
            const kindIndex = pattyKinds.indexOf(patty.kind);
            const { x } = center(trayZone(kindIndex));
            const y = trayPattyY(Math.min(shownTrayPatties - 1, count));
            spatulaMotion = { zone: hit.zone, at: now, phase: 'carry', x, y };
            flights.push({ sprite: pattySprite(patty.kind, pattyFrame(faces)),
              from: hit.zone, x, y, at: now, slot: -2, part: hit.index, serial: patty.serial });
          });
        }
        break;
      }
      case 'tray': {
        const kind = pattyKinds[hit.index];
        const quantity = data.counter.tray.filter(item => item.kind === kind).length;
        if (quantity > 1) { trayPicker = { kind, slot, at: progress(data) }; kitchenSound('touch', .24); }
        else if (quantity === 1) chooseTray(data, kind, 0, slot, hit.zone);
        break;
      }
      case 'tray-choice': {
        if (trayPicker) chooseTray(data, trayPicker.kind, hit.index, trayPicker.slot, hit.zone, serial);
        break;
      }
      case 'guest': {
        if (double) apply({ type: 'shoo', order: hit.index });
        else defer(() => {});
        break;
      }
      case 'burger': {
        const stack = data.counter.burgers[hit.index];
        if (stack.packed) { apply({ type: 'stage-burger', slot: hit.index }); break; }
        if (slot !== hit.index) { slot = hit.index; kitchenSound('touch', .2); defer(() => {}); break; }
        if (double) apply({ type: 'wrap', slot });
        else if (stack.top) defer(() => apply({ type: 'pop', slot: hit.index }));
        else apply({ type: 'pop', slot });
        break;
      }
      case 'nozzle': apply({ type: 'pour', drink: hit.index, pouring: Boolean(data.counter.cups[hit.index].pourAt) }); break;
      case 'cup': apply({ type: 'stage-drink', drink: hit.index }); break;
      case 'staged-burger': apply({ type: 'return-burger', to: 'origin', serial }); break;
      case 'staged-drink': apply({ type: 'return-drink', to: 'machine' }); break;
      case 'submit': submit(data); break;
      case 'storage': apply({ type: 'stage-stored', index: hit.index, serial }); break;
    }
  }

  function drop(from: Hit, to: Hit | undefined, up: boolean, serial?: number) {
    const inService = to && ['service', 'staged-burger', 'staged-drink', 'submit'].includes(to.type);
    const inTrash = to?.type === 'trash';
    switch (from.type) {
      case 'item': {
        const item = menu[from.index];
        if (to?.type === 'grill' && (item === 'beef' || item === 'chicken')) ingredient(item, slot, to.index);
        else if (to?.type === 'burger' && item !== 'beef' && item !== 'chicken') ingredient(item, to.index);
        break;
      }
      case 'tray': case 'grill':
        if (to?.type === 'grill' || to?.type === 'tray') apply({ type: 'move', from: location(from), to: location(to), serial });
        else if (to?.type === 'burger') {
          const viewData = view().burger;
          const kind = pattyKinds[from.index];
          if (viewData && from.type === 'tray' && viewData.counter.tray.filter(item => item.kind === kind).length > 1) {
            trayPicker = { kind, slot: to.index, at: progress(viewData) };
          } else apply({ type: 'stack', from: location(from), slot: to.index, serial });
        }
        else if (inTrash) apply({ type: 'move', from: location(from), to: 'trash', serial });
        break;
      case 'burger':
        if (to?.type === 'storage') apply({ type: 'store-burger', slot: from.index, index: to.index });
        else if (inService) apply({ type: 'stage-burger', slot: from.index });
        else if (inTrash) apply({ type: 'discard', slot: from.index });
        break;
      case 'storage':
        if (to?.type === 'storage') apply({ type: 'shift-stored', from: from.index, to: to.index, serial });
        else if (inService) apply({ type: 'stage-stored', index: from.index, serial });
        else if (inTrash || up) apply({ type: 'discard-stored', index: from.index, serial });
        break;
      case 'cup':
        if (inService) apply({ type: 'stage-drink', drink: from.index });
        else if (inTrash) apply({ type: 'spill', drink: from.index });
        break;
      case 'staged-burger':
        if (inTrash) apply({ type: 'return-burger', to: 'trash', serial });
        else if (to?.type === 'burger') apply({ type: 'return-burger', to: to.index, serial });
        else if (to?.type === 'storage') {
          const origin = view().burger?.counter.service?.origin;
          if (origin?.area === 'storage' && origin.index === to.index) apply({ type: 'return-burger', to: 'origin', serial });
        }
        break;
      case 'staged-drink':
        if (to?.type === 'cup' || to?.type === 'nozzle') apply({ type: 'return-drink', to: 'machine' });
        else if (inTrash) apply({ type: 'return-drink', to: 'trash' });
        break;
    }
  }

  function burgerArt(scene: Phaser.Scene, x: number, bottom: number, size: number, layers: Sprite[],
    bread: Bread | undefined, top: boolean, depth: number, lift = 0, hidden: number[] = [], onPaper = false) {
    const step = size * burgerLayerSpacing;
    if (bread && !hidden.includes(-2)) {
      if (onPaper) place(scene, foods(bread), x, bottom, size, size, depth, { surface: 'paper' });
      else picture(scene, foods(bread), x, bottom, size, size, depth);
    }
    layers.forEach((layer, index) => {
      if (hidden.includes(index)) return;
      const offset = !top && index === layers.length - 1 ? lift : 0;
      picture(scene, layer, x, bottom - (index + 1) * step - offset, size, size, depth + (index + 1) * .06);
    });
    if (bread && top && !hidden.includes(-1)) {
      picture(scene, topBread(bread), x, bottom - (layers.length + 1) * step - lift, size, size,
        depth + (layers.length + 1) * .06);
    }
  }

  function renderScore(scene: Phaser.Scene, data: BurgerView, now: number) {
    const { counter, labels } = data;
    const fever = counter.feverUntil > now;
    const stat = (value: string, x: number, y: number, size: number, color = '#fff0da', maxWidth = 0) =>
      label(scene, value, x, y, size, color, maxWidth, 5, true);
    if (counter.cards) {
      const ratio = counter.draft ? 1 : counter.served % ordersPerLevel / ordersPerLevel;
      const barHeight = burgerSceneHeight * .01;
      ink.fillStyle(0x203528, .92).fillRect(0, 0, width, barHeight);
      ink.fillStyle(0x63e29a, 1).fillRect(0, 0, width * ratio, barHeight);
      stat('Lv. ' + burgerRank(counter.served), 21, 23, 11, '#a3ffc0');
      picture(scene, cardDeck, 48, 23, 19, 19, 4);
      spot('cards', 0, { x: 38, y: 12, w: 22, h: 23 });
    }
    const timerX = counter.cards ? 82 : 52;
    stat(labels.time, timerX, 16, 8, '#c6e8db');
    stat(data.start ? duration(data.end - Math.max(now, data.opensAt ?? data.start)) : '—', timerX, 29, 13);
    stat(fever ? labels.fever : labels.combo, 132, 16, 8, fever ? '#ffd273' : '#c6e8db');
    stat(fever ? duration(counter.feverUntil - now) + ' ×2' : '×' + counter.combo, 132, 29, 13);
    stat(labels.money, 430, 16, 8, '#c6e8db');
    stat('✦ ' + counter.money, 430, 29, 14, '#ffe2a0');
    const feedback = counter.feedback;
    if (feedback && now - feedback.at < 2800) {
      if (feedback.tip) stat(labels.tip + ' +' + feedback.tip, 430, 46, 10, '#ffdb91');
      if (feedback.timeAdded) stat('+' + duration(feedback.timeAdded), timerX, 46, 10, '#a5ffc3');
    }
    data.rivals.slice(0, 3).forEach((rival, i, rivals) => {
      const x = 275 + (i - (rivals.length - 1) / 2) * 55;
      stat(rival.name, x, 16, 8, '#edc5d9', 49);
      stat(String(rival.money), x, 29, 11);
    });
  }

  function paintBubble(anchor: number, w: number, h: number, bottom = 123, id?: number) {
    const expanded = id !== undefined && id === expandedBubble;
    const scale = expanded ? 2 : 1;
    w *= scale; h *= scale;
    const x = expanded ? Phaser.Math.Clamp(anchor, w / 2 + 3, width - w / 2 - 3) : anchor;
    if (expanded) bottom = Math.max(bottom, h + 5);
    const top = pixel(bottom - h), left = pixel(x - w / 2);
    const tail = pixel(Phaser.Math.Clamp(anchor, left + 9, left + w - 9));
    const surface = expanded ? enlargedBalloon : balloons;
    surface.fillStyle(0x513244, .25).fillRoundedRect(left + 1, top + 2, w, h, 6 * scale);
    surface.fillStyle(0xfff0d5).fillRoundedRect(left, top, w, h, 6 * scale);
    surface.lineStyle(scale, 0x8a5760).strokeRoundedRect(left, top, w, h, 6 * scale);
    surface.fillStyle(0x8a5760).fillTriangle(tail - 5, bottom, tail + 5, bottom, tail + 1, bottom + 5);
    surface.fillStyle(0xfff0d5).fillTriangle(tail - 4, bottom - 1, tail + 4, bottom - 1, tail + 1, bottom + 4);
    if (id !== undefined) {
      const hit: Hit = { type: 'bubble', index: id, zone: { x: left, y: top, w, h: h + 4 } };
      if (expanded) layout.unshift(hit);
      else layout.push(hit);
    }
    return { x, middle: (top + bottom) / 2, scale, depth: expanded ? 23 : 3 };
  }

  function speech(scene: Phaser.Scene, copy: string, x: number, bottom = 123, id?: number) {
    const lineWidth = bottom === 123 ? 12 : 19;
    const lines = copy.split(/\s+/).reduce<string[]>((result, word) => {
      const last = result.at(-1);
      if (last && last.length + word.length < lineWidth) result[result.length - 1] += ' ' + word;
      else result.push(word);
      return result;
    }, []);
    const caption = label(scene, lines.join('\n'), x, 0, lines.length > 3 ? 8 : 10, '#523342', 72, 7);
    const bubble = paintBubble(x, Math.max(36, Math.ceil(caption.displayWidth) + 14),
      caption.displayHeight + 8, Math.max(bottom, caption.displayHeight + 12), id);
    caption.setPosition(pixel(bubble.x), pixel(bubble.middle)).setDepth(bubble.depth + 4)
      .setScale(caption.scaleX * bubble.scale, bubble.scale);
  }

  function ingredientStrip(scene: Phaser.Scene, layers: readonly (Pick<Order['layers'][number], 'ingredient' | 'cooked'>
    & Pick<Counter['burgers'][number]['layers'][number], 'patty'>)[], x: number, y: number,
    maxWidth: number, depth: number, scale = 1) {
    const contents = layers.map(layer => {
      const grade = layer.cooked ?? (layer.patty && pattyDoneness(layer.patty.faces));
      return layer.ingredient === 'beef' || layer.ingredient === 'chicken'
        ? pattySprite(layer.ingredient, grade ? cookFrame[grade] : 0) : icon(ingredients.indexOf(layer.ingredient));
    });
    const spacing = Math.min(12 * scale, maxWidth / contents.length);
    contents.forEach((sprite, i) => picture(scene, sprite, x + (i - (contents.length - 1) / 2) * spacing, y, spacing, spacing, depth));
  }

  function drawOrder(scene: Phaser.Scene, order: Order, anchor: number) {
    const layers = order.layers.map(layer => foods(layer.ingredient, layer.cooked && cookFrame[layer.cooked]));
    const { burger, stack, width: bubbleWidth, height, stripWidth, stripHeight } = orderBubbleSize(layers.length, Boolean(order.drink));
    const { x, middle, scale, depth } = paintBubble(anchor, bubbleWidth, height, 123, order.id);
    const y = middle - stripHeight * scale / 2;
    burgerArt(scene, x - (order.drink ? 12 * scale : 0), y + stack * scale / 2, burger * scale, layers, order.bread, true, depth);
    if (order.drink) {
      const drinkX = x + burger * scale / 2;
      picture(scene, { texture: cupTexture(order.drink.kind, order.drink.size) }, drinkX, y, 23 * scale, 27 * scale, depth + 1);
    }
    ingredientStrip(scene, order.layers, x, middle + (height / 2 - 9) * scale, stripWidth * scale, depth + 1.2, scale);
  }

  function renderGuests(scene: Phaser.Scene, { counter, labels, start, language = 'en' }: BurgerView, now: number) {
    if (!counter.orders.length && !departing.size) {
      const prep = Boolean(start && now >= start && now < start + burgerPreparationMs && !counter.sequence);
      label(scene, prep ? labels.prepare + '  ' + duration(start + burgerPreparationMs - now) : labels.wait,
        width / 2, 129, 12, '#fff2d6', 180, 5, true);
    }
    const feedback = counter.feedback;
    const fresh = feedback && now - feedback.at < 2000;
    if (fresh && feedback.id !== seenFeedback) {
      seenFeedback = feedback.id;
      if (feedback.kind === 'spill') kitchenSound('splash');
      if (feedback.kind === 'burnt' || feedback.kind === 'raw') kitchenSound('plate', .18);
    }
    const tween = (motion: { from: number; to: number; at: number; ms: number }) =>
      motion.from + (motion.to - motion.from) * ease((now - motion.at) / motion.ms);
    const shoo = counter.shoo;
    for (const [id, motion] of guestMotion) {
      if (counter.orders.some(order => order.id === id)) continue;
      if (counter.diners?.some(diner => diner.id === id)) { guestMotion.delete(id); continue; }
      let copy: string | undefined;
      if (fresh && feedback.guest === motion.order.guest) {
        const variant = feedback.id % 2 && (feedback.kind === 'perfect' || feedback.kind === 'mixed') ? feedback.kind + 'Alt' : feedback.kind;
        copy = labels[variant];
      }
      const shooed = shoo?.order === id && shoo.left && now - shoo.at < 2550;
      departing.set(id, { x: reduced.matches ? motion.to : tween(motion), order: motion.order,
        at: shooed ? shoo.at : now, copy: shooed ? labels['shooLeft' + shoo.variant] : copy, shooed });
      guestMotion.delete(id);
    }
    const servedGuestSpeaking = counter.diners?.some(diner => now < diner.at + diningReplyMs);
    const firstX = servedGuestSpeaking || [...departing.values()].some(guest => guest.copy && now - guest.at < 2000) ? 359 : 430;
    counter.orders.forEach((order, index) => {
      const target = firstX - index * 102;
      let motion = guestMotion.get(order.id);
      if (!motion || motion.to !== target) {
        if (!motion && now - order.at < 240) kitchenSound('knob', .15);
        motion = { from: motion ? tween(motion) : -36, to: target, at: motion ? now : order.at, ms: motion ? 410 : 1050, order };
        guestMotion.set(order.id, motion);
      }
      const x = reduced.matches ? target : tween(motion);
      const age = now - order.at;
      const left = order.until - now;
      const reaction = shoo?.order === order.id && !shoo.left ? shoo : undefined;
      const shooAge = reaction ? now - reaction.at : Infinity;
      const copy = fresh && feedback.order === order.id && feedback.line ? burgerLine(feedback.line, language)
        : reaction && shooAge < 2150 && shooAge >= 190 ? (reaction.variant < 3 ? labels['shooStay' + reaction.variant]
        : burgerLine(shooLines[reaction.variant - 3], language))
        : left <= 2000 ? labels.impatient : age >= 4000 && age < 6000 ? labels.order
        : age >= 17000 && age < 19000 ? (order.id % 2 ? labels.chat : labels.chatAlt) : undefined;
      if (order.reorderedAt !== undefined && now - order.reorderedAt < 2400) speech(scene, labels.soldOut, x, 123, order.id);
      else if (copy) speech(scene, copy, x, 123, order.id);
      else drawOrder(scene, order, x);
      const moving = !reduced.matches && now - motion.at < motion.ms;
      const blink = (age + order.id * 733) % 3100 < 135;
      if (x >= 0 && burgerFacility(counter, 'broom')) spot('guest', order.id, { x: x - 21, y: 125, w: 42, h: 40 });
      drawGuest(scene, order, x + broomSwing(scene, x, shooAge), moving ? walkFrame(now - motion.at) : Number(blink),
        142, moving && motion.from > motion.to);
      const patience = Math.max(0, Math.min(1, left / (order.patienceMs ?? order.until - order.at)));
      const barX = pixel(x - 24);
      ink.fillStyle(0x3e273c).fillRect(barX, 163, 48, 6);
      ink.fillStyle(patience > .25 ? 0x8ee0a8 : 0xf7a375).fillRect(barX + 2, 165, Math.floor(22 * patience) * 2, 2);
    });
    for (const [id, guest] of departing) {
      const age = now - guest.at, pause = guest.copy ? 2000 : 0;
      if (age >= pause + (reduced.matches ? 0 : 650)) { departing.delete(id); continue; }
      if (age < pause && guest.copy) {
        speech(scene, guest.copy, guest.x, 123, id);
        drawGuest(scene, guest.order, guest.x + (guest.shooed ? broomSwing(scene, guest.x, age) : 0),
          Number(age % 2100 > 1750 && age % 2100 < 1870), 142);
      } else {
        const x = guest.x + (width + 32 - guest.x) * Math.min(1, (age - pause) / 650);
        drawGuest(scene, guest.order, x, walkFrame(age - pause), 142);
      }
    }
  }

  function broomSwing(scene: Phaser.Scene, x: number, age: number) {
    if (age < 0 || age >= burgerShooAnimationMs) return 0;
    const direction = x > width - 75 ? -1 : 1;
    const swing = age < 130 ? -16 - 43 * ease(age / 130) : -59 + 132 * ease((age - 130) / 190);
    picture(scene, { texture: 'burger-broom' }, x + direction * 27, 156, 26, 66, 8,
      Math.min(1, (burgerShooAnimationMs - age) / 130), direction * (reduced.matches ? -28 : -swing)).setOrigin(.5, .91);
    const hitAge = age - 205;
    return hitAge < 0 || reduced.matches ? 0 : Math.sin(hitAge / 22) * 6 * (1 - hitAge / 415);
  }

  function drawGuestAura(x: number, y: number, radius: number, id: number) {
    if (!feverGlow || x + radius < 0 || x - radius > width) return;
    const time = reduced.matches ? 0 : feverTime;
    feverInk.fillStyle(0xffb55f, .16 * feverGlow).fillEllipse(x, y + radius * .28, radius * 2.35, radius * 1.75);
    for (let i = 0; i < 6; i++) {
      const phase = ((time + id * 211 + i * 173) % 950) / 950;
      const direction = i % 2 ? -1 : 1;
      const fx = x + direction * radius * (.82 + (i % 3) * .13) + Math.sin(phase * Math.PI * 2) * 2;
      const fy = y + radius * (.81 - phase * 1.9);
      const alpha = Math.sin(phase * Math.PI) * feverGlow;
      const size = radius * (.16 + (i % 3) * .035) * (1 - phase * .45);
      feverInk.fillStyle(0xff8a47, .54 * alpha).fillTriangle(fx - size, fy, fx + size, fy,
        fx + direction * size * .65, fy - size * 3.8);
      feverInk.fillStyle(0xffcf7e, .59 * alpha).fillEllipse(fx, fy - size * .45, size * 1.12, size * 1.65);
    }
  }

  function drawGuest(scene: Phaser.Scene, order: Pick<Order, 'guest' | 'id'>, x: number, frame: number, y: number, left = false) {
    drawGuestAura(x, y, 21, order.id);
    place(scene, chef(order.guest, frame), x, y, 46, 46, 2, { surface: 'floor' }).setFlipX(left);
  }

  function renderDining(scene: Phaser.Scene, { counter, seed, labels, language = 'en' }: BurgerView, now: number) {
    const diners = counter.diners ?? [];
    const speakers = diners.filter(diner => now < diner.at + diningReplyMs);
    const tables = Array.from({ length: burgerTables(counter) }, (_, index) => {
      const hash = (seed >>> (index * 7)) & 127;
      const row = Math.floor(index / 3);
      return { x: 64 + (index % 3) * 144 + row * 27 + (hash % 5) * 3, y: 68 + row * 26 + (hash % 3) * 2 };
    });
    tables.forEach(({ x, y }, index) => {
      const occupant = diners.find(diner => diner.table === index && diner.eatAt <= now && now < diner.doneAt);
      const depth = index < 3 ? 1 : 1.42;
      place(scene, { texture: 'burger-tables', frame: 1 }, x, y - 10, 26.4, 29.6, depth, { surface: 'floor', stretch: true });
      place(scene, { texture: 'burger-tables', frame: 0 }, x, y + 7, 42.4, 35.2, depth + .23, { surface: 'floor', stretch: true });
      if (!occupant) return;
      const age = now - occupant.eatAt;
      if (occupant.thought && age >= 3100 && age < 5100) {
        speech(scene, burgerLine(occupant.thought, language), Math.min(width - 46, x + 25), y - 22, occupant.id);
      }
      const finished = occupant.doneAt - now < 900;
      const bite = age % 1600;
      const pose = reduced.matches ? 2 : bite < 430 ? 0 : bite < 700 ? 1 : bite < 980 ? 2 : 3;
      drawGuestAura(x, y - 16, 15, occupant.id);
      place(scene, furnitureArt(finished ? 0 : 1), x + 3, y + 1, 14, 10, depth + .31, { surface: 'paper' });
      place(scene, finished ? chef(occupant.guest, 0)
        : { texture: 'burger-eating', frame: (occupant.guest % 4) * 4 + pose }, x, y - 16, 32, 31.2, depth + .12,
        { surface: 'floor', base: y - 4 });
      const reactionAge = (age - 550 - occupant.id % 3 * 155) % 4500;
      if (reactionAge >= 0 && reactionAge < 1900 && age >= 550) {
        const satisfaction = occupant.satisfaction ?? (occupant.reaction === 'perfect' ? 'love' : occupant.reaction === 'poor' ? 'disappointed' : 'puzzled');
        const scale = reduced.matches ? 1 : .65 + .46 * ease(reactionAge / 160) - .11 * ease((reactionAge - 180) / 220);
        const rise = reduced.matches ? 0 : 8 * ease(reactionAge / 1750);
        const alpha = reduced.matches ? 1 : Math.min(1, reactionAge / 120, (1900 - reactionAge) / 260);
        picture(scene, { texture: 'burger-dining-reactions', frame: diningSatisfaction.indexOf(satisfaction) },
          x + 17, y - 26 - rise, 19 * scale, 19 * scale, 5.2, alpha);
        if (occupant.tip) {
          picture(scene, { texture: 'burger-dining-reactions', frame: 0 }, x + 29, y - 35 - rise,
            12 * scale, 12 * scale, 5.2, alpha * .92, -15);
          picture(scene, { texture: 'burger-dining-reactions', frame: 0 }, x + 20, y - 43 - rise,
            11 * scale, 11 * scale, 5.2, alpha * .87, 12);
        }
      }
    });
    for (const diner of diners) {
      const table = tables[diner.table];
      if (now >= diner.exitAt || (now >= diner.eatAt && now < diner.doneAt)) continue;
      const replyUntil = diner.at + diningReplyMs;
      if (now < replyUntil) {
        const x = 430 - (speakers.length - 1 - speakers.indexOf(diner)) * 54;
        const reaction = diner.id % 2 && (diner.reaction === 'perfect' || diner.reaction === 'mixed') ? diner.reaction + 'Alt' : diner.reaction;
        speech(scene, diner.line ? burgerLine(diner.line, language)
          : diner.tip ? labels.delighted + ' ' + labels.tip + ' +' + diner.tip : labels[reaction], x, 123, diner.id);
        drawGuest(scene, diner, x, Number((now - diner.at) % 2300 > 1650 && (now - diner.at) % 2300 < 1790), 142);
        continue;
      }
      if (!table) {
        const age = now - replyUntil;
        drawGuest(scene, diner, 430 + 84 * Math.min(1, age / 750), walkFrame(age), 142);
        continue;
      }
      const hasWait = diner.walkAt > replyUntil;
      const waitingX = 300 + (diner.id % 5) * 24;
      if (now < diner.walkAt) {
        const age = now - replyUntil;
        const ratio = reduced.matches ? 1 : Math.min(1, age / 360);
        drawGuest(scene, diner, 430 + (waitingX - 430) * ratio, ratio < 1 ? walkFrame(age) : Number(age % 2900 < 135), 116, ratio < 1);
      } else if (now < diner.eatAt) {
        const age = now - diner.walkAt;
        const ratio = reduced.matches ? 1 : age / (diner.eatAt - diner.walkAt);
        const from = hasWait ? waitingX : 430;
        drawGuest(scene, diner, from + (table.x - from) * ratio, reduced.matches ? 0 : walkFrame(age), 142 + (table.y - 146) * ratio, true);
      } else if (!reduced.matches) {
        const age = now - diner.doneAt;
        const ratio = age / (diner.exitAt - diner.doneAt);
        drawGuest(scene, diner, table.x + (width + 32 - table.x) * ratio, walkFrame(age), table.y + (97 - table.y) * ratio);
      }
    }
  }

  function newOilGlint(at: number): OilGlint {
    const bearing = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random()) * .42;
    return { at, u: Math.cos(bearing) * radius, v: Math.sin(bearing) * radius,
      angle: Math.random() * Math.PI * 2, life: 460 + Math.random() * 1030, gap: 60 + Math.random() * 420,
      travel: .18 + Math.random() * .22, bend: (Math.random() - .5) * .21,
      size: .14 + Math.random() * .14, shine: .45 + Math.random() * .43 };
  }

  function drawPattyOil(scene: Phaser.Scene, body: Phaser.GameObjects.Image, index: number, serial: number | undefined, now: number) {
    const rx = body.displayWidth * .41, ry = body.displayHeight * .19;
    const cos = Math.cos(body.rotation), sin = Math.sin(body.rotation);
    const surface = body.displayHeight * .078;
    const x = body.x + sin * surface, y = body.y - cos * surface;
    picture(scene, { texture: pattyOilTexture }, x, y, rx * 2, ry * 2, 3.05, 1, body.angle, true);
    if (reduced.matches) return;
    let oil = grillOil.get(index);
    if (!oil || oil.serial !== serial) {
      oil = { serial, glints: Array.from({ length: 6 }, (_, i) => newOilGlint(now + (i - 3) * (65 + Math.random() * 95))) };
      grillOil.set(index, oil);
    }
    for (const [i, previous] of oil.glints.entries()) {
      const glint = now >= previous.at + previous.life + previous.gap ? oil.glints[i] = newOilGlint(now) : previous;
      const age = (now - glint.at) / glint.life;
      if (age <= 0 || age >= 1) continue;
      const direction = glint.angle + glint.bend * age * 4;
      const localX = (glint.u + Math.cos(direction) * glint.travel * age) * rx;
      const localY = (glint.v + Math.sin(direction) * glint.travel * age) * ry;
      const envelope = Math.min(1, age * 5, (1 - age) * 3);
      const tilt = Math.atan2(Math.sin(direction) * ry, Math.cos(direction) * rx) * 180 / Math.PI;
      picture(scene, { texture: pattyOilGlint }, x + localX * cos - localY * sin, y + localX * sin + localY * cos,
        rx * glint.size * 2 * (.8 + envelope * .2), ry * glint.size * .95, 3.06, envelope * glint.shine, body.angle + tilt, true);
    }
  }

  function renderGrill(scene: Phaser.Scene, { counter, active }: BurgerView, now: number) {
    pattyKinds.forEach((kind, index) => {
      const zone = trayZone(index);
      const unlocked = burgerSupplyUnlocked(kind, counter);
      drawSupplyLid(scene, zone, unlockProgress(kind, unlocked, now));
      if (!unlocked) return;
      const tray = center(zone);
      spot('tray', index, zone);
      const stack = counter.tray.filter(patty => patty.kind === kind && !flights.some(flight =>
        flight.slot === -2 && !flight.trash && flight.serial !== undefined && flight.serial === patty.serial));
      const settled = Math.max(0, stack.length - Number(Boolean(isDragging('tray', index))));
      const last = stack.slice(Math.max(0, settled - shownTrayPatties), settled);
      for (const [i, patty] of last.entries()) {
        const cooked = storedPattyFrame(patty.faces);
        const args = [scene, pattySprite(patty.kind, cooked), tray.x, trayPattyY(i), trayPattySize.w, trayPattySize.h, 2 + i * .03] as const;
        if (i === 0) place(...args, { surface: 'tray' });
        else picture(...args);
      }
    });
    const expanded = burgerFacility(counter, 'griddle');
    kitchenSlots.slice(0, expanded ? grillCount : grillColumns).forEach((original, i) => {
      const zone = expanded ? original : { ...original, y: grillZone.y + 3, h: grillZone.h - 6 };
      const { x, y } = center(zone);
      const patty = counter.grill[i];
      spot('grill', i, zone);
      if (!patty) { grillBurns.delete(i); grillOil.delete(i); return; }
      const faces = pattyFaces(patty, now);
      const frame = pattyFrame(faces, patty.side);
      const burnt = frame === 4;
      const previous = grillBurns.get(i);
      if (burnt && previous && !previous.burnt && previous.serial === patty.serial && active) kitchenSound('burn', .65);
      grillBurns.set(i, { burnt, serial: patty.serial });
      if (isDragging('grill', i) || flights.some(flight => flight.part === i && (flight.slot === -1
        || (flight.slot === -2 && flight.serial === patty.serial)))) return;
      const flip = reduced.matches ? 1 : .45 + .55 * ease((now - patty.heatAt) / 150);
      const body = place(scene, pattySprite(patty.kind, frame), x, y - 3,
        grillPattySize.w, grillPattySize.h * flip, 3,
        { surface: 'grill', lift: (1 - flip) * 12, angle: (1 - flip) * (patty.side ? 28 : -22) });
      if (!burnt && patty.heatAt > 0) drawPattyOil(scene, body, i, patty.serial, now);
      else grillOil.delete(i);
      if (!reduced.matches && faces[patty.side] >= 34) {
        const rise = (now / 45 + i * 8) % 24;
        picture(scene, prop('steam'), x + Math.sin(rise / 3) * 4, y - 5 - rise, 10 + rise / 4, 12, 4, .6 * (1 - rise / 24));
      }
    });
  }

  function renderAssembly(scene: Phaser.Scene, { counter, labels }: BurgerView, now: number) {
    counter.burgers.forEach((stack, index) => {
      const zone = bowlZone(index), { x } = center(zone);
      if (index && !burgerFacility(counter, 'assembly')) { drawSupplyLid(scene, zone, 0); return; }
      const change = assemblies[index];
      const signature = [stack.paper, stack.bread, stack.top, stack.packed, stack.layers.length].join(':');
      if (signature !== change.signature) { change.signature = signature; change.changedAt = now; }
      const age = now - change.changedAt;
      spot('burger', index, zone);
      if (counter.service?.origin?.area === 'assembly' && counter.service.origin.index === index) {
        picture(scene, atlas(tally.wrap), x, assemblyFoodY, 32, 45, 2, .22);
      }
      if (index === slot) label(scene, '▼', x, 235, 8, '#ffe2a9');
      if (stack.packed) {
        const bounce = !reduced.matches ? 5 * Math.sin(age / 36) * (1 - ease(age / 340)) : 0;
        place(scene, atlas(tally.wrap), x, assemblyFoodY + bounce, 32, 45, 2,
          { base: assemblyFoodY + 8, lift: Math.max(0, -bounce) });
        ingredientStrip(scene, stack.layers, x, 279, 41, 4.2);
        return;
      }
      const hidden = flights.filter(flight => flight.slot === index).map(flight => flight.part);
      if (stack.paper && !hidden.includes(-3)) {
        place(scene, paperSprite, x, assemblyFoodY + 1, wrapperSize.width, wrapperSize.height, 1.5, { surface: 'paper', stretch: true });
      }
      const layers = stack.layers.map(layer => foods(layer.ingredient,
        layer.patty && storedPattyFrame(layer.patty.faces)));
      const lift = reduced.matches ? 0 : 10 * (1 - ease(age / 200));
      burgerArt(scene, x, assemblyFoodY, assemblyBurgerSize, layers, stack.bread, stack.top, 3, lift, hidden, true);
      if (stack.layers.some(layer => layer.patty)) ingredientStrip(scene, stack.layers, x, 276, 38, 4.2);
      if (stack.top) label(scene, labels.wrap, x, 284, 6, '#ffeacc', 36, 5, true);
    });
  }

  function renderDrinks(scene: Phaser.Scene, { counter }: BurgerView, now: number) {
    counter.cups.forEach((cup, i) => {
      const zone = drinkZone(i), { x } = center(zone);
      const kind = drinkKinds[i];
      const unlocked = burgerSupplyUnlocked(kind, counter);
      if (unlocked) spot('nozzle', i, nozzleZone(i));
      if (unlocked || cup.amount || cup.pourAt) spot('cup', i, zone);
      else return;
      const amount = cupAmount(cup, now);
      const size = cupSize(amount);
      const progress = unlockProgress(kind, unlocked, now, 140);
      place(scene, { texture: cupTexture(kind, size) }, x, 257, 20, 20, 2, { surface: 'cup', base: 266, alpha: ease(progress) });
      if (cup.pourAt && amount < cupOverflow) {
        ink.fillStyle(i ? 0xf8df81 : 0x9e5737, .94).fillRect(pixel(x - .7), 248.5, 1.4, 5);
      }
      if (unlocked) {
        const scale = .6 + .5 * ease(progress * 1.6) - .1 * ease((progress - .65) / .35);
        picture(scene, prop(kind), x, 228 - (1 - progress) * 5, 15 * scale, 14 * scale, 2, ease(progress));
      }
    });
  }

  function renderService(scene: Phaser.Scene, data: BurgerView) {
    const { counter } = data;
    const staged = counter.service;
    if (staged?.burger) {
      spot('staged-burger', 0, stagedBurgerZone);
      const { x } = center(stagedBurgerZone);
      place(scene, atlas(tally.wrap), x, 241, 29, 28);
      ingredientStrip(scene, staged.burger.layers, x, 254, 32, 4.2);
    }
    if (staged?.drink) {
      spot('staged-drink', 0, stagedDrinkZone);
      const size = cupSize(staged.drink.amount);
      place(scene, { texture: cupTexture(staged.drink.kind, size) }, center(stagedDrinkZone).x, 243, 20, 20, 2, { surface: 'cup' });
    }
    spot('submit', 0, serveZone);
    spot('service', 0, serviceZone);
    const enabled = data.active && Boolean(staged?.burger && counter.orders[0]);
    if (enabled) ink.fillStyle(0xffd396, .13).fillEllipse(center(serveZone).x - 1.5, 267, 19, 4.5);
  }

  function renderStorage(scene: Phaser.Scene, { counter }: BurgerView) {
    spot('trash', 0, trashZone);
    if (!burgerFacility(counter, 'storage')) {
      ink.fillStyle(0x231829, .6).fillRoundedRect(rackZone.x, rackZone.y - 5, rackZone.w, 30, 4);
      return;
    }
    for (let index = 0; index < burgerStorageSize; index++) {
      const zone = storageZone(index);
      spot('storage', index, { ...zone, y: zone.y - 5, h: 31 });
      const burger = counter.storage?.[index];
      const { x, y } = center(zone);
      if (!burger) {
        if (counter.service?.origin?.area === 'storage' && counter.service.origin.index === index) {
          picture(scene, atlas(tally.wrap), x, y - 2, 26, 23, 3, .22);
        }
        continue;
      }
      if (isDragging('storage', index)) continue;
      place(scene, atlas(tally.wrap), x, y - 2, 26, 23, 3);
      ingredientStrip(scene, burger.layers, x, 312, 43, 3);
    }
  }

  function renderIngredients(scene: Phaser.Scene, counter: Counter, now: number, seed: number) {
    menu.forEach((item, i) => {
      const x1 = ingredientEdges[i], x2 = ingredientEdges[i + 1];
      const zone = { x: x1, y: 175, w: x2 - x1, h: 44 };
      if (item === 'beef' || item === 'chicken') {
        picture(scene, { texture: 'burger-patty-bins', frame: pattyKinds.indexOf(item) },
          (zone.x + zone.w / 2), 197, zone.w + 2, 39, 2, 1, 0, true);
      }
      const unlocked = burgerSupplyUnlocked(item, counter);
      if (unlocked) spot('item', i, zone);
      const tilt = (i % 2 ? -1 : 1) * ((Math.imul(seed ^ (i + 1), 0x9e3779b1) >>> 0) % 101) / 10;
      drawSupplyLid(scene, zone, unlockProgress(item, unlocked, now, i % 3 * 85), tilt);
    });
  }

  function renderCards(scene: Phaser.Scene, data: BurgerView) {
    const copy = data.cardHud;
    if (!copy) return;
    const offers = copy.showDraft ? data.counter.draft?.offers : undefined;
    if (!offers && historyPage === undefined) return;
    cardInk.fillStyle(0x211321, .78).fillRect(0, 0, width, burgerSceneHeight);
    layout = [];
    drawCardHud(copy, {
      image: (sprite, x, y, w, h, depth, alpha, stretch) => picture(scene, sprite, x, y, w, h, depth, alpha, 0, stretch),
      text: (copy, x, y, size, color, maxWidth) => label(scene, copy, x, y, size, color, maxWidth, 55),
      hit: spot,
      item: name => name === 'cola' || name === 'soda' ? prop(name) : foods(name as Item),
    }, offers, data.counter.cards ?? [], historyPage ?? 0);
  }

  function renderTrayPicker(scene: Phaser.Scene, { counter, labels }: BurgerView, now: number) {
    pickerSlots = [];
    if (!trayPicker) return;
    const list = counter.tray.filter(item => item.kind === trayPicker?.kind);
    if (!list.length) { trayPicker = undefined; return; }
    const { x, y, w, h } = trayPanel;
    const shift = traySlide(trayPicker.at, now);
    pickerInk.fillStyle(0x22191d, .58).fillRect(0, 0, width, burgerSceneHeight);
    pickerInk.fillStyle(0x6e4540).fillRoundedRect(x - 2, y + shift + 3, w + 4, h + 2, 15);
    pickerInk.fillStyle(0xf7dfa9).fillRoundedRect(x, y + shift, w, h, 14);
    pickerInk.lineStyle(2, 0xa66d55).strokeRoundedRect(x + 3, y + shift + 3, w - 6, h - 6, 12);
    label(scene, labels[trayPicker.kind] + ' · ' + labels.tray, x + w / 2, y + shift + 23, 14, '#543244', 248, 43);
    const dragging = gesture?.moved && gesture.from.type === 'tray-choice' ? gesture : undefined;
    for (let i = 0; i < (burgerFacility(counter, 'tray') ? 8 : 4); i++) {
      const zone: Zone = { x: x + 15 + (i % 4) * 63, y: y + shift + 43 + Math.floor(i / 4) * 70, w: 60, h: 63 };
      const patty = list[i];
      pickerInk.fillStyle(patty ? 0xe6bf83 : 0xead0a4).fillRoundedRect(zone.x, zone.y, zone.w, zone.h, 8);
      pickerInk.lineStyle(1, 0xa87557, patty ? .65 : .31).strokeRoundedRect(zone.x, zone.y, zone.w, zone.h, 8);
      if (!patty) continue;
      pickerSlots.push({ zone, serial: patty.serial });
      const { x: cx } = center(zone);
      const frame = storedPattyFrame(patty.faces);
      const lifted = dragging && (dragging.serial === undefined ? dragging.from.index === i : dragging.serial === patty.serial);
      if (lifted) picture(scene, pattySprite(patty.kind, frame), dragging.x, dragging.y, 53, 49, 46, .96);
      else place(scene, pattySprite(patty.kind, frame), cx, zone.y + 25, 53, 49, 41, { surface: 'tray', base: zone.y + 34 });
      const grade = pattyDoneness(patty.faces) ?? (frame === 4 ? 'charred' : 'undercooked');
      label(scene, labels[grade], cx, zone.y + 51, 10, '#523244', 53, 43);
    }
    const bx = pickerTrash.x + pickerTrash.w / 2, by = pickerTrash.y + shift + pickerTrash.h / 2;
    const hovering = dragging && contains(pickerTrash, dragging.x, dragging.y - shift);
    pickerInk.fillStyle(hovering ? 0xad4a41 : 0x714745).fillRoundedRect(pickerTrash.x, pickerTrash.y + shift, pickerTrash.w, pickerTrash.h, 7);
    pickerInk.lineStyle(1.6, 0xffe6bd);
    pickerInk.strokeRoundedRect(bx - 5.5, by - 2.5, 11, 10, 1.6);
    pickerInk.lineBetween(bx - 8, by - 3, bx + 8, by - 3);
    pickerInk.lineBetween(bx - 2.5, by - 6, bx + 2.5, by - 6);
    for (const offset of [-2, 2]) pickerInk.lineBetween(bx + offset, by, bx + offset, by + 4);
  }

  function drawSpatula(scene: Phaser.Scene, now: number) {
    if (!spatulaMotion) return;
    const { zone, at, phase, x: targetX, y: targetY } = spatulaMotion;
    const age = now - at;
    const length = phase === 'ready' ? grillTapWindow + 70 : flightMs;
    if (age >= length) { spatulaMotion = undefined; return; }
    const start = center(zone);
    const step = phase === 'carry' ? ease(age / length) : Math.max(0, age / length);
    const moving = phase === 'carry' && targetX !== undefined && targetY !== undefined;
    const lift = moving ? Math.sin(step * Math.PI) * 22 : phase === 'flip' ? Math.sin(step * Math.PI) * 9 : 0;
    const x = moving ? start.x + (targetX - start.x) * step : start.x;
    const y = moving ? start.y + (targetY - start.y) * step : start.y;
    const angle = phase === 'flip' ? -46 + 120 * ease(step) : -49 + 18 * ease(step);
    const alpha = phase === 'ready' ? Math.min(1, .45 + age / 55) : Math.min(1, (length - age) / 36);
    picture(scene, { texture: 'burger-spatula' }, x + 3, y + 3 - (reduced.matches ? 0 : lift), 23, 34, moving ? 17.9 : 2.9,
      alpha, reduced.matches ? -40 : angle).setOrigin(.5, .18);
  }

  function drawKitchen(scene: Phaser.Scene, data: BurgerView, now: number) {
    const { counter } = data;
    renderScore(scene, data, now);
    renderDining(scene, data, now);
    renderGuests(scene, data, now);
    renderIngredients(scene, counter, now, data.seed);
    renderGrill(scene, data, now);
    renderAssembly(scene, data, now);
    renderDrinks(scene, data, now);
    renderService(scene, data);
    for (const flight of flights) {
      const progress = Math.max(0, Math.min(1, (now - flight.at) / flightMs));
      const step = flight.slot === -2 ? ease(progress) : progress;
      const from = center(flight.from);
      const x = from.x + (flight.x - from.x) * step;
      const base = from.y + (flight.y - from.y) * step;
      const lift = Math.sin(step * Math.PI) * 22;
      const paper = flight.slot >= 0 && flight.part === -3;
      const size = flight.trash ? 27 * (1 - .55 * progress ** 3) : 27;
      place(scene, flight.sprite, x, base - lift, paper ? wrapperSize.width : size, paper ? wrapperSize.height : size, 18,
        { base: base + 5, lift, stretch: paper, surface: paper ? 'paper' : 'worktop',
          alpha: flight.trash ? Math.min(1, (1 - progress) * 5) : 1, angle: flight.trash ? 105 * step : 0 });
    }
    renderStorage(scene, data);
    drawSpatula(scene, now);
    if (gesture?.moved) {
      const { from, x, y } = gesture;
      const target = find(x, y);
      let sprite: Sprite | undefined;
      let size = { w: 39, h: 43 };
      let angle = reduced.matches ? 0 : -9;
      if (from.type === 'item') sprite = ingredientArt(menu[from.index], counter.burgers[target?.type === 'burger' ? target.index : slot]);
      if (from.type === 'grill' || from.type === 'tray') {
        const patty = pattyAt(counter, location(from));
        if (patty) {
          const frame = from.type === 'grill' ? pattyFrame(pattyFaces(patty, now), patty.side) : storedPattyFrame(patty.faces);
          sprite = pattySprite(patty.kind, frame);
          size = from.type === 'grill' ? grillPattySize : trayPattySize;
          angle = 0;
        }
      }
      if ((from.type === 'burger' && counter.burgers[from.index].packed) || from.type === 'staged-burger'
        || (from.type === 'storage' && counter.storage?.[from.index])) sprite = atlas(tally.wrap);
      if (from.type === 'burger' && counter.burgers[from.index].paper && !sprite) sprite = paperSprite;
      if (from.type === 'cup') {
        const level = cupSize(cupAmount(counter.cups[from.index], now));
        if (level) { sprite = { texture: cupTexture(drinkKinds[from.index], level) }; size = { w: 20, h: 20 }; }
      }
      if (from.type === 'staged-drink' && counter.service?.drink) {
        const { kind, amount } = counter.service.drink;
        sprite = { texture: cupTexture(kind, cupSize(amount)) }; size = { w: 20, h: 20 };
      }
      if (sprite) {
        place(scene, sprite, x, y, size.w, size.h, 20, { alpha: .95, angle, lift: 17, base: y + size.h * .35 });
      }
    }
    renderTrayPicker(scene, data, now);
  }

  return {
    pixelArt: true,
    announcementSound(cue) {
      const clip = cue === '1' || cue === '2' || cue === '3' ? 'knob'
        : cue === 'defeat' || cue === 'finished' ? 'plate' : 'bell';
      return Boolean(kitchenSound(clip));
    },
    preload() {
      this.load.image('burger-shop', shop);
      this.load.image('burger-lid', lid);
      this.load.image('burger-broom', broom);
      this.load.image('burger-spatula', spatula);
      const sheet = (key: string, url: string, size: number) =>
        this.load.spritesheet(key, url, { frameWidth: size, frameHeight: size, margin: 4, spacing: 4 });
      sheet('burger-food', food, 96);
      sheet('burger-patties', patties, 96);
      sheet('burger-patty-bins', rawBins, 112);
      sheet('burger-stations', stations, 160);
      sheet('burger-guests', guests, 112);
      sheet('burger-ingredient-icons', icons, 64);
      sheet('burger-furniture', furniture, 112);
      sheet('burger-eating', eating, 112);
      sheet('burger-tables', tablesArt, 128);
      sheet('burger-paper', paper, 160);
      sheet('burger-dining-reactions', reactions, 80);
      loadCardArt(this);
    },
    create() {
      this.add.image(width / 2, burgerSceneHeight / 2, 'burger-shop').setDisplaySize(width, burgerSceneHeight).setDepth(-4);
      ink = this.add.graphics().setDepth(.5);
      feverInk = this.add.graphics().setDepth(.8);
      balloons = this.add.graphics().setDepth(2.4);
      enlargedBalloon = this.add.graphics().setDepth(22);
      pickerInk = this.add.graphics().setDepth(40);
      cardInk = this.add.graphics().setDepth(50);
      createKitchenArt(this);
      kitchenSound('burn')?.();
      kitchenSound('fever')?.();
      for (const key of ['burger-shop', 'burger-food', 'burger-patties', 'burger-stations', 'burger-guests', 'burger-ingredient-icons',
        'burger-furniture', 'burger-eating', 'burger-tables', 'burger-paper', 'burger-lid', 'burger-broom', 'burger-spatula', 'burger-dining-reactions',
        'burger-patty-bins', 'burger-card-surfaces', 'burger-card-emblems', kitchenShade,
        cupTexture(), ...drinkKinds.flatMap(kind => (['small', 'medium', 'large'] as const).map(size => cupTexture(kind, size)))]) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      const silence = () => { cancelTap(); stopSizzle?.(); stopPour?.(); stopSizzle = stopPour = undefined; };
      this.events.on('pause', silence);
      this.events.once('shutdown', silence);
      this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
        const data = view().burger;
        if (!data?.cardHud || !this.game.canvas.parentElement?.contains(document.activeElement) || event.repeat) return;
        if (data.cardHud.showDraft && /^[123]$/.test(event.key)) chooseCard(data, Number(event.key) - 1);
        else if (data.active && data.counter.cards && event.key.toLowerCase() === 'c') historyPage = historyPage === undefined ? 0 : undefined;
        else if (historyPage !== undefined && event.key === 'Escape') historyPage = undefined;
        else if (historyPage !== undefined && event.key === 'ArrowLeft') pageCards(data, -1);
        else if (historyPage !== undefined && event.key === 'ArrowRight') pageCards(data, 1);
        else return;
        event.preventDefault();
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (gesture?.id !== pointer.id) return;
        gesture.x = pointer.worldX;
        gesture.y = pointer.worldY;
        gesture.moved ||= Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) >= dragDistance;
      });
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const data = view().burger;
        if (!data || (!data.active && !data.cardHud?.showDraft) || gesture || !pointer.leftButtonDown()) return;
        const x = pointer.worldX, y = pointer.worldY;
        const chosen = trayPicker ? pickerSlots.findIndex(({ zone }) => contains(zone, x, y)) : -1;
        if (trayPicker && chosen < 0) {
          if (!contains(trayPanel, x, y - traySlide(trayPicker.at, progress(data)))) trayPicker = undefined;
          return;
        }
        const choice = pickerSlots[chosen];
        const hit = chosen < 0 ? find(x, y) : { type: 'tray-choice' as const, index: chosen, zone: choice.zone };
        if (hit) gesture = { from: hit, x, y, startX: x, startY: y, id: pointer.id, moved: false,
          serial: hit.type === 'grill' || hit.type === 'tray' ? pattyAt(data.counter, location(hit))?.serial
            : hit.type === 'storage' ? burgerSerial(data.counter.storage?.[hit.index])
            : hit.type === 'staged-burger' ? burgerSerial(data.counter.service?.burger) : choice?.serial };
      });
      const release = (pointer: Phaser.Input.Pointer) => {
        if (!gesture || gesture.id !== pointer.id) return;
        const previous = gesture, data = view().burger;
        gesture = undefined;
        if (!data || (!data.active && !data.cardHud?.showDraft)) return;
        const end = find(pointer.worldX, pointer.worldY);
        if (data.cardHud?.showDraft || historyPage !== undefined) {
          if (!previous.moved && end && end.type === previous.from.type && end.index === previous.from.index && end.type.startsWith('card-')) {
            tap(end, data);
          }
          return;
        }
        if (previous.from.type.startsWith('card-')) return;
        if (previous.moved || Math.hypot(pointer.worldX - previous.startX, pointer.worldY - previous.startY) >= dragDistance) {
          cancelTap();
          if (trayPicker && previous.from.type === 'tray-choice') {
            if (contains(pickerTrash, pointer.worldX, pointer.worldY - traySlide(trayPicker.at, progress(data)))) {
              apply({ type: 'discard-tray', kind: trayPicker.kind, index: previous.from.index, serial: previous.serial });
            }
            return;
          }
          drop(previous.from, end, pointer.worldY < previous.startY - 23, previous.serial);
        } else tap(previous.from, data, previous.serial);
      };
      this.input.on('pointerup', release);
      this.input.on('pointerupoutside', release);
    },
    update() {
      const data = view().burger;
      if (!data) return;
      density = this.cameras.main.zoom;
      if (lastRound !== data.id) {
        lastRound = data.id; slot = 0; seenFeedback = 0; guestMotion.clear(); departing.clear(); flights.length = 0;
        expandedBubble = undefined;
        historyPage = undefined;
        seenFever = data.counter.feverTrigger ?? 0;
        grillBurns.clear(); grillOil.clear(); trayPicker = undefined; spatulaMotion = undefined;
        unlockTimes.clear();
        gesture = undefined; cancelTap();
      }
      const now = progress(data);
      feverTime = now;
      feverGlow = data.finishedAt || data.counter.closed || data.counter.retired ? 0 : Phaser.Math.Clamp((data.counter.feverUntil - now) / 440, 0, 1);
      const trigger = data.counter.feverTrigger ?? 0;
      if (trigger > seenFever && data.active && feverGlow > 0) kitchenSound('fever', .58);
      seenFever = trigger;
      if (!data.active) { trayPicker = undefined; spatulaMotion = undefined; cancelTap(); }
      if (!data.active) historyPage = undefined;
      if (data.active && data.counter.grill.some(Boolean)) stopSizzle ??= kitchenSound('sizzle', .16, true);
      else { stopSizzle?.(); stopSizzle = undefined; }
      if (data.active && data.counter.cups.some(cup => cup.pourAt && cupAmount(cup, now) < cupOverflow)) stopPour ??= kitchenSound('pour', .34, true);
      else { stopPour?.(); stopPour = undefined; }
      for (let i = flights.length - 1; i >= 0; i--) if (now - flights[i].at >= flightMs) flights.splice(i, 1);
      ink.clear();
      feverInk.clear();
      balloons.clear();
      enlargedBalloon.clear();
      pickerInk.clear();
      cardInk.clear();
      layout = []; imageIndex = captionIndex = 0;
      drawKitchen(this, data, now);
      renderCards(this, data);
      for (let i = imageIndex; i < images.length; i++) images[i].setVisible(false);
      for (let i = captionIndex; i < captions.length; i++) captions[i].view.setVisible(false);
    },
  };
};
