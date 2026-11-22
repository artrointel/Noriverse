import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { explorerIds } from '../../../../packages/protocol/explorers.ts';
import type { ExplorerId } from '../../../../packages/protocol/explorers.ts';
import { Avatar } from './avatar.tsx';
import { explorerCopy, explorers } from './explorers.ts';
import { BackLink, explorerPath, RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import './explorer-pages.css';

const accent = (id: ExplorerId) => ({ '--explorer-accent': explorers[id].accent } as CSSProperties);

export default function ExplorerPage({ characterId, navigate }: { characterId?: ExplorerId; navigate: Navigate }) {
  const { t, i18n } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [characterId]);
  if (characterId) {
    const character = explorerCopy(characterId, i18n.resolvedLanguage);
    return <div className="site-width subpage explorer-page">
      <BackLink fallback={explorerPath()} fallbackLabel="explorers" navigate={navigate} />
      <section className="surface explorer-feature" style={accent(characterId)}>
        <div className="explorer-portrait"><Avatar appearance={{ avatar: characterId }} size={232} characterOnly /></div>
        <div className="explorer-feature-copy">
          <p className="explorer-kicker">{t('explorerCrew')}</p>
          <h1 ref={heading} tabIndex={-1}>{character.name}</h1>
          <div className="explorer-tags"><span>{character.motif}</span><span>{character.role}</span></div>
          <p className="explorer-summary">{character.summary}</p>
        </div>
      </section>
      <section className="surface explorer-story">
        <h2>{t('explorerStory')}</h2>
        <p>{character.story}</p>
      </section>
      <div className="panel-actions explorer-actions">
        <RouteLink className="button button-primary" href="/profile" navigate={navigate}>{t('explorerProfile')}</RouteLink>
        <RouteLink className="button button-secondary" href={explorerPath()} navigate={navigate}>{t('explorers')}</RouteLink>
      </div>
    </div>;
  }

  return <div className="site-width subpage explorer-page">
    <BackLink fallback="/" fallbackLabel="home" navigate={navigate} />
    <header className="explorer-heading">
      <p className="explorer-kicker">{t('explorers')}</p>
      <h1 ref={heading} tabIndex={-1}>{t('explorerCrew')}</h1>
      <p>{t('explorerIntro')}</p>
    </header>
    <ul className="explorer-grid">
      {explorerIds.map(id => {
        const character = explorerCopy(id, i18n.resolvedLanguage);
        return <li key={id} style={accent(id)}>
          <RouteLink className="surface explorer-card" href={explorerPath(id)} navigate={navigate}>
            <div className="explorer-card-art"><Avatar appearance={{ avatar: id }} size={116} characterOnly /></div>
            <div className="explorer-card-copy"><strong>{character.name}</strong><small>{character.motif} · {character.role}</small></div>
          </RouteLink>
        </li>;
      })}
    </ul>
  </div>;
}
