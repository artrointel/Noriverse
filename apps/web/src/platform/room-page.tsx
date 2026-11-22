import { Popup } from './popup.tsx';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { isRoomGame, roomCapacity, roomCodePattern, roomRoles } from '../../../../packages/protocol/rooms.ts';
import { isTilePuzzle } from '../../../../packages/protocol/games.ts';
import type { Participant, RoomGame } from '../../../../packages/protocol/rooms.ts';
import { oppositeStone, sideLabel } from '../games/table.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { apiAvailable, apiFetch, fetchPublicProfile } from '../network/api.ts';
import { readGuestSeat, readRecentRooms } from '../network/guest-seat.ts';
import type { GuestRoom } from '../network/guest-seat.ts';
import { winRate } from '../../../../packages/protocol/profile.ts';
import type { PublicProfile } from '../../../../packages/protocol/profile.ts';
import { gameIds, games } from './game-catalog.ts';
import { RoomPlayerAvatar } from './avatar.tsx';
import { FriendButton, InviteDialog } from './friends.tsx';
import type { Friends } from './friends.tsx';
import { BackLink, gamePath, routeHref, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { GameSelectionGrid } from './catalog-pages.tsx';
import { GameFeature, GameRulesEditor, GameRulesSummary } from './game-settings.tsx';
import { RoomRankingBoard } from './room-ranking.tsx';
import { GearIcon } from './gear-icon.tsx';
import { ReactionLayer, ReactionPicker } from './game-reactions.tsx';

type Room = ReturnType<typeof useRoomBoard>;

function ConnectionReport({ read }: { read: () => string | undefined }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<string>();
  async function copy() {
    const value = read();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setReport(undefined);
    } catch { setReport(value); }
  }
  return <>
    <button type="button" className="button button-secondary" onClick={() => void copy()}>
      {t(copied ? 'connectionReportCopied' : 'connectionReportCopy')}
    </button>
    {report && <textarea className="lobby-connection-report" readOnly rows={5} value={report} aria-label={t('connectionReportCopy')}
      onFocus={event => event.currentTarget.select()} />}
  </>;
}
const roomGames = gameIds.filter(isRoomGame);

export function CreateRoomPage({ selected, select, navigate }: {
  selected?: RoomGame; select: (game: RoomGame) => void; navigate: Navigate;
}) {
  const { t } = useTranslation();
  return <div className="site-width subpage create-room-page">
    <BackLink fallback="/games" fallbackLabel="backToGames" navigate={navigate} />
    <h1 className="match-page-title" tabIndex={-1}>{t('newRoom')}</h1>
    <form onSubmit={event => {
      event.preventDefault();
      if (apiAvailable && selected) navigate(gamePath(selected, 'setup', 'online'));
    }}>
      <p className="muted" id="room-game-prompt">{t(apiAvailable ? 'chooseRoomGame' : 'roomUnavailable')}</p>
      <div role="group" aria-labelledby="room-game-prompt">
        <GameSelectionGrid ids={roomGames} selected={selected} selectable onSelect={select} />
      </div>
      <div className="create-room-actions">
        <button type="submit" className="button button-primary" disabled={!selected || !apiAvailable}>{t('continueRoomCreation')}</button>
      </div>
    </form>
  </div>;
}

