import { gameFontFamily } from '../game-font.ts';
import Phaser from 'phaser';
import { kitchenActionSound, kitchenSound } from './sounds.ts';
import type { SceneFactory } from '../scene-loader.ts';
import { burgerLayerSpacing, burgerSceneHeight, orderBubbleSize } from './layout.ts';
import { diningReplyMs, tableCount } from './dining.ts';
import { createFootprintReader, createKitchenArt, cupTexture, kitchenServe, kitchenShade } from './art.ts';
import { breads, burgerStorageSize, cupAmount, cupOverflow, cupSize, drinkKinds, grillColumns, grillCount, grillRows, ingredients, pattyAt, pattyDoneness, pattyFaces, pattyFrame, pattyKinds } from './rules.ts';
import type { Bread, BurgerAction, Counter, Ingredient, Order, PattyLocation } from './rules.ts';
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

type Item = Bread | Ingredient | 'paper';
export type BurgerView = { id: string; seed: number; counter: Counter; start: number; end: number; clockOffset: number; finishedAt: number; pausedAt: number;
  active: boolean; action: (action: BurgerAction) => boolean; labels: Record<string, string>;
  rivals: { name: string; money: number }[] };
type Zone = { x: number; y: number; w: number; h: number };
type Hit = { type: 'item' | 'grill' | 'burger' | 'tray' | 'nozzle' | 'cup' | 'service' | 'staged-burger' | 'staged-drink' | 'submit' | 'storage' | 'trash';
  index: number; zone: Zone };
type Sprite = { texture: string; frame?: number };
type Placement = { surface?: 'floor' | 'grill' | 'worktop' | 'paper' | 'cup'; base?: number; alpha?: number; angle?: number; stretch?: boolean; lift?: number };

const width = 480;
const menu: Item[] = ['paper', ...breads, ...ingredients];
const tally = { bunTop: 0, bun: 1, riceTop: 2, rice: 3, cheese: 4, lettuce: 5, onion: 6,
  pickle: 7, tomato: 8, egg: 9, bacon: 10, wrap: 11 } as const;
