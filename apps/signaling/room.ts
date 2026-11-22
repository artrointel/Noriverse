import { DurableObject } from 'cloudflare:workers';
import { isRoomRole, maxRelayMessageLength, readRelayData, readRoomActivity, readRoomLinks, readSignal, roomCapacity, roomHeartbeat, roomRoles } from '../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomActivity, RoomGame, RoomMessage } from '../../packages/protocol/rooms.ts';
import type { ProfileSummary } from '../../packages/protocol/profile.ts';
import { profileIdPattern } from '../../packages/protocol/profile.ts';
import type { Env } from './bindings.ts';
import { notifyFriends } from './profiles.ts';
import { minimumRoomPlayers } from '../../packages/protocol/games.ts';
import { readRoomResult, roomStandings } from '../../packages/protocol/room-history.ts';
import type { RoomResult } from '../../packages/protocol/room-history.ts';
import { roomStreakBadges } from '../../packages/protocol/room-badges.ts';

interface Reservation { host: string; hostJoined?: boolean; guest?: string; guest2?: string; guest3?: string; game?: RoomGame; expires: number;
  profiles?: Partial<Record<Role, ProfileSummary>>; memberIds?: Partial<Record<Role, string>>; closedAt?: number; title?: string }
type AttachedSeat = { role: Role; token?: string; relay?: boolean; upgrade?: string; activity?: RoomActivity };
const unclaimedRoomLifetime = 30 * 60 * 1000;
const guests = roomRoles.filter(role => role !== 'host');
const hasOpenSeat = (room: Reservation) => roomRoles.filter(role => room[role]).length < roomCapacity[room.game ?? 'omok'];

