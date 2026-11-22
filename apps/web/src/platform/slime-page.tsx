import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { orbitControls, resolveOrbitControl } from '../games/slime/controls.ts';
import type { OrbitControl, OrbitPress } from '../games/slime/controls.ts';
import { advanceOrbit, applyOrbitInput, createOrbitRound, nextOrbitAt, orbitGravityMs, orbitHeight, orbitOutcome, orbitSceneHeight,
  orbitWidth, resignOrbit } from '../games/slime/rules.ts';
import { orbitSidebar, orbitTabHeight } from '../games/slime/layout.ts';
import { tableSize } from '../games/table.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { Avatar, RoomPlayerAvatar } from './avatar.tsx';
import { EndRoundAction } from './end-round-action.tsx';
import { GameResult } from './game-result.tsx';
import { PlayTime } from './game-time.tsx';
import { MatchStage } from './match-stage.tsx';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';
import './slime-hud.css';

type OrbitRoom = ReturnType<typeof useRoomBoard> & { role: Role; slime: ReturnType<typeof createOrbitRound> };
const hudTabs = ['opponents', 'own'] as const;
type HudTab = typeof hudTabs[number];
const hudTabStyle = { left: orbitSidebar.x / tableSize * 100 + '%', width: orbitSidebar.width / tableSize * 100 + '%',
  top: orbitSidebar.y / orbitSceneHeight * 100 + '%', height: orbitTabHeight / orbitSceneHeight * 100 + '%' };
const newPractice = () => ({ id: crypto.randomUUID(), round: createOrbitRound(['host']), finishedAt: 0, stopped: false });

