import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { explorerIds } from '../../../../../packages/protocol/explorers.ts';
import { diningExitMs, diningReplyMs, diningSatisfaction, seatDiner, seatWalkMs, shiftDiner, tableCount } from './dining.ts';
import type { Diner, DiningReaction, DiningSatisfaction } from './dining.ts';
import { cardCount, cardModifiers, cardOffers, ordersPerLevel, readBurgerCard, supplyAvailable, unlockLevels } from './cards.ts';
import type { BurgerCard } from './cards.ts';

export const burgerMinutes = [5, 7, 10, 'endless'] as const;
export type BurgerMinutes = (typeof burgerMinutes)[number] | 3;
export type BurgerMode = 'race' | 'coop';
export const readBurgerMode = (mode: unknown): BurgerMode | undefined => mode === 'race' || mode === 'coop' ? mode : undefined;
export const defaultBurgerMinutes: BurgerMinutes = 5;
export const grillColumns = 4;
export const grillRows = 2;
export const grillCount = grillColumns * grillRows;
export const burgerStorageSize = 8;
export const burgerPreparationMs = 20_000;
export const burgerEndlessOpeningMs = 90_000;
const pattyBurnPoint = 200;
export const cupOverflow = 200;
const millisecondsPerDrinkPercent = 20;
const trayLimit = 8;
const previousTrayLimit = 12;
const queueLimit = 4;
const stackLimit = 5;
const pattyLimit = 2;
const legacyStackLimit = 7;
export const burgerShooAnimationMs = 620;
const shooCooldownMs = 2600;
const feverDurationMs = 20_000;
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
type Patty = { kind: PattyKind; faces: [number, number]; side: 0 | 1; heatAt: number; speed?: number; serial?: number };
export type PattyLocation = number | PattyKind | 'tray';
type Layer = { ingredient: Ingredient; patty?: Patty; source?: PattyLocation };
export type BurgerStack = { paper: boolean; bread?: Bread; layers: Layer[]; top: boolean; packed: boolean };
type Cup = { amount: number; pourAt: number };
type ServiceDrink = { kind: DrinkKind; amount: number };
type BurgerOrigin = { area: 'assembly' | 'storage'; index: number };
type ServiceTray = { burger?: BurgerStack; origin?: BurgerOrigin; drink?: ServiceDrink };
type RequestedLayer = { ingredient: Ingredient; cooked?: Doneness };
export type Order = { id: number; guest: number; bread: Bread; layers: RequestedLayer[]; reorderedAt?: number;
  drink?: { kind: DrinkKind; size: CupSize }; at: number; until: number; patienceMs?: number; price: number };
export type BurgerFeedback = { id: number; at: number; kind: 'perfect' | 'mixed' | 'poor' | 'burnt' | 'raw' | 'left' | 'spill';
  money?: number; guest?: number; tip?: number; timeAdded?: number; line?: BurgerLine; order?: number };
type Shoo = { sequence: number; order: number; at: number; left: boolean; variant: number };
export type Counter = {
  grill: (Patty | null)[]; tray: Patty[]; burgers: [BurgerStack, BurgerStack]; cups: [Cup, Cup]; orders: Order[];
  service?: ServiceTray;
  diners?: Diner[];
  storage?: (BurgerStack | null)[];
  pattySequence?: number;
  playUntil?: number;
  cards?: BurgerCard[];
  draft?: { at: number; offers: BurgerCard[] };
  bankrupt?: boolean;
  closed?: boolean;
  shoo?: Shoo;
  money: number; served: number; combo: number; best: number; sequence: number; next: number;
  feverUntil: number; feverTrigger?: number; retired: boolean; feedback?: BurgerFeedback;
};
export type BurgerRound = { players: Role[]; counters: Partial<Record<Role, Counter>>; seed: number; minutes: BurgerMinutes;
  mode?: BurgerMode; resigned?: Role[]; start: number; opensAt?: number; end: number; revision: number; winners?: Role[] };
export type BurgerAction =
  | { type: 'grill'; kind: PattyKind; slot: number }
  | { type: 'flip'; slot: number; side?: Patty['side']; serial?: number }
  | { type: 'hold'; slot: number; serial?: number }
  | { type: 'move'; from: PattyLocation; to: PattyLocation | 'trash'; serial?: number }
  | { type: 'add'; slot: number; item: Bread | typeof toppings[number] | 'paper' }
  | { type: 'stack'; from: PattyLocation; slot: number; serial?: number }
  | ({ type: 'stack-tray'; slot: number } & TraySelection)
  | ({ type: 'discard-tray' } & TraySelection)
  | { type: 'pop' | 'wrap' | 'discard'; slot: number }
  | { type: 'pour' | 'spill'; drink: number; pouring?: boolean }
  | { type: 'stage-burger'; slot: number }
  | { type: 'store-burger'; slot: number; index: number }
  | { type: 'stage-stored' | 'discard-stored'; index: number; serial?: number }
  | { type: 'shift-stored'; from: number; to: number; serial?: number }
  | { type: 'stage-drink'; drink: number }
  | { type: 'return-burger'; to: number | 'origin' | 'trash'; serial?: number }
  | { type: 'return-drink'; to: 'machine' | 'trash' }
  | { type: 'choose-card'; card: BurgerCard; level: number }
  | { type: 'serve' | 'shoo'; order: number };

