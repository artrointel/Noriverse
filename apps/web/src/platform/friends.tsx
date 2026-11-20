import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { FriendSummary } from '../../../../packages/protocol/profile.ts';
import type { ReactNode } from 'react';
import { apiAvailable, apiFetch } from '../network/api.ts';
import { avatars } from './avatars.ts';
import { RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

const endpoint = '/api/profiles/me/friends';

export function useFriends(owner: string | undefined, active: boolean, presence: boolean) {
  const [friends, setFriends] = useState<FriendSummary[]>();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  async function load(request: number, signal?: AbortSignal) {
    const response = await apiFetch(endpoint + (presence ? '?presence=1' : ''), { signal });
    if (!response.ok) throw new Error('Friends unavailable');
    const list = await response.json() as FriendSummary[];
    if (request === revision.current && !signal?.aborted) setFriends(list);
  }

  useEffect(() => {
    if (!owner || !active || !apiAvailable) return;
    const controller = new AbortController();
    function refresh() {
      const version = ++revision.current;
      void load(version, controller.signal).then(() => {
        if (!controller.signal.aborted && revision.current === version) setFailed(false);
      }).catch(() => {
        if (!controller.signal.aborted && revision.current === version) setFailed(true);
      });
    }
    const visibleRefresh = () => { if (!document.hidden) refresh(); };
    refresh();
    const timer = presence ? window.setInterval(visibleRefresh, 15_000) : undefined;
    if (presence) document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [owner, active, presence]);

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

function FriendGroups({ friends, navigate, action }: { friends: FriendSummary[]; navigate: Navigate; action: (friend: FriendSummary) => ReactNode }) {
  const { t } = useTranslation();
  return <div className="friend-groups">{[true, false].map(online => {
    const group = friends.filter(friend => Boolean(friend.online) === online).sort((a, b) => a.name.localeCompare(b.name));
    return <details key={String(online)} className="friend-group" open={online || undefined}>
      <summary><i className="presence-dot" data-online={online} />{t(online ? 'friendOnline' : 'friendOffline')} <small>{group.length}</small></summary>
      {group.length ? <ul className="people-list">{group.map(friend => <li key={friend.id}>
        <RouteLink className="person-link" href={'/profiles/' + friend.id} navigate={navigate}>
          <img src={avatars[friend.avatar]} width="42" height="42" alt="" />
          <span><strong>{friend.name}</strong><small>{t('levelValue', { level: friend.level })}</small></span>
        </RouteLink>
        {action(friend)}
      </li>)}</ul> : <p className="muted">{t(online ? 'emptyOnline' : 'emptyOffline')}</p>}
    </details>;
  })}</div>;
}

export function InviteDialog({ owner, navigate, invite, close }: { owner: string | undefined; navigate: Navigate; invite: (id: string) => Promise<boolean>; close: () => void }) {
  const { t } = useTranslation();
  const model = useFriends(owner, true, true);
  const dialog = useRef<HTMLDialogElement>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [sending, setSending] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog className="surface profile-dialog invite-dialog" ref={dialog} aria-labelledby="invite-dialog-title"
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="settings-heading"><h2 id="invite-dialog-title">{t('inviteFriend')}</h2>
      <button className="settings-close" type="button" aria-label={t('close')} onClick={close}><span aria-hidden="true" /></button>
    </div>
    {model.failed ? <p role="alert">{t('friendsUnavailable')}</p> : !model.friends ? <p role="status">{t('profileLoading')}</p>
      : model.friends.length === 0 ? <p>{t('emptyFriends')}</p>
      : <FriendGroups friends={model.friends} navigate={(destination, replace) => { close(); navigate(destination, replace); }} action={friend => {
        const complete = sent.includes(friend.id);
        return <button type="button" className="button button-secondary" disabled={Boolean(sending) || complete} onClick={async () => {
          setSending(friend.id);
          setFailed(false);
          if (await invite(friend.id)) setSent(current => [...current, friend.id]);
          else setFailed(true);
          setSending(undefined);
        }}>{t(complete ? 'inviteSent' : 'inviteFriend')}</button>;
      }} />}
    {failed && <p role="alert">{t('inviteError')}</p>}
  </dialog>;
}

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
  const [copiedId, setCopiedId] = useState<string>();
  const ownIdField = useRef<HTMLInputElement>(null);
  const owner = model.owner;

  async function copyOwnId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
    } catch {
      ownIdField.current?.focus();
      ownIdField.current?.select();
    }
  }

  return <div className="site-width subpage friends-page">
    <RouteLink className="back-link" href="/profile" navigate={navigate}>{t('myProfile')}</RouteLink>
    <section className="surface stat-card friends-panel">
      <h1 tabIndex={-1}>{t('friends')}</h1>
      {!apiAvailable ? <p>{t('friendsUnavailable')}</p> : !owner ? <>
        <p>{t('friendsNeedProfile')}</p>
        <button className="button button-primary" type="button" onClick={openProfile}>{t('saveName')}</button>
      </> : <>
        <div className="room-form share-profile-id">
          <label htmlFor="own-profile-id">{t('myProfileId')}</label>
          <div><input id="own-profile-id" ref={ownIdField} value={owner} readOnly onFocus={event => event.currentTarget.select()} />
            <button className="button button-secondary" type="button" onClick={() => void copyOwnId(owner)}>
              {t(copiedId === owner ? 'profileIdCopied' : 'copyProfileId')}
            </button></div>
          <small className="muted">{t('shareProfileId')}</small>
        </div>
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
          : model.friends.length === 0 ? <p>{t('emptyFriends')}</p>
          : <FriendGroups friends={model.friends} navigate={navigate} action={friend => <FriendButton id={friend.id} model={model} />} />}
      </>}
    </section>
  </div>;
}
