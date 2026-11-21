import { motifCount } from '../sichuan/options.ts';
import type { SichuanRoomSettings, SichuanTheme } from '../sichuan/options.ts';
import { isMatchTile, shuffle, tilePoint } from '../sichuan/rules.ts';
import type { Tile } from '../sichuan/rules.ts';

export const memorySizes = [4, 6] as const;
export const memoryPreviewMs = 4_000;
export const memoryRevealMs = 700;
export const memoryTimeLimits = { 4: 90, 6: 180 } as const;
export const defaultMemorySettings: SichuanRoomSettings = {
  mode: 'race', settings: { size: 4, theme: 'random', density: 100, obstacles: false, shuffles: 0, hints: 0, timeLimit: 90 },
};

export function createMemoryBoard(size: number, theme: SichuanTheme, random = Math.random): Tile[] {
  const motifs = shuffle(Array.from({ length: motifCount(theme) }, (_, index) => index), random);
  return shuffle(Array.from({ length: size ** 2 / 2 }, (_, index) => motifs[index % motifs.length]).flatMap(tile => [tile, tile]), random);
}

export function memoryPair(board: readonly Tile[], first: number, second: number) {
  if (first === second || !isMatchTile(board[first]) || board[first] !== board[second]) return;
  const size = Math.sqrt(board.length);
  return [tilePoint(first, size), tilePoint(second, size)];
}
