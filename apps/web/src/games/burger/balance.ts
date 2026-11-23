export const burgerDifficulties = ['easy', 'normal', 'hard'] as const;
export type BurgerDifficulty = (typeof burgerDifficulties)[number];
export const defaultBurgerDifficulty: BurgerDifficulty = 'normal';
export const readBurgerDifficulty = (value: unknown) => burgerDifficulties.find(difficulty => difficulty === value);

const pressureByDifficulty = { easy: .7, normal: 1, hard: 1.3 } as const;
const endlessBaseSeconds = [25, 24, 23, 22, 21, 20, 19, 18];
export const endlessReserveMs = 105_000;
const minute = 60_000;

export function burgerPressure(difficulty: BurgerDifficulty, endlessAge: number) {
  return pressureByDifficulty[difficulty] * (1 + Math.max(0, endlessAge / minute - 9) * .038);
}

export function endlessOrderReward(level: number, accuracy: number, endlessAge: number, spareTime: number, difficulty: BurgerDifficulty) {
  const taper = Math.max(.12, 1 - Math.max(0, endlessAge / minute - 19) * .048);
  const reward = Math.max(1, Math.floor(endlessBaseSeconds[level - 1] * accuracy * taper / pressureByDifficulty[difficulty])) * 1000;
  return Math.max(0, Math.min(reward, endlessReserveMs - spareTime));
}