type TraySelection = { kind: PattyKind; index: number; serial?: number };
function trayIndex(counter: Counter, { kind, index, serial }: TraySelection) {
  if (!includes(pattyKinds, kind) || !integer(index, trayLimit - 1)) return -1;
  return serial === undefined ? counter.tray.flatMap((patty, i) => patty.kind === kind ? [i] : [])[index] ?? -1
    : counter.tray.findIndex(patty => patty.kind === kind && patty.serial === serial);
}

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
type BurgerSupply = Ingredient | Bread | DrinkKind | 'paper';
const unlockLevel: Record<BurgerSupply, number> = { paper: 1, bun: 1, beef: 1, ...unlockLevels };
const difficulty = [
  { min: 1, max: 1, interval: 24_000, patience: 86_000, drinks: 0 },
  { min: 2, max: 2, interval: 19_000, patience: 72_000, drinks: 0 },
  { min: 2, max: 3, interval: 15_000, patience: 58_000, drinks: .22 },
  { min: 3, max: 4, interval: 12_000, patience: 49_000, drinks: .31 },
  { min: 3, max: 5, interval: 10_000, patience: 42_000, drinks: .39 },
  { min: 4, max: 5, interval: 8000, patience: 36_000, drinks: .47 },
  { min: 4, max: 5, interval: 6000, patience: 31_000, drinks: .55 },
  { min: 5, max: 5, interval: 4700, patience: 27_000, drinks: .63 },
] as const;
const endlessRewards = [25, 23, 20, 17, 14, 12, 10, 8] as const;

export const burgerRank = (served: number) => 1 + Math.floor(served / ordersPerLevel);
export const burgerLevel = (served: number) => Math.min(difficulty.length, burgerRank(served));
export const burgerUnlockLevel = (item: BurgerSupply) => unlockLevel[item];
export const burgerSupplyUnlocked = (item: BurgerSupply, value: number | Counter) =>
  typeof value === 'number' || !value.cards ? burgerUnlockLevel(item) <= burgerLevel(typeof value === 'number' ? value : value.served)
    : burgerUnlockLevel(item) === 1 || supplyAvailable(value.cards, item);
export const burgerFacility = (counter: Counter, card: 'broom' | 'griddle' | 'assembly' | 'storage' | 'tray') => !counter.cards || counter.cards.includes(card);
export const burgerTables = (counter: Counter) => counter.cards ? cardCount(counter.cards, 'table') : tableCount;
const allowedGrill = (counter: Counter, slot: number) => slot < (burgerFacility(counter, 'griddle') ? grillCount : grillColumns);
const assemblyLimit = (counter: Counter) => stackLimit + (counter.cards ? cardCount(counter.cards, 'picky') : 0);
const remainingDifficulty = (counter: Counter) => {
  const target = difficulty[burgerLevel(counter.served) - 1];
  if (!counter.cards) return target;
  const { traffic, patience } = cardModifiers(counter.cards);
  return { ...target, min: Math.max(1, target.min - 1), interval: Math.round((target.interval + 24_000) / 2 / traffic),
    patience: Math.round((target.patience + 86_000) / 2 * patience) };
};
export const readBurgerMinutes = (value: unknown): BurgerMinutes | undefined =>
  value === 3 ? 3 : burgerMinutes.find(minutes => minutes === value);

const kitchenRoles = (round: Pick<BurgerRound, 'mode' | 'players'>): Role[] => round.mode === 'coop' ? ['host'] : round.players;
const kitchenRole = (round: BurgerRound, role: Role): Role => round.mode === 'coop' ? 'host' : role;
export const burgerCounter = (round: BurgerRound, role: Role): Counter => round.counters[kitchenRole(round, role)]!;
export const burgerResigned = (round: BurgerRound, role: Role) =>
  round.mode === 'coop' ? Boolean(round.resigned?.includes(role)) : burgerCounter(round, role).retired;

export function createBurgerRound(minutes: BurgerMinutes, players: Role[], seed = Math.floor(Math.random() * 0x1_0000_0000),
  mode: BurgerMode = 'race'): BurgerRound {
  return { players, counters: Object.fromEntries(kitchenRoles({ mode, players }).map(role => [role, { ...emptyCounter(), money: 100, cards: [] }])),
    seed, minutes, ...(mode === 'coop' && { mode }), start: 0, end: 0, revision: 0 };
}

export function startBurgerRound(round: BurgerRound, start: number): BurgerRound {
  const opensAt = start + burgerPreparationMs;
  const end = opensAt + (round.minutes === 'endless' ? burgerEndlessOpeningMs : round.minutes * 60_000);
  return { ...round, start, opensAt, end,
    counters: Object.fromEntries(kitchenRoles(round).map(role => [role, { ...round.counters[role], next: opensAt,
      ...((round.minutes === 'endless' || round.counters[role]?.cards) && { playUntil: end }) }])),
    revision: round.revision + 1 };
}

