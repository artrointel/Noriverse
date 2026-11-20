import { DurableObject } from 'cloudflare:workers';
import { createRoomCode, isRoomGame, isRoomRole, readSignal, roomCapacity, roomCodePattern, roomRoles } from '../../packages/protocol/rooms.ts';
import type { RoomGame } from '../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomMessage } from '../../packages/protocol/rooms.ts';
import { profileIdPattern } from '../../packages/protocol/profile.ts';
import type { ProfileSummary } from '../../packages/protocol/profile.ts';
import { notifyFriends, profileRequest, profileSession, readBody, ProfileStore, verifiedFriends } from './profiles.ts';
import { FriendGraph } from './friend-graph.ts';
export { ProfileStore };
export { FriendGraph };

interface Env { ROOMS: DurableObjectNamespace<Room>; PROFILES: DurableObjectNamespace<ProfileStore>; FRIENDS: DurableObjectNamespace<FriendGraph>; APP_ORIGIN?: string }
interface Reservation { host: string; hostJoined?: boolean; guest?: string; guest2?: string; guest3?: string; game?: RoomGame; expires: number; profiles?: Partial<Record<Role, ProfileSummary>> }
type AttachedSeat = { role: Role; token?: string };
const roomLifetime = 30 * 60 * 1000;
const roomRoute = /^\/api\/rooms\/([^/]+)$/;
const guests = roomRoles.filter(role => role !== 'host');
const hasOpenSeat = (room: Reservation) => roomRoles.filter(role => room[role]).length < roomCapacity[room.game ?? 'omok'];

