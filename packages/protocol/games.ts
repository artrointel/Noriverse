export const roomCapacity = { omok: 2, physics: 4, othello: 2, chess: 2, sichuan: 4, memory: 4, sketch: 4, liar: 4, slime: 4, mole: 4, burger: 8 } as const;
export type GameId = keyof typeof roomCapacity;
const burgerModes = ['race', 'coop', 'teams'] as const;
export type BurgerMode = typeof burgerModes[number];
export const readBurgerMode = (value: unknown) => burgerModes.find(mode => mode === value);
export const roomPlayerCapacity = (game: GameId, burgerMode?: BurgerMode) =>
  game === 'burger' && burgerMode !== 'teams' ? 4 : roomCapacity[game];
export const gameIds = Object.freeze(Object.keys(roomCapacity) as GameId[]);
export const minimumRoomPlayers = (game: GameId) => game === 'liar' ? 3 : 2;
export const isOnlineOnlyGame = (game: GameId) => game === 'liar';
export const isTilePuzzle = (game: GameId) => game === 'sichuan' || game === 'memory';

export function supportsPlayerCount(game: GameId, count: number) {
  return count === 1 ? !isOnlineOnlyGame(game) : Number.isInteger(count) && count >= minimumRoomPlayers(game) && count <= roomCapacity[game];
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && Object.hasOwn(roomCapacity, value);
}