function random(seed: number, order: number, channel: number) {
  let value = seed ^ Math.imul(order, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 0x1_0000_0000;
}

function newOrder(seed: number, id: number, counter: Counter, now: number): Order {
  const { served, cards } = counter;
  const level = burgerLevel(served);
  const { min, max, patience, drinks } = remainingDifficulty(counter);
  const roll = (channel: number) => random(seed, id, channel);
  const layerMax = cards ? Math.max(1, max + cardModifiers(cards).layers) : max;
  const layerMin = Math.min(min, layerMax);
  const count = layerMin + Math.floor(roll(0) * (layerMax - layerMin + 1));
  const availablePatties = pattyKinds.filter(item => burgerSupplyUnlocked(item, counter));
  const availableToppings = toppings.filter(item => burgerSupplyUnlocked(item, counter));
  const available = level >= 5 ? [...availableToppings, ...availablePatties] : availableToppings;
  const heat = (channel: number) => id === 1 && channel === 2 ? 'medium'
    : doneness[Math.floor(roll(channel) * doneness.length)];
  const layer: RequestedLayer[] = [{ ingredient: availablePatties[Math.floor(roll(1) * availablePatties.length)], cooked: heat(2) }];
  for (let i = 1; i < count; i++) {
    const hasTwoPatties = layer.filter(part => part.cooked).length >= pattyLimit;
    const pool = available.filter(item => !(hasTwoPatties && includes(pattyKinds, item))
      && layer.filter(part => part.ingredient === item).length < 2);
    if (!pool.length) break;
    const ingredient = pool[Math.floor(roll(3 + i) * pool.length)];
    const position = level < 3 ? layer.length : Math.floor(roll(14 + i) * (layer.length + 1));
    layer.splice(position, 0, { ingredient, cooked: includes(pattyKinds, ingredient) ? heat(24 + i) : undefined });
  }
  const availableDrinks = drinkKinds.filter(item => burgerSupplyUnlocked(item, counter));
  const drink = availableDrinks.length && roll(42) < drinks ? { kind: availableDrinks[Math.floor(roll(43) * availableDrinks.length)],
    size: level === 3 ? 'medium' as const : sizes[Math.floor(roll(44) * sizes.length)] } : undefined;
  return { id, guest: Math.floor(roll(34) * explorerIds.length),
    bread: burgerSupplyUnlocked('rice', counter) && roll(35) < .37 ? 'rice' : 'bun',
    layers: layer, drink, at: now, until: now + Math.round(1.5 * (patience + Math.floor(roll(36) * 6700))),
    price: 100 + layer.length * 28 + layer.filter(part => part.cooked).length * 27 };
}

export function pattyFaces(patty: Patty, now: number): [number, number] {
  const faces: [number, number] = [...patty.faces];
  if (patty.heatAt) {
    const heat = Math.max(0, now - patty.heatAt) * (patty.speed ?? 1000) / 70_000;
    faces[patty.side] = Math.min(pattyBurnPoint, faces[patty.side] + heat);
  }
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

export const storedPattyFrame = (faces: Patty['faces']) => isBurnt(faces) ? 4 : pattyDoneness(faces) ? pattyFrame(faces) : 0;

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
  if (round.mode === 'coop') {
    return { ...round, counters, revision: round.revision + 1,
      winners: done || counters.host?.closed || round.resigned?.length === round.players.length ? [] : undefined };
  }
  const eligible = round.players.filter(role => !counters[role]!.retired);
  const best = Math.max(...eligible.map(role => counters[role]!.money));
  const ended = done || eligible.length === 0 || (round.players.length > 1 && eligible.length === 1);
  return { ...round, counters, revision: round.revision + 1,
    winners: ended || eligible.every(role => counters[role]!.closed)
      ? eligible.filter(role => counters[role]!.money === best) : undefined };
}

const orderValue = (order: Order) => order.price + (order.drink ? 55 + sizes.indexOf(order.drink.size) * 15 : 0);

function charge(counter: Counter, amount: number) {
  if (!counter.cards) return;
  counter.money = Math.max(0, counter.money - amount);
  if (!counter.money) { counter.bankrupt = true; counter.retired = true; counter.closed = true; }
}

export const burgerDeadline = (round: BurgerRound, role: Role) => burgerCounter(round, role).playUntil ?? round.end;

export function nextBurgerAt(round: BurgerRound) {
  if (!round.start || round.winners) return;
  let event = Infinity;
  for (const role of kitchenRoles(round)) {
    const counter = round.counters[role]!;
    if (counter.retired || counter.closed || counter.draft) continue;
    event = Math.min(event, burgerDeadline(round, role), counter.next, ...counter.orders.map(order => order.until), ...(counter.diners ?? []).map(diner => diner.exitAt),
      ...counter.cups.filter(cup => cup.pourAt).map(overflowAt));
  }
  return Number.isFinite(event) ? event : undefined;
}

export function advanceBurger(round: BurgerRound, now: number) {
  const next = nextBurgerAt(round);
  if (next === undefined || next > now) return;
  if (now >= round.end && round.minutes !== 'endless' && !round.counters.host?.cards) return changed(round, round.counters, true);
  const counters = { ...round.counters };
  for (const role of kitchenRoles(round)) {
    const counter = round.counters[role]!;
    if (counter.retired || counter.closed || counter.draft) continue;
    if (now >= burgerDeadline(round, role)) {
      counters[role] = { ...counter, closed: true };
      continue;
    }
    const nextCounter = { ...counter, orders: counter.orders.filter(order => now < order.until) };
    if (counter.diners) nextCounter.diners = counter.diners.filter(diner => now < diner.exitAt);
    if (nextCounter.orders.length !== counter.orders.length) {
      const expired = counter.orders.filter(order => order.until <= now);
      charge(nextCounter, expired.reduce((total, order) => total + Math.ceil(orderValue(order) / 2), 0));
      nextCounter.combo = 0;
      updateFeedback(nextCounter, now, { kind: 'left', guest: expired[0].guest });
    }
    nextCounter.cups = counter.cups.map(cup => {
      if (!cup.pourAt || now < overflowAt(cup)) return cup;
      updateFeedback(nextCounter, now, { kind: 'spill' });
      return emptyCup();
    }) as Counter['cups'];
    if (counter.next <= now && !nextCounter.closed) {
      if (nextCounter.orders.length < queueLimit) nextCounter.orders.push(newOrder(round.seed, ++nextCounter.sequence, counter, now));
      nextCounter.next = now + remainingDifficulty(counter).interval;
    }
    counters[role] = nextCounter;
  }
  return changed(round, counters);
}

export function judgeOrder(order: Order, burger: BurgerStack, side?: { kind: DrinkKind; size: CupSize }) {
  const matches = order.layers.reduce((sum, requested, index) =>
    sum + Number(burger.layers[index]?.ingredient === requested.ingredient), burger.bread === order.bread ? 2 : 0);
  const similarity = matches / Math.sqrt((order.layers.length + 2) * (burger.layers.length + 2));
  const drinkSimilarity = !order.drink || !side ? 0 : Number(order.drink.kind === side.kind) * .58 + Number(order.drink.size === side.size) * .42;
  const ratio = (value: number) => value >= .999999 ? 1 : .56 * value ** 3;
  const drinkValue = order.drink ? 55 + sizes.indexOf(order.drink.size) * 15 : 0;
  const perfect = similarity >= .999999 && (order.drink ? drinkSimilarity >= .999999 : !side);
  const accuracy = Math.min(1, (order.price * similarity + drinkValue * drinkSimilarity) / (order.price + drinkValue))
    * (!order.drink && side ? .87 : 1);
  const matchesDoneness = order.layers.every((requested, index) => {
    const patty = burger.layers[index]?.patty;
    return !requested.cooked || Boolean(patty && pattyDoneness(patty.faces) === requested.cooked);
  });
  const tip = perfect && matchesDoneness && order.layers.some(layer => layer.cooked) ? Math.round((order.price + drinkValue) / 2) : 0;
  const satisfaction: DiningSatisfaction = perfect ? 'love' : accuracy >= .82 ? 'delighted'
    : accuracy >= .67 ? 'content' : accuracy >= .48 ? 'puzzled' : 'disappointed';
  return { money: Math.round(order.price * ratio(similarity)) + Math.round(drinkValue * ratio(drinkSimilarity)),
    perfect, satisfaction, tip, similarity: accuracy };
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
    if ((to !== 'tray' && to !== patty.kind) || counter.tray.filter(item => item.kind === patty.kind).length >= (burgerFacility(counter, 'tray') ? trayLimit : 4)) return false;
    counter.tray.push(patty);
  }
  else { if (!allowedGrill(counter, to) || counter.grill[to]) return false; counter.grill[to] = { ...patty, heatAt: now }; }
  return true;
}

