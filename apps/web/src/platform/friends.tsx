import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { ProfileSummary } from '../../../../packages/protocol/profile.ts';
import { apiAvailable, apiFetch } from '../network/api.ts';
import { avatars } from './avatars.ts';
import { RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

const endpoint = '/api/profiles/me/friends';

export function useFriends(owner: string | undefined, active: boolean) {
  const [friends, setFriends] = useState<ProfileSummary[]>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  async function load(request: number, signal?: AbortSignal) {
    const response = await apiFetch(endpoint, { signal });
    if (!response.ok) throw new Error('Friends unavailable');
    const list = await response.json() as ProfileSummary[];
    if (request === revision.current && !signal?.aborted) setFriends(list);
  }

  useEffect(() => {
    if (!owner || !active || !apiAvailable) return;
    const version = ++revision.current;
    const controller = new AbortController();
    setFailed(false);
    void load(version, controller.signal).catch(() => {
      if (!controller.signal.aborted && revision.current === version) setFailed(true);
    });
    return () => controller.abort();
  }, [owner, active]);

  async function change(id: string, added: boolean) {
    if (!owner || !apiAvailable || owner === id || busy) return false;
    setBusy(true);
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, added }),
      });
      if (!response.ok) return false;
      await load(++revision.current);
      setFailed(false);
      return true;
    } catch { return false; }
    finally { setBusy(false); }
  }

  return { owner, friends, failed, busy, change };
}

export type Friends = ReturnType<typeof useFriends>;

export function FriendButton({ id, model }: { id: string; model: Friends }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (!apiAvailable || !model.owner || model.owner === id || !model.friends) return null;
  const added = model.friends.some(friend => friend.id === id);
  return <>
    <button type="button" className="button button-secondary" disabled={model.busy} onClick={async () => {
      setFailed(!await model.change(id, !added));
    }}>{t(added ? 'removeFriend' : 'addFriend')}</button>
    {failed && <small role="alert">{t('friendError')}</small>}
  </>;
}

function profileIdFromInput(input: string) {
  const value = input.trim();
  if (profileIdPattern.test(value)) return value;
  try {
    const url = new URL(value, location.href);
    const path = url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname;
    if (url.origin === location.origin) return path.match(/(?:^|\/)profiles\/([^/]+)\/?$/)?.[1];
  } catch { /* The form displays an invalid link message. */ }
}

export function FriendsPage({ model, navigate, openProfile }: { model: Friends; navigate: Navigate; openProfile: () => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [failed, setFailed] = useState(false);
  return <div className="site-width subpage friends-page">
    <RouteLink className="back-link" href="/profile" navigate={navigate}>{t('myProfile')}</RouteLink>
    <section className="surface stat-card friends-panel">
      <h1 tabIndex={-1}>{t('friends')}</h1>
      {!apiAvailable ? <p>{t('friendsUnavailable')}</p> : !model.owner ? <>
        <p>{t('friendsNeedProfile')}</p>
        <button className="button button-primary" type="button" onClick={openProfile}>{t('saveName')}</button>
      </> : <>
        <form className="room-form" onSubmit={async event => {
          event.preventDefault();
          const id = profileIdFromInput(input);
          const saved = Boolean(id && profileIdPattern.test(id) && await model.change(id, true));
          setFailed(!saved);
          if (saved) setInput('');
        }}>
          <label htmlFor="friend-link">{t('friendLink')}</label>
          <div><input id="friend-link" required value={input} maxLength={300} onChange={event => setInput(event.target.value)} />
            <button className="button button-primary" disabled={model.busy} type="submit">{t('addFriend')}</button></div>
          {failed && <p role="alert">{t('friendError')}</p>}
        </form>
        {model.failed ? <p role="alert">{t('friendsUnavailable')}</p> : !model.friends ? <p role="status">{t('profileLoading')}</p>
          : model.friends.length === 0 ? <p>{t('emptyFriends')}</p> : <ul className="people-list">
            {[...model.friends].sort((a, b) => a.name.localeCompare(b.name)).map(friend => <li key={friend.id}>
              <RouteLink className="person-link" href={'/profiles/' + friend.id} navigate={navigate}>
                <img src={avatars[friend.avatar]} width="42" height="42" alt="" />
                <span><strong>{friend.name}</strong><small>{t('levelValue', { level: friend.level })}</small></span>
              </RouteLink>
              <FriendButton id={friend.id} model={model} />
            </li>)}
          </ul>}
      </>}
    </section>
  </div>;
}
