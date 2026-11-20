import { useDeferredValue, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import heroArt from '../assets/hero-orbit.jpg';
import { apiAvailable } from '../network/api.ts';
import type { GuestRoom } from '../network/guest-seat.ts';
import { isRoomGame } from '../../../../packages/protocol/rooms.ts';
import type { ReactNode, Ref } from 'react';
import type { GameId } from '../games/scenes.ts';
import { gameIds, games, matchesGame } from './game-catalog.ts';
import { cardsPerPage, pageNumbers } from './library-pagination.ts';
import { BackLink, gamePath, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

type Filter = 'all' | 'favorites' | 'strategy' | 'action';

function Tags({ id }: { id: GameId }) {
  const { t } = useTranslation();
  return <div className="game-tags"><span>{t(games[id].category)}</span><span>{t(games[id].players)}</span></div>;
}

function GameCard({ id, selected, preview, selectable, disabled, onSelect, favorite }: {
  id: GameId; selected: boolean; preview: boolean; selectable?: boolean; disabled?: boolean; onSelect: (id: GameId, button: HTMLButtonElement) => void;
  favorite?: { selected: boolean; disabled: boolean; toggle: (id: GameId) => void };
}) {
  const { t } = useTranslation();
  const game = games[id];
  return (
    <article className="game-card" data-selected={selected}>
      <button type="button" className="card-link" aria-label={t(id)} aria-pressed={preview || selectable ? selected : undefined} disabled={disabled}
        aria-controls={preview && selected ? 'catalog-preview' : undefined} onClick={event => onSelect(id, event.currentTarget)}>
        <span className={'card-art card-art-' + id}><img src={game.art} alt="" width="880" height="587" decoding="async" /></span>
        <span className="card-copy">
          <strong>{t(id)}</strong>
          <small>{t(game.category)} · {t(game.players)}</small>
        </span>
      </button>
      {favorite && <button type="button" className="favorite-button" aria-pressed={favorite.selected} disabled={favorite.disabled}
        aria-label={t(favorite.selected ? 'removeFavorite' : 'addFavorite', { game: t(id) })} onClick={() => favorite.toggle(id)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill={favorite.selected ? 'currentColor' : 'none'} stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 8.7c0 4.2-8.8 9.5-8.8 9.5S3.2 12.9 3.2 8.7a4.4 4.4 0 0 1 8.8-.5 4.4 4.4 0 0 1 8.8.5Z" />
        </svg>
      </button>}
    </article>
  );
}

export function GameSelectionGrid({ ids, selected, onSelect, gridRef, busy, favorites, children, selectable }: {
  ids: GameId[]; selected?: GameId; onSelect: (id: GameId, button: HTMLButtonElement) => void;
  gridRef?: Ref<HTMLDivElement>; busy?: boolean; children?: ReactNode; selectable?: boolean;
  favorites?: { games: GameId[]; disabled: boolean; toggle: (id: GameId) => void };
}) {
  return <div ref={gridRef} className="game-grid" aria-busy={busy}>
    {ids.map(id => <GameCard key={id} id={id} selected={selected === id} preview={Boolean(favorites)} selectable={selectable} disabled={!favorites && busy}
      onSelect={onSelect} favorite={favorites && { selected: favorites.games.includes(id), disabled: favorites.disabled, toggle: favorites.toggle }} />)}
    {children}
  </div>;
}

function GamePreview({ id, active, navigate, onClose }: { id: GameId; active: boolean; navigate: Navigate; onClose: () => void }) {
  const { t } = useTranslation();
  const title = useRef<HTMLHeadingElement>(null);
  const game = games[id];
  useLayoutEffect(() => {
    if (!active) return;
    const heading = title.current;
    heading?.focus({ preventScroll: true });
    if (heading && heading.getBoundingClientRect().top < 0) heading.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  return (
    <aside className="surface catalog-preview" id="catalog-preview" aria-labelledby="catalog-preview-title"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
      <img className={'catalog-preview-art card-art-' + id} src={game.art} alt="" width="880" height="587" />
      <div className="catalog-preview-content">
        <div className="catalog-preview-heading">
          <h3 ref={title} id="catalog-preview-title" tabIndex={-1}>{t(id)}</h3>
          <button type="button" className="settings-close" aria-label={t('closePreview')} onClick={onClose}>
            <span aria-hidden="true" />
          </button>
        </div>
        <Tags id={id} />
        <p>{t(game.description)}</p>
        <section>
          <h4>{t('rules')}</h4>
          <p>{t(game.rules)}</p>
        </section>
        <div className="preview-modes">
          <span>{t('gameMode')}</span>
          <strong>{apiAvailable && isRoomGame(id) ? t('newRoom') + ' · ' : ''}{t('local')}</strong>
        </div>
        <RouteLink href={gamePath(id, 'setup')} navigate={navigate} className="button button-primary preview-play">
          <i className="play-glyph" aria-hidden="true" />{t('selectGame')}
        </RouteLink>
      </div>
    </aside>
  );
}

export function CatalogPage({ home, navigate, favorites, disableFavorite, favoriteError, onFavorite, rejoin }: {
  home: boolean; navigate: Navigate; favorites: GameId[]; disableFavorite: boolean;
  favoriteError: boolean; onFavorite: (id: GameId) => void;
  rejoin?: { room: GuestRoom; resume: () => void };
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<GameId>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pageAnchor, setPageAnchor] = useState(0);
  const [capacity, setCapacity] = useState(4);
  const grid = useRef<HTMLDivElement>(null);
  const previewSlot = useRef<HTMLDivElement>(null);
  const lastCard = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const visibleFilter = useDeferredValue(filter);
  const visibleQuery = useDeferredValue(query);
  const visibleGames = gameIds.filter(id => {
    const game = games[id];
    const matchesFilter = visibleFilter === 'all'
      || (visibleFilter === 'favorites' ? favorites.includes(id) : game.category === visibleFilter);
    return matchesFilter && matchesGame(id, visibleQuery, t(id));
  });
  const selected = previewOpen && selection && visibleGames.includes(selection) ? selection : undefined;
  const pageCount = Math.max(1, Math.ceil(visibleGames.length / capacity));
  const page = Math.min(pageCount, Math.floor(pageAnchor / capacity) + 1);
  const pageGames = visibleGames.slice((page - 1) * capacity, page * capacity);

  useLayoutEffect(() => {
    const container = grid.current;
    const card = container?.querySelector<HTMLElement>('.game-card');
    if (!container || !card) return;

    function measure() {
      if (!container || !card) return;
      const style = getComputedStyle(container);
      const columns = style.gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      setCapacity(cardsPerPage(columns, card.offsetHeight, Number.parseFloat(style.rowGap) || 0,
        container.getBoundingClientRect().top + window.scrollY, window.innerHeight));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(card);
    if (previewSlot.current) observer.observe(previewSlot.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pageGames[0], selected, visibleFilter, visibleQuery]);

  function select(id: GameId, button: HTMLButtonElement) {
    lastCard.current = button;
    setPageAnchor(visibleGames.indexOf(id));
    setSelection(id);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    (lastCard.current?.isConnected ? lastCard.current : search.current)?.focus({ preventScroll: true });
  }

  function selectPage(number: number) {
    setPageAnchor((number - 1) * capacity);
  }
  return (
    <div className="site-width">
      {home && rejoin && <section className="surface resume-room" aria-label={t('recentRoom')}>
        <img src={games[rejoin.room.game].art} alt="" width="64" height="52" />
        <div><small>{t('recentRoom')}</small><strong>{t(rejoin.room.game)} <code>{rejoin.room.code}</code></strong></div>
        <button type="button" className="button button-primary" onClick={rejoin.resume}>{t('rejoinRoom')}</button>
      </section>}
      {home && (
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-art"><img src={heroArt} alt="" fetchPriority="high" width="1360" height="765" /></div>
          <div className="hero-copy">
            <p className="hero-kicker"><span />{t('heroKicker')}</p>
            <h1 id="hero-title" tabIndex={-1}>{t('heroTitle')} <em>{t('heroAccent')}</em></h1>
            <p>{t('heroBody')}</p>
            <div className="hero-actions">
              <RouteLink href="/games" navigate={navigate} className="button button-lime">{t('browse')}</RouteLink>
              <RouteLink href="/room" navigate={navigate} className="button button-hero-secondary">{t('joinRoom')}</RouteLink>
            </div>
          </div>
        </section>
      )}
      <section className={home ? 'catalog' : 'catalog catalog-index'} aria-labelledby="catalog-title">
        <div className="catalog-heading">
          <div>
            {home ? <h2 id="catalog-title">{t('library')}</h2> : <h1 id="catalog-title" tabIndex={-1}>{t('library')}</h1>}
            <p>{t('libraryIntro')}</p>
          </div>
          <div className="catalog-controls">
            <div className="library-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="5.7" /><path d="m15 15 4.4 4.4" />
              </svg>
              <input ref={search} type="search" aria-label={t('gameSearch')} placeholder={t('gameSearchHint')} value={query}
                onChange={event => { setQuery(event.target.value); setPageAnchor(0); setPreviewOpen(false); }} />
            </div>
            <div className="filter" aria-label={t('games')}>
              {(['all', 'favorites', 'strategy', 'action'] as const).map(option => (
                <button key={option} type="button" aria-pressed={filter === option} onClick={() => {
                  setFilter(option); setPageAnchor(0); setPreviewOpen(false);
                }}>{t(option)}</button>
              ))}
            </div>
          </div>
        </div>
        {favoriteError && <p role="alert" className="muted favorite-error">{t('profileError')}</p>}
        <div className="catalog-layout">
          <div ref={previewSlot} className="catalog-preview-slot" data-open={Boolean(selected)} inert={!selected}>
            <div className="catalog-preview-clip">
              {selection && <GamePreview id={selection} active={Boolean(selected)} navigate={navigate} onClose={closePreview} />}
            </div>
          </div>
          <div className="catalog-list">
            <GameSelectionGrid gridRef={grid} ids={pageGames} selected={selected} onSelect={select}
              busy={visibleFilter !== filter || visibleQuery !== query} favorites={{ games: favorites, disabled: disableFavorite, toggle: onFavorite }}>
              {visibleGames.length === 0 && <p className="surface library-empty" role="status">
                {t(visibleFilter === 'favorites' && favorites.length === 0
                  ? apiAvailable ? 'emptyFavorites' : 'favoritesUnavailable'
                  : 'noSearchResults')}
              </p>}
            </GameSelectionGrid>
            {pageCount > 1 && <nav className="catalog-pagination" aria-label={t('gamePages')}>
              <button type="button" disabled={page === 1} onClick={() => selectPage(page - 1)}>{t('previousPage')}</button>
              {pageNumbers(page, pageCount).map((number, index) => number === 'gap'
                ? <span key={'gap-' + index} aria-hidden="true">…</span>
                : <button key={number} type="button" aria-label={t('pageNumber', { number })}
                  aria-current={number === page ? 'page' : undefined} onClick={() => selectPage(number)}>{number}</button>)}
              <button type="button" disabled={page === pageCount} onClick={() => selectPage(page + 1)}>{t('nextPage')}</button>
            </nav>}
          </div>
        </div>
      </section>
      <section className="invite-banner">
        <div><h2>{t('inviteTitle')}</h2><p>{t('inviteBody')}</p></div>
        <RouteLink href="/room" navigate={navigate} className="button button-secondary">{t('joinRoom')}</RouteLink>
      </section>
    </div>
  );
}

export function GameDetail({ id, navigate }: { id: GameId; navigate: Navigate }) {
  const { t } = useTranslation();
  const game = games[id];
  return (
    <div className="site-width subpage">
      <BackLink fallback="/games" fallbackLabel="backToGames" navigate={navigate} />
      <section className="detail-layout">
        <div className={'detail-art card-art-' + id}><img src={game.art} alt="" width="880" height="587" /></div>
        <div className="detail-info">
          <Tags id={id} />
          <h1 tabIndex={-1}>{t(id)}</h1>
          <p className="lead">{t(game.description)}</p>
          <RouteLink href={gamePath(id, 'setup')} navigate={navigate} className="button button-primary">
            <i className="play-glyph" aria-hidden="true" />{t('selectGame')}
          </RouteLink>
        </div>
      </section>
      <section className="reading-panel">
        <h2>{t('rules')}</h2><p>{t(game.rules)}</p>
      </section>
    </div>
  );
}
