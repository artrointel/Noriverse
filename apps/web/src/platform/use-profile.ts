import { useCallback, useEffect, useState } from 'react';
import { readReport } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, OwnProfile, PresenceMode, ProfilePreferences, PublicProfile } from '../../../../packages/protocol/profile.ts';
import { apiAvailable, apiFetch } from '../network/api.ts';
import { readBrowserProfile, readBrowserTouchEffect, saveBrowserProfile, saveBrowserTouchEffect } from './browser-profile.ts';

const recordCount = (profile: PublicProfile) => Object.values(profile.games).reduce((sum, game) => sum + game.sessions, 0);
const applyBrowserTouchEffect = (profile: OwnProfile): OwnProfile => ({ ...profile,
  touchEffect: readBrowserTouchEffect(profile.id) ?? profile.touchEffect ?? 'soft',
});
const matchQueueKey = (owner: string) => 'noriverse.pendingMatches.' + owner;

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
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading');
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error();
    const next = await response.json() as OwnProfile;
    setProfile(current => applyBrowserTouchEffect(current?.id === next.id ? { ...next, presence: current.presence ?? next.presence } : next));
    setStatus('ready');
  }

  async function setPreferences(preferences: ProfilePreferences) {
    const touchEffect = 'touchEffect' in preferences ? preferences.touchEffect : undefined;
    const id = profile?.id;
    let next: OwnProfile;
    try {
      const response = await apiFetch('/api/profiles/me/preferences', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences),
      });
      if (!response.ok) throw new Error();
      next = await response.json() as OwnProfile;
      if (touchEffect && next.touchEffect !== touchEffect) throw new Error();
      if ('presence' in preferences && next.presence !== preferences.presence) throw new Error();
    } catch (error) {
      if (!touchEffect || !id || !saveBrowserTouchEffect(id, touchEffect)) throw error;
      setProfile(current => current?.id === id ? { ...current, touchEffect } : current);
      return;
    }
    if (touchEffect) saveBrowserTouchEffect(next.id);
    next = applyBrowserTouchEffect(next);
    setProfile(current => {
      if (current?.id !== next.id) return next;
      const presence = 'presence' in preferences ? next.presence : current.presence ?? next.presence;
      return recordCount(current) > recordCount(next)
        ? { ...current, avatar: next.avatar, favorites: next.favorites, touchEffect: next.touchEffect, presence }
        : { ...next, presence };
    });
  }

  function syncPresence(id: string, presence: PresenceMode) {
    setProfile(current => current?.id === id && current.presence !== presence ? { ...current, presence } : current);
  }

  const record = useCallback(async (match: MatchReport) => {
    if (!apiAvailable || !owner) return false;
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
      setProfile(current => current?.id === next.id && recordCount(current) <= recordCount(next)
        ? { ...current, totalSeconds: next.totalSeconds, xp: next.xp, level: next.level, games: next.games, recent: next.recent } : current);
      return true;
    } catch {
      return false;
    }
  }, [owner]);

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
      } finally { retrying = false; }
    }
    void retry();
    window.addEventListener('online', retry);
    return () => { active = false; window.removeEventListener('online', retry); };
  }, [owner, record, profileOpen]);

  return { profile, status, saveName, setPreferences, syncPresence, record };
}
