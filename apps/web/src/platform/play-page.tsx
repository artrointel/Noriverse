import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import { createFlickRound, flickPlayers, initialAlkkagi, settledStatus } from '../games/alkkagi/rules.ts';
import type { AlkkagiStatus, FlickPower, FlickSettings } from '../games/alkkagi/rules.ts';
import { boardRules, isBoardGame } from '../games/board-rules.ts';
import { createLocalRound, setLocalStart } from '../games/local-round.ts';
import type { LocalRound } from '../games/local-round.ts';
import { chessIndex, chessPosition, chessSquare, encodeChessMove } from '../games/chess/rules.ts';
import { doubleThreeAxes, isForbiddenDoubleThree } from '../games/omok/rules.ts';
import type { OmokOverline } from '../games/omok/rules.ts';
import { othelloState } from '../games/othello/rules.ts';
import type { GameId } from '../../../../packages/protocol/games.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import type { Stone } from '../games/table.ts';
import { oppositeStone, rematchPlayerColor, sideLabel } from '../games/table.ts';
import { nextDeadline, resolveTurnTimeout } from '../games/turn-clock.ts';
import type { TimeoutChoice, TurnLimit } from '../games/turn-clock.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { onAudioReady, playSound } from './audio.ts';
import { GameResult } from './game-result.tsx';
import { TimeoutDecision } from './timeout-decision.tsx';
import { ChessPromotion } from './chess-promotion.tsx';
import { ChessLosses } from './chess-losses.tsx';
import { PlayTime, useCountdown } from './game-time.tsx';
import { MatchStage } from './match-stage.tsx';
import { Avatar } from './avatar.tsx';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';
import { EndRoundAction } from './end-round-action.tsx';

type Room = ReturnType<typeof useRoomBoard>;

function TurnClock({ deadline, enabled, audible = false, onExpired, compact = false }: {
  deadline: number; enabled: boolean; audible?: boolean; onExpired?: () => void; compact?: boolean;
}) {
  const { t } = useTranslation();
  const seconds = useCountdown(deadline, left => {
    if (left === 0) onExpired?.();
    else if (left <= 3 && audible) playSound('tick', left);
  });
  if (compact) return deadline ? <time className="stage-clock" data-low={seconds <= 3} dateTime={'PT' + seconds + 'S'}>{t('turnSeconds', { count: seconds })}</time>
    : enabled ? <span className="stage-clock">{t('turnClockPaused')}</span> : null;
  return <p className="match-time turn-clock" data-low={Boolean(deadline && seconds <= 3)}>
    <span>{t('turnLimit')}</span>
    {deadline ? <time dateTime={'PT' + seconds + 'S'}>{t('turnSeconds', { count: seconds })}</time>
      : <strong>{t(enabled ? 'turnClockPaused' : 'unlimitedTurns')}</strong>}
  </p>;
}

