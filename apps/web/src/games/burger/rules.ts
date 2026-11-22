import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { explorerIds } from '../../../../../packages/protocol/explorers.ts';
import { diningExitMs, diningReplyMs, seatDiner, seatWalkMs, shiftDiner, tableCount } from './dining.ts';
import type { Diner, DiningReaction } from './dining.ts';

export const burgerMinutes = [3, 5, 7] as const;
export type BurgerMinutes = typeof burgerMinutes[number];
export const defaultBurgerMinutes: BurgerMinutes = 3;
export const grillColumns = 4;
export const grillRows = 2;
export const grillCount = grillColumns * grillRows;
export const burgerStorageSize = 8;
const pattyBurnPoint = 200;
export const cupOverflow = 200;
const millisecondsPerDrinkPercent = 20;
const trayLimit = 12;
const queueLimit = 4;
const stackLimit = 7;
export const toppings = ['cheese', 'lettuce', 'onion', 'pickle', 'tomato', 'egg', 'bacon'] as const;
export const pattyKinds = ['beef', 'chicken'] as const;
export const ingredients = [...pattyKinds, ...toppings] as const;
export const breads = ['bun', 'rice'] as const;
export const drinkKinds = ['cola', 'soda'] as const;
export type Ingredient = typeof ingredients[number];
export type PattyKind = typeof pattyKinds[number];
export type Bread = typeof breads[number];
export type DrinkKind = typeof drinkKinds[number];
export type Doneness = 'rare' | 'medium' | 'well';
export type CupSize = 'small' | 'medium' | 'large';
type Patty = { kind: PattyKind; faces: [number, number]; side: 0 | 1; heatAt: number };
export type PattyLocation = number | PattyKind | 'tray';
type Layer = { ingredient: Ingredient; patty?: Patty; source?: PattyLocation };
export type BurgerStack = { paper: boolean; bread?: Bread; layers: Layer[]; top: boolean; packed: boolean };
type Cup = { amount: number; pourAt: number };
type ServiceDrink = { kind: DrinkKind; amount: number };
type ServiceTray = { burger?: BurgerStack; drink?: ServiceDrink };
type RequestedLayer = { ingredient: Ingredient; cooked?: Doneness };
export type Order = { id: number; guest: number; bread: Bread; layers: RequestedLayer[];
  drink?: { kind: DrinkKind; size: CupSize }; at: number; until: number; price: number };
export type BurgerFeedback = { id: number; at: number; kind: 'perfect' | 'mixed' | 'poor' | 'burnt' | 'raw' | 'left' | 'spill';
  money?: number; guest?: number };
export type Counter = {
  grill: (Patty | null)[]; tray: Patty[]; burgers: [BurgerStack, BurgerStack]; cups: [Cup, Cup]; orders: Order[];
  service?: ServiceTray;
  diners?: Diner[];
  storage?: (BurgerStack | null)[];
  money: number; served: number; combo: number; best: number; sequence: number; next: number;
  feverUntil: number; retired: boolean; feedback?: BurgerFeedback;
};
export type BurgerRound = { players: Role[]; counters: Partial<Record<Role, Counter>>; seed: number; minutes: BurgerMinutes;
  start: number; end: number; revision: number; winners?: Role[] };
export type BurgerAction =
  | { type: 'grill'; kind: PattyKind; slot: number }
  | { type: 'flip'; slot: number }
  | { type: 'hold'; slot: number }
  | { type: 'move'; from: PattyLocation; to: PattyLocation | 'trash' }
  | { type: 'add'; slot: number; item: Bread | typeof toppings[number] | 'paper' }
  | { type: 'stack'; from: PattyLocation; slot: number }
  | { type: 'pop' | 'wrap' | 'discard'; slot: number }
  | { type: 'pour' | 'spill'; drink: number }
  | { type: 'stage-burger'; slot: number }
  | { type: 'store-burger'; slot: number; index: number }
  | { type: 'stage-stored' | 'discard-stored'; index: number }
  | { type: 'stage-drink'; drink: number }
  | { type: 'return-burger'; to: number | 'trash' }
  | { type: 'return-drink'; to: 'machine' | 'trash' }
  | { type: 'serve'; order: number };

