import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultAvatar } from '../../../../packages/protocol/profile.ts';
import { defaultEmojiIds, emojiChoices, isEmoji, reactionCorners, reactionDuration, recentEmojis, showReaction } from '../../../../packages/protocol/reactions.ts';
import type { Emoji, ReactionSender, TimedReaction } from '../../../../packages/protocol/reactions.ts';
import { Avatar } from './avatar.tsx';
import { BlurredSurface } from './blurred-surface.tsx';
import { emojiName, searchEmojis } from './emoji-search.ts';
import { playReactionSound } from './audio.ts';
import { hasReactionCue } from './reaction-sounds.ts';

const recentCookie = 'noriverse_recent_emojis=';
const addedCookie = 'noriverse_added_emojis=';
const reactionTabs = ['recent', 'basic', 'emoji'] as const;

function readEmojiCookie(prefix: string) {
  try {
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
    return cookie?.slice(prefix.length).split(',') ?? [];
  } catch { return []; }
}

function saveEmojiCookie(prefix: string, emojis: Emoji[]) {
  try {
    document.cookie = prefix + emojis.join(',') + '; Path=' + import.meta.env.BASE_URL
      + '; SameSite=Lax; Max-Age=31536000' + (location.protocol === 'https:' ? '; Secure' : '');
  } catch { /* Cookie access is optional. */ }
}

export const ReactionUsageContext = createContext<(() => void) | undefined>(undefined);
export type RoomReactions = { events: TimedReaction[]; send: (emoji: Emoji) => boolean; enabled: boolean };

function EmojiGlyph({ emoji }: { emoji: Emoji }) {
  return <span className="reaction-glyph" data-emoji={emoji} aria-hidden="true">{emojiChoices[emoji]}</span>;
}

function ReactionBubble({ event }: { event: TimedReaction }) {
  const { t, i18n } = useTranslation();
  const { emoji, corner, sender, role, expiresAt } = event;
  const [delay] = useState(() => Math.min(0, expiresAt - performance.now() - reactionDuration));
  const played = useRef(false);
  useEffect(() => {
    if (played.current || expiresAt - performance.now() < reactionDuration - 450) return;
    played.current = true;
    playReactionSound(emoji);
  }, [emoji, expiresAt]);
  const name = sender?.name ?? t(role ? role === 'host' ? 'host' : 'anonymousPlayer' : 'me');
  return <div className="stage-reaction" data-corner={corner} style={{ '--reaction-duration': reactionDuration + 'ms',
    animationDelay: delay + 'ms' } as CSSProperties}>
    <span className="stage-reaction-emoji" role="img" aria-label={emojiName(emoji, i18n.resolvedLanguage)}><EmojiGlyph emoji={emoji} /></span>
    <span className="stage-reaction-sender">
      <Avatar appearance={sender ?? { avatar: defaultAvatar }} size={33} characterOnly /><span>{name}</span>
    </span>
  </div>;
}

export function ReactionLayer({ events, viewport = false }: { events: TimedReaction[]; viewport?: boolean }) {
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

  return <div className={viewport ? 'stage-reaction-layer viewport-reactions' : 'stage-reaction-layer'} role="log" aria-label={t('gameReactions')}>
    {visible.map(event => <ReactionBubble key={event.id} event={event} />)}
  </div>;
}

