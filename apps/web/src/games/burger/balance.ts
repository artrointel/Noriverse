export const burgerDifficulties = ['easy', 'normal', 'hard'] as const;
export type BurgerDifficulty = (typeof burgerDifficulties)[number];
export const defaultBurgerDifficulty: BurgerDifficulty = 'normal';
export const readBurgerDifficulty = (value: unknown) => burgerDifficulties.find(difficulty => difficulty === value);

export const pressureByDifficulty = { easy: .7, normal: 1, hard: 1.3 } as const;
export const endlessBaseSeconds = [25, 24, 23, 22, 21, 20, 19, 18] as const;
export const endlessReserveMs = 180_000;
export const endlessProgression = { pressureStartsAt: 9, pressurePerMinute: .038,
  rewardDecayStartsAt: 19, rewardDecayPerMinute: .048, minimumRewardRatio: .12 } as const;
const minute = 60_000;
export const firstLevelXp = 400;
export const levelXpGrowth = 1.1;
export const baseOrderXp = 100;
const logXpGrowth = Math.log(levelXpGrowth);

export const burgerPrices = { base: 100, layer: 28, patty: 27, drinks: { small: 55, medium: 70, large: 85 } } as const;
export const burgerRewardRates = { partial: .56, partialPower: 3, drinkKind: .58, drinkSize: .42,
  perfectTip: .2, perfectXp: .2, extraDrinkTip: 1, fever: 2, shooPayment: .3, expirationPenalty: .5 } as const;

export const burgerMenuPrice = (layers: number, patties: number) =>
  burgerPrices.base + layers * burgerPrices.layer + patties * burgerPrices.patty;
export const burgerCashPayout = (base: number, revenue: number, fever: boolean, tip: number) =>
  Math.round(base * revenue) * (fever ? burgerRewardRates.fever : 1) + tip;

export const roundBurgerXp = (xp: number) => Math.round(xp * 100) / 100;
export const burgerXpToReach = (level: number) =>
  roundBurgerXp(firstLevelXp * Math.expm1((level - 1) * logXpGrowth) / (levelXpGrowth - 1));

export function burgerRankFromXp(xp: number) {
  const level = 1 + Math.floor(Math.log1p(xp * (levelXpGrowth - 1) / firstLevelXp) / logXpGrowth);
  if (xp >= burgerXpToReach(level + 1)) return level + 1;
  return xp < burgerXpToReach(level) ? level - 1 : level;
}

export const endlessBonusAtLevel = (level: number) => Math.max(2, 21 - level);
export const limitEndlessReward = (reward: number, spareTime: number) => Math.max(0, Math.min(reward, endlessReserveMs - spareTime));

export function burgerDifficultyAtLevel(level: number) {
  const decay = .95 ** (level - 1);
  const steps = Math.floor((level - 1) / 2);
  return { interval: 14_000 * decay, patience: 86_000 * decay, jitter: 6700 * decay,
    min: Math.min(3, 1 + Math.max(0, steps - 3)), max: Math.min(5, 2 + steps),
    drinks: level < 3 ? 0 : Math.min(70, 20 + (steps - 1) * 5) / 100,
    endlessBonusSeconds: endlessBonusAtLevel(level) };
}

export function burgerPressure(difficulty: BurgerDifficulty, endlessAge: number) {
  return pressureByDifficulty[difficulty] * (1 + Math.max(0, endlessAge / minute - endlessProgression.pressureStartsAt) * endlessProgression.pressurePerMinute);
}

export function endlessOrderReward(level: number, accuracy: number, endlessAge: number, spareTime: number, difficulty: BurgerDifficulty) {
  const { minimumRewardRatio, rewardDecayStartsAt, rewardDecayPerMinute } = endlessProgression;
  const taper = Math.max(minimumRewardRatio, 1 - Math.max(0, endlessAge / minute - rewardDecayStartsAt) * rewardDecayPerMinute);
  const reward = Math.max(1, Math.floor(endlessBaseSeconds[level - 1] * accuracy * taper / pressureByDifficulty[difficulty])) * 1000;
  return limitEndlessReward(reward, spareTime);
}
