import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { FriendAction, FriendList, FriendRoom, FriendSummary } from '../../../../packages/protocol/profile.ts';
import type { ReactNode } from 'react';
import { apiAvailable, apiFetch } from '../network/api.ts';
import { Avatar } from './avatar.tsx';
import { games } from './game-catalog.ts';
import { socialChangeEvent } from './invitations.tsx';
import { BackLink, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

const endpoint = '/api/profiles/me/social';

export function useFriends(owner: string | undefined, presence: boolean, watchRequests = false) {
  const [snapshot, setSnapshot] = useState<{ owner: string; list: FriendList }>();
  const list = snapshot?.owner === owner ? snapshot?.list : undefined;
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);

  async function load(request: number, signal?: AbortSignal) {
    const response = await apiFetch(endpoint + (presence ? '?presence=1' : ''), { signal });
    if (!response.ok) throw new Error('Friends unavailable');
    const list = await response.json() as FriendList;
    if (owner && request === revision.current && !signal?.aborted) setSnapshot({ owner, list });
  }

  useEffect(() => {
    if (!owner || !apiAvailable) return;
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
    const timer = presence || watchRequests ? window.setInterval(visibleRefresh, 15_000) : undefined;
    window.addEventListener(socialChangeEvent, refresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener(socialChangeEvent, refresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [owner, presence, watchRequests]);

  async function change(id: string, action: FriendAction) {
    if (!owner || !apiAvailable || owner === id || busy) return false;
    setBusy(true);
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }),
      });
      if (!response.ok) return false;
      await load(++revision.current);
      setFailed(false);
      return true;
    } catch { return false; }
    finally { setBusy(false); }
  }

  return { owner, friends: list?.friends, incoming: list?.incoming ?? [], outgoing: list?.outgoing ?? [], failed, busy, change };
}

export type Friends = ReturnType<typeof useFriends>;

export function FriendRequestToast({ model, navigate, enabled }: { model: Friends; navigate: Navigate; enabled: boolean }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [failedId, setFailedId] = useState<string>();
  const request = enabled ? model.incoming.find(friend => !dismissed.includes(friend.id)) : undefined;
  const id = request?.id;
  useEffect(() => {
    setDismissed(previous => {
      const pending = previous.filter(id => model.incoming.some(friend => friend.id === id));
      return pending.length === previous.length ? previous : pending;
    });
  }, [model.incoming]);
  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(() => setDismissed(previous => [...previous, id]), 10_000);
    return () => window.clearTimeout(timer);
  }, [id]);
  if (!request) return null;
  return <aside className="friend-request-toast surface" aria-label={t('friendRequests')}>
    <Avatar appearance={request} size={36} />
    <div>
      <p role="status">{t('friendRequestReceived', { player: request.name })}</p>
      <div className="friend-request-actions">
        <button className="button button-primary" type="button" disabled={model.busy}
          onClick={async () => setFailedId(await model.change(request.id, 'accept') ? undefined : request.id)}>{t('acceptFriend')}</button>
        <RouteLink href="/friends" navigate={navigate}>{t('reviewFriendRequests')}</RouteLink>
      </div>
      {failedId === request.id && <small role="alert">{t('friendError')}</small>}
    </div>
    <button className="settings-close" type="button" aria-label={t('close')} onClick={() => setDismissed(previous => [...previous, request.id])}><span aria-hidden="true" /></button>
  </aside>;
}

function FriendGroups({ friends, navigate, action }: { friends: FriendSummary[]; navigate: Navigate; action: (friend: FriendSummary) => ReactNode }) {
  const { t } = useTranslation();
  return <div className="friend-groups">{[true, false].map(online => {
    const group = friends.filter(friend => Boolean(friend.online) === online).sort((a, b) => a.name.localeCompare(b.name));
    return <details key={String(online)} className="friend-group" open={online || undefined}>
      <summary><i className="presence-dot" data-online={online} />{t(online ? 'friendOnline' : 'friendOffline')} <small>{group.length}</small></summary>
      {group.length ? <ul className="people-list">{group.map(friend => <li key={friend.id}>
        <RouteLink className="person-link" href={'/profiles/' + friend.id} navigate={navigate}>
          <Avatar appearance={friend} size={42} />
          <span><strong>{friend.name}</strong><small>{t('levelValue', { level: friend.level })}</small></span>
        </RouteLink>
        {action(friend)}
      </li>)}</ul> : <p className="muted">{t(online ? 'emptyOnline' : 'emptyOffline')}</p>}
    </details>;
  })}</div>;
}

