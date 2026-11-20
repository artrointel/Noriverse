import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { avatarIds, avatarLevel, readName, readReport, secondsPerLevel, touchEffects, winRate } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, OwnProfile, PresenceMode, ProfilePreferences, PublicProfile, TouchEffect } from '../../../../packages/protocol/profile.ts';
import { apiAvailable, apiFetch, fetchPublicProfile } from '../network/api.ts';
import { avatars } from './avatars.ts';
import { readBrowserProfile, readBrowserTouchEffect, saveBrowserProfile, saveBrowserTouchEffect } from './browser-profile.ts';
import { gameIds, games, matchesGame } from './game-catalog.ts';
import { BackLink, gamePath, routeHref, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { randomPlayerName } from './player-names.ts';
import { FriendButton } from './friends.tsx';
import type { Friends } from './friends.tsx';
import { TouchBurst } from './touch-burst.tsx';

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

export function NameDialog({ name, close, save }: {
  name?: string; close: () => void; save: (name: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const element = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(() => name ?? readBrowserProfile()?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const dialog = element.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  async function submit() {
    const clean = readName(value);
    if (!clean || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await save(clean);
      close();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <dialog ref={element} className="profile-dialog surface" aria-labelledby="profile-prompt"
      onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <h2 id="profile-prompt">{t(name ? 'editName' : 'profilePrompt')}</h2>
        <p className="muted">{t(apiAvailable ? 'profileNotice' : 'browserProfileNotice')}</p>
        <label htmlFor="profile-name">{t('displayName')}</label>
        <div className="name-input">
          <input id="profile-name" value={value} onChange={event => setValue(event.target.value)}
            placeholder={t('namePlaceholder')} autoComplete="nickname" maxLength={24} autoFocus required />
          <button type="button" className="dice-button" aria-label={t('randomName')} title={t('randomName')}
            disabled={busy} onClick={() => setValue(randomPlayerName(i18n.resolvedLanguage, value))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="4" transform="rotate(-12 12 12)" />
              <circle cx="8.5" cy="8.5" r=".85" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r=".85" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="15.5" r=".85" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
        {failed && <p role="alert" className="muted">{t('profileError')}</p>}
        <div className="panel-actions">
          <button type="submit" className="button button-primary" disabled={!readName(value) || busy}>{t('saveName')}</button>
          <button type="button" className="button button-secondary" onClick={close} disabled={busy}>{t('later')}</button>
        </div>
      </form>
    </dialog>
  );
}

export function formatPlayTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, '0');
  return minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + tail : minutes + ':' + tail;
}

export function ProfileNav({ profile, navigate }: { profile?: PublicProfile; navigate: Navigate }) {
  const { t } = useTranslation();
  return (
    <div className="profile-nav">
      <RouteLink href="/profile" navigate={navigate} className="profile-nav-link" aria-label={t('myProfile')}>
        {profile && <span className="profile-nav-tag">
          <strong>{profile.name}</strong>{apiAvailable && <small>{t('levelValue', { level: profile.level })}</small>}
        </span>}
        <span className="profile-link">
          {profile ? <img className="nav-avatar" src={avatars[profile.avatar]} alt="" width="34" height="34" /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="8" r="3.2" /><path d="M5 20v-2a7 5 0 0 1 14 0v2" />
            </svg>
          )}
        </span>
      </RouteLink>
      {profile && apiAvailable && <div className="profile-preview">
        <div className="profile-preview-person">
          <img src={avatars[profile.avatar]} alt="" width="48" height="48" />
          <div><strong>{profile.name}</strong><span>{t('levelValue', { level: profile.level })}</span></div>
        </div>
        <div className="profile-preview-time"><span>{t('totalPlayTime')}</span><strong>{formatPlayTime(profile.totalSeconds)}</strong></div>
      </div>}
    </div>
  );
}

function AvatarDialog({ profile, save, close }: {
  profile: PublicProfile; save: (preferences: ProfilePreferences) => Promise<void>; close: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => { modal?.close(); };
  }, []);

  async function select(avatar: PublicProfile['avatar']) {
    if (avatarLevel[avatar] > profile.level || saving) return;
    if (avatar === profile.avatar) { close(); return; }
    setSaving(true);
    setFailed(false);
    try { await save({ avatar }); close(); }
    catch { setFailed(true); setSaving(false); }
  }

  return <dialog ref={dialog} className="profile-dialog avatar-dialog surface" aria-labelledby="avatar-dialog-title"
    onCancel={event => { event.preventDefault(); if (!saving) close(); }}>
    <h2 id="avatar-dialog-title">{t('chooseAvatar')}</h2>
    <div className="avatar-options">
      {avatarIds.map(avatar => {
        const locked = avatarLevel[avatar] > profile.level;
        return <button key={avatar} type="button" aria-label={t('avatar_' + avatar)} aria-pressed={profile.avatar === avatar}
          disabled={saving || locked} onClick={() => void select(avatar)}>
          <img src={avatars[avatar]} alt="" width="58" height="58" />
          {locked && <small>{t('levelValue', { level: avatarLevel[avatar] })}</small>}
        </button>;
      })}
    </div>
    {failed && <p role="alert">{t('profileError')}</p>}
    <button type="button" className="button button-secondary" onClick={close} disabled={saving}>{t('close')}</button>
  </dialog>;
}

function GameHistory({ profile }: { profile: PublicProfile }) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const played = gameIds.filter(id => (profile.games[id]?.sessions ?? 0) > 0);
  const visible = played.filter(id => matchesGame(id, query, t(id)))
    .sort((left, right) => profile.games[right].seconds - profile.games[left].seconds);
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage);
  const percentage = new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent', maximumFractionDigits: 1 });
  return (
    <details className="surface history-section history-card">
      <summary>{t('gameHistory')}</summary>
      <div className="history-content">
        <input className="history-search" type="search" aria-label={t('gameSearch')} placeholder={t('gameSearchHint')}
          value={query} onChange={event => setQuery(event.target.value)} />
        {visible.length === 0 && <p role="status">{t(played.length ? 'noSearchResults' : 'emptyHistory')}</p>}
        {visible.map(game => {
          const stats = profile.games[game];
          const rate = winRate(stats);
          const matches = profile.recent.filter(match => match.game === game);
          return <details key={game} className="game-history">
            <summary>
              <strong>{t(game)}</strong>
              <span>{t('recordScore', { ...stats })}</span>
              <span>{t('winRate')} <b>{rate === null ? '—' : percentage.format(rate)}</b></span>
              <span>{t('playTime')} <b>{formatPlayTime(stats.seconds)}</b></span>
            </summary>
            {matches.length ? <ul aria-label={t('recentMatches')}>{matches.map(match => (
              <li key={match.id}>
                <div><strong>{t('outcome_' + match.outcome)}</strong><span>{t(match.mode)} · {formatPlayTime(match.seconds)}</span></div>
                <time dateTime={new Date(match.playedAt).toISOString()}>{date.format(match.playedAt)}</time>
              </li>
            ))}</ul> : <p>{t('emptyHistory')}</p>}
          </details>;
        })}
        <p className="muted">{t('recordSource')}</p>
      </div>
    </details>
  );
}

