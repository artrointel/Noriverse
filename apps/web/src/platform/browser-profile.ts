import { defaultAvatar, profileIdPattern, readName } from '../../../../packages/protocol/profile.ts';
import type { GameStats, PublicProfile } from '../../../../packages/protocol/profile.ts';

const cookiePrefix = 'noriverse_browser_profile=';

function readCookie() {
  return document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(cookiePrefix))?.slice(cookiePrefix.length);
}

function browserProfile(id: string, name: string): PublicProfile {
  const emptyStats = (): GameStats => ({ seconds: 0, wins: 0, losses: 0, draws: 0, sessions: 0 });
  return {
    id, name, avatar: defaultAvatar, favorites: [], level: 1, xp: 0, totalSeconds: 0,
    games: { omok: emptyStats(), physics: emptyStats(), othello: emptyStats(), chess: emptyStats() }, recent: [],
  };
}

export function readBrowserProfile() {
  const [id, encodedName, extra] = readCookie()?.split(':') ?? [];
  if (!id || !encodedName || extra !== undefined || !profileIdPattern.test(id)) return;
  try {
    const name = readName(decodeURIComponent(encodedName));
    if (name) return browserProfile(id, name);
  } catch { /* Ignore malformed cookie values. */ }
}

export function saveBrowserProfile(name: string) {
  const id = readBrowserProfile()?.id ?? crypto.randomUUID();
  const value = id + ':' + encodeURIComponent(name);
  document.cookie = cookiePrefix + value + '; Path=' + import.meta.env.BASE_URL
    + '; SameSite=Lax; Max-Age=31536000' + (location.protocol === 'https:' ? '; Secure' : '');
  if (readCookie() !== value) throw new Error('Profile cookie could not be saved');
  return browserProfile(id, name);
}
