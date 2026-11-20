import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { games } from './game-catalog.ts';
import { gamePath, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

type Room = ReturnType<typeof useRoomBoard>;

export function RoomPage({ room, invite, navigate, onPlay }: {
  room: Room; invite: string; navigate: Navigate; onPlay: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(() => invite.trim().toUpperCase().slice(0, 8));
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const shareUrl = new URL('/room', location.origin);
  if (room.code) shareUrl.searchParams.set('room', room.code);
  const connected = room.state === 'connected';

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
              {(room.role === 'host' || connected) && <span className="match-rule">{t(room.allowDoubleThree ? 'allow33' : 'ban33')}</span>}
              <div className="invite-code">
                <div><span>{t('code')}</span><code>{room.code}</code></div>
                <button type="button" className="button button-secondary" onClick={() => void copyInvite()}>
                  {t(copyState === 'copied' ? 'copied' : 'copy')}
                </button>
              </div>
              {copyState === 'manual' && <input aria-label={t('link')} readOnly value={shareUrl.href} onFocus={event => event.currentTarget.select()} />}
              <div className="seats">
                {(['host', 'guest'] as const).map((role, index) => {
                  const occupied = room.role === role || connected || (role === 'host' && room.role === 'guest' && room.state === 'connecting');
                  return (
                    <div className="seat" key={role}>
                      <span className={'stone stone-' + index} aria-hidden="true" />
                      <div><strong>{t(role)}</strong><small>{t(room.role === role ? 'me' : occupied ? (index === 0 ? 'black' : 'white') : 'openSeat')}</small></div>
                    </div>
                  );
                })}
              </div>
              {room.state && <p className="connection" role="status">{t(connected && room.role === 'guest' && !room.started ? 'waitingStart' : room.state)}</p>}
              <div className="panel-actions">
                {connected && (room.started || room.role === 'host') && (
                  <button type="button" className="button button-primary" onClick={onPlay}>{t(room.started ? 'resume' : 'start')}</button>
                )}
                {(room.state === 'failed' || room.state === 'disconnected') && (
                  <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>
                )}
                <button type="button" className="button button-secondary" onClick={() => { room.leave(); setCopyState('idle'); }}>{t('leave')}</button>
              </div>
            </>
          ) : (
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
          <img src={games.omok.art} alt="" width="880" height="587" />
          <div><h2>{t('omok')}</h2><p>{t(games.omok.description)}</p></div>
        </aside>
      </div>
    </div>
  );
}
