import assert from 'node:assert/strict';
import { explorerIds } from '../packages/protocol/explorers.ts';
import type { OwnProfile, ProfilePreferences, PublicProfile } from '../packages/protocol/profile.ts';
import { profileIdPattern } from '../packages/protocol/profile.ts';

const api = new URL(process.argv[2] ?? 'http://127.0.0.1:8787');
const appOrigin = new URL(process.argv[3] ?? 'https://artrointel.github.io').origin;

async function request(path: string, method: string, session?: string, body?: unknown) {
  const headers = new Headers({ Origin: appOrigin });
  if (session) headers.set('Authorization', 'Bearer ' + session);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(new URL(path, api), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} returned HTTP ${response.status}`, { cause: response.status });
  }
  return response;
}

const me = '/api/profiles/me';
const created = await request(me, 'POST', undefined, { name: 'Profile storage check' });
const session = created.headers.get('X-Noriverse-Session') ?? '';
const [id, secret] = session.split('.');
assert(profileIdPattern.test(id) && profileIdPattern.test(secret), 'Unexpected profile session format');

async function save(update: ProfilePreferences): Promise<OwnProfile> {
  return (await request(me + '/preferences', 'POST', session, update)).json() as Promise<OwnProfile>;
}

async function reload(): Promise<OwnProfile> {
  return (await request(me, 'GET', session)).json() as Promise<OwnProfile>;
}

try {
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), appOrigin);
  for (const [index, avatar] of explorerIds.entries()) {
    const avatarBackground = index % 2 ? null : '#7863c4';
    const saved = await save({ avatar, avatarBackground }).catch(error => {
      if (error instanceof Error && error.cause === 400) {
        throw new Error(`The Worker at ${api.origin} rejected avatar ${avatar}. Deploy the matching Worker before publishing Pages.`, { cause: error });
      }
      throw new Error(`Failed to save avatar ${avatar}`, { cause: error });
    });
    const restored = await reload();
    assert.equal(saved.avatar, avatar);
    assert.equal(restored.avatar, avatar);
    assert.equal(restored.avatarBackground, avatarBackground);
    const publicView = await (await request('/api/profiles/' + id, 'GET')).json() as PublicProfile;
    assert.equal(publicView.avatar, avatar);
    assert.equal(publicView.avatarBackground, avatarBackground);
  }

  await save({ avatar: 'mint', avatarBackground: null });
  await save({ touchEffect: 'pixelDrift' });
  await save({ favorite: { game: 'omok', selected: true } });
  await save({ presence: 'offline' });
  const restored = await reload();
  assert.equal(restored.avatar, 'mint');
  assert.equal(restored.touchEffect, 'pixelDrift');
  assert(restored.favorites.includes('omok'));
  assert.equal(restored.presence, 'offline');
} finally {
  await request(me, 'DELETE', session, { id });
}
console.log(`Saved and reloaded ${explorerIds.length} explorer avatars, the original avatar, and profile preferences.`);