export function InviteDialog({ owner, navigate, invite, close }: { owner: string | undefined; navigate: Navigate; invite: (id: string) => Promise<boolean>; close: () => void }) {
  const { t } = useTranslation();
  const model = useFriends(owner, true);
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

export function FriendButton({ id, model, allowRemoval = false }: { id: string; model: Friends; allowRemoval?: boolean }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  if (!apiAvailable || !model.owner || model.owner === id || !model.friends) return null;
  const added = model.friends.some(friend => friend.id === id);
  if (added && !allowRemoval) return null;
  const received = model.incoming.some(friend => friend.id === id);
  const sent = model.outgoing.some(friend => friend.id === id);
  return <>
    <button type="button" className={'button ' + (received ? 'button-primary' : 'button-secondary')} disabled={model.busy} onClick={async () => {
      setFailed(!await model.change(id, added ? 'remove' : received ? 'accept' : sent ? 'cancel' : 'request'));
    }}>{t(added ? 'removeFriend' : received ? 'acceptFriend' : sent ? 'cancelFriend' : 'addFriend')}</button>
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

export function FriendsPage({ model, navigate, openProfile, follow }: { model: Friends; navigate: Navigate; openProfile: () => void; follow: (room: FriendRoom) => void }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
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
    <BackLink fallback="/profile" fallbackLabel="myProfile" navigate={navigate} />
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
          const saved = Boolean(id && profileIdPattern.test(id) && await model.change(id, 'request'));
          setFailed(!saved);
          setSent(saved);
          if (saved) setInput('');
        }}>
          <label htmlFor="friend-link">{t('friendLink')}</label>
          <div><input id="friend-link" required value={input} maxLength={300} onChange={event => setInput(event.target.value)} />
            <button className="button button-primary" disabled={model.busy} type="submit">{t('addFriend')}</button></div>
          {failed && <p role="alert">{t('friendError')}</p>}
          {sent && <p role="status">{t('friendRequestSent')}</p>}
        </form>
        {(model.friends || model.incoming.length > 0 || model.outgoing.length > 0) && <section className="friend-requests" aria-label={t('friendRequests')}>
          {(['incoming', 'outgoing'] as const).map(group => (group === 'incoming' || model[group].length > 0) && <div key={group}>
            <h2>{t(group === 'incoming' ? 'incomingFriends' : 'outgoingFriends')}</h2>
            {model[group].length === 0 ? <p className="muted">{t('emptyIncomingFriends')}</p> : <ul className="people-list">{model[group].map(profile => <li key={profile.id}>
              <RouteLink href={'/profiles/' + profile.id} navigate={navigate} className="person-link">
                <Avatar appearance={profile} size={38} /><strong>{profile.name}</strong>
              </RouteLink>
              <div className="panel-actions">{(group === 'incoming' ? ['accept', 'decline'] as const : ['cancel'] as const).map(action => <button
                key={action} className={'button ' + (action === 'accept' ? 'button-primary' : 'button-secondary')} type="button" disabled={model.busy}
                onClick={async () => setActionFailed(!await model.change(profile.id, action))}>
                {t(action === 'accept' ? 'acceptFriend' : action === 'decline' ? 'declineFriend' : 'cancelFriend')}</button>)}</div>
            </li>)}</ul>}
          </div>)}
          {actionFailed && <p role="alert">{t('friendError')}</p>}
        </section>}
        {model.failed ? <p role="alert">{t('friendsUnavailable')}</p> : !model.friends ? <p role="status">{t('profileLoading')}</p>
          : model.friends.length === 0 ? <p>{t('emptyFriends')}</p>
          : <FriendGroups friends={model.friends} navigate={navigate} action={friend => <div className="friend-actions">
            {friend.room && <div className="friend-room"><span>{t(friend.room.game)}</span>
              <button type="button" className="button button-primary" disabled={!friend.room.joinable} onClick={() => { if (friend.room) follow(friend.room); }}>
                {t(friend.room.joinable ? 'followFriend' : 'friendRoomFull')}</button></div>}
            <FriendButton id={friend.id} model={model} allowRemoval />
          </div>} />}
      </>}
    </section>
  </div>;
}