const emptyBurger = (): BurgerStack => ({ paper: false, layers: [], top: false, packed: false });
const emptyCup = (): Cup => ({ amount: 0, pourAt: 0 });
const emptyCounter = (): Counter => ({
  grill: Array.from({ length: grillCount }, () => null), tray: [], burgers: [emptyBurger(), emptyBurger()],
  cups: [emptyCup(), emptyCup()], orders: [], money: 0, served: 0, combo: 0, best: 0, sequence: 0, next: 0, feverUntil: 0, retired: false,
});
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const includes = <T extends string>(values: readonly T[], candidate: unknown): candidate is T => values.includes(candidate as T);
const doneness = ['rare', 'medium', 'well'] as const;
const sizes = ['small', 'medium', 'large'] as const;
export const readBurgerMinutes = (value: unknown): BurgerMinutes | undefined =>
  burgerMinutes.find(minutes => minutes === value);

export function createBurgerRound(minutes: BurgerMinutes, players: Role[], seed = Math.floor(Math.random() * 0x1_0000_0000)): BurgerRound {
  return { players, counters: Object.fromEntries(players.map(role => [role, emptyCounter()])), seed, minutes, start: 0, end: 0, revision: 0 };
}

export function startBurgerRound(round: BurgerRound, start: number): BurgerRound {
  return { ...round, start, end: start + round.minutes * 60_000,
    counters: Object.fromEntries(round.players.map(role => [role, { ...round.counters[role], next: start + 250 }])),
    revision: round.revision + 1 };
}

