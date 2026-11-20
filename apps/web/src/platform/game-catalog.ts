import omokArt from '../assets/omok.jpg';
import physicsArt from '../assets/disc-practice.jpg';
import othelloArt from '../assets/othello.jpg';
import type { GameId } from '../games/scenes.ts';

export const games = {
  omok: { art: omokArt, category: 'strategy', players: 'twoPlayers', description: 'omokCopy', rules: 'omokRules', searchNames: '오목 omok gomoku five in a row' },
  physics: { art: physicsArt, category: 'action', players: 'soloOrPair', description: 'physicsCopy', rules: 'physicsRules', searchNames: '알까기 alkkagi disc flick' },
  othello: { art: othelloArt, category: 'strategy', players: 'twoPlayers', description: 'othelloCopy', rules: 'othelloRules', searchNames: '오델로 리버시 othello reversi flip discs' },
} as const;

export const gameIds = Object.keys(games) as GameId[];

export function matchesGame(id: GameId, query: string, title: string) {
  const words = query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const names = (title + ' ' + games[id].searchNames).normalize('NFKC').toLowerCase();
  return words.every(word => names.includes(word));
}