export function SlimePage({ room, ownProfile, navigate, dark, antialias, resolution, onResolution, onAntialias,
  showTouches, onTouchDisplay, touchStyle, record }: {
  room?: OrbitRoom; ownProfile?: ProfileSummary; navigate: Navigate; dark: boolean; antialias: boolean;
  resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  showTouches: boolean; onTouchDisplay: (value: boolean) => void; touchStyle: TouchEffect;
  record?: (report: MatchReport) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [practice, setPractice] = useState(newPractice);
  const [closedResult, setClosedResult] = useState('');
  const [selection, setSelection] = useState<{ id: string; tab: HudTab }>();
  const lastDown = useRef<OrbitPress>(undefined);
  const tabsId = useId();
  const round = room?.slime ?? practice.round;
  const role = room?.role ?? 'host';
  const id = room?.matchId ?? practice.id;
  const tab = room ? selection?.id === id ? selection.tab : 'opponents' : 'own';
  const finishedAt = room?.finishedAt ?? practice.finishedAt;
  const board = round.boards[role]!;
  const roundStart = useRoundStart(id, room, room?.displayStart ?? 0, at =>
    setPractice(current => ({ ...current, round: { ...current.round, tickAt: at + orbitGravityMs } })));
  const canPlay = roundStart.started && !finishedAt && !board.out && (!room || role === 'host' || room.state === 'connected');
  const canMove = canPlay && !board.resolution;
  const practiceDeadline = nextOrbitAt(practice.round);
  const outcome = room ? orbitOutcome(round, role) : 'practice';
  const cue = !finishedAt ? undefined : outcome === 'win' ? 'victory' : outcome === 'loss' ? 'defeat' : 'finished';
  const { pending: resultPending, ending } = useRoundEnd(id, cue);
  const resultVisible = Boolean(finishedAt && !resultPending && closedResult !== id);

  useEffect(() => { if (!canMove) lastDown.current = undefined; }, [canMove]);

  useEffect(() => {
    if (room || !practiceDeadline || practice.finishedAt) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setPractice(current => {
        if (current.id !== id || nextOrbitAt(current.round) !== practiceDeadline) return current;
        const next = advanceOrbit(current.round, now);
        return next ? { ...current, round: next, finishedAt: next.winner ? now : 0 } : current;
      });
    }, Math.max(0, practiceDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [Boolean(room), id, practiceDeadline, practice.finishedAt]);

  function control(command: OrbitControl) {
    if (!canMove) return;
    const { input, down } = resolveOrbitControl(command, { id, serial: board.serial, at: performance.now() }, lastDown.current);
    lastDown.current = down;
    if (room) { room.slimeAction(input, board.serial); return; }
    const now = Date.now();
    setPractice(current => {
      const ticked = advanceOrbit(current.round, now);
      const next = applyOrbitInput(ticked ?? current.round, role, { input, serial: board.serial }, now) ?? ticked;
      return next ? { ...current, round: next, finishedAt: next.winner ? now : 0 } : current;
    });
  }

  function end() {
    if (room) { room.surrender(); return; }
    const now = Date.now();
    setPractice(current => {
      const next = resignOrbit(current.round, role);
      return next ? { ...current, round: next, finishedAt: now, stopped: true } : current;
    });
  }

  const startsAt = room?.playStartedAt ?? roundStart.beginsAt;
  const report = useMemo<MatchReport | undefined>(() => finishedAt && outcome ? {
    id, game: 'slime', mode: room ? 'online' : 'practice', outcome, seconds: elapsedPlaySeconds(startsAt, finishedAt),
  } : undefined, [id, Boolean(room), outcome, finishedAt, startsAt]);
  const mode = t(room ? 'slimeVersus' : 'practice');
  const status = report ? t(room ? 'outcome_' + outcome : practice.stopped ? 'gameFinished' : 'slimeTopOut')
    : !roundStart.started ? t('roundWaiting') : board.out ? t('slimeOut') : mode;
  const players = round.players.map((player, index) => {
    const participant = room?.participants.find(person => person.role === player);
    const profile = (player === role ? ownProfile : undefined) ?? participant?.profile;
    const name = profile?.name ?? (participant?.mock ? `${t('mockPlayer')} ${index}`
      : t(player === role ? 'me' : player === 'host' ? 'host' : 'guest'));
    const stats = round.boards[player]!;
    return { player, profile, name, stats, result: room && orbitOutcome(round, player) };
  });
  const opponents = players.filter(player => player.player !== role).map(({ name, stats }) => ({
    name, cells: stats.cells, serial: stats.serial, out: stats.out,
  }));
  const playerStats = <section className="sichuan-score" aria-label={t('sichuanPlayerStats')}>
    {players.map(({ player, profile, name, stats, result }) => <div key={player}>
        <strong>{room ? <RoomPlayerAvatar appearance={profile} size={22} path={room.connectionPaths[player]} />
          : profile && <Avatar appearance={profile} size={22} />} {name}
          {room && <small>{t(result ? 'outcome_' + result : stats.out ? 'slimeOut' : 'slimeAlive')}</small>}
        </strong>
        <span>{t('slimeCleared')} <b>{stats.cleared}</b></span>
        <span>{t('slimeChain')} <b>{stats.bestChain}</b></span>
      </div>)}
  </section>;
  const back = room ? '/room' : gamePath('slime', 'setup');
  const info = <>
    <strong>{status}</strong>
    {roundStart.started && !finishedAt && <PlayTime key={id} startedAt={roundStart.beginsAt} />}
    {room && <p className="connection" role="status">{t(room.state ?? 'joining')}</p>}
    {playerStats}
    {room?.needsReconnect && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}
  </>;
  const result = report && <GameResult key={id} report={report} winner={1} title={status} details={playerStats}
    visible={resultVisible} onClose={() => setClosedResult(id)} record={room ? record : undefined}
    room={room && { canRematch: room.role === 'host' && room.canStart, returnToLobby: room.returnToLobby, reconnect: room.needsReconnect ? room.reconnect : undefined,
      request: room.role !== 'host' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
    rematch={() => { if (room) room.rematch(); else setPractice(newPractice()); }} back={room ? '/room' : '/games'} navigate={navigate} />;
  const labels = useMemo(() => ({
    next: t('slimeNext'), cleared: t('slimeCleared'), chain: t('slimeChain'), incoming: t('slimeIncoming'), out: t('slimeOut'), alive: t('slimeAlive'),
    chainCue: t('slimeChainCue', { count: board.resolution?.chain ?? 0 }),
    controls: Object.fromEntries(orbitControls.map(input => [input, t('slime_' + input)])) as Record<OrbitControl, string>,
  }), [t, board.resolution?.chain]);
  const tabs = room && <>
    <div className="orbit-hud-tabs" role="tablist" aria-label={t('slimeHud')} style={hudTabStyle}>
      {hudTabs.map(item => <button key={item} type="button" role="tab" id={tabsId + '-' + item}
        aria-controls={tabsId + '-' + item + '-panel'} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1}
        onClick={() => setSelection({ id, tab: item })} onKeyDown={event => {
          const next = event.key === 'Home' ? 'opponents' : event.key === 'End' ? 'own'
            : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? item === 'own' ? 'opponents' : 'own' : undefined;
          if (!next) return;
          event.preventDefault();
          setSelection({ id, tab: next });
          document.getElementById(tabsId + '-' + next)?.focus({ preventScroll: true });
        }}>{t(item === 'opponents' ? 'slimeOpponents' : 'slimeOwn')}</button>)}
    </div>
    <div className="visually-hidden" role="tabpanel" id={tabsId + '-opponents-panel'} aria-labelledby={tabsId + '-opponents'} hidden={tab !== 'opponents'}>
      <ul>{players.filter(player => player.player !== role).map(({ player, name, stats }) =>
        <li key={player}>{name} · {t(stats.out ? 'slimeOut' : 'slimeAlive')} · {t('slimeStackCount', { count: stats.cells.filter(Boolean).length })}</li>)}</ul>
    </div>
    <div className="visually-hidden" role="tabpanel" id={tabsId + '-own-panel'} aria-labelledby={tabsId + '-own'} hidden={tab !== 'own'}>
      {labels.cleared} {board.cleared} · {labels.chain} {board.bestChain} · {labels.incoming} {board.incoming}
    </div>
  </>;

  return <div className="site-width subpage play-page slime-page">
    <BackLink fallback={back} fallbackLabel={room ? 'goToRoom' : 'settings'} navigate={navigate} />
    <div className="play-heading"><h1 tabIndex={-1}>{t('slime')}</h1></div>
    <div className="play-layout">
      <MatchStage id="slime" matchId={id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
        onReady={roundStart.ready} beginsAt={roundStart.beginsAt} ending={ending} playfieldContent={tabs}
        stageContext={{ mode, map: `${orbitWidth} × ${orbitHeight}` }}
        endAction={!finishedAt && !board.out && <EndRoundAction key={id} online={Boolean(room)} disabled={!canPlay} end={end} />}
        setCursor={() => {}} info={info} infoStatus={status} yourTurn={false} result={result} resultVisible={resultVisible}
        resultPending={resultPending} onShowResult={() => setClosedResult('')} showTouches={showTouches} onTouchDisplay={onTouchDisplay}
        remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch} reactions={room?.reactions} ownProfile={ownProfile} touchStyle={touchStyle}
        view={{ history: [], cursor: null, chessTargets: new Map(), dark, allowDoubleThree: true, force: 1, canMove,
          deadline: 0, finished: Boolean(finishedAt), move: () => {}, onAlkkagi: () => {},
          slime: { id, board, control, labels, playing: roundStart.started && !finishedAt,
            clockOffset: room?.playStartedAt ? room.displayStart - room.playStartedAt : 0,
            versus: Boolean(room), opponents: tab === 'opponents' ? opponents : undefined } }} />
    </div>
  </div>;
}
