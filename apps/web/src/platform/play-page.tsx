import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport } from '../../../../packages/protocol/profile.ts';
import { initialAlkkagi } from '../games/alkkagi/rules.ts';
import type { AlkkagiStatus } from '../games/alkkagi/rules.ts';
import { isBoardGame } from '../games/board-rules.ts';
import { doubleThreeAxes, isForbiddenDoubleThree, nextStone, result } from '../games/omok/rules.ts';
import { othelloState } from '../games/othello/rules.ts';
import type { GameId } from '../games/scenes.ts';
import type { Stone } from '../games/table.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import type { Power } from './catalog-pages.tsx';
import { gamePath, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { playSound } from './audio.ts';
import { GameResult } from './game-result.tsx';
import { formatPlayTime } from './profiles.tsx';

const GameStage = lazy(() => import('./game-stage.tsx').then(module => ({ default: module.GameStage })));
type Room = ReturnType<typeof useRoomBoard>;

function PlayTime({ startedAt }: { startedAt: number }) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(() => elapsedPlaySeconds(startedAt, Date.now()));
  useEffect(() => {
    let timeout: number;
    function update() {
      const now = Date.now();
      setSeconds(elapsedPlaySeconds(startedAt, now));
      const elapsed = Math.max(0, now - startedAt);
      timeout = window.setTimeout(update, 1000 - (elapsed % 1000));
    }
    update();
    return () => window.clearTimeout(timeout);
  }, [startedAt]);
  return <p className="match-time"><span>{t('playTime')}</span><time dateTime={'PT' + seconds + 'S'}>{formatPlayTime(seconds)}</time></p>;
}

