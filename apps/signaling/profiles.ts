import { DurableObject } from 'cloudflare:workers';
import { avatarLevel, defaultAvatar, levelFromPlayTime, profileGames, profileIdPattern, readFriendUpdate, readName, readProfilePreferences, readReport } from '../../packages/protocol/profile.ts';
import type { AvatarLayers, FriendAction, GameStats, MatchReport, OwnProfile, PresenceMode, ProfileGame, ProfilePreferences, ProfileSummary, PublicProfile, TouchEffect } from '../../packages/protocol/profile.ts';
import type { RoomInvite } from '../../packages/protocol/rooms.ts';
import type { Env } from './bindings.ts';
import { readBody } from './http.ts';

const cookieName = 'noriverse_profile';
type Identity = Partial<AvatarLayers> & { id: string; secret: string; name: string; favorites?: ProfileGame[]; friends?: string[]; touchEffect?: TouchEffect; presence?: PresenceMode };
const avatarLayers = (identity: Identity): AvatarLayers => ({ avatar: identity.avatar ?? defaultAvatar, avatarBackground: identity.avatarBackground });
const presenceLease = 25_000;
const friendActions = ['request', 'accept', 'decline', 'remove', 'cancel'] as const satisfies readonly FriendAction[];
const friendGraph = (env: Env) => env.FRIENDS.getByName('relationships');

export async function verifiedFriends(env: Env, id: string, secret: string) {
  const graph = friendGraph(env);
  const legacy = await env.PROFILES.getByName(id).friendIds(secret);
  if (!legacy) return null;
  if (await graph.needsImport(id)) {
    const mutual = await Promise.all(legacy.map(async other => (await env.PROFILES.getByName(other).hasLegacyFriend(id)) ? other : null));
    await graph.importMutual(id, mutual.filter(other => other !== null));
  }
  return graph.list(id);
}

export async function notifyFriends(env: Env, id: string) {
  const { friends } = await friendGraph(env).list(id);
  await Promise.all(friends.map(other => env.PROFILES.getByName(other).sendSocialChange()));
}

function json(data: unknown, status: number, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  return Response.json(data, { status, headers: responseHeaders });
}

function sessionCookie(value: string, maxAge: number, url: URL) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

export function profileSession(request: Request, external: boolean) {
  const cookie = external ? request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]
    : request.headers.get('Cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const [id, secret, extra] = cookie?.split('.') ?? [];
  return id && secret && !extra && profileIdPattern.test(id) && profileIdPattern.test(secret) ? { id, secret } : undefined;
}

