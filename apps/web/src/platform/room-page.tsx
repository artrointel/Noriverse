import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import { oppositeStone, sideLabel } from '../games/table.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { apiAvailable } from '../network/api.ts';
import type { ProfileSummary } from '../../../../packages/protocol/profile.ts';
import { games } from './game-catalog.ts';
import { avatars } from './avatars.ts';
import { FriendButton } from './friends.tsx';
import type { Friends } from './friends.tsx';
import { gamePath, routeHref, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

type Room = ReturnType<typeof useRoomBoard>;

export function RoomPage({ room, friends, ownProfile, invite, navigate, onPlay }: {
  room: Room; friends: Friends; ownProfile?: ProfileSummary; invite: string; navigate: Navigate; onPlay: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(() => invite.trim().toUpperCase().slice(0, 8));
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const activeGame = room.matchId ? room.game : 'omok';
  const shareUrl = new URL(routeHref(room.code ? '/room?room=' + room.code : '/room'), location.origin);
  const connected = room.state === 'connected';
  const participants = room.participants.length ? room.participants : (['host', 'guest'] as const)
    .filter(role => room.role === role || connected).map(role => ({ role, profile: undefined }));

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(shareUrl.href);
      setCopyState('copied');
    } catch {
      setCopyState('manual');
    }
  }

  return (
    <div className="site-width subpage">
      <RouteLink href="/games" navigate={navigate} className="back-link">{t('backToGames')}</RouteLink>
      <div className="setup-layout">
        <section className="surface setup-form room-page">
          <h1 tabIndex={-1}>{t(room.code ? 'room' : 'joinRoom')}</h1>
          {room.code ? (
            <>
              <p className="muted">{t('inviteHelp')}</p>
              {activeGame === 'omok' && (room.role === 'host' || connected) && <span className="match-rule">{t(room.allowDoubleThree ? 'allow33' : 'ban33')}</span>}
              <div className="invite-code">
                <div><span>{t('code')}</span><code>{room.code}</code></div>
                <button type="button" className="button button-secondary" onClick={() => void copyInvite()}>
                  {t(copyState === 'copied' ? 'copied' : 'copy')}
                </button>
              </div>
              {copyState === 'manual' && <input aria-label={t('link')} readOnly value={shareUrl.href} onFocus={event => event.currentTarget.select()} />}
              <section className="room-participants" aria-label={t('participants')}>
                <h2>{t('participants')} <small>{participants.length}/2</small></h2>
                <ul className="people-list">{participants.map(({ role, profile }) => {
                  const color = role === 'host' ? room.hostColor : oppositeStone(room.hostColor);
                  const own = room.role === role;
                  const participant = profile ?? (own ? ownProfile : undefined);
                  const seatInfo = [t(role), t(sideLabel(activeGame, color)), own ? t('me') : undefined,
                    participant ? t('levelValue', { level: participant.level }) : undefined].filter(Boolean).join(' · ');
                  return (
                    <li key={role}>
                      {participant ? <>
                        <RouteLink className="person-link" href={own ? '/profile' : '/profiles/' + participant.id} navigate={navigate}>
                          <img src={avatars[participant.avatar]} width="38" height="38" alt="" />
                          <span><strong>{participant.name}</strong><small>{seatInfo}</small></span>
                        </RouteLink>
                        {!own && <FriendButton id={participant.id} model={friends} />}
                      </> : <div className="person-link">
                        <span className={'stone stone-' + (sideLabel(activeGame, color) === 'black' ? 0 : 1)} aria-hidden="true" />
                        <span><strong>{t('anonymousPlayer')}</strong><small>{seatInfo}</small></span>
                      </div>}
                    </li>
                  );
                })}</ul>
              </section>
              {room.state && <p className="connection" role="status">{t(connected && room.role === 'guest' && !room.started ? 'waitingStart' : room.state)}</p>}
              <div className="panel-actions">
                {connected && (room.started || room.role === 'host') && (
                  <button type="button" className="button button-primary" onClick={onPlay}>{t(room.finishedAt ? 'resultTitle' : room.started ? 'resume' : 'start')}</button>
                )}
                {(room.state === 'failed' || room.state === 'disconnected') && (
                  <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>
                )}
                <button type="button" className="button button-secondary" onClick={() => { room.leave(); setCopyState('idle'); }}>{t('leave')}</button>
              </div>
            </>
          ) : !apiAvailable ? <p className="muted">{t('roomUnavailable')}</p> : (
            <>
              <p className="muted">{t('codeHint')}</p>
              <form className="room-form" onSubmit={event => { event.preventDefault(); room.join(code); }}>
                <label htmlFor="room-code">{t('code')}</label>
                <div>
                  <input id="room-code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
                    value={code} maxLength={8} onChange={event => setCode(event.target.value.trim().toUpperCase())} />
                  <button type="submit" className="button button-primary" disabled={!roomCodePattern.test(code) || room.state === 'joining'}>{t('join')}</button>
                </div>
              </form>
              {room.state && <p className="connection" role="status">{t(room.state)}</p>}
              <RouteLink href={gamePath('omok', 'setup', 'online')} navigate={navigate} className="button button-secondary">{t('newRoom')}</RouteLink>
            </>
          )}
        </section>
        <aside className="surface setup-summary">
          <img src={games[activeGame].art} alt="" width="880" height="587" />
          <div><h2>{t(activeGame)}</h2><p>{t(games[activeGame].description)}</p></div>
        </aside>
      </div>
    </div>
  );
}
