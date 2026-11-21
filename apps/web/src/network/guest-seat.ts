import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import { isRoomGame, roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { RoomGame } from '../../../../packages/protocol/rooms.ts';

const prefix = 'noriverse.guest-seat.';
const resumeKey = 'noriverse.active-guest-room';
const recentKey = 'noriverse.recent-rooms';
const savedSeatLimit = 16;
export type GuestRoom = { code: string; game: RoomGame };

export function readRecentRooms(): GuestRoom[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(recentKey) ?? '[]');
    const rooms = Array.isArray(saved) ? saved.filter((room): room is GuestRoom => room && typeof room.code === 'string'
      && roomCodePattern.test(room.code) && isRoomGame(room.game)) : [];
    const previous = readGuestRoom();
    return (previous && !rooms.some(room => room.code === previous.code) ? [previous, ...rooms] : rooms).slice(0, 8);
  } catch { return []; }
}

export function rememberRecentRoom(code: string, game: RoomGame) {
  try {
    const rooms = [{ code, game }, ...readRecentRooms().filter(room => room.code !== code)].slice(0, 8);
    localStorage.setItem(recentKey, JSON.stringify(rooms));
  } catch { /* Recent rooms are optional when storage is unavailable. */ }
}

export function readGuestRoom(): GuestRoom | undefined {
  try {
    const [code, game] = (localStorage.getItem(resumeKey) ?? '').split(':');
    if (roomCodePattern.test(code) && isRoomGame(game) && readGuestSeat(code)) return { code, game };
    localStorage.removeItem(resumeKey);
  } catch { /* Storage may be disabled. */ }
}

export function writeGuestRoom(code: string, game?: RoomGame) {
  try {
    if (game) localStorage.setItem(resumeKey, code + ':' + game);
    else if (localStorage.getItem(resumeKey)?.startsWith(code + ':')) localStorage.removeItem(resumeKey);
  } catch { /* The live connection still retains its seat. */ }
}

export function readGuestSeat(code: string) {
  try {
    const raw = localStorage.getItem(prefix + code);
    if (!raw) return;
    const [token] = raw.split(':');
    if (profileIdPattern.test(token)) return token;
    forgetGuestSeat(code);
  } catch { /* Storage may be disabled. */ }
}

export function saveGuestSeat(code: string, token: string) {
  try {
    const seatKey = prefix + code;
    const previous = Object.keys(localStorage).filter(key => key.startsWith(prefix) && key !== seatKey)
      .map(key => ({ key, savedAt: Number(localStorage.getItem(key)?.split(':')[1]) || 0 }))
      .sort((left, right) => right.savedAt - left.savedAt);
    localStorage.setItem(seatKey, token + ':' + Date.now());
    for (const { key } of previous.slice(savedSeatLimit - 1)) localStorage.removeItem(key);
  } catch { /* The live connection still retains its seat. */ }
}

export function forgetGuestSeat(code: string) {
  try { localStorage.removeItem(prefix + code); } catch { /* Storage may be disabled. */ }
}
