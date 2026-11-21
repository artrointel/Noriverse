import { useEffect, useEffectEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { PresenceMode } from '../../../../packages/protocol/profile.ts';
import { readInvite } from '../../../../packages/protocol/rooms.ts';
import type { RoomInvite } from '../../../../packages/protocol/rooms.ts';
import { apiAvailable, apiFetch, apiUrl } from '../network/api.ts';
import { readEarnedBadge } from '../../../../packages/protocol/badges.ts';
import type { BadgeId, EarnedBadge } from '../../../../packages/protocol/badges.ts';
import { badgeCopy, badgeImage } from './profile-badges.tsx';

const readEndpoint = '/api/profiles/me/invites/read';
export const socialChangeEvent = 'noriverse:friends-changed';

export function useInvitations(profile: string | undefined, presence: PresenceMode, onPresence: (id: string, presence: PresenceMode) => void,
  onBadges: (id: string, badges: EarnedBadge[]) => void) {
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const updatePresence = useEffectEvent(onPresence);
  const updateBadges = useEffectEvent(onBadges);
  useEffect(() => {
    if (!profile || !apiAvailable) return;
    const id = profile;
    const controller = new AbortController();
    let socket: WebSocket | undefined;
    let retry: number | undefined;
    let ping: number | undefined;
    let delay = 1000;
    let paused = !navigator.onLine;
    let connecting = false;

    function reconnect() {
      window.clearInterval(ping);
      if (controller.signal.aborted || paused) return;
      retry = window.setTimeout(() => void connect(), delay);
      delay = Math.min(30_000, delay * 2);
    }

    async function connect() {
      if (paused || connecting || socket || controller.signal.aborted) return;
      connecting = true;
      try {
        const response = await apiFetch('/api/profiles/me/presence', { method: 'POST', signal: controller.signal });
        if (response.status === 404 || response.status === 401) return;
        if (!response.ok) throw new Error('Presence unavailable');
        const { ticket } = await response.json() as { ticket?: string };
        if (controller.signal.aborted || paused || !ticket || !profileIdPattern.test(ticket)) return;
        const url = apiUrl('/api/presence/' + id);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.searchParams.set('ticket', ticket);
        const connection = new WebSocket(url);
        socket = connection;
        connection.onopen = () => {
          delay = 1000;
          const heartbeat = () => { if (connection.readyState === WebSocket.OPEN) connection.send('ping'); };
          heartbeat();
          ping = window.setInterval(heartbeat, 8000);
          window.dispatchEvent(new Event(socialChangeEvent));
        };
        connection.onclose = () => {
          if (socket !== connection) return;
          socket = undefined;
          reconnect();
        };
        connection.onmessage = event => {
          if (controller.signal.aborted || typeof event.data !== 'string' || event.data === 'pong') return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'friends-changed') { window.dispatchEvent(new Event(socialChangeEvent)); return; }
            if (message.type === 'badges-earned' && Array.isArray(message.badges)) {
              updateBadges(id, (message.badges as unknown[]).map(readEarnedBadge).filter(badge => badge !== undefined));
              return;
            }
            if (message.type === 'presence-mode' && (message.presence === 'offline' || message.presence === 'online')) {
              updatePresence(id, message.presence);
              return;
            }
            if (message.type !== 'invites' || !Array.isArray(message.invites)) return;
            const valid = message.invites.map(readInvite).filter((invite: RoomInvite | undefined): invite is RoomInvite => !!invite && invite.expires > Date.now());
            setInvites(valid);
          } catch { /* Ignore malformed notifications. */ }
        };
      } catch { reconnect(); }
      finally { connecting = false; }
    }

    function suspend() {
      paused = true;
      window.clearTimeout(retry);
      window.clearInterval(ping);
      const previous = socket;
      socket = undefined;
      previous?.close();
    }
    function resume() {
      paused = !navigator.onLine;
      window.clearTimeout(retry);
      void connect();
    }
    void connect();
    window.addEventListener('offline', suspend);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      controller.abort();
      suspend();
      window.removeEventListener('offline', suspend);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
    };
  }, [profile]);

  useEffect(() => {
    if (!invites.length) return;
    const expires = Math.min(...invites.map(invite => invite.expires));
    const timeout = window.setTimeout(() => setInvites(current => current.filter(invite => invite.expires > Date.now())), Math.max(1, expires - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [invites]);

  function dismiss(invite: RoomInvite) {
    setInvites(current => current.filter(item => item.id !== invite.id));
    void apiFetch(readEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: invite.id }), keepalive: true,
    }).catch(() => { /* Server may re-deliver after reconnect. */ });
  }

  return { invites: profile && presence === 'online' ? invites : [], dismiss };
}

export function NotificationToasts({ model, accept, badges, dismissBadge, openBadges }: {
  model: ReturnType<typeof useInvitations>; accept: (invite: RoomInvite) => void;
  badges: EarnedBadge[]; dismissBadge: (id: BadgeId) => void; openBadges: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [fullscreen, setFullscreen] = useState<Element | null>(document.fullscreenElement);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!model.invites.length && !badges.length) return null;
  const toast = <aside className="invite-toasts" aria-label={t('notifications')} aria-live="polite">
    {badges.slice(0, 2).map(badge => <div className="surface invite-toast badge-toast" key={badge.id}>
      <button className="invite-toast-content" type="button" onClick={() => { dismissBadge(badge.id); openBadges(); }}>
        <img src={badgeImage(badge.id)} width="47" height="47" alt="" />
        <span><small>{t('badgeUnlocked')}</small><strong>{badgeCopy(badge.id, i18n.resolvedLanguage)[0]}</strong></span>
      </button>
      <button className="settings-close" type="button" aria-label={t('close')} onClick={() => dismissBadge(badge.id)}><span aria-hidden="true" /></button>
    </div>)}
    {model.invites.slice(0, Math.max(1, 3 - badges.length)).map(invite => <div className="surface invite-toast" key={invite.id}>
      <button className="invite-toast-content" type="button" onClick={() => { model.dismiss(invite); accept(invite); }}>
        <strong>{t('inviteMessage', { player: invite.name, game: t(invite.game) })}</strong>
        <small>{t('acceptInvite')}</small>
      </button>
      <button className="settings-close" type="button" aria-label={t('dismissInvite')} onClick={() => model.dismiss(invite)}><span aria-hidden="true" /></button>
    </div>)}
  </aside>;
  return fullscreen ? createPortal(toast, fullscreen) : toast;
}
