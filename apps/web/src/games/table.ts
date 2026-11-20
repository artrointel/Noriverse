export const tableSize = 480;
export type Stone = 1 | 2;
export const oppositeStone = (stone: Stone): Stone => stone === 1 ? 2 : 1;

export function rematchPlayerColor(color: Stone, winner?: Stone | 'draw', forfeited?: Stone): Stone {
  const loser = forfeited ?? (winner === 1 || winner === 2 ? oppositeStone(winner) : undefined);
  return loser === 2 ? oppositeStone(color) : color;
}

export const sideLabel = (game: string, side: Stone) => (game === 'chess' ? side === 2 : side === 1) ? 'black' : 'white';