function random(seed: number, order: number, channel: number) {
  let value = seed ^ Math.imul(order, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 0x1_0000_0000;
}

function newOrder(seed: number, id: number, served: number, now: number): Order {
  const tier = Math.min(6, Math.floor(served / 2));
  const roll = (channel: number) => random(seed, id, channel);
  const count = Math.min(stackLimit, 1 + tier + Math.floor(roll(0) * Math.min(3, tier + 1)));
  const patty = id === 1 ? 'beef' : pattyKinds[Math.floor(roll(1) * pattyKinds.length)];
  const layer: RequestedLayer[] = [{ ingredient: patty, cooked: id === 1 ? 'medium' : doneness[Math.floor(roll(2) * 3)] }];
  for (let i = 1; i < count; i++) {
    const pool = (tier >= 2 ? ingredients : toppings).filter(item => layer.filter(part => part.ingredient === item).length < 2);
    const ingredient = pool[Math.floor(roll(3 + i) * pool.length)];
    layer.splice(Math.floor(roll(14 + i) * (layer.length + 1)), 0, {
      ingredient, cooked: includes(pattyKinds, ingredient) ? doneness[Math.floor(roll(24 + i) * 3)] : undefined,
    });
  }
  const drink = id > 1 && roll(42) < Math.min(.73, .30 + tier * .07)
    ? { kind: drinkKinds[Math.floor(roll(43) * 2)], size: sizes[Math.floor(roll(44) * 3)] } : undefined;
  return { id, guest: Math.floor(roll(34) * explorerIds.length), bread: id > 1 && roll(35) < .37 ? 'rice' : 'bun',
    layers: layer, drink, at: now, until: now + 43_000 - tier * 2900 + Math.floor(roll(36) * 6700),
    price: 100 + count * 28 + layer.filter(part => part.cooked).length * 27 };
}

export function pattyFaces(patty: Patty, now: number): [number, number] {
  const faces: [number, number] = [...patty.faces];
  if (patty.heatAt) faces[patty.side] = Math.min(pattyBurnPoint, faces[patty.side] + Math.max(0, now - patty.heatAt) / 70);
  return faces;
}

export function pattyAt(counter: Counter, from: PattyLocation) {
  if (typeof from === 'number') return counter.grill[from] ?? undefined;
  return from === 'tray' ? counter.tray.at(-1) : counter.tray.findLast(patty => patty.kind === from);
}

function isBurnt(faces: readonly number[]) { return faces.some(face => face >= pattyBurnPoint); }

export function pattyDoneness(faces: readonly number[]): Doneness | undefined {
  if (isBurnt(faces) || faces.some(face => face < 50)) return;
  const average = (faces[0] + faces[1]) / 2;
  return average < 85 ? 'rare' : average < 115 ? 'medium' : 'well';
}

export function pattyFrame(faces: readonly [number, number], visibleSide?: Patty['side']) {
  if (isBurnt(faces)) return 4;
  const percent = visibleSide === undefined ? (faces[0] + faces[1]) / 2 : faces[visibleSide];
  return percent >= 115 ? 3 : percent >= 85 ? 2 : percent >= 50 ? 1 : 0;
}

export function cupAmount(cup: Cup, now: number) {
  return (cup.amount * millisecondsPerDrinkPercent + (cup.pourAt ? Math.max(0, now - cup.pourAt) : 0))
    / millisecondsPerDrinkPercent;
}

export function cupSize(amount: number): CupSize | undefined {
  if (amount <= 0 || amount >= cupOverflow) return;
  return amount < 87.5 ? 'small' : amount < 112.5 ? 'medium' : 'large';
}

const overflowAt = (cup: Cup) => cup.pourAt
  + Math.ceil(cupOverflow * millisecondsPerDrinkPercent - cup.amount * millisecondsPerDrinkPercent);

function updateFeedback(counter: Counter, at: number, feedback: Omit<BurgerFeedback, 'id' | 'at'>) {
  counter.feedback = { id: (counter.feedback?.id ?? 0) + 1, at, ...feedback };
}

function changed(round: BurgerRound, counters: BurgerRound['counters'], done = false): BurgerRound {
  const eligible = round.players.filter(role => !counters[role]!.retired);
  const best = Math.max(...eligible.map(role => counters[role]!.money));
  const ended = done || eligible.length === 0 || (round.players.length > 1 && eligible.length === 1);
  return { ...round, counters, revision: round.revision + 1,
    winners: ended ? eligible.filter(role => counters[role]!.money === best) : undefined };
}

export function nextBurgerAt(round: BurgerRound) {
  if (!round.start || round.winners) return;
  let event = round.end;
  for (const role of round.players) {
    const counter = round.counters[role]!;
    if (counter.retired) continue;
    event = Math.min(event, counter.next, ...counter.orders.map(order => order.until), ...(counter.diners ?? []).map(diner => diner.exitAt),
      ...counter.cups.filter(cup => cup.pourAt).map(overflowAt));
  }
  return event;
}

export function advanceBurger(round: BurgerRound, now: number) {
  const next = nextBurgerAt(round);
  if (next === undefined || next > now) return;
  if (now >= round.end) return changed(round, round.counters, true);
  const counters = { ...round.counters };
  for (const role of round.players) {
    const counter = round.counters[role]!;
    if (counter.retired) continue;
    const nextCounter = { ...counter, orders: counter.orders.filter(order => now < order.until) };
    if (counter.diners) nextCounter.diners = counter.diners.filter(diner => now < diner.exitAt);
    if (nextCounter.orders.length !== counter.orders.length) {
      nextCounter.combo = 0;
      updateFeedback(nextCounter, now, { kind: 'left', guest: counter.orders.find(order => order.until <= now)?.guest });
    }
    nextCounter.cups = counter.cups.map(cup => {
      if (!cup.pourAt || now < overflowAt(cup)) return cup;
      updateFeedback(nextCounter, now, { kind: 'spill' });
      return emptyCup();
    }) as Counter['cups'];
    if (counter.next <= now) {
      if (nextCounter.orders.length < queueLimit) nextCounter.orders.push(newOrder(round.seed, ++nextCounter.sequence, counter.served, now));
      nextCounter.next = now + Math.max(4700, 12_000 - counter.served * 615);
    }
    counters[role] = nextCounter;
  }
  return changed(round, counters);
}

export function judgeOrder(order: Order, burger: BurgerStack, side?: { kind: DrinkKind; size: CupSize }) {
  const matches = order.layers.reduce((sum, requested, index) => {
    const given = burger.layers[index];
    if (!given || given.ingredient !== requested.ingredient) return sum;
    return sum + (requested.cooked && (!given.patty || pattyDoneness(given.patty.faces) !== requested.cooked) ? .50 : 1);
  }, burger.bread === order.bread ? 2 : 0);
  const similarity = matches / Math.sqrt((order.layers.length + 2) * (burger.layers.length + 2));
  const drinkSimilarity = !order.drink || !side ? 0 : Number(order.drink.kind === side.kind) * .58 + Number(order.drink.size === side.size) * .42;
  const ratio = (value: number) => value >= .999999 ? 1 : .56 * value ** 3;
  const drinkValue = order.drink ? 55 + sizes.indexOf(order.drink.size) * 15 : 0;
  return { money: Math.round(order.price * ratio(similarity)) + Math.round(drinkValue * ratio(drinkSimilarity)),
    perfect: similarity >= .999999 && (order.drink ? drinkSimilarity >= .999999 : !side) };
}

const isGrill = (value: unknown): value is number => integer(value, grillCount - 1);
const isSlot = (value: unknown): value is 0 | 1 => value === 0 || value === 1;
const isPlace = (value: unknown): value is PattyLocation => value === 'tray' || includes(pattyKinds, value) || isGrill(value);

function removePatty(counter: Counter, from: PattyLocation, now: number) {
  let patty: Patty | null | undefined;
  if (typeof from === 'number') {
    patty = counter.grill[from]; counter.grill[from] = null;
  } else {
    const index = counter.tray.findLastIndex(candidate => from === 'tray' || candidate.kind === from);
    if (index >= 0) [patty] = counter.tray.splice(index, 1);
  }
  if (patty) return { ...patty, faces: pattyFaces(patty, now), heatAt: 0 };
}

function putPatty(counter: Counter, patty: Patty, to: PattyLocation, now: number) {
  if (typeof to !== 'number') {
    if ((to !== 'tray' && to !== patty.kind) || counter.tray.filter(item => item.kind === patty.kind).length >= trayLimit) return false;
    counter.tray.push(patty);
  }
  else { if (counter.grill[to]) return false; counter.grill[to] = { ...patty, heatAt: now }; }
  return true;
}

function editBurger(counter: Counter, action: BurgerAction, now: number) {
  switch (action.type) {
    case 'grill':
      if (!isGrill(action.slot) || !includes(pattyKinds, action.kind)) return false;
      return putPatty(counter, { kind: action.kind, faces: [0, 0], side: 0, heatAt: 0 }, action.slot, now);
    case 'flip': {
      const patty = isGrill(action.slot) && counter.grill[action.slot];
      if (!patty) return false;
      counter.grill[action.slot] = { ...patty, faces: pattyFaces(patty, now), heatAt: now, side: patty.side === 0 ? 1 : 0 };
      return true;
    }
    case 'hold': {
      if (!isGrill(action.slot)) return false;
      const patty = counter.grill[action.slot];
      if (!patty || !pattyDoneness(pattyFaces(patty, now))) return false;
      return putPatty(counter, removePatty(counter, action.slot, now)!, patty.kind, now);
    }
    case 'move': {
      if (!isPlace(action.from) || action.to === action.from || (action.to !== 'trash' && !isPlace(action.to))) return false;
      const patty = removePatty(counter, action.from, now);
      return Boolean(patty && (action.to === 'trash' || putPatty(counter, patty, action.to, now)));
    }
    case 'pour':
    case 'spill': {
      if (!isSlot(action.drink)) return false;
      const cup = counter.cups[action.drink];
      if (action.type === 'spill') { counter.cups[action.drink] = emptyCup(); return true; }
      const pouring = Boolean(cup.pourAt);
      counter.cups = counter.cups.map((previous, index) => ({ amount: cupAmount(previous, now),
        pourAt: index === action.drink && !pouring ? now : 0 })) as Counter['cups'];
      return true;
    }
    case 'stage-burger': {
      if (!isSlot(action.slot) || counter.service?.burger) return false;
      const burger = counter.burgers[action.slot];
      if (!burger.packed) return false;
      counter.service = { ...counter.service, burger };
      counter.burgers[action.slot] = emptyBurger();
      return true;
    }
    case 'store-burger': {
      if (!isSlot(action.slot) || !integer(action.index, burgerStorageSize - 1)
        || counter.storage?.[action.index]) return false;
      const burger = counter.burgers[action.slot];
      if (!burger.packed) return false;
      const storage = counter.storage?.slice() ?? Array<BurgerStack | null>(burgerStorageSize).fill(null);
      storage[action.index] = burger;
      counter.storage = storage;
      counter.burgers[action.slot] = emptyBurger();
      return true;
    }
    case 'stage-stored':
    case 'discard-stored': {
      if (!integer(action.index, burgerStorageSize - 1)) return false;
      const burger = counter.storage?.[action.index];
      if (!burger || (action.type === 'stage-stored' && counter.service?.burger)) return false;
      const storage = counter.storage!.slice();
      storage[action.index] = null;
      counter.storage = storage;
      if (action.type === 'stage-stored') counter.service = { ...counter.service, burger };
      return true;
    }
    case 'stage-drink': {
      if (!isSlot(action.drink) || counter.service?.drink) return false;
      const amount = cupAmount(counter.cups[action.drink], now);
      if (!cupSize(amount)) return false;
      counter.service = { ...counter.service, drink: { kind: drinkKinds[action.drink], amount } };
      counter.cups[action.drink] = emptyCup();
      return true;
    }
    case 'return-burger': {
      const burger = counter.service?.burger;
      if (!burger) return false;
      if (action.to !== 'trash') {
        if (!isSlot(action.to) || counter.burgers[action.to].paper) return false;
        counter.burgers[action.to] = burger;
      }
      counter.service = { ...counter.service, burger: undefined };
      return true;
    }
    case 'return-drink': {
      const drink = counter.service?.drink;
      if (!drink || (action.to !== 'machine' && action.to !== 'trash')) return false;
      if (action.to === 'machine') {
        const index = drinkKinds.indexOf(drink.kind);
        if (counter.cups[index].pourAt || counter.cups[index].amount) return false;
        counter.cups[index] = { amount: drink.amount, pourAt: 0 };
      }
      counter.service = { ...counter.service, drink: undefined };
      return true;
    }
    case 'serve': {
      const burger = counter.service?.burger;
      const order = counter.orders[0];
      if (!burger || !order || order.id !== action.order) return false;
      const drink = counter.service?.drink;
      const size = drink && cupSize(drink.amount);
      const verdict = judgeOrder(order, burger, drink && size ? { kind: drink.kind, size } : undefined);
      const money = verdict.money * (counter.feverUntil > now ? 2 : 1);
      counter.money += money;
      counter.served++;
      counter.combo = verdict.perfect ? counter.combo + 1 : 0;
      counter.best = Math.max(counter.best, counter.combo);
      if (counter.combo && counter.combo % 5 === 0) counter.feverUntil = now + (counter.feverUntil > now ? 5000 : 10_000);
      counter.orders = counter.orders.slice(1);
      counter.service = undefined;
      const reaction: DiningReaction = verdict.perfect ? 'perfect' : money ? 'mixed' : 'poor';
      const diners = counter.diners ?? [];
      counter.diners = [...diners, seatDiner(diners, { id: order.id, guest: order.guest }, now, reaction)];
      updateFeedback(counter, now, { kind: reaction, money, guest: order.guest });
      return true;
    }
    default: break;
  }
  if (!('slot' in action) || !isSlot(action.slot)) return false;
  const burger = counter.burgers[action.slot];
  switch (action.type) {
    case 'add':
      if (burger.packed || burger.top) return false;
      if (action.item === 'paper' && !burger.paper) { burger.paper = true; return true; }
      if (!burger.paper) return false;
      if (includes(breads, action.item)) {
        if (!burger.bread) { burger.bread = action.item; return true; }
        if (burger.bread === action.item && burger.layers.some(layer => layer.patty)) { burger.top = true; return true; }
      }
      if (!burger.bread || burger.layers.length >= stackLimit || !includes(toppings, action.item)) return false;
      burger.layers.push({ ingredient: action.item });
      return true;
    case 'stack': {
      if (!isPlace(action.from) || !burger.bread || burger.packed || burger.top || burger.layers.length >= stackLimit) return false;
      const patty = pattyAt(counter, action.from);
      if (!patty) return false;
      const faces = pattyFaces(patty, now);
      if (!pattyDoneness(faces)) {
        updateFeedback(counter, now, { kind: isBurnt(faces) ? 'burnt' : 'raw' });
        return true;
      }
      const stopped = removePatty(counter, action.from, now)!;
      burger.layers.push({ ingredient: stopped.kind, patty: stopped, source: action.from });
      return true;
    }
    case 'pop': {
      if (burger.packed || !burger.paper) return false;
      if (burger.top) { burger.top = false; return true; }
      const layer = burger.layers.pop();
      if (layer?.patty && layer.source !== undefined) {
        const fallback = counter.grill.findIndex(value => !value);
        return putPatty(counter, layer.patty, layer.source, now) || putPatty(counter, layer.patty, 'tray', now)
          || (fallback >= 0 && putPatty(counter, layer.patty, fallback, now));
      }
      if (!layer) {
        if (burger.bread) burger.bread = undefined;
        else burger.paper = false;
      }
      return true;
    }
    case 'wrap':
      if (!burger.top || burger.packed) return false;
      burger.packed = true;
      return true;
    case 'discard':
      if (!burger.paper) return false;
      counter.burgers[action.slot] = emptyBurger();
      return true;
    default: return false;
  }
}

export function applyBurgerAction(round: BurgerRound, actor: Role, raw: unknown, now: number) {
  if (!round.start || now < round.start || round.winners || !raw || typeof raw !== 'object' || !('type' in raw)) return;
  const advanced = advanceBurger(round, now);
  const current = advanced ?? round;
  const board = current.counters[actor];
  if (!board || board.retired || current.winners) return advanced;
  const counter: Counter = { ...board, grill: [...board.grill], tray: [...board.tray], cups: [...board.cups],
    burgers: board.burgers.map(item => ({ ...item, layers: [...item.layers] })) as Counter['burgers'] };
  return editBurger(counter, raw as BurgerAction, now) ? changed(current, { ...current.counters, [actor]: counter }) : advanced;
}

export function resignBurger(round: BurgerRound, actor: Role) {
  const counter = round.counters[actor];
  if (!counter || counter.retired || round.winners) return;
  return changed(round, { ...round.counters, [actor]: { ...counter, retired: true } });
}

export function burgerOutcome(round: BurgerRound, role: Role) {
  if (!round.winners || !round.players.includes(role)) return;
  return !round.winners.includes(role) ? 'loss' : round.winners.length > 1 ? 'draw' : 'win';
}

export function shiftBurgerClock(round: BurgerRound, pause: number): BurgerRound {
  if (!round.start) return round;
  const shift = (value: number) => value ? value + pause : 0;
  const counters = { ...round.counters };
  for (const role of round.players) {
    const counter = counters[role]!;
    counters[role] = { ...counter, next: shift(counter.next), feverUntil: shift(counter.feverUntil),
      grill: counter.grill.map(patty => patty && { ...patty, heatAt: shift(patty.heatAt) }),
      cups: counter.cups.map(cup => ({ ...cup, pourAt: shift(cup.pourAt) })) as Counter['cups'],
      orders: counter.orders.map(order => ({ ...order, at: shift(order.at), until: shift(order.until) })),
      ...(counter.diners && { diners: counter.diners.map(diner => shiftDiner(diner, pause)) }),
      feedback: counter.feedback && { ...counter.feedback, at: shift(counter.feedback.at) } };
  }
  return { ...round, counters, start: shift(round.start), end: shift(round.end) };
}

function readPatty(raw: Patty) {
  return raw && includes(pattyKinds, raw.kind) && isSlot(raw.side) && integer(raw.heatAt)
    && Array.isArray(raw.faces) && raw.faces.length === 2 && raw.faces.every(value => Number.isFinite(value) && value >= 0 && value <= pattyBurnPoint);
}

function validStack(burger: BurgerStack) {
  return burger && typeof burger.paper === 'boolean' && typeof burger.top === 'boolean' && typeof burger.packed === 'boolean'
    && (burger.bread === undefined || includes(breads, burger.bread))
    && Array.isArray(burger.layers) && burger.layers.length <= stackLimit
    && burger.layers.every(layer => layer && includes(ingredients, layer.ingredient)
      && (layer.patty ? readPatty(layer.patty) && layer.patty.kind === layer.ingredient && isPlace(layer.source) : includes(toppings, layer.ingredient)));
}

function validService(service: ServiceTray) {
  return service && typeof service === 'object'
    && (service.burger === undefined || (validStack(service.burger) && service.burger.packed && service.burger.top
      && service.burger.paper && Boolean(service.burger.bread) && service.burger.layers.some(layer => layer.patty)))
    && (service.drink === undefined || (service.drink && includes(drinkKinds, service.drink.kind)
      && Number.isFinite(service.drink.amount) && Boolean(cupSize(service.drink.amount))));
}

function validDiners(diners: Diner[], sequence: number) {
  return Array.isArray(diners) && diners.length <= 100 && diners.every((diner, index) => diner && integer(diner.id, sequence)
    && integer(diner.guest, explorerIds.length - 1) && integer(diner.table, tableCount - 1)
    && integer(diner.at) && integer(diner.walkAt) && integer(diner.eatAt) && integer(diner.doneAt) && integer(diner.exitAt)
    && diner.walkAt >= diner.at + diningReplyMs && diner.eatAt === diner.walkAt + seatWalkMs
    && diner.doneAt === diner.eatAt + 9000 + (diner.id % 3) * 1000 && diner.exitAt === diner.doneAt + diningExitMs
    && includes(['perfect', 'mixed', 'poor'] as const, diner.reaction)
    && (!index || (diners[index - 1].id < diner.id && diners[index - 1].walkAt <= diner.walkAt)));
}

export function readBurgerRound(raw: unknown): BurgerRound | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { players, counters, seed, start, end, minutes, revision, winners } = raw as BurgerRound;
  if (!readBurgerMinutes(minutes) || !Array.isArray(players) || players.length < 2 || players.length > 4 || players[0] !== 'host'
    || !players.every(isRoomRole) || new Set(players).size !== players.length || !counters || typeof counters !== 'object'
    || !integer(seed, 0xffffffff) || !integer(start) || end !== (start ? start + minutes * 60_000 : 0) || !integer(revision)) return;
  if (winners !== undefined && (!Array.isArray(winners) || new Set(winners).size !== winners.length || !winners.every(role => players.includes(role)))) return;
  const boards: BurgerRound['counters'] = {};
  for (const role of players) {
    const counter = counters[role];
    if (!counter || ![counter.money, counter.served, counter.combo, counter.best, counter.sequence, counter.next, counter.feverUntil].every(value => integer(value))
      || counter.combo > counter.best || counter.best > counter.served || typeof counter.retired !== 'boolean'
      || !Array.isArray(counter.grill) || counter.grill.length !== grillCount || !counter.grill.every(patty => patty === null || readPatty(patty))
      || !Array.isArray(counter.tray) || counter.tray.length > trayLimit * pattyKinds.length || !counter.tray.every(readPatty)
      || pattyKinds.some(kind => counter.tray.filter(patty => patty.kind === kind).length > trayLimit)
      || !Array.isArray(counter.burgers) || counter.burgers.length !== 2 || !counter.burgers.every(validStack)
      || (counter.service !== undefined && !validService(counter.service))
      || (counter.storage !== undefined && (!Array.isArray(counter.storage) || counter.storage.length !== burgerStorageSize
        || !counter.storage.every(burger => burger === null || Boolean(burger && validService({ burger })))))
      || (counter.diners !== undefined && !validDiners(counter.diners, counter.sequence))
      || !Array.isArray(counter.cups) || counter.cups.length !== 2 || !counter.cups.every(cup => cup && Number.isFinite(cup.amount)
        && cup.amount >= 0 && cup.amount < cupOverflow && integer(cup.pourAt))
      || !Array.isArray(counter.orders) || counter.orders.length > queueLimit || !counter.orders.every(order => order && integer(order.id, counter.sequence)
        && integer(order.guest, explorerIds.length - 1) && integer(order.at) && integer(order.until) && order.until > order.at && includes(breads, order.bread)
        && integer(order.price, 1000) && Array.isArray(order.layers) && order.layers.length <= stackLimit && order.layers.length > 0
        && order.layers.every(layer => layer && includes(ingredients, layer.ingredient) && (includes(pattyKinds, layer.ingredient)
          ? includes(doneness, layer.cooked) : layer.cooked === undefined))
        && (!order.drink || includes(drinkKinds, order.drink.kind) && includes(sizes, order.drink.size)))
      || (counter.feedback && (!integer(counter.feedback.id) || !integer(counter.feedback.at)
        || !includes(['perfect', 'mixed', 'poor', 'burnt', 'raw', 'left', 'spill'], counter.feedback.kind)
        || (counter.feedback.money !== undefined && !integer(counter.feedback.money, 3000))
        || (counter.feedback.guest !== undefined && !integer(counter.feedback.guest, explorerIds.length - 1))))) return;
    boards[role] = counter;
  }
  return { players, counters: boards, seed, minutes, start, end, revision, winners };
}