function send(socket: WebSocket, message: RoomMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

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
      const links = await verifiedFriends(env, session.id, session.secret);
      if (!links?.friends.includes(body.friend)) return cors(new Response(null, { status: 403 }));
      const [profile, room] = await Promise.all([
        sender.summary(session.secret), env.ROOMS.getByName(inviteCode).inviteDetails(body.seat),
      ]);
      if (!profile || !room) return cors(new Response(null, { status: 409 }));
      const received = await env.PROFILES.getByName(body.friend).receiveInvite({ id: crypto.randomUUID(), sender: profile.id, name: profile.name,
        game: room.game, code: inviteCode, expires: Math.min(Date.now() + 180_000, room.expires) });
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
      const input = await readBody(request) as { seat?: unknown; game?: unknown } | undefined;
      if (typeof input?.seat !== 'string' || !profileIdPattern.test(input.seat) || !isRoomGame(input.game)) {
        return cors(new Response(null, { status: 400 }));
      }
      const changed = await env.ROOMS.getByName(gameRoomCode).changeGame(input.seat, input.game);
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
      const session = profileSession(request, external);
      const profile = session && await env.PROFILES.getByName(session.id).summary(session.secret);
      for (let attempt = 0; attempt < 4; attempt++) {
        const code = createRoomCode();
        const room = env.ROOMS.getByName(code);
        const token = await room.reserve(game, profile ?? undefined);
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
  async reserve(game: RoomGame, profile?: ProfileSummary): Promise<string | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<Reservation>('reservation');
      if (previous && previous.expires > Date.now()) return null;
      this.closeRoomSockets();
      const reservation: Reservation = { host: crypto.randomUUID(), hostJoined: false, game, expires: Date.now() + roomLifetime,
        profiles: profile ? { host: profile } : undefined };
      await this.ctx.storage.put('reservation', reservation);
      await this.ctx.storage.setAlarm(reservation.expires);
      return reservation.host;
    });
  }

  async changeGame(seat: string, game: RoomGame) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (!reservation || reservation.host !== seat || reservation.expires <= Date.now() || !this.socketFor('host')) return false;
      if (roomRoles.filter(role => this.socketFor(role)).length > roomCapacity[game]) return false;
      const next = { ...reservation, game, profiles: { ...reservation.profiles } };
      for (const role of guests) if (!this.socketFor(role)) {
        delete next[role];
        delete next.profiles[role];
      }
      await this.ctx.storage.put('reservation', next);
      this.notifyRoomChange(reservation);
      return true;
    });
  }

  async joinableGame(seat?: string) {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (!reservation || reservation.expires <= Date.now() || !this.socketFor('host')) return null;
    if (seat ? !guests.some(role => reservation[role] === seat) : !hasOpenSeat(reservation)) return null;
    return reservation.game ?? 'omok';
  }

  async friendRoom(id: string, viewer: string) {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (!reservation || reservation.expires <= Date.now() || !this.socketFor('host')) return null;
    const profiles = reservation.profiles;
    if (!roomRoles.some(role => profiles?.[role]?.id === id && this.socketFor(role))) return null;
    return { game: reservation.game ?? 'omok', joinable: hasOpenSeat(reservation) || roomRoles.some(role => profiles?.[role]?.id === viewer) };
  }

  async inviteDetails(seat: string) {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (!reservation || reservation.host !== seat || !hasOpenSeat(reservation) || !this.socketFor('host') || reservation.expires <= Date.now()) return null;
    return { game: reservation.game ?? 'omok', expires: reservation.expires };
  }

  async identify(seat: string, profile: ProfileSummary) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (!reservation || reservation.expires <= Date.now()) return false;
      const role = roomRoles.find(candidate => reservation[candidate] === seat);
      if (!role) return false;
      reservation.profiles = { ...reservation.profiles, [role]: profile };
      await this.ctx.storage.put('reservation', reservation);
      this.sendRoster(reservation);
      this.notifyRoomChange(reservation);
      return true;
    });
  }

  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(() => this.connectSeat(request));
  }

  private async connectSeat(request: Request): Promise<Response> {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const token = new URL(request.url).searchParams.get('seat');
    const host = this.socketFor('host', server);
    if (!reservation || reservation.expires <= Date.now()
      || (!host && (token !== reservation.host || reservation.hostJoined))) {
      send(server, { type: 'error', reason: 'missing' });
      server.close(1008);
    } else {
      const role = token ? roomRoles.find(candidate => reservation[candidate] === token)
        : hasOpenSeat(reservation) ? guests.find(candidate => !reservation[candidate]) : undefined;
      if (!role) {
        send(server, { type: 'error', reason: token ? 'token' : 'full' });
        server.close(1008);
        return new Response(null, { status: 101, webSocket: client });
      }
      const seat = token ?? crypto.randomUUID();
      if (!token || (role === 'host' && !reservation.hostJoined)) {
        if (role === 'host') reservation.hostJoined = true;
        else reservation[role] = seat;
        await this.ctx.storage.put('reservation', reservation);
      }
      this.socketFor(role, server)?.close(1000, 'Seat replaced');
      server.serializeAttachment({ role, token: seat });
      send(server, { type: 'welcome', role, token: seat });
      if (role === 'host') {
        for (const peer of guests) this.pair(server, peer);
      } else if (host) this.pair(host, role);
      this.sendRoster(reservation);
      this.notifyRoomChange(reservation);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const role = this.attachedSeat(socket)?.role;
    if (!role || this.socketFor(role) !== socket || typeof message !== 'string' || message.length > 20000) return;
    try {
      const raw: unknown = JSON.parse(message);
      if (role !== 'host' && raw && typeof raw === 'object' && 'type' in raw && raw.type === 'leave') {
        await this.ctx.blockConcurrencyWhile(async () => {
          const reservation = await this.ctx.storage.get<Reservation>('reservation');
          if (!reservation || reservation[role] !== this.attachedSeat(socket)?.token || this.socketFor(role) !== socket) return;
          const next = { ...reservation, profiles: { ...reservation.profiles } };
          delete next[role];
          delete next.profiles[role];
          await this.ctx.storage.put('reservation', next);
          this.notifyRoomChange(reservation);
        });
        socket.close(1000, 'Seat released');
        return;
      }
      if (role === 'host' && raw && typeof raw === 'object' && 'type' in raw && raw.type === 'repair') {
        for (const peer of guests) if (!this.pair(socket, peer)) send(socket, { type: 'peer-left', peer });
        return;
      }
      const signal = readSignal(raw, role);
      const requested = raw && typeof raw === 'object' && 'peer' in raw ? raw.peer : 'guest';
      const target = role === 'host' ? requested : 'host';
      if (signal && isRoomRole(target) && role !== target) {
        const other = this.socketFor(target);
        if (other) send(other, { ...signal, peer: role });
      }
    } catch {
      socket.close(1007);
    }
  }

  async webSocketClose(socket: WebSocket, code: number) {
    const attachment = this.attachedSeat(socket);
    const role = attachment?.role;
    socket.close(code === 1006 || code === 1005 ? 1000 : code);
    if (!role || this.socketFor(role, socket)) return;
    if (role === 'host') {
      await this.ctx.blockConcurrencyWhile(async () => {
        if (this.socketFor('host', socket)) return;
        const reservation = await this.ctx.storage.get<Reservation>('reservation');
        if (!reservation || (attachment.token ? attachment.token !== reservation.host : reservation.hostJoined === false)) return;
        await this.ctx.storage.delete('reservation');
        await this.ctx.storage.deleteAlarm();
        this.closeRoomSockets();
        this.notifyRoomChange(reservation);
      });
      return;
    }
    const other = this.socketFor('host');
    if (other) {
      send(other, { type: 'peer-left', peer: role });
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (reservation) {
        this.sendRoster(reservation, socket);
        this.notifyRoomChange(reservation);
      }
    }
  }

  private pair(host: WebSocket, role: Role) {
    const guest = this.socketFor(role);
    if (!guest) return false;
    send(guest, { type: 'paired', peer: 'host' });
    send(host, { type: 'paired', peer: role });
    return true;
  }

  async alarm() {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (reservation && reservation.expires > Date.now()) {
      await this.ctx.storage.setAlarm(reservation.expires);
      return;
    }
    this.closeRoomSockets();
    await this.ctx.storage.delete('reservation');
    if (reservation) this.notifyRoomChange(reservation);
  }

  private notifyRoomChange(reservation: Reservation) {
    this.ctx.waitUntil(Promise.all(Object.values(reservation.profiles ?? {}).map(profile => notifyFriends(this.env, profile.id))).catch(() => {}));
  }

  private closeRoomSockets() {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      send(socket, { type: 'room-closed' });
      socket.close(1000, 'Room closed');
    }
  }

  private attachedSeat(socket: WebSocket): AttachedSeat | undefined {
    const value = socket.deserializeAttachment() as AttachedSeat | Role | null;
    if (isRoomRole(value)) return { role: value };
    return value ?? undefined;
  }

  private sendRoster(reservation: Reservation, excluded?: WebSocket) {
    const participants: Participant[] = [];
    const sockets: WebSocket[] = [];
    for (const role of roomRoles) {
      const socket = this.socketFor(role, excluded);
      if (!socket) continue;
      sockets.push(socket);
      participants.push({ role, profile: reservation.profiles?.[role] });
    }
    for (const socket of sockets) send(socket, { type: 'roster', participants });
  }

  private socketFor(role: Role, excluded?: WebSocket) {
    return this.ctx.getWebSockets().find(socket => socket !== excluded
      && socket.readyState === WebSocket.OPEN && this.attachedSeat(socket)?.role === role);
  }
}
