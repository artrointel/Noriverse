import { DurableObject } from 'cloudflare:workers';
import { createRoomCode, readSignal, roomCodePattern } from '../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomMessage } from '../../packages/protocol/rooms.ts';
import { isProfileGame, profileIdPattern } from '../../packages/protocol/profile.ts';
import type { ProfileGame, ProfileSummary } from '../../packages/protocol/profile.ts';
import { profileRequest, profileSession, readBody, ProfileStore } from './profiles.ts';
export { ProfileStore };

interface Env { ROOMS: DurableObjectNamespace<Room>; PROFILES: DurableObjectNamespace<ProfileStore>; APP_ORIGIN?: string }
interface Reservation { host: string; guest?: string; game?: ProfileGame; expires: number; profiles?: Partial<Record<Role, ProfileSummary>> }
const roomLifetime = 30 * 60 * 1000;
const roomRoute = /^\/api\/rooms\/([^/]+)$/;

function send(socket: WebSocket, message: RoomMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export default {
  async fetch(request, env) {
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
      const friends = await sender.friendIds(session.secret);
      if (!friends?.includes(body.friend)) return cors(new Response(null, { status: 403 }));
      const [profile, room] = await Promise.all([
        sender.summary(session.secret), env.ROOMS.getByName(inviteCode).inviteDetails(body.seat),
      ]);
      if (!profile || !room) return cors(new Response(null, { status: 409 }));
      await env.PROFILES.getByName(body.friend).receiveInvite({ id: crypto.randomUUID(), sender: profile.id, name: profile.name,
        game: room.game, code: inviteCode, expires: Math.min(Date.now() + 180_000, room.expires) });
      return cors(new Response(null, { status: 204 }));
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
      return cors(new Response(null, { status: saved ? 204 : 404 }));
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await readBody(request);
      const game = body && typeof body === 'object' && 'game' in body ? body.game : 'omok';
      if (!isProfileGame(game)) return cors(new Response(null, { status: 400 }));
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = createRoomCode();
        const room = env.ROOMS.getByName(code);
        const token = await room.reserve(game);
        if (token) return cors(Response.json({ code, token }, { status: 201 }));
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

export class Room extends DurableObject<Env> {
  async reserve(game: ProfileGame): Promise<string | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<Reservation>('reservation');
      if (previous && previous.expires > Date.now()) return null;
      this.closeExpiredSockets();
      const reservation = { host: crypto.randomUUID(), game, expires: Date.now() + roomLifetime };
      await this.ctx.storage.put('reservation', reservation);
      await this.ctx.storage.setAlarm(reservation.expires);
      return reservation.host;
    });
  }

  async inviteDetails(seat: string) {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (!reservation || reservation.host !== seat || reservation.guest || !this.socketFor('host') || reservation.expires <= Date.now()) return null;
    return { game: reservation.game ?? 'omok', expires: reservation.expires };
  }

  async identify(seat: string, profile: ProfileSummary) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (!reservation || reservation.expires <= Date.now()) return false;
      const role = seat === reservation.host ? 'host' : seat === reservation.guest ? 'guest' : undefined;
      if (!role) return false;
      reservation.profiles = { ...reservation.profiles, [role]: profile };
      await this.ctx.storage.put('reservation', reservation);
      this.sendRoster(reservation);
      return true;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const token = new URL(request.url).searchParams.get('seat');
    if (!reservation || reservation.expires <= Date.now()) {
      send(server, { type: 'error', reason: 'missing' });
      server.close(1008);
    } else if (token && token !== reservation.host && token !== reservation.guest) {
      send(server, { type: 'error', reason: 'token' });
      server.close(1008);
    } else if (!token && reservation.guest) {
      send(server, { type: 'error', reason: 'full' });
      server.close(1008);
    } else {
      const role: Role = token === reservation.host ? 'host' : 'guest';
      const seat = token ?? crypto.randomUUID();
      if (!token) {
        reservation.guest = seat;
        await this.ctx.storage.put('reservation', reservation);
      }
      this.socketFor(role, server)?.close(1000, 'Seat replaced');
      server.serializeAttachment(role);
      send(server, { type: 'welcome', role, token: seat });
      const other = this.socketFor(role === 'host' ? 'guest' : 'host');
      if (other) {
        send(other, { type: 'paired' });
        send(server, { type: 'paired' });
      }
      this.sendRoster(reservation);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const role = socket.deserializeAttachment() as Role | null;
    if (!role || this.socketFor(role) !== socket || typeof message !== 'string' || message.length > 20000) return;
    try {
      const signal = readSignal(JSON.parse(message), role);
      const other = this.socketFor(role === 'host' ? 'guest' : 'host');
      if (other && signal) send(other, signal);
    } catch {
      socket.close(1007);
    }
  }

  async webSocketClose(socket: WebSocket, code: number) {
    const role = socket.deserializeAttachment() as Role | null;
    socket.close(code === 1006 || code === 1005 ? 1000 : code);
    if (!role || this.socketFor(role, socket)) return;
    const other = this.socketFor(role === 'host' ? 'guest' : 'host');
    if (other) {
      send(other, { type: 'peer-left' });
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (reservation) this.sendRoster(reservation, socket);
    }
  }

  async alarm() {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (reservation && reservation.expires > Date.now()) {
      await this.ctx.storage.setAlarm(reservation.expires);
      return;
    }
    this.closeExpiredSockets();
    await this.ctx.storage.delete('reservation');
  }

  private closeExpiredSockets() {
    for (const socket of this.ctx.getWebSockets()) socket.close(1000, 'Room expired');
  }

  private sendRoster(reservation: Reservation, excluded?: WebSocket) {
    const participants: Participant[] = [];
    const sockets: WebSocket[] = [];
    for (const role of ['host', 'guest'] as const) {
      const socket = this.socketFor(role, excluded);
      if (!socket) continue;
      sockets.push(socket);
      participants.push({ role, profile: reservation.profiles?.[role] });
    }
    for (const socket of sockets) send(socket, { type: 'roster', participants });
  }

  private socketFor(role: Role, excluded?: WebSocket) {
    return this.ctx.getWebSockets().find(socket => socket !== excluded
      && socket.readyState === WebSocket.OPEN && socket.deserializeAttachment() === role);
  }
}