function TouchEffectDialog({ selected, save, close }: { selected: TouchEffect; save: (effect: TouchEffect) => Promise<void>; close: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [effect, setEffect] = useState(selected);
  const [preview, setPreview] = useState(0);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog className="surface profile-dialog" ref={dialog} aria-labelledby="touch-effect-title"
    onCancel={event => { event.preventDefault(); if (!saving) close(); }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (saving) return;
      setSaving(true); setFailed(false);
      try { await save(effect); close(); } catch { setSaving(false); setFailed(true); }
    }}>
      <h2 id="touch-effect-title">{t('touchEffects')}</h2>
      <p className="muted">{t('touchProfileHelp')}</p>
      {touchEffects.map(value => <label className="choice" key={value}>
        <input type="radio" name="profile-touch-effect" value={value} checked={value === effect} disabled={saving}
          onChange={() => { setEffect(value); setPreview(key => key + 1); }} />
        {t(value === 'soft' ? 'touchSoft' : 'disabled')}
      </label>)}
      <button className="button button-secondary touch-preview" type="button" onClick={() => setPreview(key => key + 1)}>
        {t('previewTouch')}{effect === 'soft' && preview > 0 && <TouchBurst key={preview} />}
      </button>
      {failed && <p role="alert">{t('profileError')}</p>}
      <div className="panel-actions">
        <button className="button button-primary" type="submit" disabled={saving}>{t('saveSettings')}</button>
        <button className="button button-secondary" type="button" onClick={close} disabled={saving}>{t('cancel')}</button>
      </div>
    </form>
  </dialog>;
}

