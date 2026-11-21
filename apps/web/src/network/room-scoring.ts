import type { Role } from '../../../../packages/protocol/rooms.ts';
import { settledStatus } from '../games/alkkagi/rules.ts';
import { chessLosses } from '../games/chess/rules.ts';
import { boardFrom, boardSize } from '../games/omok/rules.ts';
import { othelloState } from '../games/othello/rules.ts';
import { puzzleProgress } from '../games/sichuan/multiplayer.ts';
import { isLiarRound, liarParticipationPoints } from '../games/liar/rules.ts';
import { matchColor } from './room-match.ts';
import type { Match } from './room-match.ts';
import type { RoomResultPlayer } from './room-history.ts';

function omokProgress(history: number[], color: number) {
  const board = boardFrom(history);
  let longest = 0;
  for (const [i, cell] of board.entries()) {
    if (cell !== color) continue;
    const x = i % boardSize, y = Math.floor(i / boardSize);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let count = 1;
      while (count < 4) {
        const col = x + count * dx, row = y + count * dy;
        if (col >= boardSize || row < 0 || row >= boardSize || board[col + row * boardSize] !== color) break;
        count++;
      }
      longest = Math.max(longest, count);
    }
  }
  return longest / 4;
}

function losingProgress(match: Match, role: Role, liarPoints: number): number {
  const color = matchColor(match, role);
  if (!color) return 0;
  switch (match.game) {
    case 'omok': return omokProgress(match.history, color);
    case 'othello': {
      const scores = othelloState(match.history).scores;
      return Math.max(0, ((scores[color - 1] ?? 2) - 2) * 2 / Math.max(1, scores[0] + scores[1] - 4));
    }
    case 'chess': {
      const { p, n, b, r, q } = chessLosses(match.history)[color === 1 ? 'b' : 'w'];
      return (p + 3 * (n + b) + 5 * r + 9 * q) / 39;
    }
    case 'physics': {
      if (!match.physics) return 0;
      const { remaining } = settledStatus(match.physics);
      const stones = match.physics.settings?.stones ?? 5;
      if (remaining.length === 2) return 1 - remaining[color === 1 ? 1 : 0] / stones;
      const place = match.physics.eliminated?.indexOf(color) ?? -1;
      return place >= 0 ? place / Math.max(1, remaining.length - 2) : (remaining[color - 1] ?? 0) / stones;
    }
    case 'sichuan': return match.puzzle ? puzzleProgress(match.puzzle, role) / 100 : 0;
    case 'sketch': return match.sketch ? (match.sketch.scores[match.sketch.players.indexOf(role)] ?? 0) / Math.max(1, ...match.sketch.scores) : 0;
    case 'liar': return liarPoints / 40;
  }
}

export function awardRoomPoints(match: Match, role: Role, outcome: RoomResultPlayer['outcome']) {
  const participation = match.liar && isLiarRound(match.liar) ? liarParticipationPoints(match.liar, role) : 0;
  const points = outcome === 'win' ? 50 : outcome === 'draw' ? 30
    : 10 + Math.round(30 * Math.max(0, Math.min(1, losingProgress(match, role, participation))));
  return { points, liarPoints: match.game === 'liar' ? Number(outcome === 'win') * 100 + participation : undefined };
}
