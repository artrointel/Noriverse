import { lazy, Suspense, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { availableTileMatches, connectTiles, createSichuanBoard, isMatchTile, nextSichuanCombo, obstacle, shuffleTiles } from '../games/sichuan/rules.ts';
import type { Tile, TilePoint } from '../games/sichuan/rules.ts';
import { resolveSichuanSettings } from '../games/sichuan/options.ts';
import type { SichuanSettings } from '../games/sichuan/options.ts';
import { puzzleBoardFor, puzzleOutcome } from '../games/sichuan/multiplayer.ts';
import type { PuzzleRound } from '../games/sichuan/multiplayer.ts';
import type { SichuanRoomSettings } from '../games/sichuan/options.ts';
import { playSound } from './audio.ts';
import { GameResult } from './game-result.tsx';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { PlayTime } from './play-page.tsx';
import { formatPlayTime } from './profiles.tsx';

const GameStage = lazy(() => import('./game-stage.tsx').then(module => ({ default: module.GameStage })));
const setup = gamePath('sichuan', 'setup');
function newRound(settings: SichuanSettings) {
  const options = resolveSichuanSettings(settings);
  return { id: crypto.randomUUID(), startedAt: 0, board: createSichuanBoard(options), options, shufflesLeft: options.shuffles };
}

function PuzzleClock({ deadline }: { deadline: number }) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  useEffect(() => {
    let timer: number;
    function update() {
      const remaining = deadline - Date.now();
      const left = Math.max(0, Math.ceil(remaining / 1000));
      setSeconds(left);
      if (left) timer = window.setTimeout(update, remaining - (left - 1) * 1000);
    }
    update();
    return () => window.clearTimeout(timer);
  }, [deadline]);
  return <time className="stage-clock" data-low={seconds <= 10} dateTime={'PT' + seconds + 'S'}
    aria-label={t('sichuanTimeLeft', { time: formatPlayTime(seconds) })}>{formatPlayTime(seconds)}</time>;
}

type PuzzleRoom = ReturnType<typeof useRoomBoard> & { puzzle: PuzzleRound; puzzleConfig: SichuanRoomSettings; role: Role };
type LocalResult = { at: number; reason: 'clear' | 'timeout' | 'stuck' };

