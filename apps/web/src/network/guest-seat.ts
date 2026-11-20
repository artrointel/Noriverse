import { profileIdPattern } from '../../../../packages/protocol/profile.ts';

const prefix = 'noriverse.guest-seat.';
const lifetime = 30 * 60 * 1000;

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
