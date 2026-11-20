import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameId, GameView } from '../games/scenes.ts';
import { boardSize as omokSize } from '../games/omok/rules.ts';
import { othelloSize, othelloState } from '../games/othello/rules.ts';

export function GameStage({ id, view, setCursor, info, infoStatus, result, resultVisible, onShowResult }: {
  id: GameId; view: GameView; setCursor: (cursor: number | null) => void;
  info?: ReactNode; infoStatus?: string; result?: ReactNode;
  resultVisible: boolean; onShowResult: () => void;
}) {
  const { t } = useTranslation();
  const shell = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const resultButton = useRef<HTMLButtonElement>(null);
  const current = useRef(view);
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expanded, setExpanded] = useState<'native' | 'page' | null>(null);
  const boardSize = id === 'othello' ? othelloSize : omokSize;
  const boardLabel = id === 'physics' ? 'physicsBoard' : id === 'othello' ? 'othelloBoard' : 'board';

  useEffect(() => { current.current = view; }, [view]);

  const resultHidden = Boolean(result && !resultVisible);
  useEffect(() => {
    if (resultHidden) resultButton.current?.focus({ preventScroll: true });
  }, [resultHidden]);

  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    let canceled = false;
    let unmount: (() => void) | undefined;
    setStatus('loading');
    void import('../games/scenes.ts').then(({ mountGame }) => {
      if (canceled) return;
      unmount = mountGame(element, id, () => current.current, () => { if (!canceled) setStatus('ready'); });
    }).catch(() => { if (!canceled) setStatus('error'); });
    return () => {
      canceled = true;
      unmount?.();
    };
  }, [id, loadAttempt]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setExpanded(previous => document.fullscreenElement === shell.current ? 'native'
        : previous === 'native' ? null : previous);
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(previous => previous === 'page' ? null : previous);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
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
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const center = Math.floor(boardSize / 2);
    const first = id === 'othello' ? othelloState(view.history).legal[0] : undefined;
    const index = view.cursor ?? first ?? center * (boardSize + 1);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (view.canMove) view.move(index);
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

  return (
    <section className={expanded === 'page' ? 'surface stage stage-expanded' : 'surface stage'} ref={shell}>
      <div className="stage-bar">
        <span>{t(boardLabel)}</span>
        <div className="stage-actions">
          {info && <details className="stage-info" onKeyDown={event => {
            if (event.key === 'Escape' && event.currentTarget.open) {
              event.preventDefault();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }
          }}>
            <summary className="button button-secondary">
              <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="10" cy="10" r="7.5" /><path d="M10 9v5m0-8v1" />
              </svg>
              <span>{t('gameInfo')}</span>
              {infoStatus && <span className="stage-turn" aria-live="polite">{infoStatus}</span>}
            </summary>
            <div className="surface match-panel">{info}</div>
          </details>}
          {resultHidden && <button ref={resultButton} className="button button-secondary" type="button" onClick={onShowResult}>{t('viewResult')}</button>}
          <button className="button button-secondary" type="button" onClick={() => void toggleFullscreen()}>
            {t(expanded ? 'restore' : 'fullscreen')}
          </button>
        </div>
      </div>
      <div className="stage-field">
        <div
          className="game-viewport" ref={mount} data-ready={status === 'ready'}
          tabIndex={0}
          role="group"
          aria-label={t(boardLabel)}
          aria-describedby="game-help"
          onBlur={() => setCursor(null)}
          onKeyDown={id === 'physics' ? undefined : onKeyDown}
        />
        {result && <div className="result-layer" hidden={!resultVisible}>{result}</div>}
      </div>
      {status !== 'ready' && (
        <div className="stage-message">
          <span role="status">{t(status === 'loading' ? 'loading' : 'gameError')}</span>
          {status === 'error' && <button type="button" className="button button-secondary" onClick={() => setLoadAttempt(attempt => attempt + 1)}>{t('retryLoad')}</button>}
        </div>
      )}
      <div className="visually-hidden" aria-live="polite">{position}</div>
      <p className="stage-help" id="game-help">{t(id === 'physics' ? 'physicsHelp' : id === 'othello' ? 'othelloHelp' : 'boardHelp')}</p>
    </section>
  );
}
