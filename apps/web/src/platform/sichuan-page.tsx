import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { connectTiles, createSichuanBoard, findTilePair, shuffleTiles } from '../games/sichuan/rules.ts';
import type { TilePoint } from '../games/sichuan/rules.ts';
import { playSound } from './audio.ts';
import { GameResult } from './game-result.tsx';
import { gamePath, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { PlayTime } from './play-page.tsx';

const GameStage = lazy(() => import('./game-stage.tsx').then(module => ({ default: module.GameStage })));
const setup = gamePath('sichuan', 'setup');
const newRound = () => ({ id: crypto.randomUUID(), startedAt: Date.now(), board: createSichuanBoard() });

export function SichuanPage({ dark, antialias, resolution, onResolution, onAntialias, navigate, record, showTouches, onTouchDisplay, touchStyle }: {
  dark: boolean; antialias: boolean; resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  navigate: Navigate; record?: (report: MatchReport) => Promise<boolean>;
  showTouches: boolean; onTouchDisplay: (active: boolean) => void; touchStyle: TouchEffect;
}) {
  const { t } = useTranslation();
  const [round, setRound] = useState(newRound);
  const [selected, setSelected] = useState<number>();
  const [hint, setHint] = useState<readonly [number, number]>();
  const [cursor, setCursor] = useState<number | null>(null);
  const [path, setPath] = useState<readonly TilePoint[]>();
  const [feedback, setFeedback] = useState<'sichuanDifferent' | 'sichuanBlocked' | 'sichuanHinted' | 'sichuanShuffled'>();
  const [finishedAt, setFinishedAt] = useState(0);
  const [showResult, setShowResult] = useState(true);
  const remaining = round.board.filter(tile => tile !== null).length;
  const pair = useMemo(() => findTilePair(round.board), [round.board]);
  const report = useMemo<MatchReport | undefined>(() => finishedAt ? { id: round.id, game: 'sichuan', mode: 'local', outcome: 'win',
    seconds: elapsedPlaySeconds(round.startedAt, finishedAt) } : undefined, [round.id, round.startedAt, finishedAt]);

  function pick(index: number) {
    if (finishedAt || round.board[index] == null) return;
    setHint(undefined);
    setFeedback(undefined);
    if (selected === undefined || selected === index) { setSelected(selected === index ? undefined : index); return; }
    const route = connectTiles(round.board, selected, index);
    if (!route) {
      setFeedback(round.board[selected] === round.board[index] ? 'sichuanBlocked' : 'sichuanDifferent');
      setSelected(index);
      return;
    }
    setRound(current => ({ ...current, board: current.board.map((tile, cell) => cell === selected || cell === index ? null : tile) }));
    setPath(route);
    setSelected(undefined);
    if (remaining === 2) { setFinishedAt(Date.now()); playSound('win'); }
    else playSound('place');
  }

  function reset() {
    setRound(newRound());
    setSelected(undefined);
    setHint(undefined);
    setCursor(null);
    setPath(undefined);
    setFeedback(undefined);
    setFinishedAt(0);
    setShowResult(true);
  }

  const status = finishedAt ? t('sichuanClear') : t('sichuanRemaining', { count: remaining });
  const info = <>
    <strong>{status}</strong>
    {!finishedAt && <PlayTime key={round.id} startedAt={round.startedAt} />}
  </>;
  const result = report && <GameResult key={report.id} report={report} winner={1} visible={showResult} onClose={() => setShowResult(false)}
    record={record} rematch={reset} back="/games" navigate={navigate} />;

  return <div className="site-width subpage play-page">
    <RouteLink className="back-link" href={setup} navigate={navigate}>{t('settings')}</RouteLink>
    <div className="play-heading"><div><h1 tabIndex={-1}>{t('sichuan')}</h1><p>{t('local')}</p></div></div>
    <div className="play-layout">
      <Suspense fallback={<div className="surface stage-loading" role="status">{t('loading')}</div>}>
        <GameStage id="sichuan" matchId={round.id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
          setCursor={setCursor} info={info} infoStatus={status} yourTurn={false} result={result} resultVisible={Boolean(report && showResult)}
          resultPending={false} onShowResult={() => setShowResult(true)} showTouches={showTouches} onTouchDisplay={onTouchDisplay}
          localTouch={touchStyle === 'soft'} view={{ history: [], cursor, chessTargets: new Map(), dark, allowDoubleThree: true, force: 1,
            canMove: !finishedAt, deadline: 0, finished: Boolean(finishedAt), move: pick, onAlkkagi: () => {},
            sichuan: { board: round.board, selected, hint, path } }} />
      </Suspense>
      {!finishedAt && <div className="sichuan-controls">
        {pair ? <button type="button" className="button button-secondary" onClick={() => { setHint(pair); setSelected(undefined); setFeedback('sichuanHinted'); }}>{t('sichuanHint')}</button>
          : <button type="button" className="button button-primary" onClick={() => {
            setRound(current => ({ ...current, board: shuffleTiles(current.board) })); setSelected(undefined); setHint(undefined); setPath(undefined); setFeedback('sichuanShuffled');
          }}>{t('sichuanShuffle')}</button>}
        <span role="status">{!pair ? t('sichuanNoPairs') : feedback && t(feedback)}</span>
      </div>}
    </div>
  </div>;
}
