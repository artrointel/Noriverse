import { isRoomRole, maxRelayMessageLength, readRelayData, readRoomActivity, readRoomLinks, roomHeartbeat, roomRoles } from '../../../../packages/protocol/rooms.ts';
import type { RoomResult } from '../../../../packages/protocol/room-history.ts';
import { readRoomTitle } from '../../../../packages/protocol/room-titles.ts';
import type { Participant, Role, RoomActivity, RoomLinks, RoomMessage, Signal } from '../../../../packages/protocol/rooms.ts';
import { apiUrl } from './api.ts';
import { directUpgradeInterval, directUpgradeTimeout, initialDirectTimeout, relayRecoveryDelay } from './room-recovery.ts';
import { candidateKind, createRoomDiagnostics, summarizeIcePath } from './room-diagnostics.ts';

export type ConnectionState = 'joining' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'full' | 'missing' | 'closed';

interface RoomEvents {
  state: (state: ConnectionState) => void;
  retryWithoutSeat?: () => void;
  seat: (role: Role, token: string, title?: string) => void;
  open: (peer: Role) => void;
  receive: (message: unknown, peer: Role) => void;
  roster: (participants: Participant[], away: Participant[]) => void;
  activity: (peer: Role, activity: RoomActivity) => void;
  connections: (peers: Role[], paths: RoomLinks) => void;
  playing: () => boolean;
  reopen: (since: number) => void;
  recoveringSince?: number;
}

type DirectPath = {
  connection?: RTCPeerConnection;
  channel?: RTCDataChannel;
  candidates: RTCIceCandidateInit[];
  negotiation: Promise<void>;
  descriptionSent?: boolean;
  endSent?: boolean;
};

type DirectUpgrade = DirectPath & {
  id: string;
  timer?: number;
  phase: 'negotiating' | 'verified' | 'draining';
  outgoing: unknown[];
  incoming: unknown[];
};

const iceGatheringGrace = 1_200;

function waitForIceGathering(connection: RTCPeerConnection) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>(resolve => {
    const timer = window.setTimeout(finish, iceGatheringGrace);
    function finish() {
      window.clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', check);
      resolve();
    }
    function check() { if (connection.iceGatheringState === 'complete') finish(); }
    connection.addEventListener('icegatheringstatechange', check);
  });
}

type Peer = DirectPath & {
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
  timer?: number;
  relay?: 'pending' | 'open';
  upgrade?: DirectUpgrade;
  retryUpgrade?: number;
  repairTimer?: number;
};

