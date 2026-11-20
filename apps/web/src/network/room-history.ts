import { profileIdPattern, readName } from '../../../../packages/protocol/profile.ts';
import { isRoomGame, isRoomRole } from '../../../../packages/protocol/rooms.ts';
import type { Role, RoomGame } from '../../../../packages/protocol/rooms.ts';

export type RoomResult = {
  id: string; game: RoomGame; endedAt: number; seconds: number;
  players: { role: Role; name?: string; outcome: 'win' | 'loss' | 'draw' }[];
};

export const roomHistoryBatchSize = 24;

export function readRoomResult(raw: unknown): RoomResult | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { id, game, endedAt, seconds, players } = raw as Partial<RoomResult>;
  if (typeof id !== 'string' || !profileIdPattern.test(id) || !isRoomGame(game)
    || typeof endedAt !== 'number' || !Number.isSafeInteger(endedAt) || endedAt <= 0 || endedAt > 8.64e15
    || typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0
    || !Array.isArray(players) || players.length < 2 || players.length > 4) return;
  if (players.some(entry => !entry || !isRoomRole(entry.role) || (entry.name !== undefined && !readName(entry.name))
    || (entry.outcome !== 'win' && entry.outcome !== 'loss' && entry.outcome !== 'draw'))
    || new Set(players.map(player => player.role)).size !== players.length) return;
  return { id, game, endedAt, seconds, players };
}

export function mergeRoomHistory(previous: RoomResult[], added: RoomResult[]) {
  const byId = new Map(previous.map(entry => [entry.id, entry]));
  for (const entry of added) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return Array.from(byId.values()).sort((a, b) => b.endedAt - a.endedAt);
}
