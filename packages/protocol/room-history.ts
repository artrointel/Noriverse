import { isAvatarId, profileIdPattern, readName } from './profile.ts';
import type { AvatarId } from './profile.ts';
import { isRoomGame, isRoomRole } from './rooms.ts';
import type { Participant, Role, RoomGame } from './rooms.ts';

export type RoomResultPlayer = { role: Role; name?: string; avatar?: AvatarId; profileId?: string; memberId?: string; mock?: true;
  outcome: 'win' | 'loss' | 'draw'; points?: number; liarPoints?: number };

export type RoomResult = {
  id: string; game: RoomGame; endedAt: number; seconds: number;
  players: RoomResultPlayer[];
  test?: true;
};

export const roomHistoryBatchSize = 24;

export function readRoomResult(raw: unknown): RoomResult | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { id, game, endedAt, seconds, players, test } = raw as Partial<RoomResult>;
  if (typeof id !== 'string' || !profileIdPattern.test(id) || !isRoomGame(game)
    || typeof endedAt !== 'number' || !Number.isSafeInteger(endedAt) || endedAt <= 0 || endedAt > 8.64e15
    || typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0
    || !Array.isArray(players) || players.length < 2 || players.length > 4
    || (test !== undefined && test !== true)) return;
  if (players.some(entry => !entry || !isRoomRole(entry.role) || (entry.name !== undefined && !readName(entry.name))
    || (entry.avatar !== undefined && !isAvatarId(entry.avatar))
    || [entry.profileId, entry.memberId].some(id => id !== undefined && (typeof id !== 'string' || !profileIdPattern.test(id)))
    || (entry.mock !== undefined && (entry.mock !== true || !test || entry.role === 'host' || entry.profileId !== undefined || entry.memberId !== undefined || entry.avatar !== undefined))
    || (entry.points !== undefined && (!Number.isInteger(entry.points) || entry.points < 10 || entry.points > 50))
    || (entry.liarPoints !== undefined && (game !== 'liar' || !Number.isInteger(entry.liarPoints) || entry.liarPoints < 0 || entry.liarPoints > 140))
    || (entry.outcome !== 'win' && entry.outcome !== 'loss' && entry.outcome !== 'draw'))
    || (test && !players.some(player => player.mock)) || new Set(players.map(player => player.role)).size !== players.length) return;
  return { id, game, endedAt, seconds, players, ...(test && { test }) };
}

export function roomRankingEntries(entries: RoomResult[], test: boolean) {
  return entries.filter(entry => Boolean(entry.test) === test);
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
  const keyFor = (role: Role, memberId?: string, profileId?: string, mock?: boolean) =>
    mock ? 'mock:' + role : profileId ?? (memberId && (aliases.get(memberId) ?? memberId)) ?? role;
  const rows = new Map<string, { key: string; role: Role; name?: string; avatar?: AvatarId; mock?: boolean; points: number; wins: number; played: number; current: boolean }>();
  for (const entry of [...entries].reverse()) {
    if (game && entry.game !== game) continue;
    for (const player of entry.players) {
      const key = keyFor(player.role, player.memberId, player.profileId, player.mock);
      const row = rows.get(key) ?? { key, role: player.role, mock: player.mock, points: 0, wins: 0, played: 0, current: false };
      rows.set(key, { ...row, name: player.name ?? row.name, avatar: player.avatar ?? row.avatar,
        points: row.points + (game ? player.liarPoints ?? 0 : roomPoints(player)),
        wins: row.wins + Number(player.outcome === 'win'), played: row.played + 1 });
    }
  }
  for (const player of participants) {
    const key = keyFor(player.role, player.memberId, player.profile?.id, player.mock);
    const row = rows.get(key) ?? { key, role: player.role, mock: player.mock, points: 0, wins: 0, played: 0, current: false };
    rows.set(key, { ...row, role: player.role, name: player.profile?.name ?? row.name, avatar: player.profile?.avatar ?? row.avatar, current: true });
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.key.localeCompare(b.key));
}

export function roomRankChange(entries: RoomResult[], participants: Participant[], completed: RoomResult) {
  const earlier = entries.filter(entry => entry.id !== completed.id && entry.endedAt <= completed.endedAt);
  if (!earlier.length) return;
  const previous = roomStandings(earlier, participants);
  const positions = new Map(previous.map((row, index) => [row.key, index]));
  const updated = roomStandings([completed, ...earlier], participants);
  for (const [index, player] of updated.entries()) {
    const before = positions.get(player.key);
    const passed = previous[index];
    if (before !== undefined && before > index && passed?.played) return { player, passed, rank: index + 1 };
  }
}

export function mergeRoomHistory(previous: RoomResult[], added: RoomResult[]) {
  const byId = new Map(previous.map(entry => [entry.id, entry]));
  for (const entry of added) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return Array.from(byId.values()).sort((a, b) => b.endedAt - a.endedAt);
}
