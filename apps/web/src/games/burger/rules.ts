import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { explorerIds } from '../../../../../packages/protocol/explorers.ts';
import { diningExitMs, diningReplyMs, diningSatisfaction, seatDiner, seatWalkMs, shiftDiner, tableCount } from './dining.ts';
import type { Diner, DiningReaction, DiningSatisfaction } from './dining.ts';
import { cardCount, cardModifiers, cardOffers, cardRerollLimit, cardXpPercent, ordersPerLevel, readBurgerCard, supplyAvailable, unlockLevels, upgradeAvailable, validUpgradeHistory } from './cards.ts';
import type { BurgerCard } from './cards.ts';
import { baseOrderXp, burgerCashPayout, burgerDifficultyAtLevel, burgerMenuPrice, burgerPressure, burgerPrices, burgerRankFromXp, burgerRewardRates, burgerXpToReach, defaultBurgerDifficulty, endlessBonusAtLevel, endlessOrderReward, endlessReserveMs, readBurgerDifficulty, roundBurgerXp } from './balance.ts';
import type { BurgerDifficulty } from './balance.ts';

export const burgerMinutes = [5, 10, 15, 'endless'] as const;
export type BurgerMinutes = (typeof burgerMinutes)[number] | 3 | 7;
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
const pattyBurnWarningPoint = 180;
const autoFlipPoint = 180;
const assemblyStepMs = 500;
export const assemblyCooldownMs = 10_000;
const heatUnitsPerPercent = 70_000;
export const cupOverflow = 200;
const millisecondsPerDrinkPercent = 20;
const trayLimit = 8;
const previousTrayLimit = 12;
const burgerQueueLimit = 4;
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
export type ServiceDrink = { kind: DrinkKind; amount: number };
type BurgerOrigin = { area: 'assembly' | 'storage'; index: number };
type ServiceTray = { burger?: BurgerStack; origin?: BurgerOrigin; drink?: ServiceDrink; drinkOrigin?: number };
type RequestedLayer = { ingredient: Ingredient; cooked?: Doneness };
export type Order = { id: number; guest: number; bread: Bread; layers: RequestedLayer[]; reorderedAt?: number;
  drink?: { kind: DrinkKind; size: CupSize }; at: number; until: number; patienceMs?: number; price: number };
export type BurgerFeedback = { id: number; at: number; kind: 'perfect' | 'mixed' | 'poor' | 'burnt' | 'raw' | 'left' | 'spill';
  money?: number; guest?: number; tip?: number; timeAdded?: number; line?: BurgerLine; order?: number };
