export const roomCapacity = { omok: 2, physics: 4, othello: 2, chess: 2, sichuan: 4, sketch: 4 } as const;
export type GameId = keyof typeof roomCapacity;
export const gameIds = Object.freeze(Object.keys(roomCapacity) as GameId[]);

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && Object.hasOwn(roomCapacity, value);
}
