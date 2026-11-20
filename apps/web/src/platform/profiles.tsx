import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readName } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, PublicProfile } from '../../../../packages/protocol/profile.ts';
import { RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

export function useProfile() {
  const [profile, setProfile] = useState<PublicProfile>();
  const [status, setStatus] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/profiles/me', { signal: controller.signal }).then(async response => {
      if (controller.signal.aborted) return;
      if (response.status === 404) {
        setStatus('missing');
      } else if (response.ok) {
        const next = await response.json() as PublicProfile;
        if (!controller.signal.aborted) {
          setProfile(next);
          setStatus('ready');
        }
      } else setStatus('error');
    }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, []);

  async function saveName(name: string) {
    const response = await fetch('/api/profiles/me', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error();
    setProfile(await response.json() as PublicProfile);
    setStatus('ready');
  }

  const record = useCallback(async (match: MatchReport) => {
    try {
      const response = await fetch('/api/profiles/me/matches', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(match), keepalive: true,
      });
      if (!response.ok) return false;
      const next = await response.json() as PublicProfile;
      setProfile(current => current?.id === next.id && current.xp <= next.xp ? { ...next, name: current.name } : current);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { profile, status, saveName, record };
}

export function NameDialog({ name, close, save }: {
  name?: string; close: () => void; save: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const element = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(name ?? '');
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
        <p className="muted">{t('profileNotice')}</p>
        <label htmlFor="profile-name">{t('displayName')}</label>
        <input id="profile-name" value={value} onChange={event => setValue(event.target.value)}
          placeholder={t('namePlaceholder')} autoComplete="nickname" maxLength={24} autoFocus required />
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

export function ProfilePage({ own, id, model, navigate, edit }: {
  own: boolean; id?: string; model: ReturnType<typeof useProfile>; navigate: Navigate; edit: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [visited, setVisited] = useState<PublicProfile | null>();
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    if (!id || own) return;
    const controller = new AbortController();
    void fetch('/api/profiles/' + id, { signal: controller.signal }).then(async response => {
      const next = response.ok ? await response.json() as PublicProfile : null;
      if (!controller.signal.aborted) setVisited(next);
    }).catch(() => { if (!controller.signal.aborted) setVisited(null); });
    return () => controller.abort();
  }, [id, own]);

  const profile = own ? model.profile : visited;
  const loading = own ? model.status === 'loading' : visited === undefined;
  const shareUrl = profile ? new URL('/profiles/' + profile.id, location.origin).href : '';
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
      <RouteLink className="back-link" href="/games" navigate={navigate}>{t('backToGames')}</RouteLink>
      <section className="profile-banner surface">
        <div>
          <p className="profile-kicker">{t(own ? 'myProfile' : 'publicProfile')}</p>
          <h1 tabIndex={-1}>{profile?.name ?? t(loading ? 'profileLoading' : own ? 'profilePrompt' : 'profileMissing')}</h1>
          {profile && <p className="profile-level">{t('levelValue', { level: profile.level })} <span>{profile.xp} XP</span></p>}
        </div>
        {own && !loading && <div className="panel-actions">
          <button type="button" className="button button-primary" onClick={edit}>{t(profile ? 'editName' : 'saveName')}</button>
          {profile && <button type="button" className="button button-secondary" onClick={() => void share()}>
            {t(copied ? 'copied' : 'shareProfile')}
          </button>}
        </div>}
        {showLink && <input aria-label={t('shareProfile')} readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} />}
      </section>
      {profile && (
        <>
          <div className="profile-stats">
            {(['omok', 'physics'] as const).map(game => (
              <section className="surface stat-card" key={game}>
                <h2>{t(game)}</h2>
                <strong>{t('recordScore', { ...profile.games[game] })}</strong>
                <p>{t('playTime')} <span>{formatPlayTime(profile.games[game].seconds)}</span></p>
              </section>
            ))}
          </div>
          <section className="surface stat-card history-card">
            <h2>{t('recentMatches')}</h2>
            <p className="muted">{t('recordSource')}</p>
            {!profile.recent.length ? <p>{t('emptyHistory')}</p> : (
              <ul>{profile.recent.map(match => (
                <li key={match.id}>
                  <div><strong>{t(match.game)}</strong><span>{t(match.mode)} · {formatPlayTime(match.seconds)}</span></div>
                  <div><strong>{t('outcome_' + match.outcome)}</strong>
                    <time dateTime={new Date(match.playedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.resolvedLanguage).format(match.playedAt)}</time></div>
                </li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
