import omokArt from '../assets/omok.jpg';
import physicsArt from '../assets/disc-practice.jpg';
import type { GameId } from '../games/scenes.ts';

export const games = {
  omok: { art: omokArt, category: 'strategy', players: 'twoPlayers', description: 'omokCopy', rules: 'omokRules' },
  physics: { art: physicsArt, category: 'action', players: 'soloOrPair', description: 'physicsCopy', rules: 'physicsRules' },
} as const;

export const gameIds = Object.keys(games) as GameId[];