export function ReactionPicker({ scope, enabled, send, lobby = false }: {
  scope: string; enabled: boolean; send: (emoji: Emoji) => boolean; lobby?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const trackUsage = useContext(ReactionUsageContext);
  const uid = useId();
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState(() => recentEmojis(readEmojiCookie(recentCookie)));
  const [added, setAdded] = useState(() => [...new Set(readEmojiCookie(addedCookie).filter(isEmoji))]);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof reactionTabs)[number]>('emoji');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerOpen = open && enabled;
  const searchVisible = pickerOpen && tab === 'emoji' && searchOpen;
  const quickEmojis = [...new Set<Emoji>([...added, ...defaultEmojiIds])];
  const options = tab === 'recent' ? recent : tab === 'emoji' ? quickEmojis : [];
  const searchResults = searchVisible ? searchEmojis(query).filter(emoji => !quickEmojis.includes(emoji)) : [];

  useEffect(() => { setOpen(false); }, [scope]);
  useEffect(() => { if (!pickerOpen || tab !== 'emoji') { setSearchOpen(false); setQuery(''); } }, [pickerOpen, tab]);
  useEffect(() => { if (searchVisible) searchInput.current?.focus(); }, [searchVisible]);

  useEffect(() => {
    if (!enabled) setOpen(false);
    if (!pickerOpen) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [enabled, pickerOpen]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
    addButton.current?.focus();
  }

  function choose(emoji: Emoji) {
    const next = recentEmojis([emoji, ...recent]);
    setRecent(next);
    saveEmojiCookie(recentCookie, next);
    if (send(emoji)) trackUsage?.();
    close();
  }

  function add(emoji: Emoji) {
    const next = [emoji, ...added];
    setAdded(next);
    saveEmojiCookie(addedCookie, next);
    closeSearch();
  }

  function emojiButton(emoji: Emoji, select: (emoji: Emoji) => void) {
    const name = emojiName(emoji, i18n.resolvedLanguage);
    const sound = hasReactionCue(emoji);
    return <button type="button" key={emoji} className="reaction-option" aria-label={name}
      aria-describedby={sound ? uid + '-sound' : undefined} title={sound ? name + ' · ' + t('reactionHasSound') : name}
      onClick={() => select(emoji)}>
      <EmojiGlyph emoji={emoji} />
      {sound && <svg className="reaction-sound-badge" aria-hidden="true" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="6" fill="currentColor" /><path d="M4.5 3.4 8.5 6l-4 2.6z" fill="white" />
      </svg>}
    </button>;
  }

  return <div className={lobby ? 'stage-reaction-bar lobby-reaction-picker' : 'stage-reaction-bar'} ref={control} onKeyDown={event => {
      if (pickerOpen && event.key === 'Escape') { event.preventDefault(); if (searchVisible) closeSearch(); else close(); }
    }}>
      <button type="button" className={'button button-secondary stage-reaction-toggle' + (lobby ? '' : ' stage-control stage-control-icon')} ref={trigger}
        aria-label={t('gameReactions')} title={t('gameReactions')} disabled={!enabled}
        aria-expanded={pickerOpen} aria-controls={pickerOpen ? uid + '-picker' : undefined} onClick={() => setOpen(value => !value)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><path d="M8 13.5a4.3 4.3 0 0 0 8 0M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>
      {pickerOpen && <BlurredSurface className="stage-reaction-picker" id={uid + '-picker'}>
        <span className="visually-hidden" id={uid + '-sound'}>{t('reactionHasSound')}</span>
        <div className="reaction-tabs" role="tablist" aria-label={t('gameReactions')} ref={tabs} onKeyDown={event => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const step = event.key === 'ArrowRight' ? 1 : -1;
          const next = event.key === 'Home' ? reactionTabs[0] : event.key === 'End' ? reactionTabs.at(-1)!
            : reactionTabs[(reactionTabs.indexOf(tab) + step + reactionTabs.length) % reactionTabs.length];
          setTab(next);
          tabs.current?.querySelector<HTMLButtonElement>('[data-tab="' + next + '"]')?.focus();
        }}>
          {reactionTabs.map(value => <button type="button" role="tab" key={value} id={uid + '-' + value}
            data-tab={value} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls={uid + '-panel'}
            onClick={() => setTab(value)}>{t('reactionTab_' + value)}</button>)}
        </div>
        <div role="tabpanel" id={uid + '-panel'} aria-labelledby={uid + '-' + tab}>
          <div className="reaction-quick-row">
            <div className="reaction-options" key={tab + added.join(',')}>
              {options.length ? options.map(emoji => emojiButton(emoji, choose)) : <p>{t(tab === 'recent' ? 'reactionRecentEmpty' : 'reactionBasicEmpty')}</p>}
            </div>
            {tab === 'emoji' && <button type="button" ref={addButton} className="reaction-option reaction-add" aria-label={t('reactionAddEmoji')}
              aria-expanded={searchVisible} aria-controls={searchVisible ? uid + '-search' : undefined}
              onClick={() => { if (searchVisible) closeSearch(); else setSearchOpen(true); }}><span aria-hidden="true">+</span></button>}
          </div>
          {searchVisible && <div className="reaction-search" id={uid + '-search'}>
            <input type="search" ref={searchInput} aria-label={t('reactionSearchEmoji')} placeholder={t('reactionSearchEmoji')}
              value={query} onChange={event => setQuery(event.target.value)} />
            <div className="reaction-options" key={query}>
              {searchResults.length ? searchResults.map(emoji => emojiButton(emoji, add)) : <p role="status">{t('reactionSearchEmpty')}</p>}
            </div>
          </div>}
        </div>
      </BlurredSurface>}
  </div>;
}

export function GameReactions({ matchId, room, profile, enabled, size, children, progress, action }: {
  matchId: string;
  room?: RoomReactions; profile?: ReactionSender; enabled: boolean;
  size: { width: number; height: number }; children: ReactNode; progress?: ReactNode; action?: ReactNode;
}) {
  const [local, setLocal] = useState<TimedReaction[]>([]);
  useEffect(() => { setLocal([]); }, [matchId]);
  function send(emoji: Emoji) {
    if (room) return room.send(emoji);
    const now = performance.now(), id = crypto.randomUUID();
    setLocal(previous => showReaction(previous, { id, emoji, corner: reactionCorners[0], sender: profile }, now));
    return true;
  }
  return <div className="stage-stack" style={{ width: size.width, '--reaction-board-width': size.width + 'px' } as CSSProperties}>
    <div className="stage-frame" style={size}>
      {children}
      <ReactionLayer events={room?.events ?? local} />
    </div>
    <div className="stage-footer-controls">
      {action}
      {progress}
      <ReactionPicker scope={matchId} enabled={enabled && (!room || room.enabled)} send={send} />
    </div>
  </div>;
}