function RoomSettingsDialog({ room, close }: { room: Room; close: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(room.settings);
  const [valid, setValid] = useState(true);
  const changed = JSON.stringify(draft) !== JSON.stringify(room.settings);
  return <Popup className="room-rules-dialog" aria-labelledby="room-rules-title"
    onDismiss={close}>
    <header className="room-panel-heading">
      <h2 id="room-rules-title">{t('setupTitle', { game: t(room.game) })}</h2>
    </header>
    <form onSubmit={event => { event.preventDefault(); if (changed && valid && room.configureMatch(draft)) close(); }}>
      <div className="setup-dialog-body">
        <GameRulesEditor game={room.game} settings={draft} change={setDraft} online onValidity={setValid} />
      </div>
      <footer className="setup-actions">
        <button type="button" className="button button-secondary" onClick={close}>{t('cancel')}</button>
        <button type="submit" className="button button-primary" disabled={!valid || !changed}>{t('saveSettings')}</button>
      </footer>
    </form>
  </Popup>;
}

function RoomGamesDialog({ room, choices, participants, close }: { room: Room; choices: RoomGame[]; participants: number; close: () => void }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  return <Popup className="room-games-dialog" aria-labelledby="room-games-title"
    onDismiss={close} locked={room.changingGame}>
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
  </Popup>;
}

function ParticipantStats({ id, game, own, latest }: { id: string; game: RoomGame; own?: PublicProfile; latest?: Room['roomHistory'][number] }) {
  const { t, i18n } = useTranslation();
  const [remote, setRemote] = useState<PublicProfile | null>();
  const ownId = own?.id;
  const latestId = latest?.id;
  const endedAt = latest?.endedAt;
  useEffect(() => {
    if (ownId === id) return;
    const controller = new AbortController();
    const retries = [400, 900, 1800];
    let timer: number | undefined;
    async function refresh(attempt: number) {
      const profile = await fetchPublicProfile(id, controller.signal).catch(() => null);
      if (controller.signal.aborted) return;
      setRemote(profile);
      // The participant may still be submitting the result when the lobby opens.
      if (attempt < retries.length && latestId && endedAt && Math.abs(Date.now() - endedAt) < 15_000
        && !profile?.recent.some(match => match.id === latestId && match.game === game)) {
        timer = window.setTimeout(() => void refresh(attempt + 1), retries[attempt]);
      }
    }
    void refresh(0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [id, game, ownId, latestId, endedAt]);

  const stats = (own ?? remote)?.games[game];
  if (!stats) return <small className="lobby-participant-record">{t(remote === null ? 'lobbyStatsUnavailable' : 'lobbyStatsLoading')}</small>;
  const rate = winRate(stats);
  return <small className="lobby-participant-record" aria-label={t('lobbyGameStats', { game: t(game) })}>
    <b>{t('recordScore', { wins: stats.wins, losses: stats.losses, draws: stats.draws })}</b>
    {rate !== null && <span>{t('winRate')} {new Intl.NumberFormat(i18n.resolvedLanguage, { style: 'percent', maximumFractionDigits: 1 }).format(rate)}</span>}
  </small>;
}

export function RoomPage({ room, friends, ownProfile, invite, navigate, onPlay }: {
  room: Room; friends: Friends; ownProfile?: PublicProfile; invite: string; navigate: Navigate; onPlay: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState(() => invite.trim().toUpperCase().slice(0, 8));
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recent, setRecent] = useState<GuestRoom[]>([]);
  const activeGame = room.matchId ? room.game : 'omok';
  const shareUrl = new URL(routeHref(room.code ? '/room?room=' + room.code : '/room'), location.origin);
  const connected = room.state === 'connected';
  const hasRoom = room.active;
  const participants: Participant[] = room.role && !room.participants.some(person => person.role === room.role)
    ? [...room.participants, { role: room.role, profile: undefined }] : room.participants;
  const rosterPlayers = [...participants, ...room.awayParticipants.filter(person => !participants.some(player => player.role === person.role))];
  const capacity = roomCapacity[activeGame];
  const gameChoices = roomGames.filter(id => id !== activeGame && participants.length <= roomCapacity[id]);
  const canEdit = room.role === 'host' && (!room.started || room.finishedAt > 0);
  const canChange = room.role === 'host' && gameChoices.length > 0;
  const canRetry = room.needsReconnect || (connected && room.role === 'host' && !room.canStart && (activeGame !== 'liar' || participants.length >= 3));

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

  if (!hasRoom) return <div className="site-width subpage match-workspace">
    <BackLink fallback="/games" fallbackLabel="backToGames" navigate={navigate} />
    <section className="surface setup-form room-join">
      <h1 tabIndex={-1}>{t('joinRoom')}</h1>
      {!apiAvailable ? <p className="muted">{t('roomUnavailable')}</p> : <>
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
      </>}
    </section>
  </div>;

  return <div className="site-width subpage match-workspace lobby-workspace">
    <BackLink fallback="/games" fallbackLabel="backToGames" navigate={navigate} />
    <header className="lobby-heading">
      <h1 className="match-page-title" tabIndex={-1}>{room.title ?? t('room')}</h1>
    </header>
    {createPortal(<ReactionLayer events={room.lobbyReactions.events} viewport />, document.body)}
    <GameFeature game={activeGame} heading={t(activeGame)}>
      <div className="lobby-feature-rules"><GameRulesSummary game={activeGame} settings={room.settings} /></div>
      <div className="lobby-feature-panels">
        {room.roomHistory.length > 0 && <RoomRankingBoard key={room.code} entries={room.roomHistory} participants={participants}
          roomTitle={room.title} test={room.testMatch && !room.mockControls} />}
        <section className="lobby-participants" aria-label={t('participants')}>
          <header className="room-panel-heading"><h2>{t('participants')}</h2><div className="lobby-participant-tools">
            <span className="lobby-count">{participants.length}/{capacity}</span>
            <ReactionPicker lobby scope={room.code ?? ''} enabled={room.lobbyReactions.enabled} send={room.lobbyReactions.send} />
          </div></header>
          {room.state && <div className="lobby-status">
            <p id="lobby-connection" className="connection lobby-connection" role="status">
              {t(activeGame === 'liar' && !room.started && participants.length < 3 ? 'liarNeedPlayers'
                : room.role === 'host' && !room.started && connected && !room.canStart ? 'waitingAllConnections'
                  : connected && room.role !== 'host' && room.started && !room.inMatch ? 'waitingNextRound'
                    : connected && room.role !== 'host' && !room.started ? 'waitingStart' : room.state)}
            </p>
            {canRetry && <button type="button" className="button button-secondary" onClick={room.reconnect}>{t('retry')}</button>}
            {connected && <ConnectionReport key={room.code} read={room.connectionReport} />}
          </div>}
          {room.rematchNotice === 'incoming' && <p role="status">{t('rematchIncoming')}</p>}
          <ul className="people-list">{rosterPlayers.map(({ role, profile, mock, activity }) => {
            const color = room.colorFor(role) ?? (role === 'host' ? room.hostColor : oppositeStone(room.hostColor));
            const own = room.role === role;
            const participant = own ? ownProfile ?? profile : profile;
            const activityLabel = activity?.startsWith('play:') ? t('roomActivity_play', { game: t(activity.slice(5)) })
              : activity ? t('roomActivity_' + activity) : undefined;
            const activityLine = activityLabel && <small className="lobby-participant-activity">{activityLabel}</small>;
            const seatInfo = [t(role === 'host' ? 'host' : 'guest'), isTilePuzzle(activeGame) || activeGame === 'sketch' || activeGame === 'liar' || activeGame === 'slime' || activeGame === 'mole' || activeGame === 'burger'
              || (activeGame === 'physics' && !room.physicsSeats) ? undefined : t(sideLabel(activeGame, color)),
              own ? t('me') : undefined, participant ? t('levelValue', { level: participant.level }) : undefined].filter(Boolean).join(' · ');
            return <li key={role}>
              {participant ? <>
                <RouteLink className="person-link" href={own ? '/profile' : '/profiles/' + participant.id} navigate={navigate}>
                  <RoomPlayerAvatar appearance={participant} size={38} path={room.connectionPaths[role]} />
                  <span><strong>{participant.name}</strong><small>{seatInfo}</small>{activityLine}
                    <ParticipantStats key={participant.id} id={participant.id} game={activeGame} own={own ? ownProfile : undefined}
                      latest={room.roomHistory.find(entry => !entry.test && entry.game === activeGame && entry.players.some(player => player.profileId === participant.id))} />
                  </span>
                </RouteLink>
                {!own && <FriendButton id={participant.id} model={friends} />}
              </> : <div className="person-link">
                {mock ? <span className={'stone stone-' + (color > 2 ? color : sideLabel(activeGame, color) === 'black' ? 0 : 1)} aria-hidden="true" />
                  : <RoomPlayerAvatar size={38} path={room.connectionPaths[role]} />}
                <span><strong>{mock ? t('mockSeat', { number: roomRoles.indexOf(role) }) : t('anonymousPlayer')}</strong>
                  <small>{mock ? t('mockIdle') : seatInfo}</small>{activityLine}</span>
              </div>}
            </li>;
          })}</ul>
          {room.mockControls && <div className="panel-actions">
            <button type="button" className="button button-secondary" disabled={!room.mockControls.canAdd} onClick={room.mockControls.add}>{t('addMockPlayer')}</button>
            {room.mockControls.canRemove && <button type="button" className="button button-secondary" onClick={room.mockControls.remove}>{t('removeMockPlayer')}</button>}
          </div>}
          <div className="invite-code">
            <div><span>{t('code')}</span><code>{room.code}</code></div>
            <button type="button" className="button button-secondary" onClick={() => void copyInvite()}>{t(copyState === 'copied' ? 'copied' : 'copy')}</button>
          </div>
          {copyState === 'manual' && <input aria-label={t('link')} readOnly value={shareUrl.href} onFocus={event => event.currentTarget.select()} />}
          {room.role === 'host' && <button className="button button-secondary lobby-invite" type="button"
            disabled={!friends.owner || participants.length >= capacity} onClick={() => setInviteOpen(true)}>{t('inviteFriend')}</button>}
        </section>
      </div>
      <div className="panel-actions lobby-feature-actions">
        {canEdit && <button type="button" className="button button-secondary" disabled={room.changingGame || !room.matchId}
          onClick={() => setSettingsOpen(true)}><GearIcon />{t('settings')}</button>}
        {canChange && <button type="button" className="button button-secondary"
          onClick={() => setGamesOpen(true)}>{t('changeRoomGame')}</button>}
        {(room.role === 'host' || (connected && room.started && room.inMatch)) &&
          <button type="button" className="button button-primary" disabled={room.changingGame || (!room.started && !room.canStart)}
            aria-describedby={!room.started && !room.canStart ? 'lobby-connection' : undefined}
            onClick={onPlay}>{t(room.finishedAt ? 'resultTitle' : room.started ? 'resume' : 'start')}</button>}
        <button type="button" className="button button-secondary lobby-leave"
          onClick={() => { room.leave(); setCopyState('idle'); setInviteOpen(false); setSettingsOpen(false); setGamesOpen(false); }}>{t('leave')}</button>
      </div>
    </GameFeature>
    {inviteOpen && room.role === 'host' && <InviteDialog owner={friends.owner} navigate={navigate} invite={room.invite} close={() => setInviteOpen(false)} />}
    {gamesOpen && room.role === 'host' && <RoomGamesDialog room={room} choices={gameChoices} participants={participants.length} close={() => setGamesOpen(false)} />}
    {settingsOpen && canEdit && <RoomSettingsDialog room={room} close={() => setSettingsOpen(false)} />}
  </div>;
}
