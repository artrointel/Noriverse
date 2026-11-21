import { useCallback, useEffect, useRef, useState } from 'react';
import { profileIdPattern, readReport } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, OwnProfile, PresenceMode, ProfilePreferences, PublicProfile } from '../../../../packages/protocol/profile.ts';
import { mergeBadges, readEarnedBadge } from '../../../../packages/protocol/badges.ts';
import type { BadgeId, EarnedBadge } from '../../../../packages/protocol/badges.ts';
import { apiAvailable, apiFetch } from '../network/api.ts';
import { deleteBrowserProfile, readBrowserProfile, readBrowserTouchEffect, recordBrowserReaction, saveBrowserAvatar, saveBrowserProfile, saveBrowserTouchEffect } from './browser-profile.ts';
import { playSound } from './audio.ts';

const recordCount = (profile: PublicProfile) => Object.values(profile.games).reduce((sum, game) => sum + game.sessions, 0);
const applyBrowserTouchEffect = (profile: OwnProfile): OwnProfile => ({ ...profile,
  touchEffect: readBrowserTouchEffect(profile.id) ?? profile.touchEffect ?? 'soft',
});
const matchQueueKey = (owner: string) => 'noriverse.pendingMatches.' + owner;
const reactionQueueKey = (owner: string) => 'noriverse.pendingReactions.' + owner;

function pendingReactions(owner: string): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(reactionQueueKey(owner)) ?? '[]');
    return Array.isArray(values) ? values.filter((id): id is string => typeof id === 'string' && profileIdPattern.test(id)) : [];
  } catch { return []; }
}

function saveReactionQueue(owner: string, pending: string[]) {
  try {
    if (pending.length) localStorage.setItem(reactionQueueKey(owner), JSON.stringify(pending));
    else localStorage.removeItem(reactionQueueKey(owner));
  } catch { /* The current reaction can still be submitted. */ }
}

function pendingMatches(owner: string): MatchReport[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(matchQueueKey(owner)) ?? '[]');
    return Array.isArray(values) ? values.map(readReport).filter(match => match !== undefined) : [];
  } catch { return []; }
}

function updatePendingMatch(owner: string, match: MatchReport, keep: boolean) {
  try {
    const remaining = pendingMatches(owner).filter(pending => pending.id !== match.id);
    if (keep) remaining.push(match);
    if (remaining.length) localStorage.setItem(matchQueueKey(owner), JSON.stringify(remaining));
    else localStorage.removeItem(matchQueueKey(owner));
  } catch { /* Saving through the API still works with storage disabled. */ }
}

