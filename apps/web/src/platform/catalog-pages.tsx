import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import heroArt from '../assets/hero-orbit.jpg';
import type { GameId } from '../games/scenes.ts';
import { gameIds, games } from './game-catalog.ts';
import { gamePath, RouteLink } from './navigation.tsx';
import type { GameMode, Navigate } from './navigation.tsx';

type Filter = 'all' | 'strategy' | 'action';
export type Power = 'standard' | 'fast';

function Tags({ id }: { id: GameId }) {
  const { t } = useTranslation();
  return <div className="game-tags"><span>{t(games[id].category)}</span><span>{t(games[id].players)}</span></div>;
}

function GameCard({ id, navigate }: { id: GameId; navigate: Navigate }) {
  const { t } = useTranslation();
  const game = games[id];
  return (
    <article className="game-card">
      <RouteLink href={gamePath(id)} navigate={navigate} className="card-link" aria-label={t(id)}>
        <div className={'card-art card-art-' + id}><img src={game.art} alt="" width="880" height="587" decoding="async" /></div>
        <div className="card-copy">
          <Tags id={id} />
          <h3>{t(id)}</h3>
          <p>{t(game.description)}</p>
          <span className="card-play" aria-hidden="true"><i className="play-glyph" /></span>
        </div>
      </RouteLink>
    </article>
  );
}

export function CatalogPage({ home, navigate }: { home: boolean; navigate: Navigate }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const visibleFilter = useDeferredValue(filter);
  return (
    <div className="site-width">
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
          <div className="filter" aria-label={t('games')}>
            {(['all', 'strategy', 'action'] as const).map(option => (
              <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>{t(option)}</button>
            ))}
          </div>
        </div>
        <div className="game-grid" aria-busy={visibleFilter !== filter}>
          {gameIds.filter(id => visibleFilter === 'all' || visibleFilter === games[id].category).map(id =>
            <GameCard key={id} id={id} navigate={navigate} />)}
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
      <RouteLink href="/games" navigate={navigate} className="back-link">{t('backToGames')}</RouteLink>
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

export function GameSetup({ id, online, practice, power, onPower, allowDoubleThree, onRule, onStart, navigate, hasRoom }: {
  id: GameId; online: boolean; practice: boolean; power: Power; onPower: (power: Power) => void;
  allowDoubleThree: boolean; onRule: (allow: boolean) => void;
  onStart: (mode: GameMode) => void; navigate: Navigate; hasRoom: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GameMode>(id === 'omok' && online ? 'online' : id === 'physics' && practice ? 'practice' : 'local');
  const alternative = id === 'omok' ? 'online' : 'practice';
  return (
    <div className="site-width subpage">
      <RouteLink href={gamePath(id)} navigate={navigate} className="back-link">{t(id)}</RouteLink>
      <div className="setup-layout">
        <section className="surface setup-form">
          <h1 tabIndex={-1}>{t('settings')}</h1>
          <fieldset>
            <legend>{t('gameMode')}</legend>
            <label className="choice">
              <input type="radio" name="mode" value="local" checked={mode === 'local'} onChange={() => setMode('local')} />
              <span><strong>{t('local')}</strong><small>{t(id === 'physics' ? 'localFlickCopy' : 'localCopy')}</small></span>
            </label>
            <label className="choice">
              <input type="radio" name="mode" value={alternative} checked={mode === alternative} onChange={() => setMode(alternative)} />
              <span><strong>{t(alternative)}</strong><small>{t(alternative === 'online' ? 'onlineCopy' : 'practiceCopy')}</small></span>
            </label>
          </fieldset>
          {id === 'omok' && (mode === 'local' || !hasRoom) && (
            <fieldset>
              <legend>{t('rule33')}</legend>
              <p className="muted">{t('rule33Help')}</p>
              {[true, false].map(allow => (
                <label className="choice" key={String(allow)}>
                  <input type="radio" name="rule33" checked={allowDoubleThree === allow} onChange={() => onRule(allow)} />
                  <span><strong>{t(allow ? 'allow33' : 'ban33')}</strong></span>
                </label>
              ))}
            </fieldset>
          )}
          {id === 'physics' && (
            <fieldset>
              <legend>{t('force')}</legend>
              {(['standard', 'fast'] as const).map(option => (
                <label className="choice" key={option}>
                  <input type="radio" name="power" value={option} checked={power === option} onChange={() => onPower(option)} />
                  <span><strong>{t(option)}</strong></span>
                </label>
              ))}
            </fieldset>
          )}
          <button type="button" className="button button-primary" onClick={() => onStart(mode)}>
            {t(mode === 'online' ? (hasRoom ? 'goToRoom' : 'newRoom') : 'start')}
          </button>
        </section>
        <aside className="surface setup-summary">
          <img src={games[id].art} alt="" width="880" height="587" />
          <div><Tags id={id} /><h2>{t(id)}</h2><p>{t(games[id].description)}</p></div>
        </aside>
      </div>
    </div>
  );
}
