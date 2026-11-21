import { isRoomRole, maxRelayMessageLength, readRelayData, roomRoles } from '../../../../packages/protocol/rooms.ts';
import type { RoomResult } from '../../../../packages/protocol/room-history.ts';
import { readRoomTitle } from '../../../../packages/protocol/room-titles.ts';
import type { Participant, Role, RoomMessage, Signal } from '../../../../packages/protocol/rooms.ts';
import { apiUrl } from './api.ts';

export type ConnectionState = 'joining' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'full' | 'missing' | 'closed';

interface RoomEvents {
  state: (state: ConnectionState) => void;
  seat: (role: Role, token: string, title?: string) => void;
  open: (peer: Role) => void;
  receive: (message: unknown, peer: Role) => void;
  roster: (participants: Participant[]) => void;
  connections: (peers: Role[]) => void;
}

type Peer = {
  connection?: RTCPeerConnection;
  channel?: RTCDataChannel;
  candidates: RTCIceCandidateInit[];
  state: 'connecting' | 'connected' | 'disconnected' | 'failed';
  timer?: number;
  relay?: 'pending' | 'open';
};

export function connectToRoom(code: string, token: string | undefined, events: RoomEvents) {
  const url = apiUrl('/api/rooms/' + code);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) url.searchParams.set('seat', token);
  const socket = new WebSocket(url);
  const peers = new Map<Role, Peer>();
  let role: Role | undefined;
  let currentState: ConnectionState = 'joining';
  let disposed = false;

  function state(next: ConnectionState) {
    if (disposed || next === currentState) return;
    currentState = next;
    events.state(next);
  }

  function refreshState(fallback: ConnectionState = 'waiting') {
    const states = [...peers.values()].map(peer => peer.state);
    if (!disposed) events.connections(connectedPeers());
    state(states.includes('connected') ? 'connected' : states.includes('connecting') ? 'connecting'
      : states.includes('failed') ? 'failed' : states.includes('disconnected') ? 'disconnected' : fallback);
  }

  function connectedPeers() {
    return roomRoles.filter(id => peers.get(id)?.state === 'connected');
  }

  function closeDirect(peer: Peer) {
    peer.channel?.close();
    peer.channel = undefined;
    peer.connection?.close();
    peer.connection = undefined;
  }

  function closePeer(id: Role) {
    const peer = peers.get(id);
    if (!peer) return;
    peers.delete(id);
    window.clearTimeout(peer.timer);
    closeDirect(peer);
  }

  function closePeers() {
    for (const id of peers.keys()) closePeer(id);
  }

  function signal(peer: Role, message: Signal) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ ...message, peer }));
  }

  function peerState(id: Role, peer: Peer, next: Peer['state']) {
    if (peers.get(id) !== peer || peer.state === next) return;
    peer.state = next;
    if (next !== 'connecting') window.clearTimeout(peer.timer);
    refreshState();
    if (next === 'connected') events.open(id);
  }

  function requestRelay(id: Role, peer: Peer) {
    if (peers.get(id) !== peer || peer.relay) return;
    window.clearTimeout(peer.timer);
    if (socket.readyState !== WebSocket.OPEN) { peerState(id, peer, 'failed'); return; }
    peer.relay = 'pending';
    peerState(id, peer, 'connecting');
    closeDirect(peer);
    socket.send(JSON.stringify({ type: role === 'host' ? 'relay-open' : 'relay-request', peer: id }));
    peer.timer = window.setTimeout(() => peerState(id, peer, 'failed'), 5000);
  }

  function bindChannel(id: Role, peer: Peer, channel: RTCDataChannel) {
    peer.channel = channel;
    channel.onopen = () => { if (!peer.relay) peerState(id, peer, 'connected'); };
    channel.onclose = () => requestRelay(id, peer);
    channel.onmessage = (event: MessageEvent) => {
      if (peers.get(id) !== peer || peer.relay || typeof event.data !== 'string' || event.data.length > 65536) return;
      try { events.receive(JSON.parse(event.data), id); } catch { /* Ignore invalid JSON. */ }
    };
  }

  function startPeer(id: Role) {
    closePeer(id);
    const peer: Peer = { candidates: [], state: 'connecting' };
    peers.set(id, peer);
    refreshState();
    let connection: RTCPeerConnection;
    try {
      connection = new RTCPeerConnection({ iceServers: import.meta.env.PROD ? [{ urls: 'stun:stun.cloudflare.com:3478' }] : [] });
    } catch { requestRelay(id, peer); return peer; }
    peer.connection = connection;
    connection.onicecandidate = ({ candidate }) => {
      if (peers.get(id) === peer && !peer.relay && candidate) signal(id, { type: 'ice', candidate: candidate.toJSON() });
    };
    connection.onconnectionstatechange = () => {
      if (peers.get(id) !== peer || peer.relay) return;
      if (connection.connectionState === 'failed') requestRelay(id, peer);
      if (connection.connectionState === 'disconnected') {
        peerState(id, peer, 'disconnected');
        window.clearTimeout(peer.timer);
        peer.timer = window.setTimeout(() => requestRelay(id, peer), 2500);
      }
      if (connection.connectionState === 'connected' && peer.channel?.readyState === 'open') peerState(id, peer, 'connected');
    };
    connection.ondatachannel = ({ channel }) => {
      if (peers.get(id) === peer && !peer.relay && role !== 'host') bindChannel(id, peer, channel);
    };
    peer.timer = window.setTimeout(() => requestRelay(id, peer), 7000);
    return peer;
  }

  async function handle(message: RoomMessage) {
    if (message.type === 'error') { state(message.reason === 'full' ? 'full' : 'missing'); return; }
    if (message.type === 'room-closed') { closePeers(); state('closed'); return; }
    if (message.type === 'welcome') {
      role = message.role;
      events.seat(role, message.token, readRoomTitle(message.title));
      state('waiting');
      return;
    }
    if (message.type === 'roster') { events.roster(message.participants); return; }
    const id = message.peer ?? (role === 'host' ? 'guest' : 'host');
    if (!isRoomRole(id) || id === role || (role !== 'host' && id !== 'host')) return;
    if (message.type === 'peer-left') {
      if (peers.get(id)?.channel?.readyState !== 'open') { closePeer(id); refreshState('disconnected'); }
      return;
    }
    if (message.type === 'paired') {
      const peer = startPeer(id);
      const connection = peer.connection;
      if (role === 'host' && connection) try {
        bindChannel(id, peer, connection.createDataChannel('game'));
        await connection.setLocalDescription();
        if (peers.get(id) === peer && !peer.relay && connection.localDescription?.sdp) signal(id, { type: 'offer', sdp: connection.localDescription.sdp });
      } catch {
        requestRelay(id, peer);
      }
      return;
    }
    const peer = peers.get(id);
    if (!peer) return;
    if (message.type === 'relay-request') { if (role === 'host') requestRelay(id, peer); return; }
    if (message.type === 'relay-open') {
      if (peer.relay === 'open') return;
      peer.relay = 'open';
      closeDirect(peer);
      if (peer.state === 'connected') events.open(id);
      else peerState(id, peer, 'connected');
      return;
    }
    if (message.type === 'relay-data') {
      const data = readRelayData(message.data);
      if (peer.relay === 'open' && data) events.receive(data, id);
      return;
    }
    const { connection } = peer;
    if (!connection || peer.relay) return;
    try {
      if (message.type === 'ice') {
        if (connection.remoteDescription) await connection.addIceCandidate(message.candidate);
        else peer.candidates.push(message.candidate);
      } else if (message.type === 'offer' || message.type === 'answer') {
        await connection.setRemoteDescription(message);
        if (peers.get(id) !== peer || peer.relay) return;
        for (const candidate of peer.candidates.splice(0)) await connection.addIceCandidate(candidate).catch(() => {});
        if (message.type === 'offer') {
          await connection.setLocalDescription();
          if (peers.get(id) === peer && !peer.relay && connection.localDescription?.sdp) signal(id, { type: 'answer', sdp: connection.localDescription.sdp });
        }
      }
    } catch {
      if (message.type !== 'ice') requestRelay(id, peer);
    }
  }

  let queue = Promise.resolve();
  socket.onmessage = (event: MessageEvent<string>) => {
    queue = queue.then(async () => {
      if (!disposed) await handle(JSON.parse(event.data) as RoomMessage);
    }).catch(() => { if (!disposed) refreshState('failed'); });
  };
  socket.onclose = () => {
    if (disposed || currentState === 'full' || currentState === 'missing' || currentState === 'closed') return;
    if (role === 'host') { closePeers(); state('closed'); return; }
    if (peers.get('host')?.channel?.readyState !== 'open') { closePeers(); refreshState('disconnected'); }
  };

  return {
    connectedPeers,
    reportResult(entry: RoomResult) {
      if (role === 'host' && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'room-result', entry }));
    },
    send(message: unknown, target?: Role) {
      const data = JSON.stringify(message);
      let sent = false;
      for (const [id, peer] of peers) {
        if (target && id !== target) continue;
        if (peer.relay === 'open' && socket.readyState === WebSocket.OPEN && socket.bufferedAmount <= 65536 && readRelayData(message)) {
          const packet = JSON.stringify({ type: 'relay-data', peer: id, data: message });
          if (packet.length <= maxRelayMessageLength) { socket.send(packet); sent = true; }
        } else if (peer.channel?.readyState === 'open' && peer.channel.bufferedAmount <= 65536) {
          peer.channel.send(data);
          sent = true;
        }
      }
      return sent;
    },
    repair() {
      if (role !== 'host' || socket.readyState !== WebSocket.OPEN) return false;
      for (const peer of roomRoles) if (peer !== 'host' && peers.get(peer)?.state !== 'connected') socket.send(JSON.stringify({ type: 'repair', peer }));
      return true;
    },
    close(leave = false) {
      if (leave && role !== 'host' && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' }));
      disposed = true;
      closePeers();
      socket.close();
    },
  };
}