export function PlayPage({ id, dark, room, power, history, boardRound, allowDoubleThree, move, reset, surrenderLocal, record, navigate }: {
  id: GameId; dark: boolean; room?: Room; power: Power; history: number[];
  boardRound?: ReturnType<typeof createLocalRound>;
  allowDoubleThree: boolean; move: (index: number) => void; reset: () => void;
  surrenderLocal: (color: Stone) => void;
  record?: (report: MatchReport) => Promise<boolean>; navigate: Navigate;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState<number | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [alkkagi, setAlkkagi] = useState(initialAlkkagi);
  const [localRound, setLocalRound] = useState(createLocalRound);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [waitingSurrender, setWaitingSurrender] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [closedResult, setClosedResult] = useState('');
  const lastTurnCue = useRef('');
  const isOmok = id === 'omok';
  const isBoard = isBoardGame(id);
  const othello = useMemo(() => id === 'othello' ? othelloState(history) : undefined, [id, history]);
  const surrendered = room?.surrendered ?? boardRound?.surrendered ?? localRound.surrendered;
  const outcome = surrendered ? (surrendered === 1 ? 2 : 1)
    : isOmok ? result(history) : othello ? othello.winner : alkkagi.winner;
  const canReset = !room || (room.role === 'host' && room.state === 'connected');
  const back = room ? '/room' : gamePath(id, 'setup');
  const backLabel = room ? 'goToRoom' : 'settings';
  const busy = !isBoard && alkkagi.phase === 'moving';
  const turn = isOmok ? nextStone(history) : othello ? othello.turn ?? 1 : alkkagi.turn;
  const status = busy ? t('settling') : t('turns', { stone: t(turn === 1 ? 'black' : 'white') });
  const matchId = room?.matchId ?? boardRound?.id ?? localRound.id;
  const startedAt = room?.startedAt ?? boardRound?.startedAt ?? localRound.startedAt;
  const finishedAt = room?.finishedAt ?? boardRound?.finishedAt ?? localRound.finishedAt;
  const mode = room ? 'online' : 'local';
  const playerColor = room?.role === 'guest' ? 2 : 1;
  const canMove = !outcome && !waitingSurrender && (room ? room.canMove : !busy);
  const report = useMemo<MatchReport | undefined>(() => {
    if (!outcome || !matchId) return;
    const seconds = elapsedPlaySeconds(startedAt, finishedAt || Date.now());
    return { id: matchId, game: id, mode, seconds,
      outcome: outcome === 'draw' ? outcome : outcome === playerColor ? 'win' : 'loss' };
  }, [matchId, id, mode, startedAt, finishedAt, outcome, playerColor]);
  const latest = history.at(-1);
  const madeDoubleThree = isOmok && allowDoubleThree && latest !== undefined
    && doubleThreeAxes(history.slice(0, -1), latest).length >= 2;

  useEffect(() => {
    if (report) playSound(report.outcome === 'win' || report.outcome === 'loss' ? report.outcome : 'finish');
  }, [report]);

  useEffect(() => {
    if (!canMove) return;
    const cue = [matchId, turn, history.length, ...alkkagi.remaining].join('/');
    if (cue === lastTurnCue.current) return;
    lastTurnCue.current = cue;
    playSound('turn');
  }, [alkkagi.remaining, canMove, history.length, matchId, turn]);

  useEffect(() => {
    setWaitingSurrender(false);
    setConfirmSurrender(false);
  }, [matchId, room?.state]);

  function tryMove(index: number) {
    if (!canMove) return;
    const forbidden = isOmok ? isForbiddenDoubleThree(history, index, allowDoubleThree) : Boolean(othello && !othello.legal.includes(index));
    setRejected(forbidden);
    if (!forbidden) move(index);
  }

  function updateAlkkagi(next: AlkkagiStatus) {
    if (next.phase === 'finished') {
      const endedAt = Date.now();
      setLocalRound(current => current.finishedAt ? current : { ...current, finishedAt: endedAt });
    }
    setAlkkagi(next);
  }

  const restart = () => {
    if (!isBoard) setLocalRound(createLocalRound());
    setRejected(false);
    setConfirmSurrender(false);
    if (isBoard) {
      reset();
      return;
    }
    setAlkkagi(initialAlkkagi);
    setRestartKey(value => value + 1);
  };

  function surrender() {
    if (outcome) return;
    setConfirmSurrender(false);
    if (room) {
      if (room.surrender() && room.role === 'guest') setWaitingSurrender(true);
    } else if (isBoard) {
      surrenderLocal(turn);
    } else {
      setLocalRound(current => ({ ...current, finishedAt: Date.now(), surrendered: turn }));
    }
  }

  const resultVisible = Boolean(report && closedResult !== report.id);
  const info = !outcome && <>
    <div className="match-status" role="status">
      <strong>{status}</strong>{isBoard && <small>{t('played', { count: history.length })}</small>}
    </div>
    <PlayTime key={matchId} startedAt={startedAt} />
    <div className="seats">
      {([1, 2] as const).map((stone, index) => (
        <div className="seat" key={stone} data-active={!busy && turn === stone}>
          <span className={'stone stone-' + index} aria-hidden="true" />
          <div>
            <strong>{t(stone === 1 ? 'black' : 'white')}</strong>
            {room && <small>{t(room.role === (stone === 1 ? 'host' : 'guest') ? 'me' : 'guest')}</small>}
            {othello && <small>{t('discCount', { count: othello.scores[index] })}</small>}
            {!isBoard && <small>{t('remaining', { count: alkkagi.remaining[index] })}</small>}
          </div>
        </div>
      ))}
    </div>
    {!isBoard && <p className="power-summary"><span>{t('force')}</span><strong>{t(power)}</strong></p>}
    {isOmok && <span className="match-rule">{t(allowDoubleThree ? 'allow33' : 'ban33')}</span>}
    {room?.state && <p className="connection" role="status">{t(room.state)}</p>}
    {(room?.state === 'failed' || room?.state === 'disconnected') && (
      <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>
    )}
    {!confirmSurrender && <button type="button" className="button button-secondary" disabled={waitingSurrender || Boolean(room && room.state !== 'connected')}
      onClick={() => setConfirmSurrender(true)}>{t('surrender')}</button>}
    {waitingSurrender && <p role="status" className="muted">{t('surrenderPending')}</p>}
    {confirmSurrender && (
      <div className="surrender-confirm">
        <p>{t('confirmSurrender', { stone: t((room ? playerColor : turn) === 1 ? 'black' : 'white') })}</p>
        <div className="panel-actions">
          <button type="button" className="button button-primary" onClick={surrender}>{t('surrender')}</button>
          <button type="button" className="button button-secondary" onClick={() => setConfirmSurrender(false)}>{t('cancel')}</button>
        </div>
      </div>
    )}
  </>;
  const resultPanel = outcome && report && <GameResult key={report.id} report={report} winner={outcome} surrendered={surrendered}
    scores={othello?.scores} visible={resultVisible} onClose={() => setClosedResult(report.id)} record={record} rematch={restart}
    room={room && { canRematch: canReset, reconnect: room.state === 'disconnected' || room.state === 'failed' ? room.reconnect : undefined }}
    back={room ? '/room' : '/games'} navigate={navigate} />;

  return (
    <div className="site-width subpage play-page">
      <RouteLink href={back} navigate={navigate} className="back-link">{t(backLabel)}</RouteLink>
      <div className="play-heading">
        <div>
          <h1 tabIndex={-1}>{t(id)}</h1>
          <p>{t(room ? 'online' : 'local')}</p>
        </div>
        {room?.code && <div className="play-room-code"><span>{t('code')}</span><code>{room.code}</code></div>}
      </div>
      <div className="play-layout">
        <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
          <GameStage key={restartKey} id={id} setCursor={setCursor} info={info}
            infoStatus={status} result={resultPanel} resultVisible={resultVisible}
            onShowResult={() => setClosedResult('')} view={{
            history, cursor, dark, allowDoubleThree, onAlkkagi: updateAlkkagi, force: power === 'fast' ? 1.35 : 1,
            canMove, finished: Boolean(outcome), move: tryMove,
          }} />
        </Suspense>
        {!outcome && <div className="play-feedback" aria-live="polite">
          {madeDoubleThree && <p className="double-three-badge">{t('made33')}</p>}
          {rejected && <p className="muted">{t(isOmok ? 'blocked33' : 'invalidOthello')}</p>}
          {othello?.passed && <p className="muted">{t('othelloPass', { stone: t(othello.passed === 1 ? 'black' : 'white') })}</p>}
        </div>}
      </div>
    </div>
  );
}

export function createLocalRound(): { id: string; startedAt: number; finishedAt: number; surrendered?: Stone } {
  return { id: crypto.randomUUID(), startedAt: Date.now(), finishedAt: 0 };
}