const atlas = (frame: number): Sprite => ({ texture: 'burger-food', frame });
const pattySprite = (kind: string, frame: number): Sprite => ({ texture: 'burger-patties', frame: (kind === 'chicken' ? 5 : 0) + frame });
const stationArt = { submit: 0, steam: 1, cola: 2, soda: 3 } as const;
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
const serveZone = { x: 429, y: 257, w: 38, h: 18 };
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
const trayPattyY = (index: number) => 264 - index * 2.5;
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
  const assemblies = [{ signature: '', changedAt: 0 }, { signature: '', changedAt: 0 }];
  const guestMotion = new Map<number, { from: number; to: number; at: number; ms: number; order: Order }>();
  const departing = new Map<number, { x: number; order: Order; at: number; copy?: string }>();
  const flights: { sprite: Sprite; from: Zone; x: number; y: number; at: number; slot: number; part: number }[] = [];
  let ink: Phaser.GameObjects.Graphics;
  let balloons: Phaser.GameObjects.Graphics;
  let stopSizzle: (() => void) | undefined;
  let stopPour: (() => void) | undefined;

  let gesture: { from: Hit; x: number; y: number; startX: number; startY: number; id: number; moved: boolean } | undefined;
  let pending: { key: string; at: number; timer: Phaser.Time.TimerEvent; single: () => void } | undefined;
  const progress = (view: BurgerView) => Math.min(view.finishedAt || Infinity, (view.pausedAt || Date.now()) - view.clockOffset);
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
      .setDepth(depth).setVisible(true).setAlpha(alpha).setAngle(angle).setFlipX(false);
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
    const flat = surface === 'paper';
    const strength = surface === 'grill' ? .96 : surface === 'floor' ? .65 : flat ? .54 : .76;
    const minHeight = surface === 'grill' ? 3 / density : surface === 'cup' ? Math.max(3, 2 / density) : 3;
    picture(scene, { texture: kitchenShade }, x + span * .055, foot + (flat ? .1 : span * .02),
      span * (flat ? 1.02 : 1.17) + lift * .14, Math.max(minHeight, span * (flat ? .37 : .31)) + lift * .055,
      depth - .025, strength * alpha * Math.max(.24, 1 - lift / 42), 0, true);
    return body;
  }

  function isDragging(type: Hit['type'], index: number) {
    return gesture?.moved && gesture.from.type === type && gesture.from.index === index;
  }

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

  function tap(scene: Phaser.Scene, hit: Hit, data: BurgerView) {
    const key = hit.type + ':' + hit.index;
    const double = pending?.key === key && scene.time.now - pending.at <= 260;
    if (pending) {
      const previous = pending;
      pending = undefined;
      previous.timer.remove();
      if (!double) previous.single();
    }
    function defer(action: () => void) {
      const timer = scene.time.delayedCall(260, () => { pending = undefined; action(); });
      pending = { key, at: scene.time.now, timer, single: action };
    }
    switch (hit.type) {
      case 'item': ingredient(menu[hit.index], slot, undefined, hit.zone); break;
      case 'grill': {
        if (!data.counter.grill[hit.index]) break;
        if (double) apply({ type: 'flip', slot: hit.index });
        else {
          defer(() => {
            const current = view().burger;
            if (!current) return;
            const patty = current.counter.grill[hit.index];
            if (!patty) return;
            const now = progress(current);
            const faces = pattyFaces(patty, now);
            if (!pattyDoneness(faces) || !apply({ type: 'hold', slot: hit.index }) || reduced.matches) return;
            const kindIndex = pattyKinds.indexOf(patty.kind);
            const { x } = center(trayZone(kindIndex));
            const count = current.counter.tray.filter(item => item.kind === patty.kind).length;
            const y = trayPattyY(Math.min(shownTrayPatties - 1, count));
            flights.push({ sprite: pattySprite(patty.kind, pattyFrame(faces)),
              from: hit.zone, x, y, at: now, slot: -2, part: kindIndex });
          });
        }
        break;
      }
      case 'tray': {
        const from = location(hit);
        const patty = pattyAt(data.counter, from);
        if (apply({ type: 'stack', from, slot }) && patty && !reduced.matches) {
          const part = data.counter.burgers[slot].layers.length;
          flights.push({ sprite: pattySprite(patty.kind, pattyFrame(patty.faces)),
            from: hit.zone, x: center(bowlZone(slot)).x, y: assemblyFoodY - (part + 1) * 3.5, at: progress(data), slot, part });
        }
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
      case 'nozzle': apply({ type: 'pour', drink: hit.index }); break;
      case 'cup': apply({ type: 'stage-drink', drink: hit.index }); break;
      case 'staged-burger': {
        const free = !data.counter.burgers[slot].paper ? slot : data.counter.burgers.findIndex(stack => !stack.paper);
        if (free >= 0) apply({ type: 'return-burger', to: free });
        break;
      }
      case 'staged-drink': apply({ type: 'return-drink', to: 'machine' }); break;
      case 'submit': submit(data); break;
      case 'storage': apply({ type: 'stage-stored', index: hit.index }); break;
    }
  }

  function drop(from: Hit, to: Hit | undefined, up: boolean) {
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
        if (to?.type === 'grill' || to?.type === 'tray') apply({ type: 'move', from: location(from), to: location(to) });
        else if (to?.type === 'burger') apply({ type: 'stack', from: location(from), slot: to.index });
        else if (inTrash) apply({ type: 'move', from: location(from), to: 'trash' });
        break;
      case 'burger':
        if (to?.type === 'storage') apply({ type: 'store-burger', slot: from.index, index: to.index });
        else if (inService) apply({ type: 'stage-burger', slot: from.index });
        else if (inTrash) apply({ type: 'discard', slot: from.index });
        break;
      case 'storage':
        if (inService) apply({ type: 'stage-stored', index: from.index });
        else if (inTrash || up) apply({ type: 'discard-stored', index: from.index });
        break;
      case 'cup':
        if (inService) apply({ type: 'stage-drink', drink: from.index });
        else if (inTrash) apply({ type: 'spill', drink: from.index });
        break;
      case 'staged-burger':
        if (to?.type === 'burger') apply({ type: 'return-burger', to: to.index });
        else if (inTrash) apply({ type: 'return-burger', to: 'trash' });
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
    stat(labels.time, 52, 16, 8, '#c6e8db');
    stat(data.start ? duration(data.end - now) : '–', 52, 29, 13);
    stat(fever ? labels.fever : labels.combo, 132, 16, 8, fever ? '#ffd273' : '#c6e8db');
    stat(fever ? duration(counter.feverUntil - now) + ' ×2' : '×' + counter.combo, 132, 29, 13);
    stat(labels.money, 430, 16, 8, '#c6e8db');
    stat('✦ ' + counter.money, 430, 29, 14, '#ffe2a0');
    data.rivals.slice(0, 3).forEach((rival, i, rivals) => {
      const x = 275 + (i - (rivals.length - 1) / 2) * 55;
      stat(rival.name, x, 16, 8, '#edc5d9', 49);
      stat(String(rival.money), x, 29, 11);
    });
  }

  function paintBubble(x: number, w: number, h: number) {
    const bottom = 123;
    const top = pixel(bottom - h), left = pixel(x - w / 2);
    x = pixel(x);
    balloons.fillStyle(0x513244, .25).fillRoundedRect(left + 1, top + 2, w, h, 6);
    balloons.fillStyle(0xfff0d5).fillRoundedRect(left, top, w, h, 6);
    balloons.lineStyle(1, 0x8a5760).strokeRoundedRect(left, top, w, h, 6);
    balloons.fillStyle(0x8a5760).fillTriangle(x - 5, bottom, x + 5, bottom, x + 1, bottom + 5);
    balloons.fillStyle(0xfff0d5).fillTriangle(x - 4, bottom - 1, x + 4, bottom - 1, x + 1, bottom + 4);
    return (top + bottom) / 2;
  }

  function speech(scene: Phaser.Scene, copy: string, x: number) {
    const lines = copy.split(/\s+/).reduce<string[]>((result, word) => {
      const last = result.at(-1);
      if (last && last.length + word.length < 12) result[result.length - 1] += ' ' + word;
      else result.push(word);
      return result;
    }, []);
    const caption = label(scene, lines.join('\n'), x, 0, lines.length > 3 ? 8 : 10, '#523342', 72, 7);
    const y = paintBubble(x, Math.max(36, Math.ceil(caption.displayWidth) + 14), caption.displayHeight + 8);
    caption.setY(pixel(y));
  }

  function drawOrder(scene: Phaser.Scene, order: Order, x: number) {
    const layers = order.layers.map(layer => foods(layer.ingredient, layer.cooked && cookFrame[layer.cooked]));
    const { burger, stack, width: bubbleWidth, height } = orderBubbleSize(layers.length, Boolean(order.drink));
    const y = paintBubble(x, bubbleWidth, height);
    burgerArt(scene, x - (order.drink ? 12 : 0), y + stack / 2, burger, layers, order.bread, true, 3);
    if (order.drink) {
      const drinkX = x + burger / 2;
      picture(scene, { texture: cupTexture(order.drink.kind, order.drink.size) }, drinkX, y, 23, 27, 4);
    }
  }

  function renderGuests(scene: Phaser.Scene, { counter, labels }: BurgerView, now: number) {
    if (!counter.orders.length && !departing.size) label(scene, labels.wait, width / 2, 119, 10, '#fff2d6', 160);
    const feedback = counter.feedback;
    const fresh = feedback && now - feedback.at < 2000;
    if (fresh && feedback.id !== seenFeedback) {
      seenFeedback = feedback.id;
      if (feedback.kind === 'spill') kitchenSound('splash');
      if (feedback.kind === 'burnt' || feedback.kind === 'raw') kitchenSound('plate', .18);
    }
    const tween = (motion: { from: number; to: number; at: number; ms: number }) =>
      motion.from + (motion.to - motion.from) * ease((now - motion.at) / motion.ms);
    for (const [id, motion] of guestMotion) {
      if (counter.orders.some(order => order.id === id)) continue;
      if (counter.diners?.some(diner => diner.id === id)) { guestMotion.delete(id); continue; }
      let copy: string | undefined;
      if (fresh && feedback.guest === motion.order.guest) {
        const variant = feedback.id % 2 && (feedback.kind === 'perfect' || feedback.kind === 'mixed') ? feedback.kind + 'Alt' : feedback.kind;
        copy = labels[variant];
      }
      departing.set(id, { x: reduced.matches ? motion.to : tween(motion), order: motion.order, at: now, copy });
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
      const copy = left <= 2000 ? labels.impatient : age >= 4000 && age < 6000 ? labels.order
        : age >= 17000 && age < 19000 ? (order.id % 2 ? labels.chat : labels.chatAlt) : undefined;
      if (copy) speech(scene, copy, x);
      else drawOrder(scene, order, x);
      const moving = !reduced.matches && now - motion.at < motion.ms;
      const blink = (age + order.id * 733) % 3100 < 135;
      drawGuest(scene, order, x, moving ? walkFrame(now - motion.at) : Number(blink), 142, moving && motion.from > motion.to);
      const patience = Math.max(0, Math.min(1, left / (order.until - order.at)));
      const barX = pixel(x - 24);
      ink.fillStyle(0x3e273c).fillRect(barX, 163, 48, 6);
      ink.fillStyle(patience > .25 ? 0x8ee0a8 : 0xf7a375).fillRect(barX + 2, 165, Math.floor(22 * patience) * 2, 2);
    });
    for (const [id, guest] of departing) {
      const age = now - guest.at, pause = guest.copy ? 2000 : 0;
      if (age >= pause + (reduced.matches ? 0 : 650)) { departing.delete(id); continue; }
      if (age < pause && guest.copy) {
        speech(scene, guest.copy, guest.x);
        drawGuest(scene, guest.order, guest.x, Number(age % 2100 > 1750 && age % 2100 < 1870), 142);
      } else {
        const x = guest.x + (width + 32 - guest.x) * Math.min(1, (age - pause) / 650);
        drawGuest(scene, guest.order, x, walkFrame(age - pause), 142);
      }
    }
  }

  function drawGuest(scene: Phaser.Scene, order: Pick<Order, 'guest'>, x: number, frame: number, y: number, left = false) {
    place(scene, chef(order.guest, frame), x, y, 46, 46, 2, { surface: 'floor' }).setFlipX(left);
  }

  function renderDining(scene: Phaser.Scene, { counter, seed, labels }: BurgerView, now: number) {
    const diners = counter.diners ?? [];
    const speakers = diners.filter(diner => now < diner.at + diningReplyMs);
    const tables = Array.from({ length: tableCount }, (_, index) => {
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
      const finished = occupant.doneAt - now < 900;
      const bite = age % 1600;
      const pose = reduced.matches ? 2 : bite < 430 ? 0 : bite < 700 ? 1 : bite < 980 ? 2 : 3;
      place(scene, furnitureArt(finished ? 0 : 1), x + 3, y + 1, 14, 10, depth + .31, { surface: 'paper' });
      place(scene, finished ? chef(occupant.guest, 0)
        : { texture: 'burger-eating', frame: (occupant.guest % 4) * 4 + pose }, x, y - 16, 32, 31.2, depth + .12,
        { surface: 'floor', base: y - 4 });
    });
    for (const diner of diners) {
      const table = tables[diner.table];
      if (!table || now >= diner.exitAt || (now >= diner.eatAt && now < diner.doneAt)) continue;
      const replyUntil = diner.at + diningReplyMs;
      if (now < replyUntil) {
        const x = 430 - (speakers.length - 1 - speakers.indexOf(diner)) * 54;
        speech(scene, labels[diner.reaction], x);
        drawGuest(scene, diner, x, Number((now - diner.at) % 2300 > 1650 && (now - diner.at) % 2300 < 1790), 142);
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

  function renderGrill(scene: Phaser.Scene, { counter }: BurgerView, now: number) {
    pattyKinds.forEach((kind, index) => {
      const zone = trayZone(index);
      const tray = center(zone);
      spot('tray', index, zone);
      picture(scene, icon(index), tray.x, 241, 8, 7);
      const stack = counter.tray.filter(patty => patty.kind === kind);
      if (isDragging('tray', index) || flights.some(flight => flight.slot === -2 && flight.part === index)) stack.pop();
      const last = stack.slice(-shownTrayPatties);
      for (const [i, patty] of last.entries()) {
        const cooked = pattyFrame(patty.faces);
        const args = [scene, pattySprite(patty.kind, cooked), tray.x, trayPattyY(i), trayPattySize.w, trayPattySize.h, 2 + i * .03] as const;
        if (i === 0) place(...args);
        else picture(...args);
      }
    });
    kitchenSlots.forEach((zone, i) => {
      const { x, y } = center(zone);
      const patty = counter.grill[i];
      spot('grill', i, zone);
      if (!patty || isDragging('grill', i) || flights.some(flight => flight.slot === -1 && flight.part === i)) return;
      const faces = pattyFaces(patty, now);
      const flip = reduced.matches ? 1 : .45 + .55 * ease((now - patty.heatAt) / 150);
      place(scene, pattySprite(patty.kind, pattyFrame(faces, patty.side)), x, y - 3,
        grillPattySize.w, grillPattySize.h * flip, 3,
        { surface: 'grill', lift: (1 - flip) * 12, angle: (1 - flip) * (patty.side ? 28 : -22) });
      if (!reduced.matches && faces[patty.side] >= 34) {
        const rise = (now / 45 + i * 8) % 24;
        picture(scene, prop('steam'), x + Math.sin(rise / 3) * 4, y - 5 - rise, 10 + rise / 4, 12, 4, .6 * (1 - rise / 24));
      }
    });
  }

  function renderAssembly(scene: Phaser.Scene, { counter, labels }: BurgerView, now: number) {
    counter.burgers.forEach((stack, index) => {
      const zone = bowlZone(index), { x } = center(zone);
      const change = assemblies[index];
      const signature = [stack.paper, stack.bread, stack.top, stack.packed, stack.layers.length].join(':');
      if (signature !== change.signature) { change.signature = signature; change.changedAt = now; }
      const age = now - change.changedAt;
      spot('burger', index, zone);
      if (index === slot) label(scene, '▼', x, 235, 8, '#ffe2a9');
      if (stack.packed) {
        const bounce = !reduced.matches ? 5 * Math.sin(age / 36) * (1 - ease(age / 340)) : 0;
        place(scene, atlas(tally.wrap), x, assemblyFoodY + bounce, 32, 45, 2,
          { base: assemblyFoodY + 8, lift: Math.max(0, -bounce) });
        return;
      }
      const hidden = flights.filter(flight => flight.slot === index).map(flight => flight.part);
      if (stack.paper && !hidden.includes(-3)) {
        place(scene, paperSprite, x, assemblyFoodY + 1, wrapperSize.width, wrapperSize.height, 1.5, { surface: 'paper', stretch: true });
      }
      const layers = stack.layers.map(layer => foods(layer.ingredient,
        layer.patty && pattyFrame(layer.patty.faces)));
      const lift = reduced.matches ? 0 : 10 * (1 - ease(age / 200));
      burgerArt(scene, x, assemblyFoodY, assemblyBurgerSize, layers, stack.bread, stack.top, 3, lift, hidden, true);
      if (stack.top) label(scene, labels.wrap, x, 277, 7, '#ffeacc', 36, 5, true);
    });
  }

  function renderDrinks(scene: Phaser.Scene, { counter }: BurgerView, now: number) {
    counter.cups.forEach((cup, i) => {
      const zone = drinkZone(i), { x } = center(zone);
      spot('nozzle', i, nozzleZone(i)); spot('cup', i, zone);
      const amount = cupAmount(cup, now);
      const size = cupSize(amount);
      place(scene, { texture: cupTexture(drinkKinds[i], size) }, x, 257, 20, 20, 2, { surface: 'cup', base: 266 });
      if (cup.pourAt && amount < cupOverflow) {
        ink.fillStyle(i ? 0xf8df81 : 0x9e5737, .94).fillRect(pixel(x - .7), 248.5, 1.4, 5);
      }
      picture(scene, prop(drinkKinds[i]), x, 228, 15, 14);
    });
  }

  function renderService(scene: Phaser.Scene, data: BurgerView) {
    const { counter } = data;
    const staged = counter.service;
    if (staged?.burger) {
      spot('staged-burger', 0, stagedBurgerZone);
      place(scene, atlas(tally.wrap), center(stagedBurgerZone).x, 245, 29, 28);
    }
    if (staged?.drink) {
      spot('staged-drink', 0, stagedDrinkZone);
      const size = cupSize(staged.drink.amount);
      place(scene, { texture: cupTexture(staged.drink.kind, size) }, center(stagedDrinkZone).x, 243, 20, 20, 2, { surface: 'cup' });
    }
    spot('submit', 0, serveZone);
    spot('service', 0, serviceZone);
    const enabled = data.active && Boolean(staged?.burger && counter.orders[0]);
    const { x, y } = center(serveZone);
    const alpha = enabled ? 1 : .58;
    place(scene, prop('submit'), x, y - 1, 32, 18, 2, { alpha, stretch: true });
    picture(scene, { texture: kitchenServe }, x, y - 2, 22, 19, 3, alpha);
  }

  function renderStorage(scene: Phaser.Scene, { counter }: BurgerView) {
    spot('trash', 0, trashZone);
    for (let index = 0; index < burgerStorageSize; index++) {
      const zone = storageZone(index);
      spot('storage', index, zone);
      const burger = counter.storage?.[index];
      if (!burger) continue;
      const { x, y } = center(zone);
      place(scene, atlas(tally.wrap), x, y - 2, 26, 23, 3);
      burger.layers.forEach((layer, i) => {
        const frame = ingredients.indexOf(layer.ingredient);
        picture(scene, icon(frame), x + (i - (burger.layers.length - 1) / 2) * 6.3, 312, 8, 8, 3);
      });
    }
  }

  function drawKitchen(scene: Phaser.Scene, data: BurgerView, now: number) {
    const { counter } = data;
    renderScore(scene, data, now);
    renderDining(scene, data, now);
    renderGuests(scene, data, now);
    menu.forEach((_, i) => { spot('item', i, { x: 10 + i * 38.4, y: 175, w: 38.4, h: 44 }); });
    renderGrill(scene, data, now);
    renderAssembly(scene, data, now);
    renderDrinks(scene, data, now);
    renderService(scene, data);
    for (const flight of flights) {
      const step = Math.max(0, Math.min(1, (now - flight.at) / 180));
      const from = center(flight.from);
      const x = from.x + (flight.x - from.x) * step;
      const base = from.y + (flight.y - from.y) * step;
      const lift = Math.sin(step * Math.PI) * 22;
      const paper = flight.slot >= 0 && flight.part === -3;
      place(scene, flight.sprite, x, base - lift, paper ? wrapperSize.width : 27, paper ? wrapperSize.height : 27, 18,
        { base: base + 5, lift, stretch: paper, surface: paper ? 'paper' : 'worktop' });
    }
    renderStorage(scene, data);
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
          const frame = from.type === 'grill' ? pattyFrame(pattyFaces(patty, now), patty.side) : pattyFrame(patty.faces);
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
      const sheet = (key: string, url: string, size: number) =>
        this.load.spritesheet(key, url, { frameWidth: size, frameHeight: size, margin: 4, spacing: 4 });
      sheet('burger-food', food, 96);
      sheet('burger-patties', patties, 96);
      sheet('burger-stations', stations, 160);
      sheet('burger-guests', guests, 112);
      sheet('burger-ingredient-icons', icons, 64);
      sheet('burger-furniture', furniture, 112);
      sheet('burger-eating', eating, 112);
      sheet('burger-tables', tablesArt, 128);
      sheet('burger-paper', paper, 160);
    },
    create() {
      this.add.image(width / 2, burgerSceneHeight / 2, 'burger-shop').setDisplaySize(width, burgerSceneHeight).setDepth(-4);
      ink = this.add.graphics().setDepth(.5);
      balloons = this.add.graphics().setDepth(2.4);
      createKitchenArt(this);
      for (const key of ['burger-shop', 'burger-food', 'burger-patties', 'burger-stations', 'burger-guests', 'burger-ingredient-icons',
        'burger-furniture', 'burger-eating', 'burger-tables', 'burger-paper', kitchenShade, kitchenServe,
        cupTexture(), ...drinkKinds.flatMap(kind => (['small', 'medium', 'large'] as const).map(size => cupTexture(kind, size)))]) {
        this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      const silence = () => { stopSizzle?.(); stopPour?.(); stopSizzle = stopPour = undefined; };
      this.events.on('pause', silence);
      this.events.once('shutdown', silence);
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (gesture?.id !== pointer.id) return;
        gesture.x = pointer.worldX;
        gesture.y = pointer.worldY;
        gesture.moved ||= Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) >= dragDistance;
      });
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!view().burger?.active || gesture || !pointer.leftButtonDown()) return;
        const hit = find(pointer.worldX, pointer.worldY);
        if (hit) gesture = { from: hit, x: pointer.worldX, y: pointer.worldY, startX: pointer.worldX, startY: pointer.worldY, id: pointer.id, moved: false };
      });
      const release = (pointer: Phaser.Input.Pointer) => {
        if (!gesture || gesture.id !== pointer.id) return;
        const previous = gesture, data = view().burger;
        gesture = undefined;
        if (!data?.active) return;
        const end = find(pointer.worldX, pointer.worldY);
        if (previous.moved || Math.hypot(pointer.worldX - previous.startX, pointer.worldY - previous.startY) >= dragDistance) {
          pending?.timer.remove(); pending = undefined;
          drop(previous.from, end, pointer.worldY < previous.startY - 23);
        } else tap(this, previous.from, data);
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
        gesture = undefined; pending?.timer.remove(); pending = undefined;
      }
      const now = progress(data);
      if (data.active && data.counter.grill.some(Boolean)) stopSizzle ??= kitchenSound('sizzle', .16, true);
      else { stopSizzle?.(); stopSizzle = undefined; }
      if (data.active && data.counter.cups.some(cup => cup.pourAt && cupAmount(cup, now) < cupOverflow)) stopPour ??= kitchenSound('pour', .34, true);
      else { stopPour?.(); stopPour = undefined; }
      for (let i = flights.length - 1; i >= 0; i--) if (now - flights[i].at >= 180) flights.splice(i, 1);
      ink.clear();
      balloons.clear();
      layout = []; imageIndex = captionIndex = 0;
      drawKitchen(this, data, now);
      for (let i = imageIndex; i < images.length; i++) images[i].setVisible(false);
      for (let i = captionIndex; i < captions.length; i++) captions[i].view.setVisible(false);
    },
  };
};