export function useProfile(profileOpen: boolean) {
  const [profile, setProfile] = useState<OwnProfile>();
  const owner = profile?.id;
  const deletingOwner = useRef<string>(null);
  const knownBadges = useRef<{ owner?: string; ids: Set<BadgeId> }>({ ids: new Set() });
  const [badgeToasts, setBadgeToasts] = useState<EarnedBadge[]>([]);
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading');
  const badgeList = profile?.badges;
  useEffect(() => {
    if (knownBadges.current.owner !== owner) {
      knownBadges.current = { owner, ids: new Set(badgeList?.map(badge => badge.id)) };
      setBadgeToasts([]);
      return;
    }
    const earned = badgeList?.filter(badge => !knownBadges.current.ids.has(badge.id)) ?? [];
    if (!earned.length) return;
    for (const badge of earned) knownBadges.current.ids.add(badge.id);
    setBadgeToasts(previous => [...previous, ...earned]);
    playSound('badge');
  }, [owner, badgeList]);

  const firstToast = badgeToasts[0]?.id;
  useEffect(() => {
    if (!firstToast) return;
    const timer = window.setTimeout(() => setBadgeToasts(previous => previous.filter(badge => badge.id !== firstToast)), 6500);
    return () => window.clearTimeout(timer);
  }, [firstToast]);

  const syncBadges = useCallback((id: string, badges: EarnedBadge[]) => {
    if (deletingOwner.current === id || !badges.length) return;
    setProfile(current => current?.id === id ? { ...current, badges: mergeBadges(current.badges, badges) } : current);
  }, []);
  useEffect(() => {
    if (!apiAvailable) {
      const saved = readBrowserProfile();
      setProfile(saved);
      setStatus(saved ? 'ready' : 'missing');
      return;
    }
    const controller = new AbortController();
    void apiFetch('/api/profiles/me', { signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return;
      if (response.status === 404) {
        setStatus('missing');
      } else if (response.ok) {
        const next = await response.json() as OwnProfile;
        if (!controller.signal.aborted) {
          setProfile(applyBrowserTouchEffect(next));
          setStatus('ready');
        }
      } else setStatus('error');
    }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, []);

  async function saveName(name: string) {
    if (!apiAvailable) {
      const next = saveBrowserProfile(name);
      setProfile(next);
      setStatus('ready');
      return;
    }
    const response = await apiFetch('/api/profiles/me', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, id: owner }),
    });
    if (!response.ok) throw new Error();
    const next = await response.json() as OwnProfile;
    if (next.id === deletingOwner.current) throw new Error();
    setProfile(current => applyBrowserTouchEffect(current?.id === next.id
      ? { ...next, presence: current.presence ?? next.presence, badges: mergeBadges(current.badges, next.badges) } : next));
    setStatus('ready');
  }

  async function deleteProfile() {
    if (!owner || owner === deletingOwner.current) throw new Error();
    deletingOwner.current = owner;
    try {
      if (apiAvailable) {
        const response = await apiFetch('/api/profiles/me', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: owner }),
        });
        if (response.status !== 204) throw new Error();
      } else deleteBrowserProfile(owner);
    } catch (error) {
      deletingOwner.current = null;
      throw error;
    }
    saveBrowserTouchEffect(owner);
    try { localStorage.removeItem(matchQueueKey(owner)); } catch { /* Storage can be disabled. */ }
    saveReactionQueue(owner, []);
    setProfile(undefined);
    setStatus('missing');
  }

  async function setPreferences(preferences: ProfilePreferences) {
    if (owner === deletingOwner.current) throw new Error();
    if (!apiAvailable && 'avatar' in preferences) {
      setProfile(saveBrowserAvatar(preferences));
      return;
    }
    const touchEffect = 'touchEffect' in preferences ? preferences.touchEffect : undefined;
    let next: OwnProfile;
    try {
      const response = await apiFetch('/api/profiles/me/preferences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error();
      next = await response.json() as OwnProfile;
      if (owner && next.id !== owner) throw new Error();
      if (touchEffect && next.touchEffect !== touchEffect) throw new Error();
      if ('presence' in preferences && next.presence !== preferences.presence) throw new Error();
      if ('avatar' in preferences && (next.avatar !== preferences.avatar
        || (preferences.avatarBackground !== undefined && (next.avatarBackground ?? null) !== preferences.avatarBackground))) throw new Error();
    } catch (error) {
      if (!touchEffect || !owner || owner === deletingOwner.current || !saveBrowserTouchEffect(owner, touchEffect)) throw error;
      setProfile(current => current?.id === owner ? { ...current, touchEffect } : current);
      return;
    }
    if (owner === deletingOwner.current) throw new Error();
    if (touchEffect) saveBrowserTouchEffect(next.id);
    next = applyBrowserTouchEffect(next);
    setProfile(current => {
      if (current?.id !== next.id) return current;
      const presence = 'presence' in preferences ? next.presence : current.presence ?? next.presence;
      return recordCount(current) > recordCount(next)
        ? { ...current, avatar: next.avatar, avatarBackground: next.avatarBackground, favorites: next.favorites, touchEffect: next.touchEffect, presence }
        : { ...next, presence, badges: mergeBadges(current.badges, next.badges) };
    });
  }

  function syncPresence(id: string, presence: PresenceMode) {
    setProfile(current => current?.id === id && current.presence !== presence ? { ...current, presence } : current);
  }

  const record = useCallback(async (match: MatchReport) => {
    if (!apiAvailable || !owner || owner === deletingOwner.current) return false;
    if (match.mode === 'local') {
      updatePendingMatch(owner, match, false);
      return true;
    }
    updatePendingMatch(owner, match, true);
    try {
      const response = await apiFetch('/api/profiles/me/matches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(match), keepalive: true,
      });
      if (!response.ok) return false;
      const next = await response.json() as PublicProfile;
      if (next.id !== owner) return false;
      updatePendingMatch(owner, match, false);
      syncBadges(owner, next.badges ?? []);
      setProfile(current => current?.id === next.id && recordCount(current) <= recordCount(next)
        ? { ...current, totalSeconds: next.totalSeconds, xp: next.xp, level: next.level, games: next.games, recent: next.recent } : current);
      return true;
    } catch {
      return false;
    }
  }, [owner, syncBadges]);

  const submitReaction = useCallback(async (id: string) => {
    if (!owner || owner === deletingOwner.current) return false;
    try {
      const response = await apiFetch('/api/profiles/me/reactions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, owner }), keepalive: true,
      });
      if (!response.ok) return false;
      const result: unknown = await response.json();
      if (!Array.isArray(result)) return false;
      saveReactionQueue(owner, pendingReactions(owner).filter(pending => pending !== id));
      syncBadges(owner, result.map(readEarnedBadge).filter(badge => badge !== undefined));
      return true;
    } catch { return false; }
  }, [owner, syncBadges]);

  function recordReaction() {
    if (!owner || owner === deletingOwner.current || badgeList?.some(badge => badge.id === 'goodSport')) return;
    if (!apiAvailable) { syncBadges(owner, recordBrowserReaction(owner)); return; }
    const id = crypto.randomUUID();
    saveReactionQueue(owner, [...pendingReactions(owner), id]);
    void submitReaction(id);
  }

  useEffect(() => {
    if (!apiAvailable || !owner) return;
    const id = owner;
    let active = true;
    let retrying = false;
    async function retry() {
      if (retrying) return;
      retrying = true;
      try {
        for (const match of pendingMatches(id)) {
          if (!active || !await record(match)) break;
        }
        for (const reaction of pendingReactions(id)) {
          if (!active || !await submitReaction(reaction)) break;
        }
      } finally { retrying = false; }
    }
    void retry();
    window.addEventListener('online', retry);
    return () => { active = false; window.removeEventListener('online', retry); };
  }, [owner, record, submitReaction, profileOpen]);

  return { profile, status, saveName, deleteProfile, setPreferences, syncPresence, record, recordReaction, syncBadges, badgeToasts,
    dismissBadge: (id: BadgeId) => setBadgeToasts(previous => previous.filter(badge => badge.id !== id)) };
}
