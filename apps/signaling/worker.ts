import { createRoomCode, isRoomGame, roomCodePattern } from '../../packages/protocol/rooms.ts';
import { profileIdPattern } from '../../packages/protocol/profile.ts';
import { readRoomTitle, roomTitleOptions } from '../../packages/protocol/room-titles.ts';
import { readBurgerMode } from '../../packages/protocol/games.ts';
import { notifyFriends, profileRequest, profileSession, verifiedFriends } from './profiles.ts';
import { readBody } from './http.ts';
import type { Env } from './bindings.ts';

export { Room } from './room.ts';
export { ProfileStore } from './profiles.ts';
export { FriendGraph } from './friend-graph.ts';

const roomRoute = /^\/api\/rooms\/([^/]+)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const external = Boolean(origin && origin !== url.origin);
    if (external && origin !== env.APP_ORIGIN) return new Response(null, { status: 403 });

    const cors = (response: Response) => {
      if (external && origin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
        response.headers.set('Access-Control-Expose-Headers', 'X-Noriverse-Session');
        response.headers.append('Vary', 'Origin');
      }
      return response;
    };
    if (external && request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return cors(new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      } }));
    }
    if (url.pathname.startsWith('/api/profiles/')) return cors(await profileRequest(request, env, url, external));

    const presenceId = url.pathname.match(/^\/api\/presence\/([^/]+)$/)?.[1];
    if (presenceId && profileIdPattern.test(presenceId) && request.headers.get('Upgrade') === 'websocket') {
      return env.PROFILES.getByName(presenceId).fetch(request);
    }

    const inviteCode = url.pathname.match(/^\/api\/rooms\/([^/]+)\/invites$/)?.[1];
    if (inviteCode && roomCodePattern.test(inviteCode) && request.method === 'POST') {
      const session = profileSession(request, external);
      if (!session) return cors(new Response(null, { status: 401 }));
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || !('seat' in body) || typeof body.seat !== 'string' || !profileIdPattern.test(body.seat)
        || !('friend' in body) || typeof body.friend !== 'string' || !profileIdPattern.test(body.friend)) {
        return cors(new Response(null, { status: 400 }));
      }
      const sender = env.PROFILES.getByName(session.id);
      const links = await verifiedFriends(env, session.id, session.secret);
      if (!links?.friends.includes(body.friend)) return cors(new Response(null, { status: 403 }));
      const [profile, room] = await Promise.all([
        sender.summary(session.secret), env.ROOMS.getByName(inviteCode).inviteDetails(body.seat),
      ]);
      if (!profile || !room) return cors(new Response(null, { status: 409 }));
      const received = await env.PROFILES.getByName(body.friend).receiveInvite({ id: crypto.randomUUID(), sender: profile.id, name: profile.name,
        game: room.game, code: inviteCode, expires: Date.now() + 180_000 });
      return cors(new Response(null, { status: received ? 204 : 409 }));
    }

    const rosterCode = url.pathname.match(/^\/api\/rooms\/([^/]+)\/participants$/)?.[1];
    if (rosterCode && roomCodePattern.test(rosterCode) && request.method === 'POST') {
      const session = profileSession(request, external);
      if (!session) return cors(new Response(null, { status: 401 }));
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || !('seat' in body) || typeof body.seat !== 'string' || !profileIdPattern.test(body.seat)) {
        return cors(new Response(null, { status: 400 }));
      }
      const profile = await env.PROFILES.getByName(session.id).summary(session.secret);
      if (!profile) return cors(new Response(null, { status: 401 }));
      const saved = await env.ROOMS.getByName(rosterCode).identify(body.seat, profile);
      if (saved) {
        await env.PROFILES.getByName(profile.id).setCurrentRoom(rosterCode);
        ctx.waitUntil(notifyFriends(env, profile.id).catch(() => {}));
      }
      return cors(new Response(null, { status: saved ? 204 : 404 }));
    }

    const gameRoomCode = url.pathname.match(/^\/api\/rooms\/([^/]+)\/game$/)?.[1];
    if (gameRoomCode && roomCodePattern.test(gameRoomCode) && request.method === 'POST') {
      const input = await readBody(request) as { seat?: unknown; game?: unknown; burgerMode?: unknown } | undefined;
      if (typeof input?.seat !== 'string' || !profileIdPattern.test(input.seat) || !isRoomGame(input.game)) {
        return cors(new Response(null, { status: 400 }));
      }
      const burgerMode = readBurgerMode(input.burgerMode);
      if (input.burgerMode !== undefined && (input.game !== 'burger' || !burgerMode)) return cors(new Response(null, { status: 400 }));
      const changed = await env.ROOMS.getByName(gameRoomCode).changeGame(input.seat, input.game, burgerMode);
      return cors(new Response(null, { status: changed ? 204 : 409 }));
    }

    if (url.pathname === '/api/rooms/recent' && request.method === 'POST') {
      const input = await readBody(request);
      if (!Array.isArray(input) || input.length > 8) return cors(new Response(null, { status: 400 }));
      const rooms = await Promise.all(input.map(async (value: { code?: unknown; seat?: unknown } | null) => {
        const code = value?.code;
        const seat = value?.seat;
        if (typeof code !== 'string' || !roomCodePattern.test(code)
          || (seat !== undefined && (typeof seat !== 'string' || !profileIdPattern.test(seat)))) return null;
        const game = await env.ROOMS.getByName(code).joinableGame(seat);
        return game ? { code, game } : null;
      }));
      return cors(Response.json(rooms.filter(room => room !== null), { headers: { 'Cache-Control': 'no-store' } }));
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await readBody(request);
      const game = body && typeof body === 'object' && 'game' in body ? body.game : 'omok';
      if (!isRoomGame(game)) return cors(new Response(null, { status: 400 }));
      const mode = body && typeof body === 'object' && 'burgerMode' in body ? body.burgerMode : undefined;
      const burgerMode = readBurgerMode(mode);
      if (mode !== undefined && (game !== 'burger' || !burgerMode)) return cors(new Response(null, { status: 400 }));
      const input = body && typeof body === 'object' && 'title' in body ? body.title : undefined;
      const customTitle = readRoomTitle(input);
      if (input !== undefined && !customTitle) return cors(new Response(null, { status: 400 }));
      const session = profileSession(request, external);
      const profile = session && await env.PROFILES.getByName(session.id).summary(session.secret);
      const suggestions = roomTitleOptions(profile?.name, request.headers.get('Accept-Language')?.split(/[,;]/, 1)[0]?.trim());
      const title = customTitle ?? suggestions[Math.floor(Math.random() * suggestions.length)];
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = createRoomCode();
        const room = env.ROOMS.getByName(code);
        const token = await room.reserve(game, title, profile ?? undefined, burgerMode);
        if (token) return cors(Response.json({ code, token, title }, { status: 201 }));
      }
      return cors(new Response(null, { status: 503 }));
    }

    const code = url.pathname.match(roomRoute)?.[1];
    if (code && roomCodePattern.test(code) && request.headers.get('Upgrade') === 'websocket') {
      return env.ROOMS.getByName(code).fetch(request);
    }
    return cors(new Response(null, { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
