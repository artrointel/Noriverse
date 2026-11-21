import { profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { PublicProfile } from '../../../../packages/protocol/profile.ts';

const pages = import.meta.env.VITE_GITHUB_PAGES === 'true';
const configuredBase = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '') as string | undefined;
const apiBase = configuredBase || location.origin;
const external = apiBase !== location.origin;
const sessionCookie = 'noriverse_pages_profile';
export const apiAvailable = !pages || Boolean(configuredBase);

export function apiUrl(path: string) {
  return new URL(path, apiBase);
}

function validSession(value: string) {
  const [id, secret, extra] = value.split('.');
  return !extra && profileIdPattern.test(id ?? '') && profileIdPattern.test(secret ?? '');
}

function readSession() {
  const value = document.cookie.split(';').map(part => part.trim())
    .find(part => part.startsWith(sessionCookie + '='))?.slice(sessionCookie.length + 1);
  return value && validSession(value) ? value : '';
}

function saveSession(value: string) {
  if (value && !validSession(value)) return;
  document.cookie = sessionCookie + '=' + value + '; Path=' + import.meta.env.BASE_URL
    + '; SameSite=Lax; Max-Age=' + (value ? '31536000' : '0') + (location.protocol === 'https:' ? '; Secure' : '');
}

export async function apiFetch(path: string, init?: RequestInit) {
  if (!apiAvailable) return new Response(null, { status: 503 });
  if (!external) return fetch(path, init);
  const headers = new Headers(init?.headers);
  const profilePath = path === '/api/profiles/me' || path.startsWith('/api/profiles/me/');
  const session = readSession();
  if (profilePath || path === '/api/rooms' || /^\/api\/rooms\/[A-Z0-9]{8}\/(?:participants|invites)$/.test(path)) {
    if (session) headers.set('Authorization', 'Bearer ' + session);
  }
  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'omit', redirect: 'error' });
  if (profilePath && response.ok) {
    const issued = response.headers.get('X-Noriverse-Session');
    if (issued) saveSession(issued);
    else if (path === '/api/profiles/me' && init?.method === 'DELETE' && response.status === 204 && readSession() === session) saveSession('');
  }
  return response;
}

export async function fetchPublicProfile(id: string, signal: AbortSignal): Promise<PublicProfile | null> {
  const response = await apiFetch('/api/profiles/' + id, { signal });
  return response.ok ? await response.json() as PublicProfile : null;
}
