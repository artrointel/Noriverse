import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import { isRoomRole, roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { Participant, Role } from '../../../../packages/protocol/rooms.ts';
import type { RoomResult } from '../../../../packages/protocol/room-history.ts';
import type { Prompt } from '../games/sketch/rules.ts';
import { blankMatch, readMatchSnapshot } from './room-match.ts';
import type { Match } from './room-match.ts';

export type RoomSeat = { code: string; role: Role; token: string };
type HostRoomState = {
  match: Match;
  previous?: Match;
  entries: RoomResult[];
  lineup?: { seats: Role[]; players: Participant[] };
  prepared: Role[];
  drawingDeck: Prompt[];
  mockCount: number;
};
type RoomResume = { seat: RoomSeat; savedAt: number; host?: HostRoomState };
const resumeKey = 'noriverse.room-resume.v1';

export function readRoomResume(): RoomResume | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(resumeKey) ?? 'null') as RoomResume | null;
    if (!value || !Number.isSafeInteger(value.savedAt) || value.savedAt <= 0 || !value.seat
      || !roomCodePattern.test(value.seat.code) || !isRoomRole(value.seat.role) || !profileIdPattern.test(value.seat.token)) return;
    if (value.seat.role === 'host') {
      const host = value.host;
      if (!host || !host.match?.id || !readMatchSnapshot({ ...host.match, type: 'snapshot' }, blankMatch, value.savedAt)
        || !Array.isArray(host.entries) || !Array.isArray(host.prepared) || !Array.isArray(host.drawingDeck)
        || (host.lineup && (!Array.isArray(host.lineup.seats) || !Array.isArray(host.lineup.players)))
        || (host.match.startedAt && !host.lineup)) return;
    }
    return value;
  } catch { /* The current tab may not have access to session storage. */ }
}

export function saveRoomResume(value: RoomResume) {
  clearRoomResume();
  try { sessionStorage.setItem(resumeKey, JSON.stringify(value)); }
  catch { /* The tab can still play while it stays open. */ }
}

export function clearRoomResume() {
  try { sessionStorage.removeItem(resumeKey); } catch { /* Storage is optional. */ }
}