type Shoo = { sequence: number; order: number; at: number; left: boolean; variant: number };
type AssemblyJob = { order: number; next: number; reorderedAt?: number };
export type Counter = {
  grill: (Patty | null)[]; tray: Patty[]; burgers: [BurgerStack, BurgerStack]; cups: [Cup, Cup]; orders: Order[];
  service?: ServiceTray;
  diners?: Diner[];
  storage?: (BurgerStack | null)[];
  storedDrinks?: (ServiceDrink | null)[];
  pattySequence?: number;
  playUntil?: number;
  salesStartedAt?: number;
  cards?: BurgerCard[];
  xp?: number;
  draft?: { at: number; offers: BurgerCard[] };
  rerollsUsed?: number;
  assemblyJob?: AssemblyJob;
  assemblyReadyAt?: number;
  submission?: { id: number; at: number };
  bankrupt?: boolean;
  closed?: boolean;
  shoo?: Shoo;
  money: number; served: number; combo: number; best: number; sequence: number; next: number;
  feverUntil: number; feverTrigger?: number; retired: boolean; feedback?: BurgerFeedback;
};
export type BurgerRound = { players: Role[]; counters: Partial<Record<Role, Counter>>; seed: number; minutes: BurgerMinutes; difficulty?: BurgerDifficulty;
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
  | ({ type: 'stage-stored' | 'discard-stored'; index: number } & StorageSelection)
  | ({ type: 'shift-stored'; from: number; to: number } & StorageSelection)
  | { type: 'store-drink'; drink: number | 'service'; index: number }
  | { type: 'stage-drink'; drink: number }
  | { type: 'return-burger'; to: number | 'origin' | 'trash'; serial?: number }
  | { type: 'return-drink'; to: 'origin' | 'machine' | 'trash' }
  | { type: 'choose-card'; card: BurgerCard; level: number; rerollsUsed?: number }
  | { type: 'reroll-cards'; level: number; rerollsUsed: number }
  | { type: 'start-assembly'; order: number }
  | { type: 'ring-bell' }
  | { type: 'serve' | 'shoo'; order: number };

type TraySelection = { kind: PattyKind; index: number; serial?: number };
type StorageSelection = { serial?: number; expectedDrink?: ServiceDrink | null };
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
const legacyDifficultyTiers = [
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

type BurgerGrowth = Pick<Counter, 'served' | 'xp'>;
const legacyRank = (served: number) => 1 + Math.floor(served / ordersPerLevel);
export const burgerRank = (growth: BurgerGrowth | number) => typeof growth === 'number'
  ? legacyRank(growth) : growth.xp === undefined ? legacyRank(growth.served) : burgerRankFromXp(growth.xp);
export const burgerLevel = (growth: BurgerGrowth | number) => typeof growth === 'number' || growth.xp === undefined
  ? Math.min(legacyDifficultyTiers.length, burgerRank(growth)) : burgerRank(growth);
export function burgerGrowthProgress(counter: BurgerGrowth) {
  if (counter.xp === undefined) return counter.served % ordersPerLevel / ordersPerLevel;
  const rank = burgerRank(counter);
  const base = burgerXpToReach(rank);
  return (counter.xp - base) / (burgerXpToReach(rank + 1) - base);
}
export const burgerUnlockLevel = (item: BurgerSupply) => unlockLevel[item];
export const burgerSupplyUnlocked = (item: BurgerSupply, value: number | Counter) =>
  typeof value === 'number' || !value.cards ? burgerUnlockLevel(item) <= burgerLevel(typeof value === 'number' ? value : value.served)
    : burgerUnlockLevel(item) === 1 || supplyAvailable(value.cards, item);
export const burgerFacility = (counter: Counter, card: 'broom' | 'griddle' | 'assembly' | 'storage' | 'tray' | 'orderStorage') =>
  counter.cards ? counter.cards.includes(card) : card !== 'orderStorage';
export const burgerTables = (counter: Counter) => counter.cards ? cardCount(counter.cards, 'table') : tableCount;
export const burgerGrillCapacity = (counter: Counter) => burgerFacility(counter, 'griddle') ? grillCount : grillColumns;
export const burgerTrayCapacity = (counter: Counter) => burgerFacility(counter, 'tray') ? trayLimit : 4;
const allowedGrill = (counter: Counter, slot: number) => slot < burgerGrillCapacity(counter);
const assemblyLimit = (counter: Counter) => stackLimit + (counter.cards ? cardCount(counter.cards, 'picky') : 0);
type BurgerBalance = Pick<BurgerRound, 'difficulty' | 'minutes'>;
const endlessAge = (counter: Pick<Counter, 'salesStartedAt'>, now: number) => Math.max(0, now - (counter.salesStartedAt ?? now));
export function burgerOrderDifficulty(counter: BurgerGrowth & Pick<Counter, 'cards' | 'salesStartedAt'>, round: BurgerBalance, now: number) {
  const elapsedMs = round.minutes === 'endless' ? endlessAge(counter, now) : 0;
  if (counter.xp !== undefined) return burgerLevelSettings(burgerLevel(counter), round.difficulty ?? defaultBurgerDifficulty, counter.cards, elapsedMs);
  const target = legacyDifficultyTiers[burgerLevel(counter) - 1];
  if (!counter.cards) return { ...target, jitter: 6700, pressure: 1 };
  const pressure = round.difficulty ? burgerPressure(round.difficulty, elapsedMs) : 1;
  const modifiers = cardModifiers(counter.cards);
  const baseInterval = (target.interval + 24_000) / (round.difficulty ? 3 : 2);
  return { ...target, pressure, jitter: 6700, min: Math.max(1, target.min - 1),
    interval: Math.max(3000, Math.round(baseInterval / (modifiers.traffic * pressure))),
    patience: Math.round((target.patience + 86_000) / 2 * modifiers.patience / pressure),
    drinks: Math.min(.9, target.drinks * pressure) };
}
export function burgerLevelSettings(level: number, difficulty: BurgerDifficulty, cards: readonly BurgerCard[] = [], elapsedMs = 0) {
  const target = burgerDifficultyAtLevel(level);
  const pressure = burgerPressure(difficulty, elapsedMs);
  const { traffic, patience } = cardModifiers(cards);
  return { ...target, pressure,
    interval: Math.max(1, Math.round(target.interval / (traffic * pressure))),
    patience: Math.max(1, Math.round(target.patience * patience / pressure)),
    drinks: Math.min(.7, target.drinks * pressure) };
}
export const burgerGuestPatience = (baseMs: number, pressure: number, roll: number, jitter = 6700) =>
  Math.round(1.5 * (baseMs + Math.floor(roll * jitter / pressure)));
export const readBurgerMinutes = (value: unknown): BurgerMinutes | undefined =>
  value === 3 || value === 7 ? value : burgerMinutes.find(minutes => minutes === value);

const kitchenRoles = (round: Pick<BurgerRound, 'mode' | 'players'>): Role[] => round.mode === 'coop' ? ['host'] : round.players;
const kitchenRole = (round: BurgerRound, role: Role): Role => round.mode === 'coop' ? 'host' : role;
export const burgerCounter = (round: BurgerRound, role: Role): Counter => round.counters[kitchenRole(round, role)]!;
export const burgerResigned = (round: BurgerRound, role: Role) =>
  round.mode === 'coop' ? Boolean(round.resigned?.includes(role)) : burgerCounter(round, role).retired;

export function createBurgerRound(minutes: BurgerMinutes, players: Role[], seed = Math.floor(Math.random() * 0x1_0000_0000),
  mode: BurgerMode = 'race', difficulty = defaultBurgerDifficulty): BurgerRound {
  return { players, counters: Object.fromEntries(kitchenRoles({ mode, players }).map(role => [role, { ...emptyCounter(), money: 100, cards: [], xp: 0 }])),
    seed, minutes, difficulty, ...(mode === 'coop' && { mode }), start: 0, end: 0, revision: 0 };
}

export function startBurgerRound(round: BurgerRound, start: number): BurgerRound {
  const opensAt = start + burgerPreparationMs;
  const end = opensAt + (round.minutes === 'endless' ? burgerEndlessOpeningMs : round.minutes * 60_000);
  return { ...round, start, opensAt, end,
    counters: Object.fromEntries(kitchenRoles(round).map(role => [role, { ...round.counters[role], next: opensAt,
      ...(round.difficulty && { salesStartedAt: opensAt }),
      ...((round.minutes === 'endless' || round.counters[role]?.cards) && { playUntil: end }) }])),
    revision: round.revision + 1 };
}

function random(seed: number, order: number, channel: number) {
  let value = seed ^ Math.imul(order, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return ((value ^ value >>> 16) >>> 0) / 0x1_0000_0000;
}

function newOrder(seed: number, id: number, counter: Counter, now: number, round: BurgerBalance): Order {
  const { cards } = counter;
  const level = burgerLevel(counter);
  const { min, max, patience, drinks, pressure, jitter } = burgerOrderDifficulty(counter, round, now);
  const roll = (channel: number) => random(seed, id, channel);
  const layerMax = cards ? Math.max(1, max + cardModifiers(cards).layers) : max;
  const layerMin = Math.min(min, layerMax);
  const count = layerMin + Math.floor(roll(0) ** (1 / pressure) * (layerMax - layerMin + 1));
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
    layers: layer, drink, at: now, until: now + burgerGuestPatience(patience, pressure, roll(36), jitter),
    price: burgerMenuPrice(layer.length, layer.filter(part => part.cooked).length) };
}

const otherPattySide = (side: Patty['side']) => side === 0 ? 1 : 0;
export const burgerGrillMultiplier = (cards: Counter['cards']) => cards?.includes('highHeat2') ? 1.5 : cards?.includes('highHeat') ? 1.3 : 1;
function pattySpeed(patty: Patty, counter?: Pick<Counter, 'cards'>) {
  return (patty.speed ?? 1000) * burgerGrillMultiplier(counter?.cards);
}

export function pattyFaces(patty: Patty, now: number, counter?: Pick<Counter, 'cards'>): [number, number] {
  const faces: [number, number] = [...patty.faces];
  if (patty.heatAt) {
    const heat = Math.max(0, now - patty.heatAt) * pattySpeed(patty, counter) / heatUnitsPerPercent;
    faces[patty.side] = Math.min(pattyBurnPoint, faces[patty.side] + heat);
  }
  return faces;
}

function flipPatty(patty: Patty, at: number, counter?: Counter): Patty {
  return { ...patty, faces: pattyFaces(patty, at, counter), heatAt: at, side: otherPattySide(patty.side) };
}

function automaticGrillAt(patty: Patty | null, autoUnload: boolean) {
  if (!patty?.heatAt || isBurnt(patty.faces) || (!autoUnload && patty.faces[otherPattySide(patty.side)] >= autoFlipPoint)) return Infinity;
  return patty.heatAt + Math.ceil(Math.max(0, autoFlipPoint - patty.faces[patty.side]) * heatUnitsPerPercent / pattySpeed(patty));
}

const readyToUnload = (faces: Patty['faces']) => faces.every(face => face >= autoFlipPoint && face < pattyBurnPoint);
export const trayHasRoom = (counter: Counter, kind: PattyKind) =>
  counter.tray.filter(item => item.kind === kind).length < burgerTrayCapacity(counter);

function advanceAutomaticGrill(counter: Counter, now: number) {
  if (!counter.cards?.includes('autoGrill')) return;
  const autoUnload = counter.cards.includes('autoGrill2');
  if (autoUnload) counter.tray = [...counter.tray];
  counter.grill = counter.grill.map(patty => {
    if (!patty) return null;
    if (autoUnload && !patty.heatAt && readyToUnload(patty.faces)) patty = { ...patty, heatAt: now };
    const canStore = autoUnload && trayHasRoom(counter, patty.kind);
    const at = automaticGrillAt(patty, canStore);
    if (at > now) return patty;
    if (patty.faces[otherPattySide(patty.side)] < autoFlipPoint) {
      const flipped = flipPatty(patty, at);
      if (!autoUnload) return flipped;
      // Keep existing heat, without overshooting the target when rounding the timer to milliseconds.
      flipped.faces[patty.side] = Math.max(autoFlipPoint, patty.faces[patty.side]);
      patty = flipped;
      if (!canStore || automaticGrillAt(patty, true) > now) return patty;
    }
    const faces: Patty['faces'] = [Math.max(autoFlipPoint, patty.faces[0]), Math.max(autoFlipPoint, patty.faces[1])];
    putPatty(counter, { ...patty, faces, heatAt: 0 }, patty.kind, 0);
    return null;
  });
}

export function pattyAt(counter: Counter, from: PattyLocation) {
  if (typeof from === 'number') return counter.grill[from] ?? undefined;
  return from === 'tray' ? counter.tray.at(-1) : counter.tray.findLast(patty => patty.kind === from);
}

function isBurnt(faces: readonly number[]) { return faces.some(face => face >= pattyBurnPoint); }

export function isPattyNearBurn(faces: Patty['faces'], cookingSide: Patty['side']) {
  return faces[cookingSide] >= pattyBurnWarningPoint && !isBurnt(faces);
}

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

const orderDrinkPrice = (order: Order) => order.drink ? burgerPrices.drinks[order.drink.size] : 0;
const burgerOrderValue = (order: Order) => order.price + orderDrinkPrice(order);

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
    event = Math.min(event, burgerDeadline(round, role), counter.next, counter.assemblyJob?.next || Infinity,
      ...counter.orders.map(order => order.until), ...(counter.diners ?? []).map(diner => diner.exitAt),
      ...counter.cups.filter(cup => cup.pourAt).map(overflowAt));
    if (counter.cards?.includes('autoGrill')) {
      const autoUnload = counter.cards.includes('autoGrill2');
      event = Math.min(event, ...counter.grill.map(patty => {
        if (autoUnload && patty && !patty.heatAt && readyToUnload(patty.faces)) return round.start;
        return automaticGrillAt(patty, Boolean(autoUnload && patty && trayHasRoom(counter, patty.kind)));
      }));
    }
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
      counters[role] = { ...counter, closed: true, assemblyJob: undefined };
      continue;
    }
    const nextCounter = { ...counter, orders: counter.orders.filter(order => now < order.until) };
    if (counter.diners) nextCounter.diners = counter.diners.filter(diner => now < diner.exitAt);
    if (nextCounter.orders.length !== counter.orders.length) {
      const expired = counter.orders.filter(order => order.until <= now);
      charge(nextCounter, expired.reduce((total, order) => total + Math.ceil(burgerOrderValue(order) * burgerRewardRates.expirationPenalty), 0));
      nextCounter.combo = 0;
      updateFeedback(nextCounter, now, { kind: 'left', guest: expired[0].guest });
    }
    nextCounter.cups = counter.cups.map(cup => {
      if (!cup.pourAt || now < overflowAt(cup)) return cup;
      updateFeedback(nextCounter, now, { kind: 'spill' });
      return emptyCup();
    }) as Counter['cups'];
    if (counter.next <= now && !nextCounter.closed) {
      if (nextCounter.orders.length < burgerQueueLimit) nextCounter.orders.push(newOrder(round.seed, ++nextCounter.sequence, counter, now, round));
      nextCounter.next = now + burgerOrderDifficulty(counter, round, now).interval;
    }
    if (!nextCounter.closed) advanceAutomaticGrill(nextCounter, now);
    advanceAssembly(nextCounter, now);
    counters[role] = nextCounter;
  }
  return changed(round, counters);
}

