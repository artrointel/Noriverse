import omokArt from '../assets/omok.jpg';
import physicsArt from '../assets/disc-practice.jpg';
import othelloArt from '../assets/othello.jpg';
import chessArt from '../assets/chess.jpg';
import sichuanArt from '../assets/sichuan-cover.webp';
import memoryArt from '../assets/sichuan-themes/animals-atlas.jpg';
import sketchArt from '../assets/sketch-cover.webp';
import liarArt from '../assets/liar-cover.webp';
import slimeArt from '../assets/slime-cover.webp';
import type { GameId } from '../../../../packages/protocol/games.ts';
export { gameIds } from '../../../../packages/protocol/games.ts';

export const games = {
  omok: { art: omokArt, category: 'strategy', players: 'twoPlayers', description: 'omokCopy', rules: 'omokRules', searchNames: '오목 omok gomoku five in a row' },
  physics: { art: physicsArt, category: 'action', players: 'upToFourPlayers', description: 'physicsCopy', rules: 'physicsRules', searchNames: '알까기 alkkagi disc flick' },
  othello: { art: othelloArt, category: 'strategy', players: 'twoPlayers', description: 'othelloCopy', rules: 'othelloRules', searchNames: '오델로 리버시 othello reversi flip discs' },
  chess: { art: chessArt, category: 'strategy', players: 'twoPlayers', description: 'chessCopy', rules: 'chessRules', searchNames: '체스 chess checkmate' },
  sichuan: { art: sichuanArt, category: 'strategy', players: 'upToFourPlayers', description: 'sichuanCopy', rules: 'sichuanRules', searchNames: '사천성 sichuan shisen-sho shisensho tile matching' },
  memory: { art: memoryArt, category: 'strategy', players: 'upToFourPlayers', description: 'memoryCopy', rules: 'memoryRules', searchNames: '메모리 카드 짝 맞추기 카드 뒤집기 memory pairs concentration' },
  sketch: { art: sketchArt, category: 'action', players: 'upToFourPlayers', description: 'sketchCopy', rules: 'sketchRules', searchNames: '스케치 퀴즈 캐치마인드 그림 단어 sketch drawing guess' },
  liar: { art: liarArt, category: 'strategy', players: 'liarPlayers', description: 'liarCopy', rules: 'liarRules', searchNames: '라이어 게임 추리 거짓말 liar hidden role deduction' },
  slime: { art: slimeArt, category: 'action', players: 'upToFourPlayers', description: 'slimeCopy', rules: 'slimeRules', searchNames: '별젤리 슬라임 낙하 퍼즐 jelly orbit slime falling puzzle' },
} as const satisfies Record<GameId, { art: string; category: string; players: string; description: string; rules: string; searchNames: string }>;

export function matchesGame(id: GameId, query: string, title: string) {
  const words = query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const names = (title + ' ' + games[id].searchNames).normalize('NFKC').toLowerCase();
  return words.every(word => names.includes(word));
}
