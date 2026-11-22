import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import {
  advanceBurger, applyBurgerAction, burgerCounter, burgerDeadline, burgerOutcome, burgerRank, burgerResigned, createBurgerRound,
  nextBurgerAt, resignBurger, startBurgerRound,
} from '../games/burger/rules.ts';
import type { BurgerAction, BurgerMinutes, BurgerRound } from '../games/burger/rules.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { RoomPlayerAvatar } from './avatar.tsx';
import { EndRoundAction } from './end-round-action.tsx';
import { GameResult } from './game-result.tsx';
import { MatchStage } from './match-stage.tsx';
import type { BurgerCard } from '../games/burger/cards.ts';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { formatPlayTime } from './game-time.tsx';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';

type BurgerRoom = ReturnType<typeof useRoomBoard> & { role: Role; burger: BurgerRound };
const newPractice = (minutes: BurgerMinutes) => ({ id: crypto.randomUUID(), round: createBurgerRound(minutes, ['host']), finishedAt: 0 });
const labelKeys = ['time', 'money', 'combo', 'fever', 'wrap', 'wait', 'prepare', 'order', 'chat', 'chatAlt', 'impatient',
  'perfect', 'perfectAlt', 'mixed', 'mixedAlt', 'poor', 'burnt', 'raw', 'left', 'spill', 'rare', 'medium', 'well', 'charred', 'undercooked',
  'beef', 'chicken', 'tray', 'delighted', 'tip', 'shooLeft0', 'shooLeft1', 'shooLeft2', 'shooStay0', 'shooStay1', 'shooStay2', 'soldOut'];