export function judgeOrder(order: Order, burger: BurgerStack, side?: { kind: DrinkKind; size: CupSize }) {
  const matches = order.layers.reduce((sum, requested, index) =>
    sum + Number(burger.layers[index]?.ingredient === requested.ingredient), burger.bread === order.bread ? 2 : 0);
  const similarity = matches / Math.sqrt((order.layers.length + 2) * (burger.layers.length + 2));
  const rates = burgerRewardRates;
  const drinkSimilarity = !order.drink || !side ? 0
    : Number(order.drink.kind === side.kind) * rates.drinkKind + Number(order.drink.size === side.size) * rates.drinkSize;
  const ratio = (value: number) => value >= .999999 ? 1 : rates.partial * value ** rates.partialPower;
  const drinkValue = orderDrinkPrice(order);
  const perfect = similarity >= .999999 && (order.drink ? drinkSimilarity >= .999999 : !side);
  const accuracy = Math.min(1, (order.price * similarity + drinkValue * drinkSimilarity) / (order.price + drinkValue))
    * (!order.drink && side ? .87 : 1);
  const matchesDoneness = order.layers.every((requested, index) => {
    const patty = burger.layers[index]?.patty;
    return !requested.cooked || Boolean(patty && pattyDoneness(patty.faces) === requested.cooked);
  });
  const tip = perfect && matchesDoneness && order.layers.some(layer => layer.cooked)
    ? Math.round((order.price + drinkValue) * rates.perfectTip) : 0;
  const satisfaction: DiningSatisfaction = perfect ? 'love' : accuracy >= .82 ? 'delighted'
    : accuracy >= .67 ? 'content' : accuracy >= .48 ? 'puzzled' : 'disappointed';
  return { money: Math.round(order.price * ratio(similarity)) + Math.round(drinkValue * ratio(drinkSimilarity)),
    perfect, satisfaction, tip, similarity: accuracy };
}

