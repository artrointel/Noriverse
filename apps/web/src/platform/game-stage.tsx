import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameId, GameView } from '../games/scenes.ts';
import { boardSize } from '../games/omok/rules.ts';

export function GameStage({ id, view, setCursor }: {
  id: GameId; view: GameView; setCursor: (cursor: number | null) => void;
}) {
  const { t } = useTranslation();
  const shell = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const current = useRef(view);
  const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [expanded, setExpanded] = useState<'native' | 'page' | null>(null);

  useEffect(() => { current.current = view; }, [view]);

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
      if (event.key === 'Escape') setExpanded(previous => previous === 'page' ? null : previous);
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
    const index = view.cursor ?? center * (boardSize + 1);
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
        <span>{t(id === 'omok' ? 'board' : 'physicsBoard')}</span>
        <button className="button button-secondary" type="button" onClick={() => void toggleFullscreen()}>
          {t(expanded ? 'restore' : 'fullscreen')}
        </button>
      </div>
      <div
        className="game-viewport" ref={mount} data-ready={status === 'ready'}
        tabIndex={0}
        role="group"
        aria-label={t(id === 'omok' ? 'board' : 'physicsBoard')}
        aria-describedby="game-help"
        onBlur={() => setCursor(null)}
        onKeyDown={id === 'omok' ? onKeyDown : undefined}
      />
      {status !== 'ready' && (
        <div className="stage-message">
          <span role="status">{t(status === 'loading' ? 'loading' : 'gameError')}</span>
          {status === 'error' && <button type="button" className="button button-secondary" onClick={() => setLoadAttempt(attempt => attempt + 1)}>{t('reset')}</button>}
        </div>
      )}
      <div className="visually-hidden" aria-live="polite">{position}</div>
      <p className="stage-help" id="game-help">{t(id === 'omok' ? 'boardHelp' : 'physicsHelp')}</p>
    </section>
  );
}
