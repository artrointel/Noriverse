import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { flushSync } from 'react-dom';
import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { GameId } from '../games/scenes.ts';

export type Navigate = (destination: string, replace?: boolean) => void;

export function readRoute(url: URL) {
  const invite = url.searchParams.get('room') ?? '';
  const online = url.searchParams.get('mode') === 'online';
  const practice = url.searchParams.get('mode') === 'practice';
  const [section, id, step, extra] = url.pathname.split('/').filter(Boolean);
  if (section === 'room' || (!section && invite)) return { page: 'room', invite } as const;
  if (!section) return { page: 'home' } as const;
  if (section === 'profile' && !id) return { page: 'profile' } as const;
  if (section === 'profiles' && id && !step && profileIdPattern.test(id)) return { page: 'publicProfile', profileId: id } as const;
  if (section === 'games' && !id) return { page: 'games' } as const;
  if (section === 'games' && (id === 'omok' || id === 'physics') && !extra) {
    if (!step) return { page: 'detail', id } as const;
    if (step === 'setup' || step === 'play') return { page: step, id, online, practice } as const;
  }
  return { page: 'missing' } as const;
}

type GameMode = 'local' | 'online' | 'practice';
export type { GameMode };
export const gamePath = (id: GameId, step?: 'setup' | 'play', mode: GameMode = 'local') =>
  '/games/' + id + (step ? '/' + step : '') + (mode === 'local' ? '' : '?mode=' + mode);

export function useNavigation() {
  const [url, setUrl] = useState(() => new URL(location.href));
  const version = useRef(0);

  const navigate = useCallback<Navigate>((destination, replace = false) => {
    const next = new URL(destination, location.href);
    if (next.href === location.href) return;
    const request = ++version.current;
    const commit = (synchronous: boolean) => {
      if (request !== version.current) return;
      if (replace) history.replaceState(null, '', next);
      else history.pushState(null, '', next);
      if (synchronous) flushSync(() => setUrl(next));
      else setUrl(next);
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
      setUrl(new URL(location.href));
    }
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  return { route: useMemo(() => readRoute(url), [url]), path: url.pathname + url.search, navigate };
}

export function RouteLink({ navigate, href, onClick, ...props }: ComponentPropsWithoutRef<'a'> & {
  navigate: Navigate; href: string;
}) {
  return (
    <a {...props} href={href} onClick={event => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(href);
    }} />
  );
}
