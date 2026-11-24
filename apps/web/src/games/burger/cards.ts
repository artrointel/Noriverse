export const unlockLevels = {
  cheese: 2, lettuce: 3, cola: 3, onion: 4, pickle: 4, chicken: 5, rice: 5,
  tomato: 6, soda: 6, egg: 7, bacon: 8,
} as const;

type Unlock = keyof typeof unlockLevels;
const facilities = ['broom', 'griddle', 'assembly', 'storage', 'table', 'tray'] as const;
const guestCards = ['rush', 'patient', 'advertise', 'picky', 'simple'] as const;
const grillPrerequisites = { highHeat: null, autoGrill: null, highHeat2: 'highHeat', autoGrill2: 'autoGrill' } as const;
const grillLevel = { highHeat: 7, autoGrill: 7, highHeat2: 14, autoGrill2: 14 } as const;
const stationUpgrades = {
  autoAssembly: { prerequisite: 'assembly', level: 10 },
  orderStorage: { prerequisite: 'storage', level: 2 },
} as const;
type GrillUpgrade = keyof typeof grillPrerequisites;
type StationUpgrade = keyof typeof stationUpgrades;
const grillUpgrades = Object.keys(grillPrerequisites) as GrillUpgrade[];
const stationUpgradeIds = Object.keys(stationUpgrades) as StationUpgrade[];
export type BurgerCard = typeof facilities[number] | typeof guestCards[number] | GrillUpgrade | StationUpgrade | `unlock:${Unlock}` | `sold:${Unlock}`;
export const ordersPerLevel = 4;
export const cardRerollLimit = 3;
export const minimumXpMultiplier = .1;
export const soldOutCardWeight = .5;

export const cardCount = (cards: readonly BurgerCard[], card: BurgerCard) => cards.filter(item => item === card).length;
const isGrillUpgrade = (card: string): card is GrillUpgrade => Object.hasOwn(grillPrerequisites, card);
const isStationUpgrade = (card: string): card is StationUpgrade => Object.hasOwn(stationUpgrades, card);

export function upgradeAvailable(cards: readonly BurgerCard[], card: BurgerCard, level = Infinity) {
  if (card === 'picky' || card === 'simple') return level >= 10 && cardCount(cards, card) < 2;
  if (isStationUpgrade(card)) {
    const upgrade = stationUpgrades[card];
    return level >= upgrade.level && cards.includes(upgrade.prerequisite) && !cards.includes(card);
  }
  if (!isGrillUpgrade(card)) return true;
  if (level < grillLevel[card]) return false;
  const prerequisite = grillPrerequisites[card];
  return prerequisite ? cards.includes(prerequisite) && !cards.includes(card) : !cards.some(isGrillUpgrade);
}

export function validUpgradeHistory(cards: readonly BurgerCard[], starterCount = 0) {
  return cards.every((card, index) => !(isGrillUpgrade(card) || isStationUpgrade(card))
    || upgradeAvailable(cards.slice(0, index), card, isStationUpgrade(card) ? index + 2 - starterCount : Infinity));
}

export function supplyAvailable(cards: readonly BurgerCard[], item: string) {
  return cards.findLast(card => card === `unlock:${item}` || card === `sold:${item}`) === `unlock:${item}`;
}

export function cardOffers(cards: readonly BurgerCard[], level: number, roll: (index: number) => number, previous: readonly BurgerCard[] = []) {
  const pool: BurgerCard[] = [...guestCards.filter(card => upgradeAvailable(cards, card, level)),
    ...facilities.filter(card => cardCount(cards, card) < (card === 'table' ? 6 : 1)),
    ...grillUpgrades.filter(card => upgradeAvailable(cards, card, level)),
    ...stationUpgradeIds.filter(card => upgradeAvailable(cards, card, level))];
  for (const item of Object.keys(unlockLevels) as Unlock[]) {
    if (level >= unlockLevels[item] && !supplyAvailable(cards, item)) pool.push(`unlock:${item}`);
    if (cards.includes(`unlock:${item}`)) pool.push(`sold:${item}`);
  }
  const candidates = pool.filter(card => !previous.includes(card))
    .map(card => ({ card, weight: card.startsWith('sold:') ? soldOutCardWeight : 1 }));
  let totalWeight = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  return Array.from({ length: 3 }, (_, i) => {
    let ticket = roll(i) * totalWeight;
    const index = candidates.findIndex(({ weight }) => {
      ticket -= weight;
      return ticket < 0;
    });
    const [{ card, weight }] = candidates.splice(index, 1);
    totalWeight -= weight;
    return card;
  });
}

export function readBurgerCard(card: unknown): card is BurgerCard {
  if (typeof card !== 'string') return false;
  const [kind, item] = card.split(':');
  return (facilities as readonly string[]).includes(card) || (guestCards as readonly string[]).includes(card)
    || isGrillUpgrade(card) || isStationUpgrade(card)
    || (kind === 'unlock' || kind === 'sold') && Boolean(item) && card === `${kind}:${item}` && Object.hasOwn(unlockLevels, item);
}

const unlocksDrink = (card: BurgerCard) => card === 'unlock:cola' || card === 'unlock:soda';
export const cardXpPercent = (card: BurgerCard) => unlocksDrink(card) ? 12 : card.startsWith('unlock:') ? 7 : card.startsWith('sold:') ? -5 : 0;

export function cardModifiers(cards: readonly BurgerCard[]) {
  const revenue = cards.reduce((sum, card) => sum + (unlocksDrink(card) ? 20
    : card.startsWith('unlock:') ? 15 : card.startsWith('sold:') ? -5 : card === 'rush' || card === 'picky' ? 20
      : card === 'patient' ? -10 : card === 'simple' ? -20 : card === 'table' ? 10 : 0), 100);
  const xp = cards.reduce((sum, card) => sum + cardXpPercent(card), 100);
  return { revenue: Math.max(.1, revenue / 100), xp: Math.max(minimumXpMultiplier, xp / 100),
    patience: Math.max(.25, 1 + (cardCount(cards, 'patient') - cardCount(cards, 'rush')) / 10),
    traffic: 1 + (cardCount(cards, 'advertise') + cardCount(cards, 'table')) / 10,
    layers: cardCount(cards, 'picky') - cardCount(cards, 'simple') };
}
