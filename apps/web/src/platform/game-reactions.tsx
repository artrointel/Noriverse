import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultAvatar } from '../../../../packages/protocol/profile.ts';
import { emojiChoices, emojiIds, freeReactionCorner, reactionDuration, recentEmojis, showReaction } from '../../../../packages/protocol/reactions.ts';
import type { Emoji, ReactionSender, TimedReaction } from '../../../../packages/protocol/reactions.ts';
import { avatars } from './avatars.ts';

const recentCookie = 'noriverse_recent_emojis=';

function readRecents() {
  try {
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(recentCookie));
    return recentEmojis(cookie?.slice(recentCookie.length).split(',') ?? []);
  } catch { return []; }
}

function saveRecents(emojis: Emoji[]) {
  try {
    document.cookie = recentCookie + emojis.join(',') + '; Path=' + import.meta.env.BASE_URL
      + '; SameSite=Lax; Max-Age=31536000' + (location.protocol === 'https:' ? '; Secure' : '');
  } catch { /* Cookie access is optional. */ }
}

export type RoomReactions = { events: TimedReaction[]; send: (emoji: Emoji) => void; enabled: boolean };

function ReactionBubble({ event }: { event: TimedReaction }) {
  const { t } = useTranslation();
  const { emoji, corner, sender, role, expiresAt } = event;
  const [delay] = useState(() => Math.min(0, expiresAt - performance.now() - reactionDuration));
  const name = sender?.name ?? t(role ? role === 'host' ? 'host' : 'anonymousPlayer' : 'me');
  return <div className="stage-reaction" data-corner={corner} style={{ '--reaction-duration': reactionDuration + 'ms',
    animationDelay: delay + 'ms' } as CSSProperties}>
    <span className="stage-reaction-emoji" role="img" aria-label={t('reaction_' + emoji)}>{emojiChoices[emoji]}</span>
    <span className="stage-reaction-sender"><img src={avatars[sender?.avatar ?? defaultAvatar]} alt="" />{name}</span>
  </div>;
}

function ReactionLayer({ events }: { events: TimedReaction[] }) {
  const { t } = useTranslation();
  const [clock, setClock] = useState(0);
  const now = Math.max(clock, performance.now());
  const visible = events.filter(event => event.expiresAt > now);
  const expiry = Math.min(...visible.map(event => event.expiresAt));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = window.setTimeout(() => setClock(performance.now()), Math.max(1, Math.ceil(expiry - performance.now())));
    return () => window.clearTimeout(timer);
  }, [clock, expiry]);

  return <div className="stage-reaction-layer" role="log" aria-label={t('gameReactions')}>
    {visible.map(event => <ReactionBubble key={event.id} event={event} />)}
  </div>;
}

export function GameReactions({ matchId, room, profile, enabled, size, children }: {
  matchId: string;
  room?: RoomReactions; profile?: ReactionSender; enabled: boolean;
  size: { width: number; height: number }; children: ReactNode;
}) {
  const { t } = useTranslation();
  const uid = useId();
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState(readRecents);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'emoji' | 'basic'>('emoji');
  const [local, setLocal] = useState<TimedReaction[]>([]);
  const active = enabled && (!room || room.enabled);
  const pickerOpen = open && active;

  useEffect(() => { setLocal([]); setOpen(false); }, [matchId]);

  useEffect(() => {
    if (!active) setOpen(false);
    if (!pickerOpen) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [active, pickerOpen]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(emoji: Emoji) {
    const next = recentEmojis([emoji, ...recent]);
    setRecent(next);
    saveRecents(next);
    if (room) room.send(emoji);
    else {
      const now = performance.now(), id = crypto.randomUUID(), random = Math.random();
      setLocal(previous => {
        const corner = freeReactionCorner(previous, now, () => random);
        return corner ? showReaction(previous, { id, emoji, corner, sender: profile }, now) : previous;
      });
    }
    close();
  }

  return <div className="stage-stack" style={{ width: size.width }}>
    <div className="stage-frame" style={size}>
      {children}
      <ReactionLayer events={room?.events ?? local} />
    </div>
    <div className="stage-reaction-bar" ref={control} onKeyDown={event => {
      if (pickerOpen && event.key === 'Escape') { event.preventDefault(); close(); }
    }}>
      <button type="button" className="button button-secondary stage-reaction-toggle" ref={trigger}
        aria-label={t('gameReactions')} title={t('gameReactions')} disabled={!active}
        aria-expanded={pickerOpen} aria-controls={pickerOpen ? uid + '-picker' : undefined} onClick={() => setOpen(value => !value)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M8 13.5a4.3 4.3 0 0 0 8 0M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      {pickerOpen && <div className="surface stage-reaction-picker" id={uid + '-picker'}>
        <div className="reaction-tabs" role="tablist" aria-label={t('gameReactions')} ref={tabs} onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'emoji' : event.key === 'End' ? 'basic' : tab === 'emoji' ? 'basic' : 'emoji';
          setTab(next);
          tabs.current?.querySelector<HTMLButtonElement>('[data-tab="' + next + '"]')?.focus();
        }}>
          {(['emoji', 'basic'] as const).map(value => <button type="button" role="tab" key={value} id={uid + '-' + value}
            data-tab={value} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls={uid + '-panel'}
            onClick={() => setTab(value)}>{t(value === 'emoji' ? 'reactionEmojiTab' : 'reactionBasicTab')}</button>)}
        </div>
        <div className="reaction-options" role="tabpanel" id={uid + '-panel'} aria-labelledby={uid + '-' + tab}>
          {tab === 'emoji' ? [...recent, ...emojiIds.filter(emoji => !recent.includes(emoji))].map(emoji =>
            <button type="button" key={emoji} className="reaction-option" aria-label={t('reaction_' + emoji)} title={t('reaction_' + emoji)}
              onClick={() => choose(emoji)}>{emojiChoices[emoji]}</button>) : <p>{t('reactionBasicEmpty')}</p>}
        </div>
      </div>}
    </div>
  </div>;
}
