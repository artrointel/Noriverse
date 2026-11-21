import { RoomRankingControl } from './room-ranking.tsx';
import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { touchResolution } from '../../../../packages/protocol/rooms.ts';
import type { TouchPoint } from '../../../../packages/protocol/rooms.ts';
import type { TouchEffect, TouchParticle } from '../../../../packages/protocol/profile.ts';
import type { ReactionSender } from '../../../../packages/protocol/reactions.ts';
import type { GameId } from '../../../../packages/protocol/games.ts';
import type { GameView } from '../games/game-view.ts';
import type { mountGame } from '../games/scenes.ts';
import { sceneLoaders } from '../games/scene-loader.ts';
import { availableStageHeight, centeredStageScroll, fixedResolutions, readResolution, renderBufferSize, renderFrameSize } from '../games/render-resolution.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { tableSize } from '../games/table.ts';
import { sichuanSceneHeight } from '../games/sichuan/options.ts';
import { liarSceneHeight } from '../games/liar/rules.ts';
import { sketchSceneHeight } from '../games/sketch/hud.ts';
import { boardSize as omokSize } from '../games/omok/rules.ts';
import { othelloSize, othelloState } from '../games/othello/rules.ts';
import { chessSize } from '../games/chess/rules.ts';
import { obstacle } from '../games/sichuan/rules.ts';
import { TouchBurst } from './touch-burst.tsx';
import { GearIcon } from './gear-icon.tsx';
import { GameReactions } from './game-reactions.tsx';
import type { RoomReactions } from './game-reactions.tsx';
import { setMatchMusic } from './audio.ts';
import type { RoundAnnouncement } from '../games/round-announcement.ts';