export const burgerSerial = (burger?: BurgerStack | null) => burger?.layers.find(layer => layer.patty)?.patty?.serial;

function editBurger(counter: Counter, action: BurgerAction, now: number, seed: number, endless: boolean) {
  const origin = counter.service?.origin;
  const validAssembly = (slot: unknown): slot is 0 | 1 => isSlot(slot) && (!slot || burgerFacility(counter, 'assembly'));
  switch (action.type) {
    case 'grill':
      if (!isGrill(action.slot) || !allowedGrill(counter, action.slot) || counter.grill[action.slot] || !includes(pattyKinds, action.kind)
        || !burgerSupplyUnlocked(action.kind, counter)) return false;
      const sequence = (counter.pattySequence ?? 0) + 1;
      const speed = 900 + Math.floor(random(seed, sequence, 61) * 201);
      counter.pattySequence = sequence;
      charge(counter, 10);
      return putPatty(counter, { kind: action.kind, faces: [0, 0], side: 0, heatAt: 0, speed, serial: sequence }, action.slot, now);
    case 'flip': {
      const patty = isGrill(action.slot) && counter.grill[action.slot];
      if (!patty || (action.serial !== undefined && patty.serial !== action.serial)
        || (action.side !== undefined && patty.side !== action.side)) return false;
      counter.grill[action.slot] = { ...patty, faces: pattyFaces(patty, now), heatAt: now, side: patty.side === 0 ? 1 : 0 };
      return true;
    }
    case 'hold': {
      if (!isGrill(action.slot)) return false;
      const patty = counter.grill[action.slot];
      if (!patty || (action.serial !== undefined && patty.serial !== action.serial) || !pattyDoneness(pattyFaces(patty, now))) return false;
      return putPatty(counter, removePatty(counter, action.slot, now)!, patty.kind, now);
    }
    case 'move': {
      if (!isPlace(action.from) || action.to === action.from || (action.to !== 'trash' && !isPlace(action.to))) return false;
      if (action.serial !== undefined && pattyAt(counter, action.from)?.serial !== action.serial) return false;
      const patty = removePatty(counter, action.from, now);
      if (patty && action.to === 'trash') charge(counter, 10);
      return Boolean(patty && (action.to === 'trash' || putPatty(counter, patty, action.to, now)));
    }
    case 'pour':
    case 'spill': {
      if (!isSlot(action.drink)) return false;
      const cup = counter.cups[action.drink];
      if (action.type === 'spill') { counter.cups[action.drink] = emptyCup(); return true; }
      const pouring = Boolean(cup.pourAt);
      if (action.pouring !== undefined && pouring !== action.pouring) return false;
      if (!pouring && !burgerSupplyUnlocked(drinkKinds[action.drink], counter)) return false;
      counter.cups = counter.cups.map((previous, index) => ({ amount: cupAmount(previous, now),
        pourAt: index === action.drink && !pouring ? now : 0 })) as Counter['cups'];
      return true;
    }
    case 'stage-burger': {
      if (!validAssembly(action.slot) || counter.service?.burger) return false;
      const burger = counter.burgers[action.slot];
      if (!burger.packed) return false;
      counter.service = { ...counter.service, burger, origin: { area: 'assembly', index: action.slot } };
      counter.burgers[action.slot] = emptyBurger();
      return true;
    }
    case 'store-burger': {
      if (!burgerFacility(counter, 'storage') || !validAssembly(action.slot) || !integer(action.index, burgerStorageSize - 1)
        || counter.storage?.[action.index] || (origin?.area === 'storage' && origin.index === action.index)) return false;
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
      if (!burgerFacility(counter, 'storage') || !integer(action.index, burgerStorageSize - 1)) return false;
      const burger = counter.storage?.[action.index];
      if (!burger || (action.serial !== undefined && burgerSerial(burger) !== action.serial)
        || (action.type === 'stage-stored' && counter.service?.burger)) return false;
      const storage = counter.storage!.slice();
      storage[action.index] = null;
      counter.storage = storage;
      if (action.type === 'stage-stored') counter.service = { ...counter.service, burger, origin: { area: 'storage', index: action.index } };
      else charge(counter, 30);
      return true;
    }
    case 'shift-stored': {
      if (!burgerFacility(counter, 'storage') || !integer(action.from, burgerStorageSize - 1) || !integer(action.to, burgerStorageSize - 1) || action.from === action.to
        || (origin?.area === 'storage' && origin.index === action.to)) return false;
      const burger = counter.storage?.[action.from];
      if (!burger || (action.serial !== undefined && burgerSerial(burger) !== action.serial)) return false;
      const storage = counter.storage!.slice();
      storage[action.from] = storage[action.to];
      storage[action.to] = burger;
      counter.storage = storage;
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
      if (!burger || (action.serial !== undefined && burgerSerial(burger) !== action.serial)) return false;
      if (action.to === 'origin' && origin?.area === 'storage') {
        if (!counter.storage || counter.storage[origin.index]) return false;
        const storage = counter.storage.slice();
        storage[origin.index] = burger;
        counter.storage = storage;
      } else if (action.to !== 'trash') {
        const index = action.to === 'origin' ? origin?.index ?? counter.burgers.findIndex(stack => !stack.paper) : action.to;
        if (!validAssembly(index) || counter.burgers[index].paper) return false;
        counter.burgers[index] = burger;
      } else charge(counter, 30);
      counter.service = { drink: counter.service?.drink };
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
    case 'shoo': {
      if (!burgerFacility(counter, 'broom') || counter.shoo && now - counter.shoo.at < shooCooldownMs) return false;
      const order = counter.orders.find(item => item.id === action.order);
      if (!order) return false;
      const sequence = (counter.shoo?.sequence ?? 0) + 1;
      const pushedOut = random(seed ^ order.id, sequence, 77) < .5;
      const patienceMs = order.patienceMs ?? order.until - order.at;
      const shortened = counter.cards ? order.until - Math.ceil(patienceMs * .3) : now + Math.ceil((order.until - now) * .8);
      const left = pushedOut || shortened <= now;
      counter.shoo = { sequence, order: order.id, left, at: now, variant: Math.floor(random(seed, sequence, 78) * (left ? 3 : 6)) };
      if (left) {
        counter.orders = counter.orders.filter(item => item.id !== order.id); counter.combo = 0;
        if (counter.cards && random(seed ^ order.id, sequence, 79) < .3) counter.money += orderValue(order);
      } else counter.orders = counter.orders.map(item => item.id === order.id ? { ...item, until: shortened, patienceMs } : item);
      return true;
    }
    case 'serve': {
      const burger = counter.service?.burger;
      const order = counter.orders[0];
      if (!burger || !order || order.id !== action.order) return false;
      const drink = counter.service?.drink;
      const size = drink && cupSize(drink.amount);
      const delivered = drink && size ? { kind: drink.kind, size } : undefined;
      const verdict = judgeOrder(order, burger, delivered);
      const { line, thought } = chooseBurgerDialogue(order, burger, delivered, verdict.similarity,
        burger.layers.map(layer => layer.patty && pattyDoneness(layer.patty.faces)),
        random(seed, order.id + (counter.feedback?.id ?? 0), 81), random(seed, order.id, 82));
      counter.service = undefined;
      if (line === 'free') {
        updateFeedback(counter, now, { kind: 'mixed', line, order: order.id, guest: order.guest });
        return true;
      }
      const tip = verdict.tip + Number(line === 'thanks');
      const money = Math.round(verdict.money * (counter.cards ? cardModifiers(counter.cards).revenue : 1)) * (counter.feverUntil > now ? 2 : 1) + tip;
      counter.money += money;
      const oldLevel = burgerLevel(counter.served);
      const timeAdded = !endless ? 0 : 1000 * Math.max(1, Math.floor(endlessRewards[oldLevel - 1] * verdict.similarity));
      if (counter.playUntil !== undefined) counter.playUntil += timeAdded;
      counter.served++;
      const newLevel = burgerLevel(counter.served);
      if (newLevel > oldLevel) counter.next = Math.min(counter.next, now + remainingDifficulty(counter).interval);
      if (counter.cards && counter.served % ordersPerLevel === 0) {
        const rank = burgerRank(counter.served);
        counter.draft = { at: now, offers: cardOffers(counter.cards, rank, index => random(seed, rank, 95 + index)) };
      }
      counter.combo = verdict.perfect ? counter.combo + 1 : 0;
      counter.best = Math.max(counter.best, counter.combo);
      if (counter.combo && counter.combo % 5 === 0) {
        counter.feverUntil = now + feverDurationMs;
        counter.feverTrigger = counter.served;
      }
      counter.orders = counter.orders.slice(1);
      const reaction: DiningReaction = verdict.perfect ? 'perfect' : verdict.satisfaction === 'disappointed' ? 'poor' : 'mixed';
      const diners = counter.diners ?? [];
      counter.diners = [...diners, { ...seatDiner(diners, { id: order.id, guest: order.guest }, now, reaction, verdict.satisfaction, verdict.tip, burgerTables(counter)),
        ...(line && { line }), ...(thought && { thought }) }];
      updateFeedback(counter, now, { kind: reaction, money, guest: order.guest,
        ...(tip && { tip }), ...(timeAdded && { timeAdded }) });
      return true;
    }
    case 'discard-tray': {
      const index = trayIndex(counter, action);
      if (index < 0) return false;
      counter.tray.splice(index, 1);
      charge(counter, 10);
      return true;
    }
    default: break;
  }
  if (!('slot' in action) || !validAssembly(action.slot)) return false;
  if (origin?.area === 'assembly' && origin.index === action.slot) return false;
  const burger = counter.burgers[action.slot];
  switch (action.type) {
    case 'add':
      if (burger.packed || burger.top || !burgerSupplyUnlocked(action.item, counter)) return false;
      if (action.item === 'paper' && !burger.paper) { burger.paper = true; return true; }
      if (!burger.paper) return false;
      if (includes(breads, action.item)) {
        if (!burger.bread) { burger.bread = action.item; return true; }
        if (burger.bread === action.item && burger.layers.some(layer => layer.patty)) { burger.top = true; return true; }
      }
      if (!burger.bread || burger.layers.length >= assemblyLimit(counter) || !includes(toppings, action.item)) return false;
      burger.layers.push({ ingredient: action.item });
      return true;
    case 'stack': case 'stack-tray': {
      if (!burger.bread || burger.packed || burger.top || burger.layers.length >= assemblyLimit(counter)
        || burger.layers.filter(layer => layer.patty).length >= pattyLimit) return false;
      const from = action.type === 'stack' ? action.from : action.kind;
      if (!isPlace(from)) return false;
      let selected: number | undefined;
      if (action.type === 'stack-tray') {
        selected = trayIndex(counter, action);
        if (selected < 0) return false;
      }
      const patty = selected === undefined ? pattyAt(counter, from) : counter.tray[selected];
      if (!patty || (action.serial !== undefined && patty.serial !== action.serial)) return false;
      const faces = pattyFaces(patty, now);
      if (!pattyDoneness(faces)) {
        updateFeedback(counter, now, { kind: isBurnt(faces) ? 'burnt' : 'raw' });
        return true;
      }
      const stopped = selected === undefined ? removePatty(counter, from, now)! : counter.tray.splice(selected, 1)[0];
      burger.layers.push({ ingredient: stopped.kind, patty: stopped, source: from });
      return true;
    }
    case 'pop': {
      if (burger.packed || !burger.paper) return false;
      if (burger.top) { burger.top = false; return true; }
      const layer = burger.layers.pop();
      if (layer?.patty && layer.source !== undefined) {
        const fallback = counter.grill.findIndex((value, index) => !value && allowedGrill(counter, index));
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
      if (burger.packed) charge(counter, 30);
      counter.burgers[action.slot] = emptyBurger();
      return true;
    default: return false;
  }
}

export function applyBurgerAction(round: BurgerRound, actor: Role, raw: unknown, now: number) {
  if (!round.players.includes(actor) || burgerResigned(round, actor)
    || !round.start || now < round.start || round.winners || !raw || typeof raw !== 'object' || !('type' in raw)) return;
  const advanced = advanceBurger(round, now);
  const current = advanced ?? round;
  const role = kitchenRole(current, actor);
  const board = current.counters[role];
  if (!board || board.retired || board.closed || current.winners) return advanced;
  const input = raw as BurgerAction;
  if (board.draft) {
    if (input.type !== 'choose-card' || input.level !== burgerRank(board.served) || !board.draft.offers.includes(input.card)) return advanced;
    const counter = shiftCounter(board, Math.max(0, now - board.draft.at));
    counter.cards = [...board.cards!, input.card];
    counter.draft = undefined;
    counter.next = Math.min(counter.next, now + remainingDifficulty(counter).interval);
    if (input.card.startsWith('sold:')) {
      const supply = input.card.slice(5);
      if (includes(drinkKinds, supply)) {
        const index = drinkKinds.indexOf(supply);
        counter.cups[index] = { amount: cupAmount(counter.cups[index], now), pourAt: 0 };
      }
      counter.orders = counter.orders.map(order => {
        if (order.bread !== supply && order.drink?.kind !== supply && !order.layers.some(layer => layer.ingredient === supply)) return order;
        const replacement = newOrder(current.seed ^ 0x50d ^ counter.cards!.length, order.id, counter, order.at);
        return { ...replacement, guest: order.guest, at: order.at, until: order.until, patienceMs: order.patienceMs, reorderedAt: now };
      });
    }
    return changed({ ...current, end: Math.max(current.end, counter.playUntil ?? 0) }, { ...current.counters, [role]: counter });
  }
  const counter: Counter = { ...board, grill: [...board.grill], tray: [...board.tray], cups: [...board.cups],
    burgers: board.burgers.map(item => ({ ...item, layers: [...item.layers] })) as Counter['burgers'] };
  if (!editBurger(counter, input, now, current.seed, current.minutes === 'endless')) return advanced;
  return changed({ ...current, end: Math.max(current.end, counter.playUntil ?? 0) }, { ...current.counters, [role]: counter });
}

export function resignBurger(round: BurgerRound, actor: Role) {
  if (!round.players.includes(actor) || round.winners || burgerResigned(round, actor)) return;
  if (round.mode === 'coop') return changed({ ...round, resigned: [...(round.resigned ?? []), actor] }, round.counters);
  const counter = round.counters[actor];
  if (!counter || counter.retired || round.winners) return;
  return changed(round, { ...round.counters, [actor]: { ...counter, retired: true } });
}

export function burgerOutcome(round: BurgerRound, role: Role) {
  if (round.mode === 'coop' || !round.winners || !round.players.includes(role)) return;
  return !round.winners.includes(role) ? 'loss' : round.winners.length > 1 ? 'draw' : 'win';
}

function shiftCounter(counter: Counter, pause: number): Counter {
  const shift = (value: number) => value ? value + pause : 0;
  return { ...counter, next: shift(counter.next), feverUntil: shift(counter.feverUntil),
      grill: counter.grill.map(patty => patty && { ...patty, heatAt: shift(patty.heatAt) }),
      cups: counter.cups.map(cup => ({ ...cup, pourAt: shift(cup.pourAt) })) as Counter['cups'],
      orders: counter.orders.map(order => ({ ...order, at: shift(order.at), until: shift(order.until),
        ...(order.reorderedAt !== undefined && { reorderedAt: shift(order.reorderedAt) }) })),
      ...(counter.diners && { diners: counter.diners.map(diner => shiftDiner(diner, pause)) }),
      ...(counter.playUntil !== undefined && { playUntil: shift(counter.playUntil) }),
      ...(counter.draft && { draft: { ...counter.draft, at: shift(counter.draft.at) } }),
      ...(counter.shoo && { shoo: { ...counter.shoo, at: shift(counter.shoo.at) } }),
      feedback: counter.feedback && { ...counter.feedback, at: shift(counter.feedback.at) } };
}

export function shiftBurgerClock(round: BurgerRound, pause: number): BurgerRound {
  if (!round.start) return round;
  const shift = (value: number) => value ? value + pause : 0;
  const counters = { ...round.counters };
  for (const role of kitchenRoles(round)) counters[role] = shiftCounter(counters[role]!, pause);
  return { ...round, counters, start: shift(round.start), end: shift(round.end),
    ...(round.opensAt !== undefined && { opensAt: shift(round.opensAt) }) };
}

function readPatty(raw: Patty) {
  return raw && includes(pattyKinds, raw.kind) && isSlot(raw.side) && integer(raw.heatAt)
    && (raw.speed === undefined || integer(raw.speed, 1100) && raw.speed >= 900)
    && (raw.serial === undefined || integer(raw.serial) && raw.serial > 0)
    && Array.isArray(raw.faces) && raw.faces.length === 2 && raw.faces.every(value => Number.isFinite(value) && value >= 0 && value <= pattyBurnPoint);
}

function validStack(burger: BurgerStack) {
  return burger && typeof burger.paper === 'boolean' && typeof burger.top === 'boolean' && typeof burger.packed === 'boolean'
    && (burger.bread === undefined || includes(breads, burger.bread))
    && Array.isArray(burger.layers) && burger.layers.length <= legacyStackLimit
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

function validServiceOrigin(counter: Counter) {
  const origin = counter.service?.origin;
  if (origin === undefined) return true;
  if (!origin || !counter.service?.burger) return false;
  if (origin.area === 'assembly') return isSlot(origin.index) && !counter.burgers[origin.index].paper;
  return origin.area === 'storage' && integer(origin.index, burgerStorageSize - 1) && counter.storage?.[origin.index] === null;
}

function validDiners(diners: Diner[], sequence: number) {
  return Array.isArray(diners) && diners.length <= 100 && diners.every((diner, index) => diner && integer(diner.id, sequence)
    && integer(diner.guest, explorerIds.length - 1) && (diner.table === -1 || integer(diner.table, tableCount - 1))
    && integer(diner.at) && integer(diner.walkAt) && integer(diner.eatAt) && integer(diner.doneAt) && integer(diner.exitAt)
    && diner.walkAt >= diner.at + diningReplyMs && diner.eatAt === diner.walkAt + seatWalkMs
    && diner.doneAt === diner.eatAt + (diner.table < 0 ? 0 : 9000 + (diner.id % 3) * 1000) && diner.exitAt === diner.doneAt + diningExitMs
    && includes(['perfect', 'mixed', 'poor'] as const, diner.reaction)
    && (diner.satisfaction === undefined || includes(diningSatisfaction, diner.satisfaction))
    && (diner.tip === undefined || integer(diner.tip, 550))
    && (diner.line === undefined || isBurgerLine(diner.line)) && (diner.thought === undefined || isBurgerLine(diner.thought))
    && (!index || diners[index - 1].id < diner.id));
}

export function readBurgerRound(raw: unknown): BurgerRound | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { players, counters, seed, start, opensAt, end, minutes, mode, resigned, revision, winners } = raw as BurgerRound;
  const salesStart = opensAt ?? start;
  const cardRound = Array.isArray(counters?.host?.cards);
  if (!readBurgerMinutes(minutes) || !Array.isArray(players) || players.length < 2 || players.length > 4 || players[0] !== 'host'
    || !players.every(isRoomRole) || new Set(players).size !== players.length || !counters || typeof counters !== 'object'
    || !integer(seed, 0xffffffff) || !integer(start) || !integer(end) || !integer(revision)
    || (opensAt !== undefined && (!start || !integer(opensAt) || opensAt !== start + burgerPreparationMs))
    || (minutes === 'endless' ? (start ? end < salesStart + burgerEndlessOpeningMs : end !== 0)
      : cardRound && start ? end < salesStart + minutes * 60_000 : end !== (start ? salesStart + minutes * 60_000 : 0))) return;
  if (mode !== undefined && !readBurgerMode(mode)) return;
  if (resigned !== undefined && (mode !== 'coop' || !Array.isArray(resigned) || new Set(resigned).size !== resigned.length
    || !resigned.every(role => players.includes(role)))) return;
  if (winners !== undefined && (!Array.isArray(winners) || new Set(winners).size !== winners.length || !winners.every(role => players.includes(role)))) return;
  if (mode === 'coop' && (Object.keys(counters).some(role => role !== 'host') || winners?.length)) return;
  const boards: BurgerRound['counters'] = {};
  const kitchens = kitchenRoles({ players, mode });
  for (const role of kitchens) {
    const counter = counters[role];
    if (!counter || ![counter.money, counter.served, counter.combo, counter.best, counter.sequence, counter.next, counter.feverUntil].every(value => integer(value))
      || (cardRound ? !Array.isArray(counter.cards) || counter.cards.length !== burgerRank(counter.served) - 1 - Number(Boolean(counter.draft))
        || !counter.cards.every(readBurgerCard) : counter.cards !== undefined || counter.draft !== undefined || counter.bankrupt !== undefined)
      || (counter.draft !== undefined && (!counter.draft || !integer(counter.draft.at, end) || counter.draft.at < start
        || !Array.isArray(counter.draft.offers) || counter.draft.offers.length !== 3
        || new Set(counter.draft.offers).size !== 3 || !counter.draft.offers.every(readBurgerCard)))
      || (counter.bankrupt !== undefined && (counter.bankrupt !== true || counter.money !== 0 || !counter.closed || !counter.retired))
      || (counter.feverTrigger !== undefined && (!integer(counter.feverTrigger, counter.served) || counter.feverTrigger < 5))
      || counter.combo > counter.best || counter.best > counter.served || typeof counter.retired !== 'boolean'
      || !Array.isArray(counter.grill) || counter.grill.length !== grillCount || !counter.grill.every(patty => patty === null || readPatty(patty))
      || !Array.isArray(counter.tray) || counter.tray.length > previousTrayLimit * pattyKinds.length || !counter.tray.every(readPatty)
      || pattyKinds.some(kind => counter.tray.filter(patty => patty.kind === kind).length > previousTrayLimit)
      || (counter.pattySequence !== undefined && !integer(counter.pattySequence))
      || ((minutes === 'endless' || cardRound) && start
        ? !integer(counter.playUntil, end) || counter.playUntil! < salesStart + (minutes === 'endless' ? burgerEndlessOpeningMs : minutes * 60_000)
          || (counter.closed !== undefined && typeof counter.closed !== 'boolean')
        : counter.playUntil !== undefined || counter.closed !== undefined)
      || (counter.shoo !== undefined && (!counter.shoo || !integer(counter.shoo.at) || !integer(counter.shoo.sequence)
        || !integer(counter.shoo.order, counter.sequence) || !integer(counter.shoo.variant, counter.shoo.left ? 2 : 5)
        || typeof counter.shoo.left !== 'boolean'))
      || !Array.isArray(counter.burgers) || counter.burgers.length !== 2 || !counter.burgers.every(validStack)
      || (counter.service !== undefined && !validService(counter.service))
      || (counter.storage !== undefined && (!Array.isArray(counter.storage) || counter.storage.length !== burgerStorageSize
        || !counter.storage.every(burger => burger === null || Boolean(burger && validService({ burger })))))
      || !validServiceOrigin(counter)
      || (counter.diners !== undefined && !validDiners(counter.diners, counter.sequence))
      || !Array.isArray(counter.cups) || counter.cups.length !== 2 || !counter.cups.every(cup => cup && Number.isFinite(cup.amount)
        && cup.amount >= 0 && cup.amount < cupOverflow && integer(cup.pourAt))
      || !Array.isArray(counter.orders) || counter.orders.length > queueLimit || !counter.orders.every(order => order && integer(order.id, counter.sequence)
        && integer(order.guest, explorerIds.length - 1) && integer(order.at) && integer(order.until) && order.until > order.at && includes(breads, order.bread)
        && (order.reorderedAt === undefined || integer(order.reorderedAt) && order.reorderedAt >= order.at)
        && (order.patienceMs === undefined || integer(order.patienceMs) && order.patienceMs >= order.until - order.at)
        && integer(order.price, 1000) && Array.isArray(order.layers) && order.layers.length <= legacyStackLimit && order.layers.length > 0
        && order.layers.every(layer => layer && includes(ingredients, layer.ingredient) && (includes(pattyKinds, layer.ingredient)
          ? includes(doneness, layer.cooked) : layer.cooked === undefined))
        && (!order.drink || includes(drinkKinds, order.drink.kind) && includes(sizes, order.drink.size)))
      || (counter.feedback && (!integer(counter.feedback.id) || !integer(counter.feedback.at)
        || !includes(['perfect', 'mixed', 'poor', 'burnt', 'raw', 'left', 'spill'], counter.feedback.kind)
        || (counter.feedback.money !== undefined && !integer(counter.feedback.money))
        || (counter.feedback.tip !== undefined && !integer(counter.feedback.tip, 550))
        || (counter.feedback.line !== undefined && !isBurgerLine(counter.feedback.line))
        || (counter.feedback.order !== undefined && !integer(counter.feedback.order, counter.sequence))
        || (counter.feedback.timeAdded !== undefined && !integer(counter.feedback.timeAdded, 25_000))
        || (counter.feedback.guest !== undefined && !integer(counter.feedback.guest, explorerIds.length - 1))))) return;
    const overflow = pattyKinds.some(kind => counter.tray.filter(patty => patty.kind === kind).length > trayLimit);
    if (overflow) {
      const retained = new Set(pattyKinds.flatMap(kind => counter.tray
        .flatMap((patty, index) => patty.kind === kind ? [index] : []).slice(-trayLimit)));
      boards[role] = { ...counter, tray: counter.tray.filter((_, index) => retained.has(index)) };
    } else boards[role] = counter;
  }
  if ((minutes === 'endless' || cardRound) && start && Math.max(...kitchens.map(role => boards[role]!.playUntil!)) !== end) return;
  return { players, counters: boards, seed, minutes, ...(mode && { mode }), ...(resigned && { resigned }), start,
    ...(opensAt !== undefined && { opensAt }), end, revision, winners };
}
import { chooseBurgerDialogue, isBurgerLine } from './dialogue.ts';
import type { BurgerLine } from './dialogue.ts';