export function PlayPage({ id, dark, antialias, resolution, onResolution, onAntialias, room, ownProfile, power, flickSettings, turnLimit, history, boardRound, allowDoubleThree, overline, move, reset, startLocal, endLocal, decideLocal, record, navigate,
  showTouches, onTouchDisplay, touchStyle }: {
  id: GameId; dark: boolean; antialias: boolean; room?: Room; ownProfile?: ProfileSummary; power: FlickPower; flickSettings: FlickSettings; turnLimit: TurnLimit; history: number[];
  resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  boardRound?: LocalRound;
  startLocal: (id: string, beginsAt: number) => void;
  allowDoubleThree: boolean; overline: OmokOverline; move: (index: number) => void; reset: () => void;
  endLocal: (color: Stone, expiredDeadline?: number) => void;
  decideLocal: (choice: TimeoutChoice, at: number) => void;
  record?: (report: MatchReport) => Promise<boolean>; navigate: Navigate;
  showTouches: boolean; onTouchDisplay: (active: boolean) => void; touchStyle: TouchEffect;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState<number | null>(null);
  const [tapPreview, setTapPreview] = useState<{ index: number; matchId: string; history: number[]; at: number }>();
  const [chessChoice, setChessChoice] = useState<{ matchId: string; revision: number; last?: number; from: number; to?: number }>();
  const [localFlick, setLocalFlick] = useState(() => id === 'physics' && !room ? createFlickRound(flickSettings) : undefined);
  const [alkkagi, setAlkkagi] = useState(() => localFlick ? settledStatus(localFlick) : initialAlkkagi);
  const [localRound, setLocalRound] = useState(() => createLocalRound(turnLimit));
  const [waitingSurrender, setWaitingSurrender] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [closedResult, setClosedResult] = useState('');
  const lastTurnCue = useRef('');
  const isOmok = id === 'omok';
  const isBoard = isBoardGame(id);
  const matchId = room?.matchId ?? boardRound?.id ?? localRound.id;
  const roundStart = useRoundStart(matchId, room, room?.displayStart ?? (boardRound?.prepared ? boardRound.startedAt : 0), at => {
    if (isBoard) startLocal(matchId, at);
    else setLocalRound(current => setLocalStart(current, matchId, at));
  });
  const othello = useMemo(() => id === 'othello' ? othelloState(history) : undefined, [id, history]);
  const chess = id === 'chess' ? chessPosition(history) : undefined;
  const choice = chessChoice?.matchId === matchId && chessChoice.revision === history.length && chessChoice.last === history.at(-1)
    ? chessChoice : undefined;
  const chessMoves = useMemo(() => chess && choice ? chess.moves({ square: chessSquare(choice.from), verbose: true }) : [], [chess, choice]);
  const chessTargets = useMemo(() => new Map(chessMoves.map(move => [chessIndex(move.to), move.captured ? 'capture' : 'target'] as const)), [chessMoves]);
  const flickStatus = room?.physics ? settledStatus(room.physics) : alkkagi;
  const surrendered = room?.surrendered ?? boardRound?.surrendered ?? localRound.surrendered;
  const timedOut = room?.timedOut ?? boardRound?.timedOut ?? localRound.timedOut;
  const pending = room?.timeoutPending ?? boardRound?.timeoutPending ?? localRound.timeoutPending;
  const loser = surrendered ?? timedOut;
  const outcome = loser ? oppositeStone(loser) : isBoardGame(id) ? boardRules[id].result(history, overline) : flickStatus.winner;
  const canReset = !room || (room.role === 'host' && room.canStart);
  const back = room ? '/room' : gamePath(id, 'setup');
  const backLabel = room ? 'goToRoom' : 'settings';
  const busy = !isBoard && flickStatus.phase === 'moving';
  const turn = isBoardGame(id) ? boardRules[id].turn(history) ?? 1 : flickStatus.turn;
  const startedAt = room?.playStartedAt ?? boardRound?.startedAt ?? localRound.startedAt;
  const finishedAt = room?.finishedAt ?? boardRound?.finishedAt ?? localRound.finishedAt;
  const deadline = room?.displayDeadline ?? boardRound?.deadline ?? localRound.deadline;
  const limit = room?.turnLimit ?? boardRound?.turnLimit ?? localRound.turnLimit;
  const mode = room ? 'online' : 'local';
  const firstPlayerColor = boardRound?.firstPlayerColor ?? localRound.firstPlayerColor;
  const playerColor = room?.playerColor ?? firstPlayerColor;
  const multiplayerFlick = Boolean(room?.physics && (room.physics.players ?? 2) > 2);
  const eliminated = multiplayerFlick && !flickStatus.remaining[playerColor - 1];
  const localTurn = turn === 2 ? 2 : 1;
  const canMove = roundStart.started && !outcome && !pending && !waitingSurrender && (room ? room.canMove : !busy);
  const yourTurn = Boolean(room && canMove);
  const status = outcome ? t('gameFinished') : pending ? t('turnTimeout', { stone: t(sideLabel(id, pending.color)) })
    : eliminated ? t('flickEliminated') : busy ? t('settling') : waitingSurrender ? t('surrenderPending')
    : room && room.state !== 'connected' ? t('turnDisconnected') : !roundStart.started ? t('roundWaiting')
    : room ? t(yourTurn ? 'yourTurn' : 'opponentTurn') : t('turns', { stone: t(sideLabel(id, turn)) });
  const report = useMemo<MatchReport | undefined>(() => {
    if (!outcome || !matchId) return;
    const seconds = elapsedPlaySeconds(startedAt, finishedAt || Date.now());
    return { id: matchId, game: id, mode, seconds,
      outcome: outcome === 'draw' || (!room && surrendered) ? 'draw' : outcome === playerColor ? 'win' : 'loss' };
  }, [matchId, id, mode, startedAt, finishedAt, outcome, playerColor, surrendered]);
  const settleChessMove = id === 'chess' && history.length > 0 && !surrendered && !timedOut
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { ending, pending: resultPending } = useRoundEnd(matchId, report && (mode === 'local' || report.outcome === 'draw'
    ? 'finished' : report.outcome === 'win' ? 'victory' : 'defeat'), settleChessMove ? 290 : 0);
  const latest = history.at(-1);
  const madeDoubleThree = isOmok && allowDoubleThree && latest !== undefined
    && doubleThreeAxes(history.slice(0, -1), latest).length >= 2;

  useEffect(() => {
    if (!canMove) return;
    const cue = [matchId, turn, history.length, room?.physics?.revision, ...flickStatus.remaining].join('/');
    function announce() {
      if (cue !== lastTurnCue.current && playSound('turn')) lastTurnCue.current = cue;
    }
    announce();
    return onAudioReady(announce);
  }, [flickStatus.remaining, canMove, history.length, matchId, turn, room?.physics?.revision]);

  useEffect(() => {
    setWaitingSurrender(false);
  }, [matchId, room?.state, room?.physics?.revision, eliminated]);

  useEffect(() => {
    if (!tapPreview) return;
    const timer = window.setTimeout(() => setTapPreview(undefined), Math.max(0, 650 - (performance.now() - tapPreview.at)));
    return () => window.clearTimeout(timer);
  }, [tapPreview]);

  function confirmTap(index: number, touch: boolean) {
    const at = performance.now();
    if (!touch || (tapPreview?.index === index && tapPreview.matchId === matchId && tapPreview.history === history && at - tapPreview.at <= 650)) {
      setTapPreview(undefined);
      return true;
    }
    setTapPreview({ index, matchId, history, at });
    return false;
  }

  function tryMove(index: number, touch = false) {
    if (!canMove) return;
    if (chess) {
      if (choice?.to !== undefined) return;
      const target = chessMoves.find(move => chessIndex(move.to) === index);
      if (target && choice) {
        if (!confirmTap(index, touch)) return;
        if (target.promotion) setChessChoice({ ...choice, to: index });
        else { move(encodeChessMove(choice.from, index)); setChessChoice(undefined); }
      } else {
        setTapPreview(undefined);
        setChessChoice(chess.get(chessSquare(index))?.color === chess.turn() && choice?.from !== index
          ? { matchId, revision: history.length, last: history.at(-1), from: index } : undefined);
      }
      return;
    }
    if (!confirmTap(index, touch)) return;
    const forbidden = isOmok ? isForbiddenDoubleThree(history, index, allowDoubleThree, overline) : Boolean(othello && !othello.legal.includes(index));
    setRejected(forbidden);
    if (!forbidden) move(index);
  }

  function updateAlkkagi(next: AlkkagiStatus) {
    if (room) return;
    if (next.phase !== alkkagi.phase) {
      const now = Date.now();
      setLocalRound(current => current.finishedAt ? current : { ...current,
        finishedAt: next.phase === 'finished' ? now : 0,
        deadline: next.phase === 'aim' ? nextDeadline(current.turnLimit, now) : 0,
      });
    }
    setAlkkagi(next);
  }

  const restart = () => {
    setRejected(false);
    if (room || isBoard) {
      reset();
      return;
    }
    const next = createFlickRound(flickSettings);
    setLocalFlick(next);
    setLocalRound(createLocalRound(localRound.turnLimit, rematchPlayerColor(firstPlayerColor, outcome === 3 || outcome === 4 ? undefined : outcome, loser)));
    setAlkkagi(settledStatus(next));
  };

  function surrender() {
    if (outcome) return;
    if (room) {
      if (room.surrender() && room.role !== 'host') setWaitingSurrender(true);
    } else if (isBoard) {
      endLocal(localTurn);
    } else {
      const now = Date.now();
      setLocalRound(current => current.finishedAt || (current.deadline && now >= current.deadline) ? current
        : { ...current, finishedAt: now, surrendered: localTurn, deadline: 0, timeoutPending: undefined });
    }
  }

  const resultVisible = Boolean(report && closedResult !== report.id && !resultPending);
  const info = (!outcome || chess) && <>
    <div className="match-status" role="status">
      <strong>{status}</strong>{isBoard && <small>{t('played', { count: history.length })}</small>}
    </div>
    {roundStart.started && !outcome && <PlayTime key={matchId} startedAt={startedAt} />}
    {roundStart.started && !outcome && <TurnClock key={matchId + '/' + deadline} deadline={deadline} enabled={Boolean(limit)} audible={!room || turn === playerColor} onExpired={() => {
      if (room) return;
      if (isBoard) endLocal(localTurn, deadline);
      else setLocalRound(current => current.finishedAt || current.deadline !== deadline ? current
        : { ...current, timeoutPending: { color: localTurn, at: deadline }, deadline: 0 });
    }} />}
    <section aria-label={room ? t('participants') : undefined}>
      {room && <h2 className="match-roster-label">{t('participants')}</h2>}
      <ul className={room ? 'seats match-roster' : 'seats'}>
        {flickPlayers.slice(0, room?.physics?.players ?? 2).map((stone, index) => {
          const role = room?.physicsSeats?.[index] ?? (stone === room?.hostColor ? 'host' : 'guest');
          const ownSeat = room?.playerColor === stone;
          const participant = room?.participants.find(candidate => candidate.role === role);
          const profile = ownSeat ? ownProfile ?? participant?.profile : participant?.profile;
          const side = t(sideLabel(id, stone));
          return <li className="seat" key={stone} data-active={!outcome && !busy && turn === stone}>
            {profile ? <Avatar appearance={profile} size={34} />
              : <span className={'stone stone-' + (stone > 2 ? stone : sideLabel(id, stone) === 'black' ? 0 : 1)} aria-hidden="true" />}
            <div>
              <strong title={profile?.name}>{room ? profile?.name ?? t('anonymousPlayer') : side}</strong>
              {room ? <small>{[side, t(ownSeat ? 'me' : role === 'host' ? 'host' : 'guest'), profile ? t('levelValue', { level: profile.level }) : undefined].filter(Boolean).join(' · ')}</small>
                : <small>{t(stone === firstPlayerColor ? 'playerOne' : 'playerTwo')}</small>}
              {othello && <small>{t('discCount', { count: othello.scores[index] })}</small>}
              {!isBoard && <small>{t('remaining', { count: flickStatus.remaining[index] })}</small>}
            </div>
          </li>;
        })}
      </ul>
    </section>
    {chess && <ChessLosses history={history} />}
    {!isBoard && <p className="power-summary"><span>{t('force')}</span><strong>{t((room?.power ?? power) === 1.35 ? 'fast' : 'standard')}</strong></p>}
    {isOmok && <span className="match-rule">{t(allowDoubleThree ? 'allow33' : 'ban33')} · {t(overline)}</span>}
    {room?.state && <p className="connection" role="status">{t(room.state)}</p>}
    {room?.needsReconnect && (
      <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>
    )}
    {waitingSurrender && <p role="status" className="muted">{t('surrenderPending')}</p>}
  </>;
  const resultPanel = outcome && report && <GameResult key={report.id} report={report} winner={outcome} surrendered={room ? surrendered : undefined} timedOut={timedOut}
    title={!room && surrendered ? t('gameFinished') : undefined} scores={othello?.scores} visible={resultVisible} onClose={() => setClosedResult(report.id)}
    record={room ? record : undefined} rematch={restart}
    room={room && { canRematch: canReset, reconnect: room.needsReconnect ? room.reconnect : undefined,
      request: room.role !== 'host' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
    back={room ? '/room' : '/games'} navigate={navigate} />;

  const deadlineDecision = pending && !outcome && <TimeoutDecision key={pending.at}
    timedPlayer={t(sideLabel(id, pending.color))} decisionPlayer={t(sideLabel(id, oppositeStone(pending.color)))}
    mayChoose={!room || (room.playerColor !== undefined && room.playerColor !== pending.color)}
    canSubmit={!room || room.role === 'host' || room.state === 'connected'}
    reconnect={room?.needsReconnect ? room.reconnect : undefined}
    choose={choice => {
      if (room) room.chooseTimeout(choice);
      else if (isBoard) decideLocal(choice, pending.at);
      else {
        const now = Date.now();
        setLocalRound(current => current.timeoutPending?.at === pending.at && !current.finishedAt
          ? { ...current, ...resolveTurnTimeout(pending, choice, now) } : current);
      }
    }} />;

  const promotion = !outcome && !pending && choice?.to !== undefined && <ChessPromotion canChoose={canMove}
    cancel={() => setChessChoice({ ...choice, to: undefined })} choose={piece => {
      if (!canMove || choice.to === undefined) return;
      move(encodeChessMove(choice.from, choice.to, piece));
      setChessChoice(undefined);
    }} />;

  return (
    <div className="site-width subpage play-page">
      <BackLink fallback={back} fallbackLabel={backLabel} navigate={navigate} />
      <div className="play-heading">
        <div>
          <h1 tabIndex={-1}>{t(id)}</h1>
          <p>{t(room ? 'online' : 'local')}</p>
        </div>
        {room?.rematchNotice === 'incoming' && !resultVisible && <p role="status">{t('rematchIncoming')}</p>}
        {room?.code && <div className="play-room-code"><span>{t('code')}</span><code>{room.code}</code></div>}
      </div>
      <div className="play-layout">
        <MatchStage id={id} matchId={matchId} antialias={antialias} setCursor={setCursor} info={info}
          resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
          beginsAt={roundStart.beginsAt} ending={ending} onReady={roundStart.ready}
          endAction={!outcome && !eliminated && <EndRoundAction key={matchId} online={Boolean(room)} end={surrender}
            disabled={!roundStart.started || waitingSurrender || (multiplayerFlick && busy) || Boolean(room && room.state !== 'connected')} />}
          infoStatus={status} yourTurn={yourTurn} timer={roundStart.started && !outcome && <TurnClock key={deadline} deadline={deadline} enabled={Boolean(limit)} compact />}
          showTouches={showTouches} onTouchDisplay={onTouchDisplay} localTouch={touchStyle === 'soft'}
          remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch} reactions={room?.reactions} ownProfile={ownProfile} result={resultPanel} resultVisible={resultVisible}
          resultPending={resultPending} decision={deadlineDecision || promotion}
          onShowResult={() => setClosedResult('')} view={{
            history, cursor: canMove && tapPreview?.matchId === matchId && tapPreview.history === history ? tapPreview.index : cursor,
            chessSelected: choice?.from, chessTargets, dark, allowDoubleThree, onAlkkagi: updateAlkkagi,
            force: room?.power ?? power,
            localFlick,
            onlineFlick: room?.physics && { ...room.physics, host: room.role === 'host', send: room.flick, settle: room.settleFlick },
            canMove, deadline, finished: Boolean(outcome), move: tryMove,
          }} />
        {!outcome && <div className="play-feedback" aria-live="polite">
          {madeDoubleThree && <p className="double-three-badge">{t('made33')}</p>}
          {rejected && <p className="muted">{t(isOmok ? 'blocked33' : 'invalidOthello')}</p>}
          {othello?.passed && <p className="muted">{t('othelloPass', { stone: t(othello.passed === 1 ? 'black' : 'white') })}</p>}
          {chess?.inCheck() && <p className="muted">{t('chessCheck')}</p>}
        </div>}
      </div>
    </div>
  );
}
