import { defaultAvatar, isAvatarId, isTouchEffect, profileIdPattern, readAvatarBackground, readName } from '../../../../packages/protocol/profile.ts';
import type { AvatarLayers, GameStats, PublicProfile, TouchEffect } from '../../../../packages/protocol/profile.ts';
import { badgeCatalog } from '../../../../packages/protocol/badges.ts';
import type { EarnedBadge } from '../../../../packages/protocol/badges.ts';

const cookiePrefix = 'noriverse_browser_profile=';
const touchKey = 'noriverse.browser-profile-touch';
const reactionKey = (id: string) => 'noriverse.browser-reactions.' + id;

function browserReactions(id: string): { count: number; earnedAt?: number } {
  try { return JSON.parse(localStorage.getItem(reactionKey(id)) ?? 'null') ?? { count: 0 }; }
  catch { return { count: 0 }; }
}

export function recordBrowserReaction(id: string): EarnedBadge[] {
  const previous = browserReactions(id);
  if (previous.earnedAt) return [{ id: 'goodSport', earnedAt: previous.earnedAt }];
  const count = previous.count + 1;
  const earnedAt = count >= badgeCatalog.goodSport.target ? Date.now() : undefined;
  try { localStorage.setItem(reactionKey(id), JSON.stringify({ count, earnedAt })); } catch { /* Storage may be disabled. */ }
  return earnedAt ? [{ id: 'goodSport', earnedAt }] : [];
}

export function readBrowserTouchEffect(id?: string): TouchEffect | undefined {
  try {
    const value = localStorage.getItem(id ? touchKey + '.' + id : touchKey);
    return isTouchEffect(value) ? value : undefined;
  } catch { return undefined; }
}

export function saveBrowserTouchEffect(id: string, touchEffect?: TouchEffect) {
  try {
    if (touchEffect) localStorage.setItem(touchKey + '.' + id, touchEffect);
    else localStorage.removeItem(touchKey + '.' + id);
    return true;
  } catch { return false; }
}

function readCookie() {
  return document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(cookiePrefix))?.slice(cookiePrefix.length);
}

function writeCookie(value: string, maxAge: number) {
  document.cookie = cookiePrefix + value + '; Path=' + import.meta.env.BASE_URL
    + '; SameSite=Lax; Max-Age=' + maxAge + (location.protocol === 'https:' ? '; Secure' : '');
}

export function deleteBrowserProfile(id: string) {
  const profile = readBrowserProfile();
  if (profile && profile.id !== id) throw new Error('Profile session changed');
  writeCookie('', 0);
  if (readCookie()) throw new Error('Profile cookie could not be deleted');
  try { localStorage.removeItem(touchKey); localStorage.removeItem(reactionKey(id)); } catch { /* Storage can be disabled. */ }
}

function browserProfile(id: string, name: string, appearance: AvatarLayers): PublicProfile {
  const emptyStats = (): GameStats => ({ seconds: 0, wins: 0, losses: 0, draws: 0, sessions: 0 });
  const earnedAt = browserReactions(id).earnedAt;
  return {
    id, name, ...appearance, favorites: [], touchEffect: readBrowserTouchEffect(id) ?? readBrowserTouchEffect() ?? 'soft', level: 1, xp: 0, totalSeconds: 0,
    games: { omok: emptyStats(), physics: emptyStats(), othello: emptyStats(), chess: emptyStats(), sichuan: emptyStats(), sketch: emptyStats(), liar: emptyStats() }, recent: [],
    badges: earnedAt ? [{ id: 'goodSport', earnedAt }] : [],
  };
}

export function readBrowserProfile() {
  const [id, encodedName, avatar, color, extra] = readCookie()?.split(':') ?? [];
  if (!id || !encodedName || extra !== undefined || !profileIdPattern.test(id)) return;
  try {
    const name = readName(decodeURIComponent(encodedName));
    if (name) return browserProfile(id, name, {
      avatar: isAvatarId(avatar) ? avatar : defaultAvatar,
      avatarBackground: readAvatarBackground(color) ?? null,
    });
  } catch { /* Ignore malformed cookie values. */ }
}

function writeBrowserProfile(id: string, name: string, appearance: AvatarLayers) {
  const value = [id, encodeURIComponent(name), appearance.avatar, appearance.avatarBackground ?? ''].join(':');
  writeCookie(value, 31536000);
  if (readCookie() !== value) throw new Error('Profile cookie could not be saved');
  return browserProfile(id, name, appearance);
}

export function saveBrowserProfile(name: string) {
  const previous = readBrowserProfile();
  return writeBrowserProfile(previous?.id ?? crypto.randomUUID(), name, {
    avatar: previous?.avatar ?? defaultAvatar, avatarBackground: previous?.avatarBackground ?? null,
  });
}

export function saveBrowserAvatar(appearance: AvatarLayers) {
  const previous = readBrowserProfile();
  if (!previous) throw new Error('Profile cookie is missing');
  return writeBrowserProfile(previous.id, previous.name, {
    avatar: appearance.avatar, avatarBackground: appearance.avatarBackground === undefined ? previous.avatarBackground : appearance.avatarBackground,
  });
}