export async function profileRequest(request: Request, env: Env, url: URL, external: boolean) {
  const path = url.pathname;
  const auth = profileSession(request, external);
  const store = auth && env.PROFILES.getByName(auth.id);
  if (path === '/api/profiles/me' && request.method === 'GET') {
    const profile = store && await store.readOwn(auth.secret);
    return profile ? json(profile, 200) : json(null, 404);
  }
  if (path === '/api/profiles/me' && request.method === 'DELETE') {
    if (!store) return json(null, 401);
    const input = await readBody(request) as { id?: unknown } | undefined;
    if (input?.id !== auth.id) return json(null, 409);
    if (!await store.deleteProfile(auth.secret)) return json(null, 401);
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    if (!external) headers.set('Set-Cookie', sessionCookie('', 0, url));
    return new Response(null, { status: 204, headers });
  }
  if (path === '/api/profiles/me' && request.method === 'POST') {
    const input = await readBody(request) as { name?: unknown; id?: unknown } | undefined;
    const name = readName(input?.name);
    if (!name) return json(null, 400);
    if (input?.id !== undefined && (!auth || input.id !== auth.id)) return json(null, 409);
    if (store) {
      const updated = await store.rename(auth.secret, name);
      if (updated) return json(updated, 200);
    }
    if (input?.id !== undefined) return json(null, 401);
    const id = crypto.randomUUID();
    const secret = crypto.randomUUID();
    const profile = await env.PROFILES.getByName(id).create({ id, secret, name });
    if (external) return json(profile, 201, { 'X-Noriverse-Session': id + '.' + secret });
    return json(profile, 201, {
      'Set-Cookie': sessionCookie(id + '.' + secret, 31536000, url),
    });
  }
  if (path === '/api/profiles/me/preferences' && request.method === 'POST') {
    if (!store) return json(null, 401);
    const update = readProfilePreferences(await readBody(request));
    if (!update) return json(null, 400);
    const profile = await store.preferences(auth.secret, update);
    return profile ? json(profile, 200) : json(null, 401);
  }
  if (path === '/api/profiles/me/matches' && request.method === 'POST') {
    if (!store) return json(null, 401);
    const report = readReport(await readBody(request));
    if (!report) return json(null, 400);
    const profile = await store.record(auth.secret, report);
    return profile ? json(profile, 200) : json(null, 401);
  }
  if ((path === '/api/profiles/me/friends' || path === '/api/profiles/me/social') && (request.method === 'GET' || request.method === 'POST')) {
    if (!store) return json(null, 401);
    const links = await verifiedFriends(env, auth.id, auth.secret);
    if (!links) return json(null, 401);
    if (request.method === 'POST') {
      const input = await readBody(request) as { id?: unknown; action?: unknown } | undefined;
      const legacy = readFriendUpdate(input);
      const action = legacy ? legacy.added ? 'request' : 'remove' : friendActions.find(candidate => candidate === input?.action);
      const id = input?.id;
      if (typeof id !== 'string' || !profileIdPattern.test(id) || id === auth.id || !action) return json(null, 400);
      const other = env.PROFILES.getByName(id);
      if (action === 'request' && !await other.summary()) return json(null, 404);
      const updated = await friendGraph(env).change(auth.id, id, action);
      if (!updated) return json(null, 409);
      await Promise.allSettled([store.sendSocialChange(), other.sendSocialChange()]);
      return json(null, 200);
    }
    const presence = url.searchParams.get('presence') === '1';
    const summaries = async (ids: string[], full = false) => (await Promise.all(ids.map(id => full
      ? env.PROFILES.getByName(id).friendSummary(auth.id) : env.PROFILES.getByName(id).summary()))).filter(friend => friend !== null);
    if (path.endsWith('/friends')) return json(await summaries(links.friends, presence), 200);
    const [friends, incoming, outgoing] = await Promise.all([summaries(links.friends, presence), summaries(links.incoming), summaries(links.outgoing)]);
    return json({ friends, incoming, outgoing }, 200);
  }
  if (path === '/api/profiles/me/presence' && request.method === 'POST') {
    const ticket = store && await store.issuePresenceTicket(auth.secret);
    return ticket ? json({ ticket }, 201) : json(null, 401);
  }
  if (path === '/api/profiles/me/invites/read' && request.method === 'POST') {
    if (!store) return json(null, 401);
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string' || !profileIdPattern.test(body.id)) return json(null, 400);
    return json(null, await store.clearInvite(auth.secret, body.id) ? 200 : 401);
  }
  const id = path.match(/^\/api\/profiles\/([^/]+)$/)?.[1];
  if (request.method === 'GET' && id && profileIdPattern.test(id)) {
    const profile = await env.PROFILES.getByName(id).readPublic();
    return profile ? json(profile, 200) : json(null, 404);
  }
  return json(null, 404);
}

const emptyStats = (): GameStats => ({ seconds: 0, wins: 0, losses: 0, draws: 0, sessions: 0 });