export function burgerOrderXp(order: Order, burger: BurgerStack, side?: { kind: DrinkKind; size: CupSize }, multiplier = 1) {
  const matches = order.layers.reduce((sum, requested, index) =>
    sum + Number(burger.layers[index]?.ingredient === requested.ingredient), Number(burger.bread === order.bread));
  const drinkMatches = Number(Boolean(order.drink && side && order.drink.kind === side.kind && order.drink.size === side.size));
  const slots = 1 + Math.max(order.layers.length, burger.layers.length) + Number(Boolean(order.drink || side));
  return roundBurgerXp(baseOrderXp * (matches + drinkMatches) / slots * multiplier);
}

const isGrill = (value: unknown): value is number => integer(value, grillCount - 1);
const isSlot = (value: unknown): value is 0 | 1 => value === 0 || value === 1;
const isPlace = (value: unknown): value is PattyLocation => value === 'tray' || includes(pattyKinds, value) || isGrill(value);
const canAccessAssembly = (counter: Counter, slot: unknown): slot is 0 | 1 =>
  isSlot(slot) && (!slot || burgerFacility(counter, 'assembly') && !counter.assemblyJob);

function removePatty(counter: Counter, from: PattyLocation, now: number) {
  let patty: Patty | null | undefined;
  if (typeof from === 'number') {
    patty = counter.grill[from]; counter.grill[from] = null;
  } else {
    const index = counter.tray.findLastIndex(candidate => from === 'tray' || candidate.kind === from);
    if (index >= 0) [patty] = counter.tray.splice(index, 1);
  }
  if (patty) return { ...patty, faces: pattyFaces(patty, now, counter), heatAt: 0 };
}

function putPatty(counter: Counter, patty: Patty, to: PattyLocation, now: number) {
  if (typeof to !== 'number') {
    if ((to !== 'tray' && to !== patty.kind) || !trayHasRoom(counter, patty.kind)) return false;
    counter.tray.push(patty);
  }
  else { if (!allowedGrill(counter, to) || counter.grill[to]) return false; counter.grill[to] = { ...patty, heatAt: now }; }
  return true;
}

function fillOpenTraySpace(counter: Counter, now: number) {
  if (!counter.cards?.includes('autoGrill2') || counter.closed || counter.draft) return;
  for (const [slot, patty] of counter.grill.entries()) {
    if (!patty || !trayHasRoom(counter, patty.kind)) continue;
    const faces = pattyFaces(patty, now, counter);
    if (readyToUnload(faces) && putPatty(counter, { ...patty, faces, heatAt: 0 }, patty.kind, 0)) counter.grill[slot] = null;
  }
}

function assemblyOrder(counter: Counter, job: AssemblyJob) {
  const order = counter.orders[0];
  return order?.id === job.order && order.reorderedAt === job.reorderedAt ? order : undefined;
}

const assemblyPattyIndex = (counter: Counter, kind: PattyKind) =>
  counter.tray.findLastIndex(patty => patty.kind === kind && pattyDoneness(patty.faces));

export const isAutoAssemblySlot = (counter: Counter, slot: number) => slot === 1 && counter.cards?.includes('autoAssembly') === true;

export function canStartAutoAssembly(counter: Counter, now: number) {
  const slot = counter.burgers[1];
  return Boolean(isAutoAssemblySlot(counter, 1) && !counter.assemblyJob && !slot.paper
    && (counter.assemblyReadyAt ?? 0) <= now && counter.orders[0] && counter.orders[0].until > now);
}

function syncAssembly(counter: Counter, now: number) {
  const job = counter.assemblyJob;
  if (!job) return;
  const order = assemblyOrder(counter, job);
  if (!order || counter.closed) { counter.assemblyJob = undefined; return; }
  if (job.next) return;
  const ingredient = order.layers[counter.burgers[1].layers.length]?.ingredient;
  if (includes(pattyKinds, ingredient) && assemblyPattyIndex(counter, ingredient) >= 0) counter.assemblyJob = { ...job, next: now + assemblyStepMs };
}

