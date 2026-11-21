import { DurableObject } from 'cloudflare:workers';
import { isRoomRole, maxRelayMessageLength, readRelayData, readSignal, roomCapacity, roomRoles } from '../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomGame, RoomMessage } from '../../packages/protocol/rooms.ts';
import type { ProfileSummary } from '../../packages/protocol/profile.ts';
import type { Env } from './bindings.ts';
import { notifyFriends } from './profiles.ts';

interface Reservation { host: string; hostJoined?: boolean; guest?: string; guest2?: string; guest3?: string; game?: RoomGame; expires: number; profiles?: Partial<Record<Role, ProfileSummary>> }
type AttachedSeat = { role: Role; token?: string; relay?: boolean };
const roomLifetime = 30 * 60 * 1000;
const guests = roomRoles.filter(role => role !== 'host');
const hasOpenSeat = (room: Reservation) => roomRoles.filter(role => room[role]).length < roomCapacity[room.game ?? 'omok'];

function send(socket: WebSocket, message: RoomMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export class Room extends DurableObject<Env> {
  private readonly relayBudget = new WeakMap<WebSocket, { tokens: number; at: number }>();
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
    if (!role || this.socketFor(role) !== socket || typeof message !== 'string' || message.length > maxRelayMessageLength) return;
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
      const requested = raw && typeof raw === 'object' && 'peer' in raw ? raw.peer : 'guest';
      const target = role === 'host' ? requested : 'host';
      if (raw && typeof raw === 'object' && 'type' in raw) {
        if (role === 'host' && raw.type === 'repair') {
          for (const peer of guests) if ((!('peer' in raw) || requested === peer) && !this.pair(socket, peer)) send(socket, { type: 'peer-left', peer });
          return;
        }
        if (isRoomRole(target) && target !== role && (raw.type === 'relay-request' || raw.type === 'relay-open' || raw.type === 'relay-data')) {
          const other = this.socketFor(target);
          if (!other || !this.allowRelayMessage(socket)) return;
          const guest = role === 'host' ? other : socket;
          const attachment = this.attachedSeat(guest);
          if (!attachment) return;
          if (raw.type === 'relay-request' && role !== 'host' && !attachment.relay) {
            send(other, { type: 'relay-request', peer: role });
          } else if (raw.type === 'relay-open' && role === 'host' && !attachment.relay) {
            guest.serializeAttachment({ ...attachment, relay: true });
            send(guest, { type: 'relay-open', peer: 'host' });
            send(socket, { type: 'relay-open', peer: target });
          } else if (raw.type === 'relay-data' && attachment.relay && 'data' in raw) {
            const data = readRelayData(raw.data);
            if (data) send(other, { type: 'relay-data', peer: role, data });
          }
          return;
        }
      }
      if (message.length > 20_000) return;
      const signal = readSignal(raw, role);
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
    const attachment = this.attachedSeat(guest);
    if (attachment?.relay) guest.serializeAttachment({ ...attachment, relay: false });
    send(guest, { type: 'paired', peer: 'host' });
    send(host, { type: 'paired', peer: role });
    return true;
  }

  private allowRelayMessage(socket: WebSocket) {
    const now = Date.now();
    const previous = this.relayBudget.get(socket);
    const tokens = previous ? Math.min(100, previous.tokens + (now - previous.at) * .05) : 100;
    if (tokens < 1) return false;
    this.relayBudget.set(socket, { tokens: tokens - 1, at: now });
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