export class ProfileStore extends DurableObject<Env> {
  constructor(context: DurableObjectState, env: Env) {
    super(context, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY, game TEXT NOT NULL, mode TEXT NOT NULL, outcome TEXT NOT NULL,
        seconds INTEGER NOT NULL, xp INTEGER NOT NULL, playedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS matches_recent ON matches(playedAt DESC);
      CREATE TABLE IF NOT EXISTS presence_tickets (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    `);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async create(identity: Identity) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const existing = await this.ctx.storage.get<Identity>('identity');
      if (existing) return this.ownView(existing);
      await this.ctx.storage.put('identity', identity);
      return this.ownView(identity);
    });
  }

  async deleteProfile(secret: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (!identity) return true;
      if (identity.secret !== secret) return false;
      const contacts = await friendGraph(this.env).removeProfile(identity.id);
      this.ctx.waitUntil(Promise.allSettled(contacts.map(id => this.env.PROFILES.getByName(id).sendSocialChange())));
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec('DELETE FROM matches; DELETE FROM presence_tickets;');
        this.ctx.storage.kv.delete('currentRoom');
        this.ctx.storage.kv.delete('invites');
        this.ctx.storage.kv.delete('identity');
      });
      await this.ctx.storage.deleteAlarm();
      for (const socket of this.ctx.getWebSockets()) {
        if (socket.readyState === WebSocket.OPEN) socket.close(1000, 'Profile deleted');
      }
      return true;
    });
  }

  async readOwn(secret: string) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    return identity?.secret === secret ? this.ownView(identity) : null;
  }

  async readPublic() {
    const identity = await this.ctx.storage.get<Identity>('identity');
    return identity ? this.publicView(identity) : null;
  }

  async summary(secret?: string): Promise<ProfileSummary | null> {
    const identity = await this.ctx.storage.get<Identity>('identity');
    if (!identity || (secret !== undefined && secret !== identity.secret)) return null;
    return this.profileSummary(identity);
  }

  private profileSummary(identity: Identity): ProfileSummary {
    const seconds = this.ctx.storage.sql.exec<{ seconds: number }>("SELECT COALESCE(sum(seconds), 0) AS seconds FROM matches WHERE mode = 'online'").one().seconds;
    return { id: identity.id, name: identity.name, ...avatarLayers(identity), level: levelFromPlayTime(seconds) };
  }

  async friendSummary(viewer: string) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    if (!identity) return null;
    const profile = this.profileSummary(identity);
    if (identity.presence === 'offline') return { ...profile, online: false };
    const online = Boolean(this.presenceUntil());
    const code = await this.ctx.storage.get<string>('currentRoom');
    const room = code && await this.env.ROOMS.getByName(code).friendRoom(profile.id, viewer);
    return { ...profile, online, room: room && code ? { code, ...room } : undefined };
  }

  async setCurrentRoom(code: string) {
    if (this.ctx.storage.kv.get<Identity>('identity')) this.ctx.storage.kv.put('currentRoom', code);
  }

  sendSocialChange() {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"friends-changed"}');
    }
  }

  async issuePresenceTicket(secret: string) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    if (identity?.secret !== secret) return null;
    const ticket = crypto.randomUUID();
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM presence_tickets WHERE expires <= ?', now);
    this.ctx.storage.sql.exec('INSERT INTO presence_tickets VALUES (?, ?)', ticket, now + 30_000);
    return ticket;
  }

  async fetch(request: Request) {
    const ticket = new URL(request.url).searchParams.get('ticket');
    if (!ticket || !profileIdPattern.test(ticket) || request.headers.get('Upgrade') !== 'websocket') return new Response(null, { status: 400 });
    const valid = this.ctx.storage.sql.exec('DELETE FROM presence_tickets WHERE id = ? AND expires > ? RETURNING id', ticket, Date.now()).toArray();
    if (valid.length === 0) return new Response(null, { status: 401 });
    const wasOnline = Boolean(this.presenceUntil());
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ openedAt: Date.now() });
    const identity = await this.ctx.storage.get<Identity>('identity');
    const mode = identity?.presence ?? 'online';
    this.sendPresenceMode([server], mode);
    this.sendInvites([server], mode === 'offline' ? [] : await this.pendingInvites());
    if (!wasOnline || !await this.ctx.storage.getAlarm()) await this.ctx.storage.setAlarm(Date.now() + presenceLease);
    if (!wasOnline) this.notifyPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket) { socket.close(1008); }

  webSocketClose(socket: WebSocket, code: number) {
    socket.close(code === 1006 || code === 1005 ? 1000 : code);
    if (!this.presenceUntil(socket)) this.notifyPresence();
  }

  async alarm() {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState === WebSocket.OPEN && this.presenceDeadline(socket) <= now) socket.close(4000, 'Presence expired');
    }
    const until = this.presenceUntil();
    if (until) await this.ctx.storage.setAlarm(until);
    else this.notifyPresence();
  }

  private presenceDeadline(socket: WebSocket) {
    const attached = socket.deserializeAttachment() as { openedAt?: number } | null;
    return (this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? attached?.openedAt ?? 0) + presenceLease;
  }

  private presenceUntil(excluded?: WebSocket) {
    let until = 0;
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excluded || socket.readyState !== WebSocket.OPEN) continue;
      const expires = this.presenceDeadline(socket);
      if (expires > now) until = Math.max(until, expires);
    }
    return until;
  }

  private notifyPresence() {
    this.ctx.waitUntil((async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (identity && identity.presence !== 'offline') await notifyFriends(this.env, identity.id);
    })().catch(() => {}));
  }

  async receiveInvite(invite: RoomInvite) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (!identity || identity.presence === 'offline') return false;
      const invites = await this.pendingInvites();
      if (invites.some(item => item.code === invite.code && item.sender === invite.sender)) return true;
      const next = [invite, ...invites].slice(0, 12);
      await this.ctx.storage.put('invites', next);
      this.sendInvites(this.ctx.getWebSockets(), next);
      return true;
    });
  }

  async clearInvite(secret: string, id: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (identity?.secret !== secret) return false;
      const next = (await this.pendingInvites()).filter(invite => invite.id !== id);
      await this.ctx.storage.put('invites', next);
      this.sendInvites(this.ctx.getWebSockets(), identity.presence === 'offline' ? [] : next);
      return true;
    });
  }

  private async pendingInvites() {
    return (await this.ctx.storage.get<RoomInvite[]>('invites') ?? []).filter(invite => invite.expires > Date.now());
  }

  private sendInvites(sockets: WebSocket[], invites: RoomInvite[]) {
    const message = JSON.stringify({ type: 'invites', invites });
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }

  private sendPresenceMode(sockets: WebSocket[], presence: PresenceMode) {
    const message = JSON.stringify({ type: 'presence-mode', presence });
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }

  async friendIds(secret: string) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    return identity?.secret === secret ? identity.friends ?? [] : null;
  }

  async hasLegacyFriend(id: string) {
    return (await this.ctx.storage.get<Identity>('identity'))?.friends?.includes(id) ?? false;
  }

  async rename(secret: string, name: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (identity?.secret !== secret) return null;
      const next = { ...identity, name };
      await this.ctx.storage.put('identity', next);
      return this.ownView(next);
    });
  }

  async record(secret: string, report: MatchReport) {
    const identity = await this.ctx.storage.get<Identity>('identity');
    if (identity?.secret !== secret) return null;
    if (report.mode === 'online') {
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO matches VALUES (?, ?, ?, ?, ?, ?, ?)',
        report.id, report.game, report.mode, report.outcome, report.seconds, report.seconds, Date.now());
    }
    return this.ownView(identity);
  }

  async preferences(secret: string, update: ProfilePreferences) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const identity = await this.ctx.storage.get<Identity>('identity');
      if (identity?.secret !== secret) return null;
      const next = { ...identity };
      if ('avatar' in update) {
        if (this.publicView(identity).level < avatarLevel[update.avatar]) return null;
        next.avatar = update.avatar;
        if (update.avatarBackground !== undefined) next.avatarBackground = update.avatarBackground;
      } else if ('touchEffect' in update) {
        next.touchEffect = update.touchEffect;
      } else if ('presence' in update) {
        next.presence = update.presence;
      } else {
        const favorites = new Set(identity.favorites);
        if (update.favorite.selected) favorites.add(update.favorite.game);
        else favorites.delete(update.favorite.game);
        next.favorites = [...favorites];
      }
      await this.ctx.storage.put('identity', next);
      if ('presence' in update && update.presence !== (identity.presence ?? 'online')) {
        const sockets = this.ctx.getWebSockets();
        this.sendPresenceMode(sockets, update.presence);
        this.sendInvites(sockets, update.presence === 'offline' ? [] : await this.pendingInvites());
        this.ctx.waitUntil(notifyFriends(this.env, identity.id).catch(() => {}));
      }
      return this.ownView(next);
    });
  }

  private ownView(identity: Identity): OwnProfile {
    return { ...this.publicView(identity), presence: identity.presence ?? 'online' };
  }

  private publicView(identity: Identity): PublicProfile {
    const games = Object.fromEntries(profileGames.map(game => [game, emptyStats()])) as PublicProfile['games'];
    let totalSeconds = 0;
    const totals = this.ctx.storage.sql.exec<{
      game: MatchReport['game']; seconds: number; wins: number; losses: number; draws: number; sessions: number;
    }>(`SELECT game, sum(seconds) AS seconds, sum(outcome = 'win') AS wins,
      sum(outcome = 'loss') AS losses, sum(outcome = 'draw') AS draws, count(*) AS sessions
      FROM matches WHERE mode = 'online' GROUP BY game`);
    for (const { game, ...stats } of totals) {
      games[game] = stats;
      totalSeconds += stats.seconds;
    }
    type MatchRow = {
      id: string; game: MatchReport['game']; mode: MatchReport['mode']; outcome: MatchReport['outcome']; seconds: number; playedAt: number;
    };
    const recent = profileGames.flatMap(game => this.ctx.storage.sql.exec<MatchRow>(
      "SELECT id, game, mode, outcome, seconds, playedAt FROM matches WHERE mode = 'online' AND game = ? ORDER BY playedAt DESC LIMIT 20", game).toArray())
      .sort((left, right) => right.playedAt - left.playedAt);
    return {
      id: identity.id, name: identity.name, ...avatarLayers(identity),
      touchEffect: identity.touchEffect ?? 'soft',
      favorites: identity.favorites ?? [], level: levelFromPlayTime(totalSeconds), xp: totalSeconds, totalSeconds, games, recent,
    };
  }
}