export function connectToRoom(code: string, token: string | undefined, events: RoomEvents) {
  const url = apiUrl('/api/rooms/' + code);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) url.searchParams.set('seat', token);
  const socket = new WebSocket(url);
  const peers = new Map<Role, Peer>();
  const diagnostics = createRoomDiagnostics();
  const recoveryStarts = new Map<Role, number>();
  const directRetries = new Set<Role>();
  let role: Role | undefined;
  let currentState: ConnectionState = 'joining';
  let disposed = false;
  let heartbeat: number | undefined;
  let roomLinks: RoomLinks = {};
  let lastPublishedLinks = '';
  let activity: RoomActivity | undefined;
  let reopenRequested = false;
  let reconnectSince = events.recoveringSince;

  function reopen(since: number) {
    if (reopenRequested) return;
    reopenRequested = true;
    events.reopen(since);
  }

  socket.onopen = () => {
    if (disposed) return;
    heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(roomHeartbeat.ping);
    }, 30_000);
  };

  function publishActivity() {
    if (role && activity && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'room-activity', activity }));
  }

  function state(next: ConnectionState) {
    if (disposed || next === currentState) return;
    currentState = next;
    events.state(next);
  }

  function refreshState(fallback: ConnectionState = 'waiting') {
    const states = [...peers.values()].map(peer => peer.state);
    if (!disposed) publishLinks();
    state(states.includes('connected') ? 'connected' : states.includes('connecting') ? 'connecting'
      : states.includes('failed') ? 'failed' : states.includes('disconnected') ? 'disconnected' : fallback);
  }

  function connectedPeers() {
    return roomRoles.filter(id => peers.get(id)?.state === 'connected');
  }

  function publishLinks() {
    if (!role) return;
    const connected = connectedPeers();
    const paths: RoomLinks = {};
    for (const id of connected) paths[id] = peers.get(id)?.relay === 'open' ? 'relay' : 'direct';
    if (role === 'host') {
      if (connected.length) paths.host = connected.some(id => paths[id] === 'relay') ? 'relay' : 'direct';
      const published = JSON.stringify(paths);
      if (lastPublishedLinks !== published && socket.readyState === WebSocket.OPEN) {
        lastPublishedLinks = published;
        socket.send(JSON.stringify({ type: 'room-links', paths }));
      }
    } else {
      const hostPath = paths.host;
      Object.assign(paths, roomLinks);
      if (hostPath) {
        paths[role] = hostPath;
        paths.host = roomLinks.host ?? hostPath;
      } else {
        delete paths[role];
        delete paths.host;
      }
    }
    events.connections(connected, paths);
  }

  function closeDirect(peer: DirectPath) {
    const channel = peer.channel;
    peer.channel = undefined;
    channel?.close();
    peer.connection?.close();
    peer.connection = undefined;
  }

  function recordIcePath(id: Role, connection: RTCPeerConnection | undefined) {
    void connection?.getStats().then(stats => {
      diagnostics.note(id, summarizeIcePath(stats.values(), key => stats.get(key)));
    }).catch(() => {});
  }

  function closePeer(id: Role) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    window.clearTimeout(peer.timer);
    window.clearTimeout(peer.repairTimer);
    window.clearInterval(peer.retryUpgrade);
    discardUpgrade(peer);
    closeDirect(peer);
  }

  function closePeers() {
    for (const id of peers.keys()) closePeer(id);
  }

  function signal(peer: Role, message: Signal, attempt?: string) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...message, peer, attempt }));
  }

  function peerState(id: Role, peer: Peer, next: Peer['state']) {
    if (peers.get(id) !== peer || peer.state === next) return;
    peer.state = next;
    if (next !== 'connecting') window.clearTimeout(peer.timer);
    if (next === 'connected') {
      window.clearTimeout(peer.repairTimer);
      if (role !== 'host' || connectedPeers().length === peers.size) reconnectSince = undefined;
      directRetries.delete(id);
      if (recoveryStarts.delete(id) && role !== 'host' && !peer.relay && peer.channel?.readyState === 'open') {
        peer.channel.send('{"type":"direct-resumed"}');
      }
    }
    refreshState();
    if (next === 'connected') events.open(id);
  }

  function requestRelay(id: Role, peer: Peer) {
    if (peers.get(id) !== peer || peer.relay) return;
    if (events.playing() && (peer.state === 'connected' || recoveryStarts.has(id))) {
      const previous = recoveryStarts.get(id);
      const since = previous ?? Date.now();
      recoveryStarts.set(id, since);
      peerState(id, peer, 'disconnected');
      if (!previous && role !== 'host' && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'direct-lost', peer: id }));
      if (!previous && role === 'host') peer.repairTimer = window.setTimeout(() => retryDirect(id, peer), directUpgradeInterval);
      if (role !== 'host' && socket.readyState === WebSocket.CLOSED) {
        window.clearTimeout(peer.timer);
        reopen(since);
        return;
      }
      const remaining = since + relayRecoveryDelay - Date.now();
      if (remaining > 0) {
        window.clearTimeout(peer.timer);
        peer.timer = window.setTimeout(() => requestRelay(id, peer), remaining);
        return;
      }
    }
    window.clearTimeout(peer.timer);
    if (socket.readyState !== WebSocket.OPEN) {
      peerState(id, peer, 'failed');
      if (role !== 'host' && events.playing() && socket.readyState === WebSocket.CLOSED) reopen(recoveryStarts.get(id) ?? Date.now());
      return;
    }
    peer.relay = 'pending';
    peerState(id, peer, 'connecting');
    recordIcePath(id, peer.connection);
    closeDirect(peer);
    socket.send(JSON.stringify({ type: role === 'host' ? 'relay-open' : 'relay-request', peer: id }));
    peer.timer = window.setTimeout(() => peerState(id, peer, 'failed'), 5000);
  }

  function retryDirect(id: Role, peer: Peer) {
    if (peers.get(id) !== peer || role !== 'host' || peer.relay || !recoveryStarts.has(id)
      || directRetries.has(id) || socket.readyState !== WebSocket.OPEN) return;
    directRetries.add(id);
    socket.send(JSON.stringify({ type: 'repair', peer: id }));
  }

  function bindChannel(id: Role, peer: Peer, channel: RTCDataChannel) {
    peer.channel = channel;
    channel.onopen = () => {
      if (peer.channel !== channel || peer.relay) return;
      diagnostics.note(id, 'data channel open');
      recordIcePath(id, peer.connection);
      peerState(id, peer, 'connected');
    };
    channel.onclose = () => {
      if (peer.channel !== channel || peers.get(id) !== peer || peer.relay) return;
      diagnostics.note(id, 'data channel closed');
      requestRelay(id, peer);
      if (events.playing()) retryDirect(id, peer);
    };
    channel.onmessage = (event: MessageEvent) => {
      if (peers.get(id) !== peer || peer.relay || typeof event.data !== 'string' || event.data.length > 65536) return;
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'direct-resumed') {
          if (role === 'host' && peer.connection?.connectionState === 'connected') peerState(id, peer, 'connected');
        } else if (peer.state === 'connected') events.receive(message, id);
      } catch { /* Ignore invalid JSON. */ }
    };
  }

  function createDirect(id: Role, path: DirectPath, active: () => boolean, attempt?: string) {
    const useStun = import.meta.env.PROD || import.meta.env.VITE_WEBRTC_STUN === 'true';
    const connection = new RTCPeerConnection({ iceServers: useStun ? [{ urls: 'stun:stun.cloudflare.com:3478' }] : [] });
    path.connection = connection;
    connection.onicecandidate = ({ candidate }) => {
      if (!active()) return;
      if (candidate?.candidate) {
        diagnostics.note(id, 'local candidate ' + candidateKind(candidate.candidate));
        if (path.descriptionSent) signal(id, { type: 'ice', candidate: candidate.toJSON() }, attempt);
        return;
      }
      if (path.descriptionSent) endCandidates(id, path, attempt, candidate?.toJSON());
    };
    connection.addEventListener('iceconnectionstatechange', () => {
      if (active()) diagnostics.note(id, 'ICE state ' + connection.iceConnectionState);
    });
    connection.addEventListener('icecandidateerror', event => {
      if (active()) diagnostics.note(id, 'STUN/ICE error ' + event.errorCode);
    });
    return connection;
  }

  function endCandidates(id: Role, path: DirectPath, attempt?: string, candidate: RTCIceCandidateInit = { candidate: '' }) {
    if (path.endSent) return;
    path.endSent = true;
    diagnostics.note(id, 'sent end of ICE candidates');
    signal(id, { type: 'ice', candidate }, attempt);
  }

  async function sendDescription(id: Role, path: DirectPath, type: 'offer' | 'answer', active: () => boolean, attempt?: string) {
    const connection = path.connection;
    if (!connection) return;
    await connection.setLocalDescription();
    await waitForIceGathering(connection);
    const sdp = connection.localDescription?.sdp;
    if (!active() || !sdp) return;
    const count = sdp.match(/^a=candidate:/gm)?.length ?? 0;
    diagnostics.note(id, `sent ${type} with ${count} ICE candidates`);
    path.descriptionSent = true;
    path.endSent = /^a=end-of-candidates\r?$/m.test(sdp);
    signal(id, { type, sdp }, attempt);
    if (connection.iceGatheringState === 'complete') endCandidates(id, path, attempt);
  }

  async function applySignal(id: Role, path: DirectPath, message: Signal, active: () => boolean, attempt?: string) {
    const connection = path.connection;
    if (!connection) return;
    const addCandidate = async (candidate: RTCIceCandidateInit) => {
      try { await connection.addIceCandidate(candidate); }
      catch (error) { diagnostics.note(id, 'remote candidate rejected'); throw error; }
    };
    if (message.type === 'ice') {
      diagnostics.note(id, message.candidate.candidate ? 'remote candidate ' + candidateKind(message.candidate.candidate) : 'remote end of ICE candidates');
      if (connection.remoteDescription) await addCandidate(message.candidate);
      else path.candidates.push(message.candidate);
      return;
    }
    await connection.setRemoteDescription(message);
    if (!active()) return;
    const candidates = message.sdp.split(/\r?\n/).filter(line => line.startsWith('a=candidate:')).map(candidateKind);
    diagnostics.note(id, 'applied ' + message.type + (candidates.length ? ' with ' + candidates.join(', ') : ''));
    for (const candidate of path.candidates.splice(0)) await addCandidate(candidate).catch(() => {});
    if (message.type === 'offer') await sendDescription(id, path, 'answer', active, attempt);
  }

  function watchDirect(id: Role, peer: Peer, connection: RTCPeerConnection) {
    connection.onconnectionstatechange = () => {
      if (peers.get(id) !== peer || peer.connection !== connection || peer.relay) return;
      if (connection.connectionState === 'failed' && peer.descriptionSent) {
        requestRelay(id, peer);
        if (events.playing()) retryDirect(id, peer);
      }
      if (connection.connectionState === 'disconnected') {
        if (events.playing() && (peer.state === 'connected' || recoveryStarts.has(id))) { requestRelay(id, peer); return; }
        peerState(id, peer, 'disconnected');
        window.clearTimeout(peer.timer);
        peer.timer = window.setTimeout(() => requestRelay(id, peer), 2500);
      }
      if (connection.connectionState === 'connected' && peer.channel?.readyState === 'open') peerState(id, peer, 'connected');
    };
  }

  function startPeer(id: Role) {
    diagnostics.note(id, 'initial direct attempt');
    if (!events.playing()) {
      recoveryStarts.delete(id);
      directRetries.delete(id);
    } else {
      if (peers.get(id)?.state === 'connected') recoveryStarts.set(id, Date.now());
      if (reconnectSince !== undefined && !recoveryStarts.has(id)) recoveryStarts.set(id, reconnectSince);
    }
    closePeer(id);
    const peer: Peer = { candidates: [], negotiation: Promise.resolve(), state: 'connecting' };
    peers.set(id, peer);
    refreshState();
    let connection: RTCPeerConnection;
    try { connection = createDirect(id, peer, () => peers.get(id) === peer && !peer.relay); }
    catch { diagnostics.note(id, 'WebRTC setup failed'); requestRelay(id, peer); return peer; }
    watchDirect(id, peer, connection);
    connection.ondatachannel = ({ channel }) => {
      if (peers.get(id) === peer && !peer.relay && role !== 'host') bindChannel(id, peer, channel);
    };
    const since = recoveryStarts.get(id);
    peer.timer = window.setTimeout(() => {
      diagnostics.note(id, 'direct attempt timed out, ICE ' + (peer.connection?.iceConnectionState ?? 'unavailable'));
      requestRelay(id, peer);
    }, since === undefined ? initialDirectTimeout : Math.max(0, since + relayRecoveryDelay - Date.now()));
    return peer;
  }

  function sendRelay(id: Role, message: unknown) {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount > 65536 || !readRelayData(message)) return false;
    const packet = JSON.stringify({ type: 'relay-data', peer: id, data: message });
    if (packet.length > maxRelayMessageLength) return false;
    socket.send(packet);
    return true;
  }

  function sendDirect(channel: RTCDataChannel | undefined, data: string) {
    if (channel?.readyState !== 'open' || channel.bufferedAmount > 65536) return false;
    channel.send(data);
    return true;
  }

  function scheduleUpgrade(id: Role, peer: Peer) {
    if (role !== 'host' || peer.retryUpgrade !== undefined) return;
    peer.retryUpgrade = window.setInterval(() => {
      if (peers.get(id) === peer && peer.relay === 'open' && !peer.upgrade && socket.readyState === WebSocket.OPEN) {
        diagnostics.note(id, 'requested P2P retry');
        socket.send(JSON.stringify({ type: 'upgrade-start', peer: id, attempt: crypto.randomUUID() }));
      }
    }, directUpgradeInterval);
  }

  function discardUpgrade(peer: Peer) {
    const upgrade = peer.upgrade;
    if (!upgrade) return;
    peer.upgrade = undefined;
    window.clearTimeout(upgrade.timer);
    closeDirect(upgrade);
  }

  function abortUpgrade(id: Role, peer: Peer, upgrade: DirectUpgrade, notify = true) {
    if (peer.upgrade !== upgrade) return;
    discardUpgrade(peer);
    if (notify && upgrade.phase === 'draining') sendRelay(id, { type: 'upgrade-abort', attempt: upgrade.id });
    for (const message of upgrade.outgoing) sendRelay(id, message);
  }

  function promoteUpgrade(id: Role, peer: Peer, upgrade: DirectUpgrade) {
    const { channel, connection } = upgrade;
    if (!channel || channel.readyState !== 'open' || !connection) return;
    diagnostics.note(id, 'switched to P2P');
    recordIcePath(id, connection);
    window.clearTimeout(upgrade.timer);
    window.clearInterval(peer.retryUpgrade);
    peer.retryUpgrade = undefined;
    peer.upgrade = undefined;
    peer.relay = undefined;
    peer.connection = connection;
    peer.descriptionSent = upgrade.descriptionSent;
    watchDirect(id, peer, connection);
    bindChannel(id, peer, channel);
    if (role === 'host' && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'relay-close', peer: id, attempt: upgrade.id }));
    }
    for (const message of upgrade.outgoing) sendDirect(channel, JSON.stringify(message));
    for (const message of upgrade.incoming) events.receive(message, id);
    publishLinks();
  }

  function startUpgrade(id: Role, peer: Peer, attempt: string) {
    if (peer.relay !== 'open' || peer.upgrade) return;
    diagnostics.note(id, 'P2P retry acknowledged');
    const upgrade: DirectUpgrade = { id: attempt, candidates: [], negotiation: Promise.resolve(), phase: 'negotiating', incoming: [], outgoing: [] };
    peer.upgrade = upgrade;
    const active = () => peers.get(id) === peer && peer.upgrade === upgrade;
    function abort(reason: string) {
      if (!active()) return;
      diagnostics.note(id, reason + ', ICE ' + (upgrade.connection?.iceConnectionState ?? 'unavailable'));
      recordIcePath(id, upgrade.connection);
      abortUpgrade(id, peer, upgrade);
    }
    function bind(channel: RTCDataChannel) {
      upgrade.channel = channel;
      channel.onclose = () => abort('retry data channel closed');
      channel.onopen = () => {
        if (!active()) return;
        diagnostics.note(id, 'retry data channel open');
        if (role === 'host') sendDirect(channel, '{"type":"upgrade-probe"}');
      };
      channel.onmessage = (event: MessageEvent) => {
        if (!active() || typeof event.data !== 'string' || event.data.length > 65536) return;
        try {
          const message = JSON.parse(event.data);
          if (message?.type === 'upgrade-probe' && role !== 'host' && upgrade.phase === 'negotiating') {
            if (sendDirect(channel, '{"type":"upgrade-ack"}')) upgrade.phase = 'verified';
          } else if (message?.type === 'upgrade-ack' && role === 'host' && upgrade.phase === 'negotiating') {
            diagnostics.note(id, 'retry data round-trip verified');
            if (!sendRelay(id, { type: 'upgrade-cutover', attempt })) { abort('cutover signal could not be sent'); return; }
            upgrade.phase = 'draining';
            window.clearTimeout(upgrade.timer);
            upgrade.timer = window.setTimeout(() => abort('cutover timed out'), 1800);
          } else if (role === 'host' && upgrade.phase === 'draining') {
            // The new path can arrive before the ordered relay's final marker.
            if (upgrade.incoming.length < 128) upgrade.incoming.push(message);
          }
        } catch { /* Ignore invalid JSON. */ }
      };
    }
    upgrade.timer = window.setTimeout(() => abort('P2P retry timed out'), directUpgradeTimeout);
    try {
      const connection = createDirect(id, upgrade, active, attempt);
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'failed' && upgrade.descriptionSent) abort('WebRTC retry failed');
      };
      if (role === 'host') {
        bind(connection.createDataChannel('game-upgrade'));
        upgrade.negotiation = sendDescription(id, upgrade, 'offer', active, attempt).catch(() => abort('retry offer failed'));
      } else {
        connection.ondatachannel = ({ channel }) => { if (active()) bind(channel); };
      }
    } catch { abort('retry WebRTC setup failed'); }
  }

  function receiveRelay(id: Role, peer: Peer, data: NonNullable<ReturnType<typeof readRelayData>>) {
    if (data.type !== 'upgrade-cutover' && data.type !== 'upgrade-abort') { events.receive(data, id); return; }
    const upgrade = peer.upgrade;
    if (!upgrade || data.attempt !== upgrade.id) return;
    if (data.type === 'upgrade-abort') { abortUpgrade(id, peer, upgrade, false); return; }
    if (upgrade.channel?.readyState !== 'open') { abortUpgrade(id, peer, upgrade); return; }
    if (role === 'host') {
      if (upgrade.phase === 'draining') promoteUpgrade(id, peer, upgrade);
    } else if (upgrade.phase === 'verified') {
      // Flush the old path before replacing it. WebSocket preserves this marker's order.
      if (sendRelay(id, data)) promoteUpgrade(id, peer, upgrade);
      else abortUpgrade(id, peer, upgrade);
    }
  }

  async function handle(message: RoomMessage) {
    if (message.type === 'error') {
      if (message.reason === 'token' && events.retryWithoutSeat) events.retryWithoutSeat();
      else state(message.reason === 'full' ? 'full' : 'missing');
      return;
    }
    if (message.type === 'room-closed') { closePeers(); roomLinks = {}; publishLinks(); state('closed'); return; }
    if (message.type === 'welcome') {
      role = message.role;
      events.seat(role, message.token, readRoomTitle(message.title));
      state('waiting');
      publishActivity();
      return;
    }
    if (message.type === 'roster') { events.roster(message.participants, message.away ?? []); return; }
    if (message.type === 'room-activity') {
      const activity = readRoomActivity(message.activity);
      if (isRoomRole(message.peer) && activity) events.activity(message.peer, activity);
      return;
    }
    if (message.type === 'room-links') {
      const paths = readRoomLinks(message.paths);
      if (role !== 'host' && paths) { roomLinks = paths; publishLinks(); }
      return;
    }
    const id = message.peer ?? (role === 'host' ? 'guest' : 'host');
    if (!isRoomRole(id) || id === role || (role !== 'host' && id !== 'host')) return;
    if (message.type === 'peer-left') {
      const peer = peers.get(id);
      if (id === 'host' || peer?.channel?.readyState !== 'open') {
        if (events.playing() && peer && !recoveryStarts.has(id)) recoveryStarts.set(id, Date.now());
        closePeer(id);
        refreshState('disconnected');
      }
      return;
    }
    if (message.type === 'paired') {
      const peer = startPeer(id);
      const connection = peer.connection;
      if (role === 'host' && connection) try {
        bindChannel(id, peer, connection.createDataChannel('game'));
        const active = () => peers.get(id) === peer && !peer.relay;
        peer.negotiation = sendDescription(id, peer, 'offer', active).catch(() => {
          if (!active()) return;
          diagnostics.note(id, 'offer setup failed');
          requestRelay(id, peer);
        });
      } catch {
        diagnostics.note(id, 'offer setup failed');
        requestRelay(id, peer);
      }
      return;
    }
    const peer = peers.get(id);
    if (!peer) return;
    if (message.type === 'upgrade-start') { startUpgrade(id, peer, message.attempt); return; }
    if (message.type === 'direct-lost') {
      if (role === 'host' && events.playing() && !peer.relay) requestRelay(id, peer);
      return;
    }
    if (message.type === 'relay-request') { if (role === 'host') requestRelay(id, peer); return; }
    if (message.type === 'relay-open') {
      if (peer.relay === 'open') return;
      diagnostics.note(id, 'relay opened');
      peer.relay = 'open';
      closeDirect(peer);
      scheduleUpgrade(id, peer);
      if (peer.state === 'connected') { publishLinks(); events.open(id); }
      else peerState(id, peer, 'connected');
      return;
    }
    if (message.type === 'relay-data') {
      const data = readRelayData(message.data);
      if (peer.relay === 'open' && data) receiveRelay(id, peer, data);
      return;
    }
    if (message.type !== 'offer' && message.type !== 'answer' && message.type !== 'ice') return;
    const upgrade = peer.upgrade;
    if (message.attempt !== undefined) {
      if (!upgrade || upgrade.id !== message.attempt) return;
      const active = () => peer.upgrade === upgrade;
      upgrade.negotiation = upgrade.negotiation.then(async () => {
        if (active()) await applySignal(id, upgrade, message, active, upgrade.id);
      }).catch(() => {
        if (message.type !== 'ice' && active()) {
          diagnostics.note(id, 'retry failed to apply ' + message.type);
          abortUpgrade(id, peer, upgrade);
        }
      });
      return;
    }
    if (!peer.connection || peer.relay) return;
    const active = () => peers.get(id) === peer && !peer.relay;
    peer.negotiation = peer.negotiation.then(async () => {
      if (active()) await applySignal(id, peer, message, active);
    }).catch(() => {
      if (message.type !== 'ice' && active()) {
        diagnostics.note(id, 'failed to apply ' + message.type);
        requestRelay(id, peer);
      }
    });
  }

  let queue = Promise.resolve();
  socket.onmessage = (event: MessageEvent<string>) => {
    if (event.data === roomHeartbeat.pong) return;
    queue = queue.then(async () => {
      if (!disposed) await handle(JSON.parse(event.data) as RoomMessage);
    }).catch(() => { if (!disposed) refreshState('failed'); });
  };
  socket.onclose = event => {
    window.clearInterval(heartbeat);
    if (disposed || currentState === 'full' || currentState === 'missing' || currentState === 'closed') return;
    if (event.reason === 'Seat replaced' || event.reason === 'Room closed') {
      closePeers();
      publishLinks();
      state('closed');
      return;
    }
    const host = peers.get('host');
    if (role === 'host' || host?.state !== 'connected' || host.channel?.readyState !== 'open') {
      const since = recoveryStarts.get('host') ?? reconnectSince ?? Date.now();
      closePeers();
      refreshState('disconnected');
      if (role === 'host' || reconnectSince !== undefined || events.playing()) reopen(since);
    }
  };

  return {
    connectedPeers,
    relayedPeerCount: () => connectedPeers().filter(id => peers.get(id)?.relay === 'open').length,
    setActivity(next: RoomActivity) {
      if (activity === next) return;
      activity = next;
      publishActivity();
    },
    connectionReport: () => diagnostics.report(role, id => {
      const peer = peers.get(id);
      return peer?.state === 'connected' ? peer.relay === 'open' ? 'relay' : 'direct' : 'disconnected';
    }),
    reportResult(entry: RoomResult) {
      if (role === 'host' && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'room-result', entry }));
    },
    send(message: unknown, target?: Role) {
      const data = JSON.stringify(message);
      let sent = false;
      for (const [id, peer] of peers) {
        if (target && id !== target) continue;
        if (peer.state !== 'connected') continue;
        const upgrade = peer.upgrade;
        if (peer.relay === 'open') {
          if (upgrade?.phase === 'draining' && readRelayData(message)) {
            upgrade.outgoing.push(message);
            sent = true;
          } else if (sendRelay(id, message)) sent = true;
        } else if (sendDirect(peer.channel, data)) sent = true;
      }
      return sent;
    },
    repair() {
      if (role !== 'host' || socket.readyState !== WebSocket.OPEN) return false;
      for (const peer of roomRoles) if (peer !== 'host' && peers.get(peer)?.state !== 'connected') socket.send(JSON.stringify({ type: 'repair', peer }));
      return true;
    },
    close(leave = false) {
      disposed = true;
      window.clearInterval(heartbeat);
      closePeers();
      if (leave && socket.readyState < WebSocket.CLOSING) {
        const release = () => socket.send('{"type":"leave"}');
        if (socket.readyState === WebSocket.OPEN) release();
        else socket.addEventListener('open', release, { once: true });
        // Let the signaling service process the explicit departure before the socket closes.
        const timer = window.setTimeout(() => socket.close(), 3000);
        socket.addEventListener('close', () => window.clearTimeout(timer), { once: true });
      } else socket.close();
    },
  };
}
