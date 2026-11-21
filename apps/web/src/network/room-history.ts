import { profileIdPattern, readName } from '../../../../packages/protocol/profile.ts';
import { isRoomGame, isRoomRole } from '../../../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomGame } from '../../../../packages/protocol/rooms.ts';

export type RoomResultPlayer = { role: Role; name?: string; profileId?: string; memberId?: string;
  outcome: 'win' | 'loss' | 'draw'; points?: number; liarPoints?: number };

export type RoomResult = {
  id: string; game: RoomGame; endedAt: number; seconds: number;
  players: RoomResultPlayer[];
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
    || [entry.profileId, entry.memberId].some(id => id !== undefined && (typeof id !== 'string' || !profileIdPattern.test(id)))
    || (entry.points !== undefined && (!Number.isInteger(entry.points) || entry.points < 10 || entry.points > 50))
    || (entry.liarPoints !== undefined && (game !== 'liar' || !Number.isInteger(entry.liarPoints) || entry.liarPoints < 0 || entry.liarPoints > 140))
    || (entry.outcome !== 'win' && entry.outcome !== 'loss' && entry.outcome !== 'draw'))
    || new Set(players.map(player => player.role)).size !== players.length) return;
  return { id, game, endedAt, seconds, players };
}

export function roomPoints(player: RoomResultPlayer) {
  return player.points ?? (player.outcome === 'win' ? 50 : player.outcome === 'draw' ? 30 : 10);
}

export function roomStandings(entries: RoomResult[], participants: Participant[], game?: 'liar') {
  const aliases = new Map<string, string>();
  for (const entry of [...entries].reverse()) for (const player of entry.players) {
    if (player.memberId && player.profileId) aliases.set(player.memberId, player.profileId);
  }
  for (const player of participants) if (player.memberId && player.profile) aliases.set(player.memberId, player.profile.id);
  const keyFor = (role: Role, memberId?: string, profileId?: string) => profileId ?? (memberId && (aliases.get(memberId) ?? memberId)) ?? role;
  const rows = new Map<string, { key: string; role: Role; name?: string; points: number; wins: number; played: number; current: boolean }>();
  for (const entry of [...entries].reverse()) {
    if (game && entry.game !== game) continue;
    for (const player of entry.players) {
      const key = keyFor(player.role, player.memberId, player.profileId);
      const row = rows.get(key) ?? { key, role: player.role, points: 0, wins: 0, played: 0, current: false };
      rows.set(key, { ...row, name: player.name ?? row.name,
        points: row.points + (game ? player.liarPoints ?? 0 : roomPoints(player)),
        wins: row.wins + Number(player.outcome === 'win'), played: row.played + 1 });
    }
  }
  for (const player of participants) {
    if (player.mock) continue;
    const key = keyFor(player.role, player.memberId, player.profile?.id);
    const row = rows.get(key) ?? { key, role: player.role, points: 0, wins: 0, played: 0, current: false };
    rows.set(key, { ...row, role: player.role, name: player.profile?.name ?? row.name, current: true });
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.key.localeCompare(b.key));
}

export function mergeRoomHistory(previous: RoomResult[], added: RoomResult[]) {
  const byId = new Map(previous.map(entry => [entry.id, entry]));
  for (const entry of added) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return Array.from(byId.values()).sort((a, b) => b.endedAt - a.endedAt);
}