export function SichuanPage({ settings, room, ownProfile, dark, antialias, resolution, onResolution, onAntialias, navigate, record, showTouches, onTouchDisplay, touchStyle }: {
  settings: SichuanSettings;
  room?: PuzzleRoom; ownProfile?: ProfileSummary;
  dark: boolean; antialias: boolean; resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  navigate: Navigate; record?: (report: MatchReport) => Promise<boolean>;
  showTouches: boolean; onTouchDisplay: (active: boolean) => void; touchStyle: TouchEffect;
}) {
  const { t } = useTranslation();
  const [local, setRound] = useState(() => room ? undefined : newRound(settings));
  const [selected, setSelected] = useState<number>();
  const [hint, setHint] = useState<readonly [number, number]>();
  const [cursor, setCursor] = useState<number | null>(null);
  const [match, setMatch] = useState<{ path: readonly TilePoint[]; combo: number }>();
  const [rejected, setRejected] = useState<{ index: number }>();
  const [feedback, setFeedback] = useState<'sichuanDifferent' | 'sichuanBlocked' | 'sichuanHinted' | 'sichuanShuffled' | 'sichuanObstacleFeedback'>();
  const [resultState, setResultState] = useState<LocalResult>();
  const [flip, setFlip] = useState<{ phase: 'backs' | 'faces'; board: Tile[]; previous?: Tile[] }>();
  const [combo, setCombo] = useState<{ at: number; count: number }>();
  const [localMax, setLocalMax] = useState(0);
  const [localRemoved, setLocalRemoved] = useState(0);
  const [showResult, setShowResult] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [onlineStarted, setOnlineStarted] = useState(false);
  const onlineBoard = room && puzzleBoardFor(room.puzzle, room.puzzleConfig.mode, room.role);
  const round = room && onlineBoard ? { id: room.matchId, startedAt: room.puzzleDisplayStart, options: room.puzzle.options,
    board: onlineBoard.tiles, shufflesLeft: onlineBoard.shufflesLeft } : local!;
  const remaining = round.board.filter(isMatchTile).length;
  const { pair, pairs } = useMemo(() => availableTileMatches(round.board), [round.board]);
  const deadline = round.startedAt ? round.startedAt + round.options.timeLimit * 1000 : 0;
  const onlineResult = room?.puzzle.result;
  const finished = Boolean(resultState || onlineResult);
  const canMove = Boolean(deadline && !finished && !flip && (!room || (onlineStarted && room.state === 'connected')));
  const recordStart = room ? room.puzzle.beginsAt || room.startedAt : round.startedAt;
  const end = room ? room.finishedAt : resultState?.at;
  const outcome = room && onlineResult ? puzzleOutcome(onlineResult, room.role) : resultState ? resultState.reason === 'clear' ? 'win' : 'loss' : undefined;
  const report = useMemo<MatchReport | undefined>(() => outcome && end ? { id: round.id, game: 'sichuan', mode: room ? 'online' : 'local',
    outcome, seconds: elapsedPlaySeconds(recordStart, end) } : undefined, [round.id, end, outcome, recordStart, Boolean(room)]);
  const observed = useRef({ revision: room?.puzzle.revision, board: onlineBoard });
  const event = room?.puzzle.event;
  const visibleEvent = event && (room?.puzzleConfig.mode === 'coop' || event.actor === room?.role) ? event : undefined;
  const onlineMatch = useMemo(() => visibleEvent?.kind === 'pair' ? { path: visibleEvent.path, combo: visibleEvent.combo } : undefined,
    [room?.puzzle.revision]);

  const signalReady = useEffectEvent(() => room?.puzzleReady());
  const seatReady = room?.puzzle.ready[room.role];
  useEffect(() => {
    if (!loaded || room?.state !== 'connected' || seatReady || finished) return;
    signalReady();
    const retry = window.setInterval(signalReady, 750);
    return () => window.clearInterval(retry);
  }, [loaded, room?.state, seatReady, finished]);

  useEffect(() => {
    if (!room || !round.startedAt) return;
    const timer = window.setTimeout(() => setOnlineStarted(true), Math.max(0, round.startedAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [Boolean(room), round.startedAt]);

  useLayoutEffect(() => {
    if (!room || observed.current.revision === room.puzzle.revision) return;
    const previous = observed.current.board;
    observed.current = { revision: room.puzzle.revision, board: onlineBoard };
    if (visibleEvent?.kind === 'shuffle' && previous && onlineBoard && previous.shufflesLeft !== onlineBoard.shufflesLeft) {
      setSelected(undefined);
      setHint(undefined);
      setCombo(undefined);
      setFeedback('sichuanShuffled');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setFlip({ phase: 'backs', board: onlineBoard.tiles, previous: previous.tiles });
    } else if (visibleEvent?.kind === 'pair' && previous && onlineBoard && previous.tiles.filter(isMatchTile).length !== remaining) {
      if (visibleEvent.combo > 1) {
        setCombo({ count: visibleEvent.combo, at: performance.now() });
        playSound('combo', visibleEvent.combo);
      } else playSound('place');
    }
  }, [room?.puzzle.revision]);

  useEffect(() => {
    if (onlineResult && outcome) playSound(outcome);
  }, [onlineResult, outcome]);

  function finish(reason: 'clear' | 'timeout' | 'stuck', at = Date.now()) {
    if (resultState) return;
    setResultState({ reason, at });
    playSound(reason === 'clear' ? 'win' : 'loss');
  }

  const expire = useEffectEvent(() => finish('timeout', deadline));
  useEffect(() => {
    if (room || !deadline || resultState) return;
    const timer = window.setTimeout(expire, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [Boolean(room), deadline, resultState]);

  const loseStuck = useEffectEvent(() => finish('stuck'));
  useEffect(() => {
    if (!room && canMove && !pair && remaining && round.shufflesLeft === 0) loseStuck();
  }, [Boolean(room), canMove, pair, remaining, round.shufflesLeft]);

  useEffect(() => {
    if (!flip) return;
    const timer = window.setTimeout(() => {
      if (flip.phase === 'backs') {
        setRound(current => current && ({ ...current, board: flip.board }));
        setFlip({ ...flip, phase: 'faces' });
      } else setFlip(undefined);
    }, flip.phase === 'backs' ? 235 : 215);
    return () => window.clearTimeout(timer);
  }, [flip]);

  useEffect(() => {
    if (!combo) return;
    const timer = window.setTimeout(() => setCombo(undefined), 1050);
    return () => window.clearTimeout(timer);
  }, [combo]);

  function pick(index: number) {
    if (!canMove) return;
    if (Date.now() >= deadline) { if (!room) finish('timeout', deadline); return; }
    const tile = round.board[index];
    if (tile === obstacle) {
      setRejected({ index });
      setFeedback('sichuanObstacleFeedback');
      return;
    }
    if (!isMatchTile(tile)) return;
    setHint(undefined);
    setFeedback(undefined);
    if (selected !== index) playSound('paper');
    if (selected === undefined || selected === index || !isMatchTile(round.board[selected])) {
      setSelected(selected === index ? undefined : index); return;
    }
    const route = connectTiles(round.board, selected, index);
    if (!route) {
      setFeedback(round.board[selected] === round.board[index] ? 'sichuanBlocked' : 'sichuanDifferent');
      setSelected(index);
      return;
    }
    setSelected(undefined);
    if (room) { room.puzzleAction({ kind: 'pair', first: selected, second: index, generation: round.shufflesLeft }); return; }
    setRound(current => current && ({ ...current, board: current.board.map((tile, cell) => cell === selected || cell === index ? null : tile) }));
    const chain = nextSichuanCombo(combo, performance.now());
    setLocalMax(old => Math.max(old, chain.count));
    setLocalRemoved(old => old + 2);
    setMatch({ path: route, combo: chain.count });
    setCombo(chain);
    if (chain.count > 1) playSound('combo', chain.count);
    if (remaining === 2) finish('clear');
    else if (chain.count === 1) playSound('place');
  }

  function reshuffle() {
    if (!canMove || pair || round.shufflesLeft === 0) return;
    if (Date.now() >= deadline) { if (!room) finish('timeout', deadline); return; }
    if (room) { room.puzzleAction({ kind: 'shuffle', generation: round.shufflesLeft }); return; }
    const board = shuffleTiles(round.board);
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    setRound(current => current && ({ ...current, shufflesLeft: current.shufflesLeft - 1, board: animate ? current.board : board }));
    if (animate) setFlip({ phase: 'backs', board });
    setSelected(undefined);
    setHint(undefined);
    setMatch(undefined);
    setCombo(undefined);
    setFeedback('sichuanShuffled');
  }

  function reset() {
    if (room) { room.rematch(); return; }
    setRound(newRound(settings));
    setSelected(undefined);
    setHint(undefined);
    setCursor(null);
    setMatch(undefined);
    setRejected(undefined);
    setFeedback(undefined);
    setResultState(undefined);
    setFlip(undefined);
    setCombo(undefined);
    setShowResult(true);
    setLocalMax(0);
    setLocalRemoved(0);
  }

  function showHint() {
    if (!canMove || !pair || Date.now() >= deadline) return;
    setHint(pair);
    setSelected(undefined);
    setFeedback('sichuanHinted');
  }

  const status = onlineResult ? t(onlineResult === 'timeout' ? 'sichuanTimedOut' : onlineResult === 'abandoned' ? 'sichuanAbandoned'
    : onlineResult === 'team' ? 'sichuanTeamWin' : outcome === 'win' ? 'sichuanRaceWin' : 'sichuanRaceLoss')
    : resultState ? t(resultState.reason === 'clear' ? 'sichuanClear' : resultState.reason === 'timeout' ? 'sichuanTimedOut' : 'sichuanStuck')
    : room && !onlineStarted ? t('sichuanWaiting') : t('sichuanRemaining', { count: remaining / 2 });
  const back = room ? '/room' : setup;
  const description = t('sichuanTheme_' + round.options.theme) + ` · ${round.options.size} × ${round.options.size} · ${round.options.density}%`;
  const feedbackText = flip ? t('sichuanShuffling') : feedback ? t(feedback) : !finished && canMove && !pair ? t('sichuanNoPairs') : undefined;
  const stats = room ? (['host', 'guest'] as const).map(role => ({ role, ...room.puzzle.stats[role],
    profile: (role === room.role ? ownProfile : undefined) ?? room.participants.find(player => player.role === role)?.profile,
    outcome: onlineResult && puzzleOutcome(onlineResult, role) }))
    : [{ role: 'solo', maxCombo: localMax, removed: localRemoved, profile: ownProfile, outcome }];
  const results = <section className="sichuan-score" aria-label={t('sichuanPlayerStats')}>
    {stats.map(row => <div key={row.role}><strong>{row.profile?.name ?? t(row.role === 'solo' ? 'me' : row.role)}
      {row.outcome && <small>{t('outcome_' + row.outcome)}</small>}</strong>
      <span>{t('sichuanMaxCombo')} <b>{row.maxCombo}</b></span><span>{t('sichuanRemovedTiles')} <b>{row.removed}</b></span></div>)}
  </section>;
  const info = <>
    <strong>{status}</strong>
    <small>{description}</small>
    <p className="match-time"><span>{t('sichuanRemovable')}</span><strong>{pairs}</strong></p>
    <p className="match-time"><span>{t('sichuanShufflesLeft')}</span><strong>{round.shufflesLeft}</strong></p>
    {round.startedAt > 0 && !finished && <PlayTime key={round.id} startedAt={round.startedAt} />}
    {room && <><p className="connection" role="status">{t(room.state ?? 'joining')}</p>{results}
      {(room.state === 'failed' || room.state === 'disconnected') && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}</>}
  </>;
  const result = report && <GameResult key={report.id} report={report} winner={1} title={status} visible={showResult} onClose={() => setShowResult(false)}
    details={results} room={room && { canRematch: room.role === 'host' && room.state === 'connected',
      request: room.role === 'guest' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
    record={record} rematch={reset} back={room ? '/room' : '/games'} navigate={navigate} />;

  return <div className="site-width subpage play-page">
    <BackLink fallback={back} fallbackLabel={room ? 'goToRoom' : 'settings'} navigate={navigate} />
    <div className="play-heading"><div><h1 tabIndex={-1}>{t('sichuan')}</h1><p>{t(room ? 'sichuanMode_' + room.puzzleConfig.mode : 'local')}</p></div></div>
    <div className="play-layout">
      <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
        <GameStage key={round.id} id="sichuan" matchId={round.id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
          onReady={() => { setLoaded(true); setRound(current => !current || current.startedAt ? current : { ...current, startedAt: Date.now() }); }}
          timer={deadline > 0 && !finished && (!room || onlineStarted) && <PuzzleClock deadline={deadline} />}
          setCursor={setCursor} info={info} infoStatus={status} yourTurn={false} result={result} resultVisible={Boolean(report && showResult)}
          resultPending={false} onShowResult={() => setShowResult(true)} showTouches={showTouches} onTouchDisplay={onTouchDisplay}
          remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch}
          localTouch={touchStyle === 'soft'} view={{ history: [], cursor, chessTargets: new Map(), dark, allowDoubleThree: true, force: 1,
            canMove, deadline, finished, move: pick, onAlkkagi: () => {},
            sichuan: { board: flip?.phase === 'backs' && flip.previous ? flip.previous : round.board, size: round.options.size, theme: round.options.theme,
              selected, hint, match: room ? onlineMatch : match, rejected, flip: flip?.phase,
              hud: { status, description, feedback: feedbackText, startedAt: (!room || onlineStarted) ? round.startedAt : 0,
                endedAt: end ? end + round.startedAt - recordStart : undefined,
                remaining: remaining / 2, available: pairs, shuffles: round.shufflesLeft,
                labels: { timeLeft: t('sichuanHudTime'), remaining: t('sichuanHudRemaining'), available: t('sichuanHudAvailable'),
                  shuffles: t('sichuanShufflesLeft'), elapsed: t('playTime'), shuffle: t('sichuanShuffle'), hint: t('sichuanHint') },
                shuffle: canMove && !pair && round.shufflesLeft > 0 ? reshuffle : undefined, hint: canMove && pair ? showHint : undefined } } }} />
      </Suspense>
      <span className="visually-hidden" role="status">{feedbackText}</span>
      <span className="visually-hidden" role="status">{combo && combo.count > 1 && <span key={combo.at}>{t('sichuanCombo', { count: combo.count })}</span>}</span>
    </div>
  </div>;
}