export function ProfilePage({ own, id, model, friends, navigate, edit }: {
  own: boolean; id?: string; model: ReturnType<typeof useProfile>; friends: Friends; navigate: Navigate; edit: () => void;
}) {
  const { t } = useTranslation();
  const [visited, setVisited] = useState<PublicProfile | null>();
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);

  useEffect(() => {
    if (!id || own) return;
    const controller = new AbortController();
    void fetchPublicProfile(id, controller.signal).then(next => {
      if (!controller.signal.aborted) setVisited(next);
    }).catch(() => { if (!controller.signal.aborted) setVisited(null); });
    return () => controller.abort();
  }, [id, own]);

  const profile = own ? model.profile : visited;
  const loading = own ? model.status === 'loading' : visited === undefined;
  const shareUrl = profile ? new URL(routeHref('/profiles/' + profile.id), location.origin).href : '';
  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setShowLink(true);
    }
  }

  return (
    <div className="site-width subpage profile-page">
      <BackLink fallback="/games" fallbackLabel="backToGames" navigate={navigate} />
      <section className="profile-banner surface">
        <div className="profile-identity">
          {profile && <img className="profile-avatar" src={avatars[profile.avatar]} alt="" width="80" height="80" />}
          <div>
            <p className="profile-kicker">{t(own ? 'myProfile' : 'publicProfile')}</p>
            <h1 tabIndex={-1}>{profile?.name ?? t(!own && !apiAvailable ? 'userProfilesUnavailable' : loading ? 'profileLoading' : own ? 'profilePrompt' : 'profileMissing')}</h1>
            {own && !apiAvailable && <p className="muted">{t('browserProfileNotice')}</p>}
            {profile && apiAvailable && <div className="profile-progress">
              <p className="profile-level">{t('levelValue', { level: profile.level })} <span>{t('totalPlayTime')} {formatPlayTime(profile.totalSeconds)}</span></p>
              <progress aria-label={t('levelProgress')} max={secondsPerLevel} value={profile.totalSeconds % secondsPerLevel} />
            </div>}
          </div>
        </div>
        {own && !loading && <div className="panel-actions">
          <button type="button" className="button button-primary" onClick={edit}>{t(profile ? 'editName' : 'saveName')}</button>
          {profile && apiAvailable && <button type="button" className="button button-secondary" onClick={() => setAvatarOpen(true)}>{t('chooseAvatar')}</button>}
          {profile && <button type="button" className="button button-secondary" onClick={() => setTouchOpen(true)}>{t('touchEffects')}</button>}
          {profile && apiAvailable && <button type="button" className="button button-secondary" onClick={() => void share()}>
            {t(copied ? 'copied' : 'shareProfile')}
          </button>}
          {apiAvailable && <RouteLink className="button button-secondary" href="/friends" navigate={navigate}>{t('manageFriends')}
            {friends.incoming.length > 0 && <span className="lobby-count" aria-label={t('incomingFriends')}>{friends.incoming.length}</span>}
          </RouteLink>}
        </div>}
        {!own && profile && <div className="panel-actions"><FriendButton id={profile.id} model={friends} /></div>}
        {showLink && <input aria-label={t('shareProfile')} readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} />}
      </section>
      {own && profile && touchOpen && <TouchEffectDialog selected={profile.touchEffect ?? 'soft'} save={touchEffect => model.setPreferences({ touchEffect })}
        close={() => setTouchOpen(false)} />}
      {profile && apiAvailable && (
        <>
          {own && avatarOpen && <AvatarDialog profile={profile} save={model.setPreferences} close={() => setAvatarOpen(false)} />}
          <section className="surface stat-card profile-favorites">
            <h2>{t('favorites')}</h2>
            {profile.favorites.length === 0 ? <p>{t('emptyFavorites')}</p> : (
              <ul>{profile.favorites.map(game => (
                <li key={game}><RouteLink href={gamePath(game)} navigate={navigate}>
                  <img alt="" src={games[game].art} width="80" height="52" />
                  <strong>{t(game)}</strong>
                </RouteLink></li>
              ))}</ul>
            )}
          </section>
          <GameHistory profile={profile} />
        </>
      )}
    </div>
  );
}
