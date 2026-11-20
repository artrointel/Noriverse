import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { availableTileMatches, connectTiles, createSichuanBoard, isMatchTile, nextSichuanCombo, obstacle, shuffleTiles } from '../games/sichuan/rules.ts';
import type { Tile, TilePoint } from '../games/sichuan/rules.ts';
import { resolveSichuanSettings } from '../games/sichuan/options.ts';
import type { SichuanSettings } from '../games/sichuan/options.ts';
import { playSound } from './audio.ts';
import { GameResult } from './game-result.tsx';
import { gamePath, RouteLink } from './navigation.tsx';
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

export function SichuanPage({ settings, dark, antialias, resolution, onResolution, onAntialias, navigate, record, showTouches, onTouchDisplay, touchStyle }: {
  settings: SichuanSettings;
  dark: boolean; antialias: boolean; resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  navigate: Navigate; record?: (report: MatchReport) => Promise<boolean>;
  showTouches: boolean; onTouchDisplay: (active: boolean) => void; touchStyle: TouchEffect;
}) {
  const { t } = useTranslation();
  const [round, setRound] = useState(() => newRound(settings));
  const [selected, setSelected] = useState<number>();
  const [hint, setHint] = useState<readonly [number, number]>();
  const [cursor, setCursor] = useState<number | null>(null);
  const [match, setMatch] = useState<{ path: readonly TilePoint[]; combo: number }>();
  const [rejected, setRejected] = useState<{ index: number }>();
  const [feedback, setFeedback] = useState<'sichuanDifferent' | 'sichuanBlocked' | 'sichuanHinted' | 'sichuanShuffled' | 'sichuanObstacleFeedback'>();
  const [resultState, setResultState] = useState<{ at: number; reason: 'clear' | 'timeout' | 'stuck' }>();
  const [flip, setFlip] = useState<{ phase: 'backs' | 'faces'; board: Tile[] }>();
  const [combo, setCombo] = useState<{ at: number; count: number }>();
  const [showResult, setShowResult] = useState(true);
  const remaining = round.board.filter(isMatchTile).length;
  const { pair, count } = useMemo(() => availableTileMatches(round.board), [round.board]);
  const deadline = round.startedAt ? round.startedAt + round.options.timeLimit * 1000 : 0;
  const canMove = Boolean(deadline && !resultState && !flip);
  const report = useMemo<MatchReport | undefined>(() => resultState ? { id: round.id, game: 'sichuan', mode: 'local',
    outcome: resultState.reason === 'clear' ? 'win' : 'loss', seconds: elapsedPlaySeconds(round.startedAt, resultState.at) }
    : undefined, [round.id, round.startedAt, resultState]);

  function finish(reason: 'clear' | 'timeout' | 'stuck', at = Date.now()) {
    if (resultState) return;
    setResultState({ reason, at });
    playSound(reason === 'clear' ? 'win' : 'loss');
  }

  const expire = useEffectEvent(() => finish('timeout', deadline));
  useEffect(() => {
    if (!deadline || resultState) return;
    const timer = window.setTimeout(expire, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deadline, resultState]);

  const loseStuck = useEffectEvent(() => finish('stuck'));
  useEffect(() => {
    if (canMove && !pair && remaining && round.shufflesLeft === 0) loseStuck();
  }, [canMove, pair, remaining, round.shufflesLeft]);

  useEffect(() => {
    if (!flip) return;
    const timer = window.setTimeout(() => {
      if (flip.phase === 'backs') {
        setRound(current => ({ ...current, board: flip.board }));
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
    if (Date.now() >= deadline) { finish('timeout', deadline); return; }
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
    if (selected === undefined || selected === index) { setSelected(selected === index ? undefined : index); return; }
    const route = connectTiles(round.board, selected, index);
    if (!route) {
      setFeedback(round.board[selected] === round.board[index] ? 'sichuanBlocked' : 'sichuanDifferent');
      setSelected(index);
      return;
    }
    setRound(current => ({ ...current, board: current.board.map((tile, cell) => cell === selected || cell === index ? null : tile) }));
    setSelected(undefined);
    const chain = nextSichuanCombo(combo, performance.now());
    setMatch({ path: route, combo: chain.count });
    setCombo(chain);
    if (chain.count > 1) playSound('combo', chain.count);
    if (remaining === 2) finish('clear');
    else if (chain.count === 1) playSound('place');
  }

  function reshuffle() {
    if (!canMove || pair || round.shufflesLeft === 0) return;
    if (Date.now() >= deadline) { finish('timeout', deadline); return; }
    const board = shuffleTiles(round.board);
    const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    setRound(current => ({ ...current, shufflesLeft: current.shufflesLeft - 1, board: animate ? current.board : board }));
    if (animate) setFlip({ phase: 'backs', board });
    setSelected(undefined);
    setHint(undefined);
    setMatch(undefined);
    setCombo(undefined);
    setFeedback('sichuanShuffled');
  }

  function reset() {
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
  }

  const status = resultState ? t(resultState.reason === 'clear' ? 'sichuanClear' : resultState.reason === 'timeout' ? 'sichuanTimedOut' : 'sichuanStuck')
    : t('sichuanRemaining', { count: remaining });
  const info = <>
    <strong>{status}</strong>
    <small>{t('sichuanTheme_' + round.options.theme)} · {round.options.size} × {round.options.size} · {round.options.density}%</small>
    <p className="match-time"><span>{t('sichuanRemovable')}</span><strong>{count}</strong></p>
    <p className="match-time"><span>{t('sichuanShufflesLeft')}</span><strong>{round.shufflesLeft}</strong></p>
    {round.startedAt > 0 && !resultState && <PlayTime key={round.id} startedAt={round.startedAt} />}
  </>;
  const result = report && <GameResult key={report.id} report={report} winner={1} title={status} visible={showResult} onClose={() => setShowResult(false)}
    record={record} rematch={reset} back="/games" navigate={navigate} />;

  return <div className="site-width subpage play-page">
    <RouteLink className="back-link" href={setup} navigate={navigate}>{t('settings')}</RouteLink>
    <div className="play-heading"><div><h1 tabIndex={-1}>{t('sichuan')}</h1><p>{t('local')}</p></div></div>
    <div className="play-layout">
      <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
        <GameStage key={round.id} id="sichuan" matchId={round.id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
          onReady={() => setRound(current => current.startedAt ? current : { ...current, startedAt: Date.now() })}
          timer={deadline > 0 && !resultState && <PuzzleClock key={deadline} deadline={deadline} />}
          notice={combo && combo.count > 1 && <span key={combo.at} className="sichuan-combo" role="status">{t('sichuanCombo', { count: combo.count })}</span>}
          setCursor={setCursor} info={info} infoStatus={status} yourTurn={false} result={result} resultVisible={Boolean(report && showResult)}
          resultPending={false} onShowResult={() => setShowResult(true)} showTouches={showTouches} onTouchDisplay={onTouchDisplay}
          localTouch={touchStyle === 'soft'} view={{ history: [], cursor, chessTargets: new Map(), dark, allowDoubleThree: true, force: 1,
            canMove, deadline, finished: Boolean(resultState), move: pick, onAlkkagi: () => {},
            sichuan: { board: round.board, size: round.options.size, theme: round.options.theme, selected, hint, match, rejected, flip: flip?.phase } }} />
      </Suspense>
      {!resultState && <div className="sichuan-controls">
        {pair ? <button type="button" className="button button-secondary" disabled={!canMove}
          onClick={() => { setHint(pair); setSelected(undefined); setFeedback('sichuanHinted'); }}>{t('sichuanHint')}</button>
          : <button type="button" className="button button-primary" disabled={!canMove || round.shufflesLeft === 0} onClick={reshuffle}>
            {t('sichuanShuffle')} · {round.shufflesLeft}</button>}
        <span role="status">{flip ? t('sichuanShuffling') : !pair ? t('sichuanNoPairs') : feedback && t(feedback)}</span>
      </div>}
    </div>
  </div>;
}
