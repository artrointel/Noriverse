export const unlockLevels = {
  cheese: 2, lettuce: 3, cola: 3, onion: 4, pickle: 4, chicken: 5, rice: 5,
  tomato: 6, soda: 6, egg: 7, bacon: 8,
} as const;

type Unlock = keyof typeof unlockLevels;
const facilities = ['broom', 'griddle', 'assembly', 'storage', 'table', 'tray'] as const;
const guestCards = ['rush', 'patient', 'advertise', 'picky', 'simple'] as const;
const grillUpgrades = ['highHeat', 'autoGrill'] as const;
export type BurgerCard = typeof facilities[number] | typeof guestCards[number] | typeof grillUpgrades[number] | `unlock:${Unlock}` | `sold:${Unlock}`;
export const ordersPerLevel = 4;
export const cardRerollLimit = 3;

export const cardCount = (cards: readonly BurgerCard[], card: BurgerCard) => cards.filter(item => item === card).length;
export const isGrillUpgrade = (card: string) => grillUpgrades.some(upgrade => upgrade === card);
export const grillUpgradeAvailable = (cards: readonly BurgerCard[], card: BurgerCard) =>
  !isGrillUpgrade(card) || !cards.some(isGrillUpgrade);

export function supplyAvailable(cards: readonly BurgerCard[], item: string) {
  return cards.findLast(card => card === `unlock:${item}` || card === `sold:${item}`) === `unlock:${item}`;
}

export function cardOffers(cards: readonly BurgerCard[], level: number, roll: (index: number) => number, previous: readonly BurgerCard[] = []) {
  const pool: BurgerCard[] = [...guestCards.filter(card => (card !== 'picky' && card !== 'simple') || cardCount(cards, card) < 2),
    ...facilities.filter(card => cardCount(cards, card) < (card === 'table' ? 6 : 1)),
    ...grillUpgrades.filter(card => grillUpgradeAvailable(cards, card))];
  for (const item of Object.keys(unlockLevels) as Unlock[]) {
    if (level >= unlockLevels[item] && !supplyAvailable(cards, item)) pool.push(`unlock:${item}`);
    if (cards.includes(`unlock:${item}`)) pool.push(`sold:${item}`);
  }
  const candidates = pool.filter(card => !previous.includes(card));
  return Array.from({ length: 3 }, (_, i) => candidates.splice(Math.floor(roll(i) * candidates.length), 1)[0]);
}

export function readBurgerCard(card: unknown): card is BurgerCard {
  if (typeof card !== 'string') return false;
  const [kind, item] = card.split(':');
  return (facilities as readonly string[]).includes(card) || (guestCards as readonly string[]).includes(card)
    || isGrillUpgrade(card)
    || (kind === 'unlock' || kind === 'sold') && Boolean(item) && card === `${kind}:${item}` && Object.hasOwn(unlockLevels, item);
}

export function cardModifiers(cards: readonly BurgerCard[]) {
  const revenue = cards.reduce((sum, card) => sum + (card.startsWith('unlock:') ? 15 : card.startsWith('sold:') ? -5
    : card === 'rush' || card === 'picky' ? 20 : card === 'patient' ? -10 : card === 'simple' ? -20 : card === 'table' ? 10 : 0), 100);
  return { revenue: Math.max(.1, revenue / 100), patience: Math.max(.25, 1 + (cardCount(cards, 'patient') - cardCount(cards, 'rush')) / 10),
    traffic: 1 + (cardCount(cards, 'advertise') + cardCount(cards, 'table')) / 10,
    layers: cardCount(cards, 'picky') - cardCount(cards, 'simple') };
}
