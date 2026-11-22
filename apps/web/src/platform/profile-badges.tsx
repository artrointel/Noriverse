import { Popup } from './popup.tsx';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { badgeCatalog, badgeIds } from '../../../../packages/protocol/badges.ts';
import type { BadgeId, EarnedBadge } from '../../../../packages/protocol/badges.ts';

const artwork = import.meta.glob<string>('../assets/badges/*.webp', { eager: true, import: 'default', query: '?url' });
export const badgeImage = (id: BadgeId) => artwork['../assets/badges/' + id + '.webp'];
export const badgeCopy = (id: BadgeId, language?: string) => badgeCatalog[id][language?.startsWith('ko') ? 'ko' : 'en'];

function Achievement({ id, earnedAt }: { id: BadgeId; earnedAt?: number }) {
  const { t, i18n } = useTranslation();
  const [name, description] = badgeCopy(id, i18n.resolvedLanguage);
  const date = earnedAt ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(earnedAt) : undefined;
  return <>
    <img className="achievement-art" src={badgeImage(id)} width="66" height="66" alt="" loading="lazy" />
    <div className="achievement-copy">
      <strong>{name}</strong>
      <p><span>{t('achievement')}</span> {description}</p>
      {date && earnedAt && <time dateTime={new Date(earnedAt).toISOString()}>{t('badgeEarnedDate', { date })}</time>}
    </div>
  </>;
}

function BadgeGuide({ badges, close }: { badges: EarnedBadge[]; close: () => void }) {
  const { t } = useTranslation();
  const title = useId();
  const [current, setCurrent] = useState<'earned' | 'unearned'>('earned');
  const earned = new Map(badges.map(badge => [badge.id, badge.earnedAt]));
  const tabs = [
    { id: 'earned', label: 'badgesEarned', empty: 'badgesEarnedEmpty', badges: badgeIds.filter(id => earned.has(id)) },
    { id: 'unearned', label: 'badgesUnearned', empty: 'badgesUnearnedEmpty', badges: badgeIds.filter(id => !earned.has(id)) },
  ] as const;
  return <Popup className="badge-guide" aria-labelledby={title} onDismiss={close}>
    <header className="room-panel-heading">
      <h2 id={title}>{t('badgeGuide')}</h2>
      <small>{earned.size} / {badgeIds.length}</small>
    </header>
    <div className="badge-guide-tabs" role="tablist" aria-label={t('badges')} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'earned' : event.key === 'End' ? 'unearned' : current === 'earned' ? 'unearned' : 'earned';
      setCurrent(next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next === 'earned' ? 0 : 1]?.focus();
    }}>
      {tabs.map(tab => <button key={tab.id} className="button button-secondary" type="button" role="tab"
        id={title + '-' + tab.id} aria-controls={title + '-' + tab.id + '-panel'}
        aria-selected={current === tab.id} tabIndex={current === tab.id ? 0 : -1} onClick={() => setCurrent(tab.id)}>
        {t(tab.label)} <span aria-hidden="true">{tab.badges.length}</span>
      </button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} id={title + '-' + tab.id + '-panel'} role="tabpanel"
      aria-labelledby={title + '-' + tab.id} tabIndex={0} hidden={current !== tab.id}>
      {tab.badges.length ? <ul>
        {tab.badges.map(id => <li className="achievement-card" key={id} data-earned={tab.id === 'earned'}>
          <Achievement id={id} earnedAt={earned.get(id)} />
        </li>)}
      </ul> : <p className="muted">{t(tab.empty)}</p>}
    </div>)}
  </Popup>;
}

export function ProfileBadges({ badges = [] }: { badges?: EarnedBadge[] }) {
  const { t, i18n } = useTranslation();
  const [guideOpen, setGuideOpen] = useState(false);
  const [hovered, setHovered] = useState<BadgeId>();
  const [pressed, setPressed] = useState<BadgeId>();
  const id = guideOpen ? undefined : hovered ?? pressed;
  const badge = badges.find(badge => badge.id === id);
  const buttonRefs = useRef(new Map<BadgeId, HTMLButtonElement>());
  const panel = useRef<HTMLDivElement>(null);
  const description = useId();

  useLayoutEffect(() => {
    if (!id) return;
    const anchor = buttonRefs.current.get(id);
    const popup = panel.current;
    if (!anchor || !popup) return;
    function position() {
      if (!anchor || !popup) return;
      const rect = anchor.getBoundingClientRect();
      const right = rect.right + popup.offsetWidth + 16 <= innerWidth;
      const left = rect.left >= popup.offsetWidth + 16;
      const x = right ? rect.right + 8 : left ? rect.left - popup.offsetWidth - 8 : rect.left;
      const y = right || left ? rect.top + (rect.height - popup.offsetHeight) / 2
        : rect.bottom + popup.offsetHeight + 16 <= innerHeight ? rect.bottom + 8 : rect.top - popup.offsetHeight - 8;
      popup.style.left = Math.max(8, Math.min(innerWidth - popup.offsetWidth - 8, x)) + 'px';
      popup.style.top = Math.max(8, Math.min(innerHeight - popup.offsetHeight - 8, y)) + 'px';
    }
    position();
    const size = new ResizeObserver(position);
    size.observe(popup);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { size.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [id]);

  useEffect(() => {
    const activeId = id;
    if (!activeId) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !buttonRefs.current.get(activeId)?.contains(event.target)) {
        setPressed(undefined);
        setHovered(undefined);
      }
    };
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setPressed(undefined); setHovered(undefined); }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [id]);

  return <div className="profile-badge-row" role="group" aria-label={t('badges')}>
    {badges.map(({ id: badgeId }) => <button key={badgeId} className="profile-badge" type="button"
      ref={element => { if (element) buttonRefs.current.set(badgeId, element); else buttonRefs.current.delete(badgeId); }}
      aria-label={badgeCopy(badgeId, i18n.resolvedLanguage)[0]} aria-expanded={id === badgeId}
      aria-describedby={id === badgeId ? description : undefined}
      onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(badgeId); }}
      onPointerLeave={() => setHovered(undefined)}
      onClick={() => setPressed(previous => previous === badgeId ? undefined : badgeId)}>
      <img src={badgeImage(badgeId)} alt="" width="36" height="36" />
    </button>)}
    <button className="button button-secondary badge-guide-button" type="button" aria-label={t('badgeGuide')}
      onClick={() => { setHovered(undefined); setPressed(undefined); setGuideOpen(true); }}>?</button>
    {badge && createPortal(<div id={description} role="tooltip" className="surface achievement-card badge-popover" ref={panel}>
      <Achievement id={badge.id} earnedAt={badge.earnedAt} />
    </div>, document.body)}
    {guideOpen && <BadgeGuide badges={badges} close={() => setGuideOpen(false)} />}
  </div>;
}
