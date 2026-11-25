import omokArt from '../assets/omok.jpg';
import physicsArt from '../assets/disc-practice.jpg';
import othelloArt from '../assets/othello.jpg';
import chessArt from '../assets/chess.jpg';
import sichuanArt from '../assets/sichuan-cover.webp';
import memoryArt from '../assets/memory-cover.webp';
import sketchArt from '../assets/sketch-cover.webp';
import liarArt from '../assets/liar-cover.webp';
import slimeArt from '../assets/slime-cover.webp';
import moleArt from '../assets/mole/cover.webp';
import burgerArt from '../assets/burger/cover.webp';
import startrailArt from '../assets/startrail/relay-puzzle.jpg';
import type { CatalogGameId } from '../../../../packages/protocol/games.ts';
export { catalogGameIds, gameIds } from '../../../../packages/protocol/games.ts';

export const games = {
  omok: { art: omokArt, category: 'strategy', players: 'twoPlayers', description: 'omokCopy', rules: 'omokRules', searchNames: '오목 omok gomoku five in a row' },
  physics: { art: physicsArt, category: 'action', players: 'upToFourPlayers', description: 'physicsCopy', rules: 'physicsRules', searchNames: '알까기 alkkagi disc flick' },
  othello: { art: othelloArt, category: 'strategy', players: 'twoPlayers', description: 'othelloCopy', rules: 'othelloRules', searchNames: '오델로 리버시 othello reversi flip discs' },
  chess: { art: chessArt, category: 'strategy', players: 'twoPlayers', description: 'chessCopy', rules: 'chessRules', searchNames: '체스 chess checkmate' },
  sichuan: { art: sichuanArt, category: 'strategy', players: 'upToFourPlayers', description: 'sichuanCopy', rules: 'sichuanRules', searchNames: '사천성 sichuan shisen-sho shisensho tile matching' },
  memory: { art: memoryArt, category: 'strategy', players: 'upToFourPlayers', description: 'memoryCopy', rules: 'memoryRules', searchNames: '메모리 카드 짝 맞추기 카드 뒤집기 memory pairs concentration' },
  sketch: { art: sketchArt, category: 'action', players: 'upToFourPlayers', description: 'sketchCopy', rules: 'sketchRules', searchNames: '스케치 퀴즈 캐치마인드 그림 단어 sketch drawing guess' },
  liar: { art: liarArt, category: 'strategy', players: 'liarPlayers', description: 'liarCopy', rules: 'liarRules', searchNames: '라이어 게임 추리 거짓말 liar hidden role deduction' },
  slime: { art: slimeArt, category: 'action', players: 'upToFourPlayers', description: 'slimeCopy', rules: 'slimeRules',
    cardSubtitle: 'slimeCardSubtitle', searchNames: '별젤리 슬라임 낙하 퍼즐 jelly orbit slime falling puzzle 뿌요뿌요 puyo puyo puyopuyo ぷよぷよ' },
  mole: { art: moleArt, category: 'action', players: 'upToFourPlayers', description: 'moleCopy', rules: 'moleHelp',
    searchNames: '두더지 게임 두더지잡기 두더지망치 별길 탐사대 star bop mole whack arcade' },
  burger: { art: burgerArt, category: 'action', players: 'upToEightPlayers', description: 'burgerCopy', rules: 'burgerHelp',
    searchNames: '햄버거 타이쿤 버거 요리 경영 burger tycoon kitchen cooking' },
  startrail: { art: startrailArt, category: 'action', players: 'onePlayer', description: 'startrailCopy', rules: 'startrailRules',
    cardSubtitle: 'startrailCardSubtitle', launchPath: 'startrail/', searchNames: '별길탐사대 탑다운 슈팅 솔오리 꼬미 startrail crew top down shooter solori kommi' },
} as const satisfies Record<CatalogGameId, { art: string; category: string; players: string; description: string; rules: string; searchNames: string;
  cardSubtitle?: string; launchPath?: string }>;

export function matchesGame(id: CatalogGameId, query: string, title: string) {
  const words = query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const names = (title + ' ' + games[id].searchNames).normalize('NFKC').toLowerCase();
  return words.every(word => names.includes(word));
}
