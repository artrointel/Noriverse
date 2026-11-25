export const roomCapacity = { omok: 2, physics: 4, othello: 2, chess: 2, sichuan: 4, memory: 4, sketch: 4, liar: 4, slime: 4, mole: 4, burger: 8 } as const;
export type GameId = keyof typeof roomCapacity;
const burgerModes = ['race', 'coop', 'teams'] as const;
export type BurgerMode = typeof burgerModes[number];
export const readBurgerMode = (value: unknown) => burgerModes.find(mode => mode === value);
export const roomPlayerCapacity = (game: GameId, burgerMode?: BurgerMode) =>
  game === 'burger' && burgerMode !== 'teams' ? 4 : roomCapacity[game];
export const gameIds = Object.freeze(Object.keys(roomCapacity) as GameId[]);
const standaloneGameIds = ['startrail'] as const;
export type CatalogGameId = GameId | typeof standaloneGameIds[number];
export const catalogGameIds: readonly CatalogGameId[] = Object.freeze([...gameIds, ...standaloneGameIds]);
export const minimumRoomPlayers = (game: GameId) => game === 'liar' ? 3 : 2;
export const isOnlineOnlyGame = (game: GameId) => game === 'liar';
export const isTilePuzzle = (game: GameId) => game === 'sichuan' || game === 'memory';

export function supportsPlayerCount(game: CatalogGameId, count: number) {
  if (!isGameId(game)) return count === 1;
  return count === 1 ? !isOnlineOnlyGame(game) : Number.isInteger(count) && count >= minimumRoomPlayers(game) && count <= roomCapacity[game];
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && Object.hasOwn(roomCapacity, value);
}

export function isCatalogGameId(value: unknown): value is CatalogGameId {
  return catalogGameIds.some(id => id === value);
}
