import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isRoomGame, roomCapacity, roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { RoomGame } from '../../../../packages/protocol/rooms.ts';
import { oppositeStone, sideLabel } from '../games/table.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { apiAvailable, apiFetch } from '../network/api.ts';
import { readGuestSeat, readRecentRooms } from '../network/guest-seat.ts';
import type { GuestRoom } from '../network/guest-seat.ts';
import type { ProfileSummary } from '../../../../packages/protocol/profile.ts';
import { gameIds, games } from './game-catalog.ts';
import { avatars } from './avatars.ts';
import { FriendButton, InviteDialog } from './friends.tsx';
import type { Friends } from './friends.tsx';
import { BackLink, routeHref, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { SichuanModePicker, SichuanSettingsFields } from './sichuan-settings.tsx';
import { GameSelectionGrid } from './catalog-pages.tsx';

type Room = ReturnType<typeof useRoomBoard>;

function RoomGamesDialog({ room, choices, participants, close }: { room: Room; choices: RoomGame[]; participants: number; close: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  return <dialog ref={dialog} className="surface profile-dialog room-games-dialog" aria-labelledby="room-games-title"
    onCancel={event => { event.preventDefault(); if (!room.changingGame) close(); }}>
    <button className="settings-close" type="button" aria-label={t('close')} disabled={room.changingGame} onClick={close}><span aria-hidden="true" /></button>
    <h2 id="room-games-title">{t('changeRoomGame')}</h2>
    <p className="muted">{t('roomGameChoices', { count: participants })}</p>
    {room.started && !room.finishedAt && <p className="muted">{t('changeLiveGame')}</p>}
    <GameSelectionGrid ids={choices} busy={room.changingGame} onSelect={async id => {
      if (!isRoomGame(id) || !choices.includes(id) || room.changingGame) return;
      setFailed(false);
      if (await room.changeGame(id)) close();
      else setFailed(true);
    }} />
    {room.changingGame && <p role="status">{t('loading')}</p>}
    {failed && <p role="alert">{t('changeGameError')}</p>}
  </dialog>;
}

export function RoomPage({ room, friends, ownProfile, invite, navigate, onPlay }: {
  room: Room; friends: Friends; ownProfile?: ProfileSummary; invite: string; navigate: Navigate; onPlay: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(() => invite.trim().toUpperCase().slice(0, 8));
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [recent, setRecent] = useState<GuestRoom[]>([]);
  const activeGame = room.matchId ? room.game : 'omok';
  const shareUrl = new URL(routeHref(room.code ? '/room?room=' + room.code : '/room'), location.origin);
  const connected = room.state === 'connected';
  const hasRoom = Boolean(room.code) && room.state !== 'closed' && room.state !== 'missing' && room.state !== 'full';
  const participants = (['host', 'guest'] as const).map(role => room.participants.find(participant => participant.role === role)
    ?? (room.role === role || connected ? { role, profile: undefined } : undefined)).filter(participant => participant !== undefined);
  const gameChoices = gameIds.filter(isRoomGame).filter(id => id !== activeGame && participants.length <= roomCapacity[id]);

  useEffect(() => {
    if (hasRoom || !apiAvailable) return;
    const candidates = readRecentRooms().map(({ code }) => ({ code, seat: readGuestSeat(code) }));
    if (!candidates.length) { setRecent([]); return; }
    const controller = new AbortController();
    let revision = 0;
    async function check() {
      const current = ++revision;
      try {
        const response = await apiFetch('/api/rooms/recent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidates), signal: controller.signal });
        const rooms: unknown = response.ok ? await response.json() : [];
        if (!controller.signal.aborted && current === revision) setRecent(Array.isArray(rooms) ? rooms.filter(room => room
          && candidates.some(candidate => candidate.code === room.code) && isRoomGame(room.game)) : []);
      } catch { if (!controller.signal.aborted && current === revision) setRecent([]); }
    }
    void check();
    const timer = window.setInterval(() => { if (!document.hidden) void check(); }, 12_000);
    document.addEventListener('visibilitychange', check);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [hasRoom, room.state]);

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
      <BackLink fallback="/games" fallbackLabel="backToGames" navigate={navigate} />
      <div className={hasRoom ? 'setup-layout' : 'setup-layout join-layout'}>
        <section className="surface setup-form room-page">
          <h1 tabIndex={-1}>{t(hasRoom ? 'room' : 'joinRoom')}</h1>
          {hasRoom ? (
            <>
              <p className="muted">{t('inviteHelp')}</p>
              {activeGame === 'omok' && (room.role === 'host' || connected) && <span className="match-rule">{t(room.allowDoubleThree ? 'allow33' : 'ban33')} · {t(room.overline)}</span>}
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
                  const participant = own ? ownProfile ?? profile : profile;
                  const seatInfo = [t(role), activeGame === 'sichuan' ? undefined : t(sideLabel(activeGame, color)), own ? t('me') : undefined,
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
              {room.puzzleConfig && <p className="match-rule">{t('sichuanMode_' + room.puzzleConfig.mode)} · {room.puzzleConfig.settings.size} × {room.puzzleConfig.settings.size}</p>}
              {room.role === 'host' && room.puzzleConfig && (!room.started || room.finishedAt > 0) &&
                <details className="room-games"><summary>{t('settings')}</summary>
                  <SichuanModePicker value={room.puzzleConfig.mode} change={mode => {
                    if (room.puzzleConfig) room.configurePuzzle({ ...room.puzzleConfig, mode });
                  }} />
                  <SichuanSettingsFields value={room.puzzleConfig.settings} change={settings => {
                    if (room.puzzleConfig) room.configurePuzzle({ ...room.puzzleConfig, settings });
                  }} />
                </details>}
              {room.state && <p className="connection" role="status">{t(connected && room.role === 'guest' && !room.started ? 'waitingStart' : room.state)}</p>}
              <div className="panel-actions">
                {room.role === 'host' && gameChoices.length > 0 && <button type="button" className="button button-secondary"
                  onClick={() => setGamesOpen(true)}>{t('changeRoomGame')}</button>}
                {room.role === 'host' && <button className="button button-secondary" type="button"
                  disabled={!friends.owner || participants.some(participant => participant.role === 'guest')}
                  onClick={() => setInviteOpen(true)}>{t('inviteFriend')}</button>}
                {connected && (room.started || room.role === 'host') && (
                  <button type="button" className="button button-primary" disabled={room.changingGame} onClick={onPlay}>{t(room.finishedAt ? 'resultTitle' : room.started ? 'resume' : 'start')}</button>
                )}
                {(room.state === 'failed' || room.state === 'disconnected') && (
                  <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>
                )}
              {room.rematchNotice === 'incoming' && <p role="status">{t('rematchIncoming')}</p>}
                <button type="button" className="button button-secondary" onClick={() => { room.leave(); setCopyState('idle'); setInviteOpen(false); }}>{t('leave')}</button>
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
              {recent.length > 0 && <section className="recent-rooms" aria-label={t('recentPlayableRooms')}>
                <h2>{t('recentPlayableRooms')}</h2>
                <ul className="people-list">{recent.map(item => <li key={item.code}>
                  <span><strong>{t(item.game)}</strong> <code>{item.code}</code></span>
                  <button type="button" className="button button-secondary" onClick={() => room.join(item.code)}>{t('join')}</button>
                </li>)}</ul>
              </section>}
            </>
          )}
          {inviteOpen && hasRoom && room.role === 'host' && <InviteDialog owner={friends.owner} navigate={navigate} invite={room.invite} close={() => setInviteOpen(false)} />}
          {gamesOpen && hasRoom && room.role === 'host' && <RoomGamesDialog room={room} choices={gameChoices}
            participants={participants.length} close={() => setGamesOpen(false)} />}
        </section>
        {hasRoom && <aside className="surface setup-summary">
          <img src={games[activeGame].art} alt="" width="880" height="587" />
          <div><h2>{t(activeGame)}</h2><p>{t(games[activeGame].description)}</p></div>
        </aside>}
      </div>
    </div>
  );
}