function advanceAssembly(counter: Counter, now: number) {
  syncAssembly(counter, now);
  const job = counter.assemblyJob;
  if (!job?.next || job.next > now) return;
  const order = assemblyOrder(counter, job)!;
  const stack = { ...counter.burgers[1] };
  const ingredient = order.layers[stack.layers.length]?.ingredient;
  if (!stack.paper) stack.paper = true;
  else if (!stack.bread) stack.bread = order.bread;
  else if (includes(pattyKinds, ingredient)) {
    const index = assemblyPattyIndex(counter, ingredient);
    if (index < 0) { counter.assemblyJob = { ...job, next: 0 }; return; }
    counter.tray = [...counter.tray];
    const [patty] = counter.tray.splice(index, 1);
    stack.layers = [...stack.layers, { ingredient, patty, source: ingredient }];
    fillOpenTraySpace(counter, now);
  } else if (ingredient) stack.layers = [...stack.layers, { ingredient }];
  else if (!stack.top) stack.top = true;
  else stack.packed = true;
  counter.burgers = [counter.burgers[0], stack];
  counter.assemblyJob = stack.packed ? undefined : { ...job, next: now + assemblyStepMs };
  if (stack.packed) counter.assemblyReadyAt = now + assemblyCooldownMs;
}

export const burgerSerial = (burger?: BurgerStack | null) => burger?.layers.find(layer => layer.patty)?.patty?.serial;

export function stagedBurgerReturnTarget(counter: Counter, to: number | 'origin'): BurgerOrigin | undefined {
  if (!counter.service?.burger) return;
  const { origin } = counter.service;
  const openAssembly = (index: unknown): index is 0 | 1 => canAccessAssembly(counter, index) && !counter.burgers[index].paper;
  if (origin?.area === 'assembly' && !openAssembly(origin.index)) return;
  if (to === 'origin' && origin?.area === 'storage') {
    return counter.storage && !counter.storage[origin.index] ? origin : undefined;
  }
  const index = to !== 'origin' ? to
    : origin?.index ?? counter.burgers.findIndex((_, slot) => openAssembly(slot) && !isAutoAssemblySlot(counter, slot));
  if (!openAssembly(index) || (isAutoAssemblySlot(counter, index) && (origin?.area !== 'assembly' || origin.index !== index))) return;
  return { area: 'assembly', index };
}

export function storedOrder(counter: Counter, index: number) {
  return { burger: counter.storage?.[index] ?? null, drink: counter.storedDrinks?.[index] ?? null };
}

export function storageReserved(counter: Counter, index: number) {
  const { origin, drinkOrigin } = counter.service ?? {};
  return (origin?.area === 'storage' && origin.index === index) || drinkOrigin === index;
}

function writeStorageSlot<T>(slots: (T | null)[] | undefined, index: number, value: T | null) {
  if (!slots && value === null) return;
  const next = slots?.slice() ?? Array<T | null>(burgerStorageSize).fill(null);
  next[index] = value;
  return next;
}

function matchesStoredSelection({ burger, drink }: ReturnType<typeof storedOrder>, { serial, expectedDrink }: StorageSelection) {
  if (!burger && !drink) return false;
  if (serial !== undefined && burgerSerial(burger) !== serial) return false;
  if (expectedDrink === undefined) return true;
  return burgerSerial(burger) === serial && (expectedDrink === null ? drink === null
    : drink?.kind === expectedDrink.kind && drink.amount === expectedDrink.amount);
}

function takeCup(counter: Counter, index: 0 | 1, now: number): ServiceDrink | undefined {
  const amount = cupAmount(counter.cups[index], now);
  if (!cupSize(amount)) return;
  counter.cups[index] = emptyCup();
  return { kind: drinkKinds[index], amount };
}