export function GameStage({ id, matchId, antialias, resolution, onResolution, onAntialias, view, setCursor, info, infoStatus, yourTurn, timer, result, resultVisible, resultPending, decision, onShowResult,
  showTouches, onTouchDisplay, touchStyle, remoteTouch, onTouch, reactions, ownProfile, onReady, progress, beginsAt = 0, ending, endAction,
  stageContext, interaction, playfieldContent }: {
  id: GameId; matchId: string; antialias: boolean; view: GameView; setCursor: (cursor: number | null) => void;
  resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  info?: ReactNode; infoStatus?: string; yourTurn: boolean; timer?: ReactNode; result?: ReactNode; decision?: ReactNode;
  resultVisible: boolean; resultPending: boolean; onShowResult: () => void;
  showTouches: boolean; onTouchDisplay: (active: boolean) => void; touchStyle: TouchEffect;
  remoteTouch?: TouchPoint; onTouch?: (point: TouchPoint) => void;
  reactions?: RoomReactions; ownProfile?: ReactionSender;
  onReady?: () => void; progress?: ReactNode; interaction?: ReactNode; playfieldContent?: ReactNode;
  beginsAt?: number; ending?: RoundAnnouncement['ending']; endAction?: ReactNode;
  stageContext?: { mode: string; map: string };
}) {
  const { t, i18n } = useTranslation();
  const shell = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof mountGame>>(null);
  const centered = useRef(false);
  const sceneHeight = id === 'sichuan' ? sichuanSceneHeight : id === 'liar' ? liarSceneHeight : id === 'sketch' ? sketchSceneHeight : tableSize;
  const requestedSize = useRef({ frame: { width: tableSize, height: sceneHeight }, buffer: { width: tableSize, height: sceneHeight } });
  const [actualSize, setActualSize] = useState(requestedSize.current);
  const resultButton = useRef<HTMLButtonElement>(null);
  const gameSettings = useRef<HTMLDetailsElement>(null);
  const gameInfo = useRef<HTMLDetailsElement>(null);
  const gameHelp = useRef<HTMLDialogElement>(null);
  const helpId = useId();
  const burstId = useRef(0);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; remote: boolean; effect: TouchParticle }[]>([]);
  const current = useRef(view);
  const announcements: RoundAnnouncement = { beginsAt, ending, language: i18n.resolvedLanguage === 'ko' ? 'ko' : 'en', labels: { '3': '3', '2': '2', '1': '1', go: 'GO!',
    victory: t('roundVictory'), defeat: t('roundDefeat'), success: t('roundSuccess'), finished: t('roundFinished') } };
  const announcement = useRef(announcements);
  const wasDeciding = useRef(false);
  const [graphics, setGraphics] = useState({ matchId, antialias });
  if (graphics.matchId !== matchId) setGraphics({ matchId, antialias });
  const roundAntialias = graphics.antialias;
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expanded, setExpanded] = useState<'native' | 'page' | null>(null);
  const boardSize = view.sichuan?.size ?? (id === 'othello' ? othelloSize : id === 'chess' ? chessSize : omokSize);
  const notifyReady = useEffectEvent(() => onReady?.());
  const boardLabel = id === 'physics' ? 'physicsBoard' : id === 'othello' ? 'othelloBoard' : id === 'chess' ? 'chessBoard' : id === 'sichuan' ? 'sichuanBoard'
    : id === 'sketch' ? 'sketchCanvas' : id === 'liar' ? 'liarTable' : 'board';

  useLayoutEffect(() => { current.current = view; announcement.current = announcements; });
  useEffect(() => { setMatchMusic(id, matchId); }, [id, matchId]);

  useLayoutEffect(() => {
    const element = field.current;
    const stage = shell.current;
    const layout = stage?.parentElement;
    if (!element || !stage || !layout) return;
    const canvas = mount.current;
    const footerControls = element.querySelector<HTMLElement>('.stage-footer-controls');
    const header = document.querySelector<HTMLElement>('.site-header');
    const viewport = window.visualViewport;
    function measure() {
      if (!element || !stage || !layout) return;
      const fitWindow = resolution === 'auto' || matchMedia('(pointer: coarse)').matches;
      let availableHeight = Infinity;
      if (expanded) availableHeight = Math.max(1, element.clientHeight - (footerControls?.offsetHeight ?? 0));
      else if (fitWindow) {
        const visibleHeight = viewport?.scale === 1 ? viewport.height : window.innerHeight;
        availableHeight = availableStageHeight(visibleHeight, header?.offsetHeight ?? 0, stage.offsetHeight, canvas?.offsetHeight ?? 0);
      }
      const style = getComputedStyle(stage);
      const inset = (property: string) => Number.parseFloat(style.getPropertyValue(property)) || 0;
      const availableWidth = expanded ? element.clientWidth
        : layout.clientWidth - inset('padding-left') - inset('padding-right') - inset('--stage-sidebar-width') - inset('column-gap');
      const frame = renderFrameSize(resolution, availableWidth, availableHeight, sceneHeight);
      if (!frame.width) return;
      const buffer = renderBufferSize(resolution, frame, sceneHeight, window.devicePixelRatio);
      const previous = requestedSize.current;
      if (frame.width === previous.frame.width && buffer.width === previous.buffer.width) return;
      requestedSize.current = { frame, buffer };
      if (buffer.width !== previous.buffer.width) engine.current?.resize(buffer);
      setActualSize(requestedSize.current);
    }
    let densityQuery: MediaQueryList | undefined;
    function watchDensity() {
      densityQuery?.removeEventListener('change', watchDensity);
      densityQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      densityQuery.addEventListener('change', watchDensity);
      measure();
    }
    watchDensity();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(layout);
    observer.observe(stage);
    if (mount.current && 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype) {
      observer.observe(mount.current, { box: 'device-pixel-content-box' });
    }
    for (const chrome of [stage.querySelector('.stage-bar'), footerControls, header]) {
      if (chrome) observer.observe(chrome);
    }
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      densityQuery?.removeEventListener('change', watchDensity);
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
    };
  }, [resolution, expanded, sceneHeight]);

  useEffect(() => {
    if (status !== 'ready' || expanded || resolution !== 'auto' || centered.current) return;
    const timer = requestAnimationFrame(() => {
      const stage = shell.current;
      const viewport = window.visualViewport;
      if (!stage || !stage.isConnected || (viewport && viewport.scale !== 1)) return;
      const { top, height } = stage.getBoundingClientRect();
      const header = document.querySelector<HTMLElement>('.site-header');
      centered.current = true;
      window.scrollTo({
        top: centeredStageScroll(window.scrollY, top, height, viewport?.height ?? window.innerHeight, header?.offsetHeight ?? 0),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [status, expanded, resolution, actualSize.frame.width]);

  useLayoutEffect(() => { engine.current?.refreshInputBounds(); }, [actualSize, expanded]);

  const deciding = Boolean(decision);
  const hasResult = Boolean(result);
  useEffect(() => {
    if (wasDeciding.current && !deciding && !hasResult && status === 'ready') mount.current?.focus({ preventScroll: true });
    wasDeciding.current = deciding;
  }, [deciding, hasResult, status]);

  function addBurst(point: TouchPoint, remote: boolean) {
    const bounds = mount.current?.getBoundingClientRect();
    const canvas = mount.current?.querySelector('canvas')?.getBoundingClientRect();
    if (!showTouches || !bounds || !canvas) return;
    const burst = { id: ++burstId.current, remote, effect: point.effect ?? 'soft' as const,
      x: canvas.left - bounds.left + canvas.width * point.x / touchResolution,
      y: canvas.top - bounds.top + canvas.height * point.y / touchResolution };
    setBursts(previous => [...previous.slice(-15), burst]);
  }

  const displayRemoteTouch = useEffectEvent((point: TouchPoint) => addBurst(point, true));
  useEffect(() => { if (remoteTouch) displayRemoteTouch(remoteTouch); }, [remoteTouch]);
  useEffect(() => { setBursts([]); }, [showTouches, matchId]);

  function handleTouch(event: PointerEvent<HTMLDivElement>) {
    if (touchStyle === 'none' || status !== 'ready' || view.finished || (beginsAt && Date.now() < beginsAt) || !event.isPrimary || event.button !== 0
      || !(event.target instanceof HTMLCanvasElement)) return;
    const bounds = event.target.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const coordinate = (value: number) => Math.max(0, Math.min(touchResolution, Math.round(value * touchResolution)));
    const point = { x: coordinate((event.clientX - bounds.left) / bounds.width), y: coordinate((event.clientY - bounds.top) / bounds.height), effect: touchStyle };
    addBurst(point, false);
    onTouch?.(point);
  }

  const resultHidden = Boolean(result && !resultVisible && !resultPending);
  useEffect(() => {
    if (resultHidden) resultButton.current?.focus({ preventScroll: true });
  }, [resultHidden]);

  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    let canceled = false;
    let instance: ReturnType<typeof mountGame> | undefined;
    setStatus('loading');
    void Promise.all([import('../games/scenes.ts'), sceneLoaders[id]()]).then(async ([{ mountGame, loadRoundAnnouncementAssets }, createScene]) => {
      if (canceled) return;
      await loadRoundAnnouncementAssets();
      if (canceled) return;
      instance = mountGame(element, id, roundAntialias, requestedSize.current.buffer, () => current.current, createScene, () => announcement.current, () => {
        if (!canceled) { setStatus('ready'); notifyReady(); }
      });
      engine.current = instance;
    }).catch(() => { if (!canceled) setStatus('error'); });
    return () => {
      canceled = true;
      if (engine.current === instance) engine.current = null;
      instance?.destroy();
    };
  }, [id, matchId, loadAttempt, roundAntialias]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setExpanded(previous => document.fullscreenElement === shell.current ? 'native'
        : previous === 'native' ? null : previous);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(previous => previous === 'page' ? null : previous);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    function closeSettings(event: globalThis.PointerEvent) {
      if (gameSettings.current?.open && event.target instanceof Node && !gameSettings.current.contains(event.target)) gameSettings.current.open = false;
    }
    document.addEventListener('pointerdown', closeSettings);
    window.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('pointerdown', closeSettings);
      window.removeEventListener('keydown', onEscape);
    };
  }, []);

  useEffect(() => {
    if (expanded !== 'page') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [expanded]);

  async function toggleFullscreen() {
    if (expanded === 'native') {
      await document.exitFullscreen();
    } else if (expanded === 'page') {
      setExpanded(null);
    } else {
      try {
        if (!shell.current?.requestFullscreen) throw new Error();
        await shell.current.requestFullscreen();
        setExpanded('native');
      } catch {
        setExpanded('page');
      }
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const hud = view.sichuan?.hud;
    if (hud && !event.ctrlKey && !event.metaKey && !event.altKey && /^[hs]$/i.test(event.key)) {
      event.preventDefault();
      if (!event.repeat) (event.key.toLowerCase() === 'h' ? hud.hint : hud.shuffle)?.();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const center = Math.floor(boardSize / 2);
    const first = id === 'othello' ? othelloState(view.history).legal[0] : undefined;
    const index = view.cursor ?? first ?? center * (boardSize + 1);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (view.canMove || view.canInspect) {
        if (id === 'sichuan') setCursor(index);
        view.move(index);
      }
    } else if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      const limit = (value: number) => Math.max(0, Math.min(boardSize - 1, value));
      setCursor(limit(Math.floor(index / boardSize) + dy) * boardSize + limit(index % boardSize + dx));
    }
  }

  const position = view.cursor === null ? '' : t('position', {
    row: Math.floor(view.cursor / boardSize) + 1, column: view.cursor % boardSize + 1,
  });
  const focusTile = view.cursor === null ? undefined : view.sichuan?.board[view.cursor];
  const focusLabel = !position || !view.sichuan ? position : position + ' · ' + (focusTile == null ? t('sichuanEmptyTile')
    : focusTile === obstacle ? t('sichuanObstacle') : t('sichuanMotifs_' + view.sichuan.theme).split('|')[focusTile]);

  return (
    <section className={expanded === 'page' ? 'stage stage-expanded' : 'stage'} ref={shell}>
      <div className="stage-bar">
        {stageContext && <div className="stage-context">
          <span>{stageContext.mode}</span><strong>{stageContext.map}</strong>
        </div>}
        <div className="stage-actions">
          {resultHidden && <button ref={resultButton} className="button stage-result-trigger" type="button" aria-label={t('viewResult')} onClick={onShowResult}>{t('viewResult')}</button>}
          {info && <details className="stage-info" ref={gameInfo} onKeyDown={event => {
            if (event.key === 'Escape' && event.currentTarget.open) {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="button button-secondary stage-control" aria-label={t('gameInfo')}>
              {infoStatus && <span className="stage-turn" data-your-turn={yourTurn} aria-live="polite">{infoStatus}</span>}
              {timer}
            </summary>
            <div className="surface match-panel">{info}</div>
          </details>}
          <button className="button button-secondary stage-control stage-control-icon stage-help-trigger" type="button"
            aria-label={t('gameHelp')} title={t('gameHelp')} aria-haspopup="dialog" aria-controls={helpId}
            onClick={() => {
              if (gameInfo.current) gameInfo.current.open = false;
              gameHelp.current?.showModal();
            }}>?</button>
          <button className="button button-secondary stage-control" type="button" onClick={() => void toggleFullscreen()}>
            {t(expanded ? 'restore' : 'fullscreen')}
          </button>
          <RoomRankingControl />
          <details className="stage-settings" ref={gameSettings} onKeyDown={event => {
            if (event.key === 'Escape' && event.currentTarget.open) {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="button button-secondary stage-control stage-control-icon" aria-label={t('inGameSettings')} onClick={() => {
              if (gameInfo.current?.open) gameInfo.current.open = false;
            }}><GearIcon /></summary>
            <div className="surface stage-settings-panel">
              <label><input type="checkbox" role="switch" checked={showTouches} onChange={event => onTouchDisplay(event.target.checked)} />{t('touchEffects')}</label>
              <label><input type="checkbox" checked={antialias} onChange={event => onAntialias(event.target.checked)} />{t('antialias')}</label>
              {antialias !== roundAntialias && <small>{t('graphicsHelp')}</small>}
              <label className="stage-resolution">
                <span>{t('resolution')}</span>
                <select value={resolution} onChange={event => onResolution(readResolution(event.target.value))}>
                  <option value="auto">{t('resolutionAuto')}</option>
                  {fixedResolutions.map(size => <option key={size} value={size}>{size} × {renderFrameSize(size, size, Infinity, sceneHeight).height}</option>)}
                </select>
              </label>
              <small>{t('resolutionFit')}</small>
              {status === 'ready' && <>
                <output className="applied-resolution">{t('resolutionApplied', actualSize.buffer)}</output>
                {actualSize.frame.width !== actualSize.buffer.width && <small>{t('resolutionDisplay', actualSize.frame)}</small>}
              </>}
            </div>
          </details>
        </div>
      </div>
      <div className="stage-field" ref={field}>
        <GameReactions matchId={matchId} size={actualSize.frame} profile={ownProfile} room={reactions} progress={progress} action={endAction} enabled={status === 'ready'}>
          <div
            className="game-viewport" ref={mount} data-ready={status === 'ready'}
            tabIndex={id === 'liar' ? undefined : 0}
            role="group"
            aria-label={t(boardLabel)}
            aria-describedby={helpId + '-body'}
            onBlur={() => setCursor(null)}
            onPointerDownCapture={handleTouch}
            onKeyDown={id === 'physics' || id === 'sketch' || id === 'liar' ? undefined : onKeyDown}
          >
            <div className="touch-layer" aria-hidden="true">{bursts.map(burst => <TouchBurst key={burst.id} effect={burst.effect} remote={burst.remote}
              style={{ left: burst.x, top: burst.y }} onEnd={() => setBursts(current => current.filter(item => item.id !== burst.id))} />)}</div>
            {status === 'ready' && playfieldContent}
          </div>
          {result && <div className="result-layer" hidden={!resultVisible}>{result}</div>}
          {decision && <div className="result-layer decision-layer">{decision}</div>}
        </GameReactions>
      </div>
      {interaction}
      {status !== 'ready' && (
        <div className="stage-message">
          <span role="status">{t(status === 'loading' ? 'loading' : 'gameError')}</span>
          {status === 'error' && <button type="button" className="button button-secondary" onClick={() => setLoadAttempt(attempt => attempt + 1)}>{t('retryLoad')}</button>}
        </div>
      )}
      <div className="visually-hidden" aria-live="polite">{focusLabel}</div>
      <dialog ref={gameHelp} id={helpId} className="surface profile-dialog stage-help-dialog" aria-labelledby={helpId + '-title'}
        aria-describedby={helpId + '-body'} onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
        <header className="room-panel-heading">
          <h2 id={helpId + '-title'}>{t('gameHelp')}</h2>
          <button className="settings-close" type="button" aria-label={t('close')} onClick={() => gameHelp.current?.close()}><span aria-hidden="true" /></button>
        </header>
        <p id={helpId + '-body'}>{t(id === 'physics' ? 'physicsHelp' : id === 'othello' ? 'othelloHelp' : id === 'chess' ? 'chessHelp' : id === 'sichuan' ? 'sichuanHelp'
          : id === 'sketch' ? 'sketchHelp' : id === 'liar' ? 'liarHelp' : 'boardHelp')}
          {(id === 'omok' || id === 'chess') && <> {t('previewMoveHelp')}</>}
          {id === 'othello' && <span className="touch-move-help"> {t('touchMoveHelp')}</span>}
        </p>
      </dialog>
    </section>
  );
}
