import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchReport } from '../../../../packages/protocol/profile.ts';
import { initialAlkkagi } from '../games/alkkagi/rules.ts';
import { doubleThreeAxes, isForbiddenDoubleThree, nextStone, result } from '../games/omok/rules.ts';
import type { GameId } from '../games/scenes.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import type { Power } from './catalog-pages.tsx';
import { gamePath, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { playSound } from './audio.ts';
import { GameResult } from './game-result.tsx';

const GameStage = lazy(() => import('./game-stage.tsx').then(module => ({ default: module.GameStage })));
type Room = ReturnType<typeof useRoomBoard>;

export function PlayPage({ id, dark, room, power, practice, history, omokRound, allowDoubleThree, move, reset, record, navigate }: {
  id: GameId; dark: boolean; room?: Room; power: Power; practice: boolean; history: number[];
  omokRound?: ReturnType<typeof createLocalRound>;
  allowDoubleThree: boolean; move: (index: number) => void; reset: () => void;
  record?: (report: MatchReport) => Promise<boolean>; navigate: Navigate;
}) {
  const { t } = useTranslation();
  const [cursor, setCursor] = useState<number | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [alkkagi, setAlkkagi] = useState(initialAlkkagi);
  const [localRound, setLocalRound] = useState(createLocalRound);
  const [practiceFinished, setPracticeFinished] = useState(false);
  const [rejected, setRejected] = useState(false);
  const isOmok = id === 'omok';
  const isMatch = isOmok || !practice;
  const outcome = practiceFinished ? 'practice' : isOmok ? result(history) : alkkagi.winner;
  const canReset = !room || (room.role === 'host' && room.state === 'connected');
  const back = room ? '/room' : gamePath(id, 'setup', practice ? 'practice' : 'local');
  const backLabel = room ? 'goToRoom' : 'settings';
  const busy = !isOmok && alkkagi.phase === 'moving';
  const turn = isOmok ? nextStone(history) : alkkagi.turn;
  const status = busy ? t('settling') : t('turns', { stone: t(turn === 1 ? 'black' : 'white') });
  const matchId = room?.matchId ?? omokRound?.id ?? localRound.id;
  const startedAt = room?.startedAt ?? omokRound?.startedAt ?? localRound.startedAt;
  const finishedAt = room?.finishedAt ?? omokRound?.finishedAt ?? localRound.finishedAt;
  const mode = room ? 'online' : practice ? 'practice' : 'local';
  const playerColor = room?.role === 'guest' ? 2 : 1;
  const report = useMemo<MatchReport | undefined>(() => {
    if (!outcome || !matchId) return;
    const seconds = Math.min(10800, Math.max(1, Math.round(((finishedAt || Date.now()) - startedAt) / 1000)));
    return { id: matchId, game: id, mode, seconds,
      outcome: outcome === 'draw' || outcome === 'practice' ? outcome : outcome === playerColor ? 'win' : 'loss' };
  }, [matchId, id, mode, startedAt, finishedAt, outcome, playerColor]);
  const latest = history.at(-1);
  const madeDoubleThree = isOmok && allowDoubleThree && latest !== undefined
    && doubleThreeAxes(history.slice(0, -1), latest).length >= 2;

  useEffect(() => { if (report) playSound('win'); }, [report]);

  function tryMove(index: number) {
    const forbidden = isOmok && isForbiddenDoubleThree(history, index, allowDoubleThree);
    setRejected(forbidden);
    if (!forbidden) move(index);
  }

  const restart = () => {
    if (!isOmok) setLocalRound(createLocalRound());
    setRejected(false);
    setPracticeFinished(false);
    if (isOmok) {
      reset();
      return;
    }
    setAlkkagi(initialAlkkagi);
    setRestartKey(value => value + 1);
  };

  return (
    <div className="site-width subpage play-page">
      <RouteLink href={back} navigate={navigate} className="back-link">{t(backLabel)}</RouteLink>
      <div className="play-heading">
        <div>
          <h1 tabIndex={-1}>{t(id)}</h1>
          <p>{t(room ? 'online' : practice ? 'practice' : 'local')}</p>
          {isMatch && !outcome && <strong className="mobile-turn" aria-hidden="true">{status}</strong>}
        </div>
        {room?.code && <div className="play-room-code"><span>{t('code')}</span><code>{room.code}</code></div>}
      </div>
      {outcome && report ? <GameResult report={report} winner={outcome} record={record} rematch={restart}
        room={room && { canRematch: canReset, reconnect: room.state === 'disconnected' || room.state === 'failed' ? room.reconnect : undefined }}
        back={room ? '/room' : '/games'} navigate={navigate} /> : (
      <div className="play-layout">
        <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
          <GameStage key={restartKey} id={id} setCursor={setCursor} view={{
            history, cursor, dark, practice, allowDoubleThree, onAlkkagi: setAlkkagi, force: power === 'fast' ? 1.35 : 1,
            canMove: room ? room.canMove : !outcome, move: tryMove,
          }} />
        </Suspense>
        <aside className="play-aside">
          <section className="surface match-panel">
            {isMatch && (
              <>
                <div className="match-status" role="status">
                  <strong>{status}</strong>{isOmok && <small>{t('played', { count: history.length })}</small>}
                </div>
                <div className="seats play-seats">
                  {([1, 2] as const).map((stone, index) => (
                    <div className="seat" key={stone} data-active={!outcome && !busy && turn === stone}>
                      <span className={'stone stone-' + index} aria-hidden="true" />
                      <div>
                        <strong>{t(stone === 1 ? 'black' : 'white')}</strong>
                        {room && <small>{t(room.role === (stone === 1 ? 'host' : 'guest') ? 'me' : 'guest')}</small>}
                        {!isOmok && <small>{t('remaining', { count: alkkagi.remaining[index] })}</small>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!isOmok && <p className="power-summary"><span>{t('force')}</span><strong>{t(power)}</strong></p>}
            {isOmok && <span className="match-rule">{t(allowDoubleThree ? 'allow33' : 'ban33')}</span>}
            {madeDoubleThree && <p className="double-three-badge" role="status">{t('made33')}</p>}
            {rejected && <p className="muted" role="status">{t('blocked33')}</p>}
            {room?.state && <p className="connection" role="status">{t(room.state)}</p>}
            {(room?.state === 'failed' || room?.state === 'disconnected') && (
              <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>
            )}
            <div className="panel-actions">
              {canReset && <button type="button" className="button button-secondary" onClick={restart}>{t('reset')}</button>}
              {practice && <button type="button" className="button button-primary" onClick={() => setPracticeFinished(true)}>{t('finishPractice')}</button>}
            </div>
          </section>
        </aside>
      </div>
      )}
    </div>
  );
}

export function createLocalRound() {
  return { id: crypto.randomUUID(), startedAt: Date.now(), finishedAt: 0 };
}