function editBurger(counter: Counter, action: BurgerAction, now: number, round: BurgerRound) {
  const { seed } = round;
  const fullyAutomatic = counter.cards?.includes('autoGrill2');
  switch (action.type) {
    case 'start-assembly': {
      const order = counter.orders[0];
      if (!order || order.id !== action.order || !canStartAutoAssembly(counter, now)) return false;
      counter.assemblyJob = { order: order.id, next: now + assemblyStepMs, ...(order.reorderedAt !== undefined && { reorderedAt: order.reorderedAt }) };
      return true;
    }
    case 'grill':
      if (!isGrill(action.slot) || !allowedGrill(counter, action.slot) || counter.grill[action.slot] || !includes(pattyKinds, action.kind)
        || !burgerSupplyUnlocked(action.kind, counter)) return false;
      const sequence = (counter.pattySequence ?? 0) + 1;
      const speed = 900 + Math.floor(random(seed, sequence, 61) * 201);
      counter.pattySequence = sequence;
      charge(counter, 10);
      return putPatty(counter, { kind: action.kind, faces: [0, 0], side: 0, heatAt: 0, speed, serial: sequence }, action.slot, now);
    case 'flip': {
      if (fullyAutomatic) return false;
      const patty = isGrill(action.slot) && counter.grill[action.slot];
      if (!patty || (action.serial !== undefined && patty.serial !== action.serial)
        || (action.side !== undefined && patty.side !== action.side)) return false;
      counter.grill[action.slot] = flipPatty(patty, now, counter);
      return true;
    }
    case 'hold': {
      if (fullyAutomatic || !isGrill(action.slot)) return false;
      const patty = counter.grill[action.slot];
      if (!patty || (action.serial !== undefined && patty.serial !== action.serial) || !pattyDoneness(pattyFaces(patty, now, counter))) return false;
      return putPatty(counter, removePatty(counter, action.slot, now)!, patty.kind, now);
    }
    case 'move': {
      if (!isPlace(action.from) || action.to === action.from || (action.to !== 'trash' && !isPlace(action.to))) return false;
      if (fullyAutomatic && typeof action.from === 'number' && action.to !== 'trash') return false;
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
      if (!canAccessAssembly(counter, action.slot) || counter.service?.burger) return false;
      const burger = counter.burgers[action.slot];
      if (!burger.packed) return false;
      counter.service = { ...counter.service, burger, origin: { area: 'assembly', index: action.slot } };
      counter.burgers[action.slot] = emptyBurger();
      return true;
    }
    case 'store-burger': {
      if (!burgerFacility(counter, 'storage') || !canAccessAssembly(counter, action.slot) || !integer(action.index, burgerStorageSize - 1)
        || counter.storage?.[action.index] || storageReserved(counter, action.index)) return false;
      const burger = counter.burgers[action.slot];
      if (!burger.packed) return false;
      counter.storage = writeStorageSlot(counter.storage, action.index, burger);
      counter.burgers[action.slot] = emptyBurger();
      return true;
    }
    case 'store-drink': {
      const { drink: source, index } = action;
      if (!burgerFacility(counter, 'orderStorage') || !integer(index, burgerStorageSize - 1) || counter.storedDrinks?.[index]
        || (storageReserved(counter, index) && !(source === 'service' && counter.service?.drinkOrigin === index))) return false;
      const drink = source === 'service' ? counter.service?.drink : isSlot(source) ? takeCup(counter, source, now) : undefined;
      if (!drink) return false;
      counter.storedDrinks = writeStorageSlot(counter.storedDrinks, index, drink);
      if (source === 'service') counter.service = { ...counter.service, drink: undefined, drinkOrigin: undefined };
      return true;
    }
    case 'stage-stored':
    case 'discard-stored': {
      const { index } = action;
      if (!burgerFacility(counter, 'storage') || !integer(index, burgerStorageSize - 1) || storageReserved(counter, index)) return false;
      const contents = storedOrder(counter, index);
      if (!matchesStoredSelection(contents, action)) return false;
      const { burger, drink } = contents;
      if (action.type === 'stage-stored' && ((burger && counter.service?.burger) || (drink && counter.service?.drink))) return false;
      counter.storage = writeStorageSlot(counter.storage, index, null);
      counter.storedDrinks = writeStorageSlot(counter.storedDrinks, index, null);
      if (action.type === 'stage-stored') counter.service = { ...counter.service,
        ...(burger && { burger, origin: { area: 'storage', index } }),
        ...(drink && { drink, drinkOrigin: index }) };
      else if (burger) charge(counter, 30);
      return true;
    }
    case 'shift-stored': {
      const { from, to } = action;
      if (!burgerFacility(counter, 'storage') || !integer(from, burgerStorageSize - 1) || !integer(to, burgerStorageSize - 1) || from === to
        || storageReserved(counter, from) || storageReserved(counter, to)) return false;
      const source = storedOrder(counter, from);
      if (!matchesStoredSelection(source, action)) return false;
      const target = storedOrder(counter, to);
      counter.storage = writeStorageSlot(writeStorageSlot(counter.storage, from, target.burger), to, source.burger);
      counter.storedDrinks = writeStorageSlot(writeStorageSlot(counter.storedDrinks, from, target.drink), to, source.drink);
      return true;
    }
    case 'stage-drink': {
      if (!isSlot(action.drink) || counter.service?.drink) return false;
      const drink = takeCup(counter, action.drink, now);
      if (!drink) return false;
      counter.service = { ...counter.service, drink };
      return true;
    }
    case 'return-burger': {
      const burger = counter.service?.burger;
      if (!burger || (action.serial !== undefined && burgerSerial(burger) !== action.serial)) return false;
      if (action.to === 'trash') charge(counter, 30);
      else {
        const target = stagedBurgerReturnTarget(counter, action.to);
        if (!target) return false;
        if (target.area === 'storage') counter.storage = writeStorageSlot(counter.storage, target.index, burger);
        else counter.burgers[target.index] = burger;
      }
      counter.service = { ...counter.service, burger: undefined, origin: undefined };
      return true;
    }
    case 'return-drink': {
      const drink = counter.service?.drink;
      const storageIndex = counter.service?.drinkOrigin;
      if (!drink || (action.to !== 'origin' && action.to !== 'machine' && action.to !== 'trash')) return false;
      if (action.to === 'origin' && storageIndex !== undefined) {
        if (!burgerFacility(counter, 'orderStorage') || !integer(storageIndex, burgerStorageSize - 1)
          || counter.storedDrinks?.[storageIndex]) return false;
        counter.storedDrinks = writeStorageSlot(counter.storedDrinks, storageIndex, drink);
      } else if (action.to !== 'trash') {
        const index = drinkKinds.indexOf(drink.kind);
        if (counter.cups[index].pourAt || counter.cups[index].amount) return false;
        counter.cups[index] = { amount: drink.amount, pourAt: 0 };
      }
      counter.service = { ...counter.service, drink: undefined, drinkOrigin: undefined };
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
        if (counter.cards && random(seed ^ order.id, sequence, 79) < burgerRewardRates.shooPayment) counter.money += burgerOrderValue(order);
      } else counter.orders = counter.orders.map(item => item.id === order.id ? { ...item, until: shortened, patienceMs } : item);
      return true;
    }
    case 'ring-bell':
      if (counter.orders.length) return false;
      counter.next = Math.max(round.opensAt ?? round.start, now, counter.next - 1000);
      return true;
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
      counter.submission = { id: (counter.submission?.id ?? 0) + 1, at: now };
      counter.service = undefined;
      if (line === 'free') {
        updateFeedback(counter, now, { kind: 'mixed', line, order: order.id, guest: order.guest });
        return true;
      }
      const modifiers = cardModifiers(counter.cards ?? []);
      const tip = verdict.tip + (line === 'thanks' ? burgerRewardRates.extraDrinkTip : 0);
      const money = burgerCashPayout(verdict.money, modifiers.revenue, counter.feverUntil > now, tip);
      counter.money += money;
      const oldRank = burgerRank(counter);
      const oldLevel = burgerLevel(counter);
      const timeAdded = round.minutes !== 'endless' ? 0 : counter.xp !== undefined && counter.playUntil !== undefined
        ? Math.max(0, Math.min(endlessBonusAtLevel(oldLevel) * 1000, endlessReserveMs - (counter.playUntil - now)))
        : round.difficulty && counter.playUntil !== undefined
        ? endlessOrderReward(oldLevel, verdict.similarity, endlessAge(counter, now), counter.playUntil - now, round.difficulty)
        : 1000 * Math.max(1, Math.floor(endlessRewards[oldLevel - 1] * verdict.similarity));
      if (counter.playUntil !== undefined) counter.playUntil += timeAdded;
      if (counter.xp !== undefined) counter.xp = roundBurgerXp(counter.xp + burgerOrderXp(order, burger, delivered, modifiers.xp));
      counter.served++;
      const rank = burgerRank(counter);
      const newLevel = burgerLevel(counter);
      if (newLevel > oldLevel) counter.next = Math.min(counter.next, now + burgerOrderDifficulty(counter, round, now).interval);
      if (counter.cards && rank > oldRank) {
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
  if (!('slot' in action) || !canAccessAssembly(counter, action.slot)) return false;
  if (isAutoAssemblySlot(counter, action.slot) && action.type !== 'pop' && action.type !== 'discard') return false;
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
      if (!isPlace(from) || (fullyAutomatic && typeof from === 'number')) return false;
      let selected: number | undefined;
      if (action.type === 'stack-tray') {
        selected = trayIndex(counter, action);
        if (selected < 0) return false;
      }
      const patty = selected === undefined ? pattyAt(counter, from) : counter.tray[selected];
      if (!patty || (action.serial !== undefined && patty.serial !== action.serial)) return false;
      const faces = pattyFaces(patty, now, counter);
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
    const level = burgerRank(board);
    const rerollsUsed = board.rerollsUsed ?? 0;
    if (input.type === 'reroll-cards') {
      if (input.level !== level || input.rerollsUsed !== rerollsUsed || rerollsUsed >= cardRerollLimit) return advanced;
      const spent = rerollsUsed + 1;
      const offers = cardOffers(board.cards!, level, index => random(current.seed, level, 95 + spent * 3 + index), board.draft.offers);
      const counter = { ...board, rerollsUsed: spent, draft: { ...board.draft, offers } };
      return changed(current, { ...current.counters, [role]: counter });
    }
    if (input.type !== 'choose-card' || input.level !== level || !board.draft.offers.includes(input.card)
      || (input.rerollsUsed !== undefined && input.rerollsUsed !== rerollsUsed)
      || !upgradeAvailable(board.cards!, input.card, level)) return advanced;
    const counter = shiftCounter(board, Math.max(0, now - board.draft.at));
    if (input.card === 'highHeat' || input.card === 'highHeat2' || input.card === 'autoGrill2') {
      counter.grill = counter.grill.map(patty => patty?.heatAt ? { ...patty, faces: pattyFaces(patty, now, counter), heatAt: now } : patty);
    }
    counter.cards = [...board.cards!, input.card];
    counter.draft = undefined;
    counter.next = Math.min(counter.next, now + burgerOrderDifficulty(counter, current, now).interval);
    if (input.card.startsWith('sold:')) {
      const supply = input.card.slice(5);
      if (includes(drinkKinds, supply)) {
        const index = drinkKinds.indexOf(supply);
        counter.cups[index] = { amount: cupAmount(counter.cups[index], now), pourAt: 0 };
      }
      counter.orders = counter.orders.map(order => {
        if (order.bread !== supply && order.drink?.kind !== supply && !order.layers.some(layer => layer.ingredient === supply)) return order;
        const replacement = newOrder(current.seed ^ 0x50d ^ counter.cards!.length, order.id, counter, now, current);
        return { ...replacement, guest: order.guest, at: order.at, until: order.until, patienceMs: order.patienceMs, reorderedAt: now };
      });
    }
    if (input.card === 'autoGrill2') advanceAutomaticGrill(counter, now);
    else if (input.card === 'tray' && counter.cards.includes('autoGrill2')) {
      counter.tray = [...counter.tray];
      fillOpenTraySpace(counter, now);
    }
    syncAssembly(counter, now);
    return changed({ ...current, end: Math.max(current.end, counter.playUntil ?? 0) }, { ...current.counters, [role]: counter });
  }
  const counter: Counter = { ...board, grill: [...board.grill], tray: [...board.tray], cups: [...board.cups],
    burgers: board.burgers.map(item => ({ ...item, layers: [...item.layers] })) as Counter['burgers'] };
  if (!editBurger(counter, input, now, current)) return advanced;
  fillOpenTraySpace(counter, now);
  syncAssembly(counter, now);
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
      ...(counter.salesStartedAt !== undefined && { salesStartedAt: shift(counter.salesStartedAt) }),
      ...(counter.draft && { draft: { ...counter.draft, at: shift(counter.draft.at) } }),
      ...(counter.assemblyJob && { assemblyJob: { ...counter.assemblyJob, next: shift(counter.assemblyJob.next),
        ...(counter.assemblyJob.reorderedAt !== undefined && { reorderedAt: shift(counter.assemblyJob.reorderedAt) }) } }),
      ...(counter.assemblyReadyAt !== undefined && { assemblyReadyAt: shift(counter.assemblyReadyAt) }),
      ...(counter.submission && { submission: { ...counter.submission, at: shift(counter.submission.at) } }),
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

const validDrink = (drink: ServiceDrink) => drink && includes(drinkKinds, drink.kind)
  && Number.isFinite(drink.amount) && Boolean(cupSize(drink.amount));

function validService(service: ServiceTray) {
  return service && typeof service === 'object'
    && (service.burger === undefined || (validStack(service.burger) && service.burger.packed && service.burger.top
      && service.burger.paper && Boolean(service.burger.bread) && service.burger.layers.some(layer => layer.patty)))
    && (service.drink === undefined || validDrink(service.drink));
}

function validAssemblyState(counter: Counter) {
  const { assemblyJob: job, assemblyReadyAt: readyAt } = counter;
  if (!counter.cards?.includes('autoAssembly')) return job === undefined && readyAt === undefined;
  if (readyAt !== undefined && (!integer(readyAt) || !readyAt)) return false;
  if (job === undefined) return true;
  if (!job || counter.closed || !integer(job.next)) return false;
  const order = assemblyOrder(counter, job);
  if (!order) return false;
  const stack = counter.burgers[1];
  return !stack.packed && (stack.bread === undefined || stack.paper && stack.bread === order.bread)
    && (!stack.layers.length || Boolean(stack.bread) && stack.layers.every((layer, i) => layer.ingredient === order.layers[i]?.ingredient))
    && (!stack.top || stack.layers.length === order.layers.length)
    && (job.next > 0 || Boolean(stack.bread) && includes(pattyKinds, order.layers[stack.layers.length]?.ingredient));
}

function validServiceOrigin(counter: Counter) {
  const { origin, drinkOrigin, drink, burger } = counter.service ?? {};
  if (drinkOrigin !== undefined && (!drink || !integer(drinkOrigin, burgerStorageSize - 1)
    || counter.storedDrinks?.[drinkOrigin] !== null)) return false;
  if (origin === undefined) return true;
  if (!origin || !burger) return false;
  if (origin.area === 'assembly') return isSlot(origin.index);
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
  const { players, counters, seed, start, opensAt, end, minutes, difficulty, mode, resigned, revision, winners } = raw as BurgerRound;
  const salesStart = opensAt ?? start;
  const cardRound = Array.isArray(counters?.host?.cards);
  const xpRound = counters?.host?.xp !== undefined;
  if (!readBurgerMinutes(minutes) || !Array.isArray(players) || players.length < 2 || players.length > 4 || players[0] !== 'host'
    || !players.every(isRoomRole) || new Set(players).size !== players.length || !counters || typeof counters !== 'object'
    || !integer(seed, 0xffffffff) || !integer(start) || !integer(end) || !integer(revision)
    || (difficulty !== undefined && !readBurgerDifficulty(difficulty))
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
      || (xpRound ? !cardRound || typeof counter.xp !== 'number' || !Number.isFinite(counter.xp) || counter.xp < 0 : counter.xp !== undefined)
      || (difficulty && start ? !integer(counter.salesStartedAt, end) || counter.salesStartedAt < salesStart : counter.salesStartedAt !== undefined)
      || (cardRound ? !Array.isArray(counter.cards) || counter.cards.length !== burgerRank(counter) - 1 - Number(Boolean(counter.draft))
        || !counter.cards.every(readBurgerCard) || !validUpgradeHistory(counter.cards)
        : counter.cards !== undefined || counter.draft !== undefined || counter.bankrupt !== undefined || counter.rerollsUsed !== undefined)
      || (counter.rerollsUsed !== undefined && !integer(counter.rerollsUsed, cardRerollLimit))
      || (counter.draft !== undefined && (!counter.draft || !integer(counter.draft.at, end) || counter.draft.at < start
        || !Array.isArray(counter.draft.offers) || counter.draft.offers.length !== 3
        || new Set(counter.draft.offers).size !== 3 || !counter.draft.offers.every(card => readBurgerCard(card)
          && upgradeAvailable(counter.cards!, card, card === 'autoAssembly' ? burgerRank(counter) : Infinity))))
      || (counter.bankrupt !== undefined && (counter.bankrupt !== true || counter.money !== 0 || !counter.closed || !counter.retired))
      || (counter.feverTrigger !== undefined && (!integer(counter.feverTrigger, counter.served) || counter.feverTrigger < 5))
      || (counter.submission !== undefined && (!counter.submission || !integer(counter.submission.id) || counter.submission.id < 1
        || !integer(counter.submission.at, end) || counter.submission.at < start))
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
      || (counter.storedDrinks !== undefined && (!burgerFacility(counter, 'orderStorage') || !Array.isArray(counter.storedDrinks)
        || counter.storedDrinks.length !== burgerStorageSize || !counter.storedDrinks.every(drink => drink === null || validDrink(drink))))
      || !validServiceOrigin(counter)
      || (counter.diners !== undefined && !validDiners(counter.diners, counter.sequence))
      || !Array.isArray(counter.cups) || counter.cups.length !== 2 || !counter.cups.every(cup => cup && Number.isFinite(cup.amount)
        && cup.amount >= 0 && cup.amount < cupOverflow && integer(cup.pourAt))
      || !Array.isArray(counter.orders) || counter.orders.length > burgerQueueLimit || !counter.orders.every(order => order && integer(order.id, counter.sequence)
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
        || (counter.feedback.timeAdded !== undefined && !integer(counter.feedback.timeAdded, endlessReserveMs))
        || (counter.feedback.guest !== undefined && !integer(counter.feedback.guest, explorerIds.length - 1))))) return;
    if (!validAssemblyState(counter)) return;
    if (counter.xp !== undefined) {
      // Sellout cards never revoke XP earned before the sale.
      const maxBonus = counter.cards!.reduce((sum, card) => sum + Math.max(0, cardXpPercent(card)), 0);
      const maxPerOrder = roundBurgerXp(baseOrderXp * (1 + maxBonus / 100));
      if (counter.xp > counter.served * maxPerOrder) return;
    }
    const overflow = pattyKinds.some(kind => counter.tray.filter(patty => patty.kind === kind).length > trayLimit);
    if (overflow) {
      const retained = new Set(pattyKinds.flatMap(kind => counter.tray
        .flatMap((patty, index) => patty.kind === kind ? [index] : []).slice(-trayLimit)));
      boards[role] = { ...counter, tray: counter.tray.filter((_, index) => retained.has(index)) };
    } else boards[role] = counter;
  }
  if ((minutes === 'endless' || cardRound) && start && Math.max(...kitchens.map(role => boards[role]!.playUntil!)) !== end) return;
  return { players, counters: boards, seed, minutes, ...(mode && { mode }), ...(resigned && { resigned }), start,
    ...(opensAt !== undefined && { opensAt }), ...(difficulty && { difficulty }), end, revision, winners };
}
import { chooseBurgerDialogue, isBurgerLine } from './dialogue.ts';
import type { BurgerLine } from './dialogue.ts';
