import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import { isExplorerId } from '../../../../packages/protocol/explorers.ts';
import type { ExplorerId } from '../../../../packages/protocol/explorers.ts';
import { isRoomGame } from '../../../../packages/protocol/rooms.ts';
import type { RoomActivity } from '../../../../packages/protocol/rooms.ts';
import { isCatalogGameId } from '../../../../packages/protocol/games.ts';
import type { CatalogGameId, GameId } from '../../../../packages/protocol/games.ts';
import { routeHref, usesHashRoutes } from './route-href.ts';
export { routeHref } from './route-href.ts';

export type Navigate = (destination: string, replace?: boolean) => void;
function readLocation(url = new URL(location.href)) {
  if (!usesHashRoutes) return url;
  return new URL(url.hash.startsWith('#/') ? url.hash.slice(1) : '/' + url.search, url.origin);
}

const routePath = (url: URL) => url.pathname + url.search;
function readPrevious(): string | undefined {
  const previous = history.state?.noriversePrevious;
  return typeof previous === 'string' && previous.startsWith('/') && !previous.startsWith('//') ? previous : undefined;
}

export const BackNavigation = createContext<{ previous?: string; back: () => void }>({ back: () => {} });

export function readRoute(url: URL) {
  const invite = url.searchParams.get('room') ?? '';
  const online = url.searchParams.get('mode') === 'online';
  const [section, id, step, extra] = url.pathname.split('/').filter(Boolean);
  if (section === 'room' && id === 'create' && !step) return { page: 'createRoom' } as const;
  if (section === 'room' || (!section && invite)) return { page: 'room', invite } as const;
  if (!section) return { page: 'home' } as const;
  if (section === 'profile' && !id) return { page: 'profile' } as const;
  if (section === 'friends' && !id) return { page: 'friends' } as const;
  if (section === 'characters' && !id) return { page: 'explorers' } as const;
  if (section === 'characters' && !step && isExplorerId(id)) return { page: 'explorer', characterId: id } as const;
  if (section === 'profiles' && id && !step && profileIdPattern.test(id)) return { page: 'publicProfile', profileId: id } as const;
  if (section === 'games' && !id) return { page: 'games' } as const;
  if (section === 'games' && isCatalogGameId(id) && !extra) {
    if (!step) return { page: 'detail', id } as const;
    if ((step === 'setup' || step === 'play') && isRoomGame(id)) return { page: step, id, online } as const;
  }
  return { page: 'missing' } as const;
}

export function roomActivityForRoute(route: ReturnType<typeof readRoute>): RoomActivity {
  switch (route.page) {
    case 'room': return 'lobby';
    case 'home': return 'home';
    case 'profile': case 'publicProfile': return 'profile';
    case 'friends': return 'friends';
    case 'games': case 'detail': return 'library';
    case 'setup': case 'createRoom': return 'setup';
    case 'explorers': case 'explorer': return 'characters';
    case 'play': return `play:${route.id}`;
    default: return 'other';
  }
}

type GameMode = 'local' | 'online';
export type { GameMode };
export function gamePath(id: CatalogGameId): string;
export function gamePath(id: GameId, step: 'setup' | 'play', mode?: GameMode): string;
export function gamePath(id: CatalogGameId, step?: 'setup' | 'play', mode: GameMode = 'local') {
  return '/games/' + id + (step ? '/' + step : '') + (mode === 'local' ? '' : '?mode=' + mode);
}
export const explorerPath = (id?: ExplorerId) => id ? '/characters/' + id : '/characters';

export function useNavigation() {
  const [entry, setEntry] = useState(() => ({ url: readLocation(), previous: readPrevious() }));
  const version = useRef(0);

  const navigate = useCallback<Navigate>((destination, replace = false) => {
    const next = new URL(routeHref(destination), location.href);
    if (next.href === location.href) return;
    const request = ++version.current;
    const commit = (synchronous: boolean) => {
      if (request !== version.current) return;
      const previous = replace ? readPrevious() : routePath(readLocation());
      const state = { noriversePrevious: previous };
      if (replace) history.replaceState(state, '', next);
      else history.pushState(state, '', next);
      const update = () => setEntry({ url: readLocation(next), previous });
      if (synchronous) flushSync(update);
      else update();
      window.scrollTo(0, 0);
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches
      && !document.fullscreenElement) {
      document.startViewTransition(() => commit(true));
    } else {
      commit(false);
    }
  }, []);

  useEffect(() => {
    function restore() {
      version.current++;
      setEntry({ url: readLocation(), previous: readPrevious() });
    }
    window.addEventListener('popstate', restore);
    if (usesHashRoutes) window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      if (usesHashRoutes) window.removeEventListener('hashchange', restore);
    };
  }, []);

  const path = routePath(entry.url);
  const back = useCallback(() => { version.current++; history.back(); }, []);
  return { route: useMemo(() => readRoute(entry.url), [entry.url]), path, navigate,
    backNavigation: { previous: entry.previous !== path ? entry.previous : undefined, back } };
}

export function BackLink({ navigate, fallback, fallbackLabel }: { navigate: Navigate; fallback: string; fallbackLabel: string }) {
  const { t } = useTranslation();
  const { previous, back } = useContext(BackNavigation);
  const route = previous && readRoute(new URL(previous, location.origin));
  const label = route && (route.page === 'room' ? 'room' : route.page === 'createRoom' ? 'newRoom' : route.page === 'profile' ? 'myProfile'
    : route.page === 'publicProfile' ? 'publicProfile' : route.page === 'friends' ? 'friends'
    : route.page === 'explorers' || route.page === 'explorer' ? 'explorers' : route.page === 'games' ? 'backToGames' : route.page === 'home' ? 'home'
    : route.page === 'setup' ? 'settings' : 'id' in route ? route.id : undefined);
  return <RouteLink className="back-link" href={label && previous ? previous : fallback} navigate={navigate} onClick={event => {
    if (!label || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    back();
  }}>{t(label || fallbackLabel)}</RouteLink>;
}

export function RouteLink({ navigate, href, onClick, ...props }: ComponentPropsWithoutRef<'a'> & {
  navigate: Navigate; href: string;
}) {
  return (
    <a {...props} href={routeHref(href)} onClick={event => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(href);
    }} />
  );
}