function send(socket: WebSocket, message: RoomMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export class Room extends DurableObject<Env> {
  private readonly relayBudget = new WeakMap<WebSocket, { tokens: number; at: number }>();
  constructor(context: DurableObjectState, env: Env) {
    super(context, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(roomHeartbeat.ping, roomHeartbeat.pong));
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS badge_room_members (memberId TEXT PRIMARY KEY, profileId TEXT);
      CREATE TABLE IF NOT EXISTS badge_room_results (id TEXT PRIMARY KEY, result TEXT NOT NULL);
    `);
  }

  async reserve(game: RoomGame, title: string, profile?: ProfileSummary): Promise<string | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<Reservation>('reservation');
      if (previous) {
        const unclaimed = !previous.hostJoined && previous.expires > Date.now();
        if ((!previous.closedAt && (unclaimed || this.socketFor('host'))) || !await this.finishRoom(previous)) return null;
      }
      this.closeRoomSockets();
      const reservation: Reservation = { host: crypto.randomUUID(), hostJoined: false, game, title, expires: Date.now() + unclaimedRoomLifetime,
        profiles: profile ? { host: profile } : undefined, memberIds: { host: crypto.randomUUID() } };
      await this.ctx.storage.put('reservation', reservation);
      this.rememberBadgeMembers(reservation);
      await this.ctx.storage.setAlarm(reservation.expires);
      return reservation.host;
    });
  }

  async changeGame(seat: string, game: RoomGame) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.openReservation();
      if (!reservation || reservation.host !== seat) return false;
      if (roomRoles.filter(role => this.socketFor(role)).length > roomCapacity[game]) return false;
      const next = { ...reservation, game, profiles: { ...reservation.profiles }, memberIds: { ...reservation.memberIds } };
      for (const role of guests) if (!this.socketFor(role)) {
        delete next[role];
        delete next.profiles[role];
        delete next.memberIds[role];
      }
      await this.ctx.storage.put('reservation', next);
      this.notifyRoomChange(reservation);
      return true;
    });
  }

  async joinableGame(seat?: string) {
    const reservation = await this.openReservation();
    if (!reservation) return null;
    if (!hasOpenSeat(reservation) && !(seat && guests.some(role => reservation[role] === seat))) return null;
    return reservation.game ?? 'omok';
  }

  async friendRoom(id: string, viewer: string) {
    const reservation = await this.openReservation();
    if (!reservation) return null;
    const profiles = reservation.profiles;
    if (!roomRoles.some(role => profiles?.[role]?.id === id && this.socketFor(role))) return null;
    return { game: reservation.game ?? 'omok', joinable: hasOpenSeat(reservation) || roomRoles.some(role => profiles?.[role]?.id === viewer) };
  }

  async inviteDetails(seat: string) {
    const reservation = await this.openReservation();
    if (!reservation || reservation.host !== seat || !hasOpenSeat(reservation)) return null;
    return { game: reservation.game ?? 'omok' };
  }

  async identify(seat: string, profile: ProfileSummary) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.openReservation();
      if (!reservation) return false;
      const role = roomRoles.find(candidate => reservation[candidate] === seat);
      if (!role) return false;
      reservation.profiles = { ...reservation.profiles, [role]: profile };
      await this.ctx.storage.put('reservation', reservation);
      this.rememberBadgeMembers(reservation);
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
    if (!reservation || reservation.closedAt
      || (!host && (token !== reservation.host || reservation.hostJoined || reservation.expires <= Date.now()))) {
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
      if (!token || (role === 'host' && !reservation.hostJoined) || !reservation.memberIds?.[role]) {
        if (role === 'host') reservation.hostJoined = true;
        else reservation[role] = seat;
        reservation.memberIds = { ...reservation.memberIds, [role]: reservation.memberIds?.[role] ?? crypto.randomUUID() };
        await this.ctx.storage.put('reservation', reservation);
      }
      if (role === 'host') await this.ctx.storage.deleteAlarm();
      this.rememberBadgeMembers(reservation);
      this.socketFor(role, server)?.close(1000, 'Seat replaced');
      server.serializeAttachment({ role, token: seat });
      send(server, { type: 'welcome', role, token: seat, title: reservation.title });
      if (role === 'host') {
        for (const peer of guests) this.pair(server, peer);
      } else if (host) this.pair(host, role);
      this.sendRoster(reservation);
      this.notifyRoomChange(reservation);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const seat = this.attachedSeat(socket);
    if (!seat || this.socketFor(seat.role) !== socket || typeof message !== 'string' || message.length > maxRelayMessageLength) return;
    const { role } = seat;
    try {
      const raw: unknown = JSON.parse(message);
      if (role === 'host' && raw && typeof raw === 'object' && 'type' in raw && raw.type === 'room-result') {
        const result = 'entry' in raw ? readRoomResult(raw.entry) : undefined;
        if (result && !result.test) await this.recordBadgeResult(socket, result);
        return;
      }
      if (role !== 'host' && raw && typeof raw === 'object' && 'type' in raw && raw.type === 'leave') {
        await this.ctx.blockConcurrencyWhile(async () => {
          const reservation = await this.ctx.storage.get<Reservation>('reservation');
          if (!reservation || reservation[role] !== this.attachedSeat(socket)?.token || this.socketFor(role) !== socket) return;
          const next = { ...reservation, profiles: { ...reservation.profiles }, memberIds: { ...reservation.memberIds } };
          delete next[role];
          delete next.profiles[role];
          delete next.memberIds[role];
          await this.ctx.storage.put('reservation', next);
          this.notifyRoomChange(reservation);
        });
        socket.close(1000, 'Seat released');
        return;
      }
      const requested = raw && typeof raw === 'object' && 'peer' in raw ? raw.peer : 'guest';
      const target = role === 'host' ? requested : 'host';
      if (raw && typeof raw === 'object' && 'type' in raw) {
        if (raw.type === 'room-activity') {
          const activity = 'activity' in raw ? readRoomActivity(raw.activity) : undefined;
          if (!activity || activity === seat.activity) return;
          socket.serializeAttachment({ ...seat, activity });
          for (const peer of roomRoles) {
            const member = this.socketFor(peer);
            if (member) send(member, { type: 'room-activity', peer: role, activity });
          }
          return;
        }
        if (raw.type === 'room-links' && role === 'host' && 'paths' in raw && this.allowRelayMessage(socket)) {
          const paths = readRoomLinks(raw.paths);
          if (paths) for (const peer of guests) {
            const guest = this.socketFor(peer);
            if (guest) send(guest, { type: 'room-links', paths });
          }
          return;
        }
        if (role === 'host' && raw.type === 'repair') {
          for (const peer of guests) if ((!('peer' in raw) || requested === peer) && !this.pair(socket, peer)) send(socket, { type: 'peer-left', peer });
          return;
        }
        if (isRoomRole(target) && target !== role && (raw.type === 'direct-lost' || raw.type === 'relay-request'
          || raw.type === 'relay-open' || raw.type === 'relay-data' || raw.type === 'upgrade-start' || raw.type === 'relay-close')) {
          const other = this.socketFor(target);
          if (!other || !this.allowRelayMessage(socket)) return;
          const guest = role === 'host' ? other : socket;
          const attachment = this.attachedSeat(guest);
          if (!attachment) return;
          if ((raw.type === 'direct-lost' || raw.type === 'relay-request') && role !== 'host') {
            send(other, { type: raw.type, peer: role });
          } else if (raw.type === 'relay-open' && role === 'host') {
            guest.serializeAttachment({ ...attachment, relay: true, upgrade: undefined });
            send(guest, { type: 'relay-open', peer: 'host' });
            send(socket, { type: 'relay-open', peer: target });
          } else if (raw.type === 'relay-data' && attachment.relay && 'data' in raw) {
            const data = readRelayData(raw.data);
            if (data) send(other, { type: 'relay-data', peer: role, data });
          } else if (role === 'host' && attachment.relay && 'attempt' in raw && typeof raw.attempt === 'string'
            && profileIdPattern.test(raw.attempt)) {
            if (raw.type === 'upgrade-start') {
              guest.serializeAttachment({ ...attachment, upgrade: raw.attempt });
              send(other, { type: 'upgrade-start', peer: role, attempt: raw.attempt });
              send(socket, { type: 'upgrade-start', peer: target, attempt: raw.attempt });
            } else if (raw.type === 'relay-close' && attachment.upgrade === raw.attempt) {
              guest.serializeAttachment({ ...attachment, relay: false, upgrade: undefined });
            }
          }
          return;
        }
      }
      if (message.length > 20_000) return;
      const signal = readSignal(raw, role);
      if (signal && isRoomRole(target) && role !== target) {
        const other = this.socketFor(target);
        if (!other) return;
        const guest = this.attachedSeat(role === 'host' ? other : socket);
        const attempt = raw && typeof raw === 'object' && 'attempt' in raw ? raw.attempt : undefined;
        if (attempt === undefined || (typeof attempt === 'string' && guest?.relay && attempt === guest.upgrade)) {
          send(other, { ...signal, peer: role, attempt });
        }
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
        await this.finishRoom(reservation);
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
    if (attachment?.relay) guest.serializeAttachment({ ...attachment, relay: false, upgrade: undefined });
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
    await this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (!reservation || (!reservation.closedAt && this.socketFor('host'))) return;
      if (!reservation.closedAt && !reservation.hostJoined && reservation.expires > Date.now()) await this.ctx.storage.setAlarm(reservation.expires);
      else await this.finishRoom(reservation);
    });
  }

  private rememberBadgeMembers(reservation: Reservation) {
    for (const role of roomRoles) {
      const memberId = reservation.memberIds?.[role];
      if (!memberId) continue;
      this.ctx.storage.sql.exec(`INSERT INTO badge_room_members VALUES (?, ?)
        ON CONFLICT(memberId) DO UPDATE SET profileId = excluded.profileId
        WHERE excluded.profileId IS NOT NULL AND excluded.profileId IS NOT badge_room_members.profileId`,
      memberId, reservation.profiles?.[role]?.id ?? null);
    }
  }

  private badgeResults() {
    const profiles = new Map(this.ctx.storage.sql.exec<{ memberId: string; profileId: string | null }>(
      'SELECT memberId, profileId FROM badge_room_members',
    ).toArray().map(row => [row.memberId, row.profileId ?? undefined]));
    return this.ctx.storage.sql.exec<{ result: string }>('SELECT result FROM badge_room_results ORDER BY rowid').toArray()
      .map(({ result }) => {
        const entry = JSON.parse(result) as RoomResult;
        return { ...entry, players: entry.players.map(player => ({ ...player,
          profileId: player.profileId ?? (player.memberId ? profiles.get(player.memberId) : undefined),
        })) };
      });
  }

  private async recordBadgeResult(socket: WebSocket, result: RoomResult) {
    const awards = await this.ctx.blockConcurrencyWhile(async () => {
      const reservation = await this.ctx.storage.get<Reservation>('reservation');
      if (!reservation || reservation.closedAt || reservation.host !== this.attachedSeat(socket)?.token
        || result.players.length < minimumRoomPlayers(result.game)
        || result.players.length > roomCapacity[result.game]
        || result.players.find(player => player.role === 'host')?.memberId !== reservation.memberIds?.host) return;
      const sql = this.ctx.storage.sql;
      const players = result.players.map(player => {
        if (!player.memberId || player.points === undefined) return;
        const member = sql.exec<{ profileId: string | null }>('SELECT profileId FROM badge_room_members WHERE memberId = ?', player.memberId).toArray()[0];
        if (member) return { ...player, profileId: member.profileId ?? undefined };
      });
      if (players.some(player => !player) || new Set(players.map(player => player?.profileId ?? player?.memberId)).size !== players.length) return;
      const stored = { ...result, players, endedAt: Date.now() };
      const added = sql.exec('INSERT OR IGNORE INTO badge_room_results VALUES (?, ?) RETURNING id', result.id, JSON.stringify(stored)).toArray();
      if (!added.length) return;
      return roomStreakBadges(this.badgeResults()).filter(award => award.badges.some(badge => badge.earnedAt === stored.endedAt));
    });
    if (awards?.length) this.ctx.waitUntil(this.deliverStreakBadges(awards).catch(() => {}));
  }

  private async deliverStreakBadges(awards: ReturnType<typeof roomStreakBadges>) {
    await Promise.all(awards.map(({ id, badges }) => this.env.PROFILES.getByName(id).grantRoomBadges(badges)));
  }

  private async finishRoom(reservation: Reservation) {
    this.closeRoomSockets();
    const closedAt = reservation.closedAt ?? Date.now();
    const entries = this.badgeResults();
    const winner = roomStandings([...entries].reverse(), [])[0];
    const profileId = winner && entries.flatMap(entry => entry.players).find(player => player.profileId === winner.key)?.profileId;
    if (!reservation.closedAt && entries.length) await this.ctx.storage.put('reservation', { ...reservation, closedAt });
    try {
      await this.deliverStreakBadges(roomStreakBadges(entries));
      if (profileId) await this.env.PROFILES.getByName(profileId).recordRoomLead(reservation.host, closedAt);
    } catch {
      await this.ctx.storage.setAlarm(Date.now() + 5000);
      return false;
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.kv.delete('reservation');
      this.ctx.storage.sql.exec('DELETE FROM badge_room_members; DELETE FROM badge_room_results;');
    });
    await this.ctx.storage.deleteAlarm();
    this.notifyRoomChange(reservation);
    return true;
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
    const away: Participant[] = [];
    const sockets: WebSocket[] = [];
    for (const role of roomRoles) {
      const participant = { role, profile: reservation.profiles?.[role], memberId: reservation.memberIds?.[role] };
      const socket = this.socketFor(role, excluded);
      if (socket) {
        sockets.push(socket);
        participants.push({ ...participant, activity: this.attachedSeat(socket)?.activity });
      } else if (reservation[role] && participant.memberId) away.push(participant);
    }
    for (const socket of sockets) send(socket, { type: 'roster', participants, away });
  }

  private socketFor(role: Role, excluded?: WebSocket) {
    return this.ctx.getWebSockets().find(socket => socket !== excluded
      && socket.readyState === WebSocket.OPEN && this.attachedSeat(socket)?.role === role);
  }

  private async openReservation() {
    const reservation = await this.ctx.storage.get<Reservation>('reservation');
    if (reservation && !reservation.closedAt && this.socketFor('host')) return reservation;
  }
}