export function BurgerPage({ room, minutes, ownProfile, navigate, dark, antialias, resolution, onResolution, onAntialias,
  showTouches, onTouchDisplay, touchStyle, record }: {
  room?: BurgerRoom; minutes: BurgerMinutes; ownProfile?: ProfileSummary; navigate: Navigate; dark: boolean; antialias: boolean;
  resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  showTouches: boolean; onTouchDisplay: (value: boolean) => void; touchStyle: TouchEffect;
  record?: (report: MatchReport) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const [practice, setPractice] = useState(() => newPractice(minutes));
  const [closedResult, setClosedResult] = useState('');
  const round = room?.burger ?? practice.round;
  const id = room?.matchId ?? practice.id;
  const role = room?.role ?? 'host';
  const counter = burgerCounter(round, role);
  const cooperative = round.mode === 'coop';
  const resigned = burgerResigned(round, role);
  const finishedAt = room?.finishedAt ?? practice.finishedAt;
  const roundStart = useRoundStart(id, room, room?.displayStart ?? 0, at =>
    setPractice(current => ({ ...current, round: startBurgerRound(current.round, at) })));
  const canInteract = roundStart.started && !finishedAt && !resigned && !counter.closed
    && (!room || room.state === 'connected' || room.testMatch && !room.recoveryAt);
  const active = canInteract && !counter.draft;
  const deadline = nextBurgerAt(practice.round);
  useEffect(() => {
    if (room || !deadline || practice.finishedAt) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setPractice(current => {
        if (current.id !== id || nextBurgerAt(current.round) !== deadline) return current;
        const next = advanceBurger(current.round, now);
        return next ? { ...current, round: next, finishedAt: next.winners ? now : 0 } : current;
      });
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [Boolean(room), deadline, id, practice.finishedAt]);

  function action(input: BurgerAction) {
    if (!canInteract || Boolean(counter.draft) !== (input.type === 'choose-card')) return false;
    if (room) return room.burgerAction(input);
    const now = Date.now();
    const next = applyBurgerAction(practice.round, 'host', input, now);
    if (!next) return false;
    setPractice(current => {
      if (current.id !== id || current.finishedAt) return current;
      const updated = current.round === practice.round ? next : applyBurgerAction(current.round, 'host', input, now);
      return updated ? { ...current, round: updated, finishedAt: updated.winners ? now : 0 } : current;
    });
    return true;
  }

  function end() {
    if (room) { room.surrender(); return; }
    const now = Date.now();
    setPractice(current => {
      const next = resignBurger(current.round, 'host');
      return next ? { ...current, round: next, finishedAt: now } : current;
    });
  }

  const labels = useMemo(() => Object.fromEntries(labelKeys.map(key => [key,
    t(key === 'money' && cooperative ? 'burgerTeamSales' : 'burgerLabel_' + key)])), [t, cooperative]);
  const outcome = room ? burgerOutcome(round, role) : 'practice';
  const { pending: resultPending, ending } = useRoundEnd(id, !finishedAt ? undefined
    : outcome === 'win' ? 'victory' : outcome === 'loss' || counter.bankrupt ? 'defeat' : 'finished');
  const startedAt = room?.playStartedAt ?? round.start;
  const report = useMemo<MatchReport | undefined>(() => {
    if (!finishedAt) return;
    const seconds = elapsedPlaySeconds(startedAt, finishedAt);
    if (cooperative) return { id, game: 'burger', mode: 'coop', outcome: 'score', seconds, score: counter.money };
    if (outcome) return { id, game: 'burger', mode: room ? 'online' : 'practice', outcome, seconds };
  }, [id, Boolean(room), cooperative, counter.money, outcome, finishedAt, startedAt]);
  const mode = cooperative ? 'coop' : room ? 'burgerRace' : 'practice';
  const status = finishedAt ? t(counter.bankrupt ? 'burgerBankrupt' : room && outcome ? 'outcome_' + outcome : resigned ? 'gameFinished' : 'burgerClosed')
    : !roundStart.started ? t('roundWaiting') : resigned || counter.closed ? t('burgerWaiting') : t(mode);
  const players = round.players.map((player, index) => {
    const participant = room?.participants.find(person => person.role === player);
    const profile = (player === role ? ownProfile : undefined) ?? participant?.profile;
    const name = profile?.name ?? t(participant?.mock ? 'mockSeat'
      : player === role ? 'me' : player === 'host' ? 'host' : 'anonymousSeat', { number: index + 1 });
    return { player, profile, name, data: burgerCounter(round, player), result: room && burgerOutcome(round, player) };
  }).sort((a, b) => Number(a.data.retired) - Number(b.data.retired) || b.data.money - a.data.money);
  const stats = <section className="sichuan-score" aria-label={t('sichuanPlayerStats')}>
    {cooperative ? <div>
      <strong>{t('burgerSharedKitchen')}</strong>
      <span>{t('burgerTeamSales')} <b>{counter.money.toLocaleString()}</b></span>
      <span>{t('burgerServed')} <b>{counter.served}</b></span>
      <span>{t('burgerBest')} <b>{counter.best}</b></span>
    </div> : players.map(({ player, profile, name, data, result }) => <div key={player}>
      <strong>{room && <RoomPlayerAvatar appearance={profile} size={22} path={room.connectionPaths[player]} />}{name}
        {result && <small>{t('outcome_' + result)}</small>}</strong>
      <span>{labels.money} <b>{data.money.toLocaleString()}</b></span>
      <span>{t('burgerServed')} <b>{data.served}</b></span>
      <span>{t('burgerBest')} <b>{data.best}</b></span>
    </div>)}
  </section>;
  const resultVisible = Boolean(report && !resultPending && closedResult !== id);
  const result = report && <GameResult key={id} report={report} winner={outcome === 'draw' ? 'draw' : 1} title={status}
    details={stats} visible={resultVisible} onClose={() => setClosedResult(id)} record={room && (!cooperative || !resigned) ? record : undefined}
    room={room && { canRematch: room.role === 'host' && room.canStart, returnToLobby: room.returnToLobby,
      reconnect: room.needsReconnect ? room.reconnect : undefined,
      request: room.role !== 'host' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
    rematch={() => { if (room) room.rematch(); else setPractice(newPractice(minutes)); }}
    back={room ? '/room' : '/games'} navigate={navigate} />;
  const pausedAt = room?.recoveryAt || 0;
  const clockOffset = room?.displayStart ? room.displayStart - round.start : 0;
  const cardDetails = (card: BurgerCard) => {
    const [kind, item] = card.split(':');
    const category = item ? kind === 'unlock' ? 'unlock' : 'special'
      : ['rush', 'patient', 'advertise', 'picky', 'simple'].includes(card) ? 'guest' : 'special';
    const name = item ? t('burgerCard_' + kind, { item: t('burgerLabel_' + item) }) : t('burgerCard_' + card);
    const detail = t('burgerCardDetail_' + (item ? kind : card));
    return { category, tag: t('burgerCardType_' + category), name, detail } as const;
  };
  return <div className="site-width subpage play-page burger-page">
    <BackLink fallback={room ? '/room' : gamePath('burger', 'setup')} fallbackLabel={room ? 'goToRoom' : 'settings'} navigate={navigate} />
    <div className="play-heading"><h1 tabIndex={-1}>{t('burger')}</h1></div>
    <div className="play-layout">
      <MatchStage id="burger" matchId={id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias} landscapeFullscreen
        onReady={roundStart.ready} beginsAt={roundStart.beginsAt} ending={ending}
        stageContext={{ mode: t(mode),
          map: round.minutes === 'endless' ? t('burgerEndless') : formatPlayTime(round.minutes * 60) }}
        endAction={!finishedAt && !resigned && <EndRoundAction key={id} online={Boolean(room)} disabled={!active} end={end} />}
        info={<><strong>{status}</strong>{stats}</>} infoStatus={status} yourTurn={false}
        result={result} resultVisible={resultVisible} resultPending={resultPending} onShowResult={() => setClosedResult('')}
        showTouches={showTouches} onTouchDisplay={onTouchDisplay} remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch}
        reactions={room?.reactions} ownProfile={ownProfile} touchStyle={touchStyle} setCursor={() => {}}
        view={{ history: [], cursor: null, chessTargets: new Map(), dark, force: 1, allowDoubleThree: true, canMove: active,
          deadline: 0, finished: Boolean(finishedAt), onAlkkagi: () => {}, move: () => {},
          burger: { id, seed: round.seed, counter, start: round.start, opensAt: round.opensAt,
            end: burgerDeadline(round, role), clockOffset, finishedAt, pausedAt,
            active, action, labels, language: i18n.resolvedLanguage,
            cardHud: { showDraft: canInteract && !room?.recoveryAt && Boolean(counter.draft), describe: cardDetails,
              title: t('burgerLevelUp', { level: burgerRank(counter.served) }),
              instruction: t(cooperative ? 'burgerDraftCoop' : 'burgerDraftChoose'),
              history: t('burgerCardHistory'), empty: t('burgerNoCards') },
            rivals: cooperative ? [] : players.filter(player => player.player !== role)
              .map(({ name, data }) => ({ name, money: data.money })) } }} />
    </div>
  </div>;
}
