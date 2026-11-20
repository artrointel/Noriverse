import { isProfileGame, profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { ProfileGame } from '../../../../packages/protocol/profile.ts';
import { roomCodePattern } from '../../../../packages/protocol/rooms.ts';

const prefix = 'noriverse.guest-seat.';
const resumeKey = 'noriverse.active-guest-room';
const lifetime = 30 * 60 * 1000;
export type GuestRoom = { code: string; game: ProfileGame };

export function readGuestRoom(): GuestRoom | undefined {
  try {
    const [code, game] = (localStorage.getItem(resumeKey) ?? '').split(':');
    if (roomCodePattern.test(code) && isProfileGame(game) && readGuestSeat(code)) return { code, game };
    localStorage.removeItem(resumeKey);
  } catch { /* Storage may be disabled. */ }
}

export function writeGuestRoom(code: string, game?: ProfileGame) {
  try {
    if (game) localStorage.setItem(resumeKey, code + ':' + game);
    else if (localStorage.getItem(resumeKey)?.startsWith(code + ':')) localStorage.removeItem(resumeKey);
  } catch { /* The live connection still retains its seat. */ }
}

export function readGuestSeat(code: string) {
  try {
    const raw = localStorage.getItem(prefix + code);
    if (!raw) return;
    const [token, expires] = raw.split(':');
    if (profileIdPattern.test(token) && Number(expires) > Date.now()) return token;
    forgetGuestSeat(code);
  } catch { /* Storage may be disabled. */ }
}

export function saveGuestSeat(code: string, token: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) readGuestSeat(key.slice(prefix.length));
    }
    localStorage.setItem(prefix + code, token + ':' + (Date.now() + lifetime));
  } catch { /* The live connection still retains its seat. */ }
}

export function forgetGuestSeat(code: string) {
  try { localStorage.removeItem(prefix + code); } catch { /* Storage may be disabled. */ }
}
