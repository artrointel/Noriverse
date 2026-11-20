export const tableSize = 480;
export type Stone = 1 | 2;
export const oppositeStone = (stone: Stone): Stone => stone === 1 ? 2 : 1;
export const sideLabel = (game: string, side: Stone) => (game === 'chess' ? side === 2 : side === 1) ? 'black' : 'white';
