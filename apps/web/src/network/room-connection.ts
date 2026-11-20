import type { Participant, Role, RoomMessage, Signal } from '../../../../packages/protocol/rooms.ts';

export type ConnectionState = 'joining' | 'waiting' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'full' | 'missing';

interface RoomEvents {
  state: (state: ConnectionState) => void;
  seat: (role: Role, token: string) => void;
  open: () => void;
  receive: (message: unknown) => void;
  roster: (participants: Participant[]) => void;
}

export function connectToRoom(code: string, token: string | undefined, events: RoomEvents) {
  const url = apiUrl('/api/rooms/' + code);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (token) url.searchParams.set('seat', token);
  const socket = new WebSocket(url);
  let role: Role | undefined;
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let candidates: RTCIceCandidateInit[] = [];
  let currentState: ConnectionState = 'joining';
  let disposed = false;
  let timer: number | undefined;

  function state(next: ConnectionState) {
    if (disposed) return;
    currentState = next;
    events.state(next);
    if (next !== 'connecting') window.clearTimeout(timer);
  }

  function resetPeer() {
    const previousPeer = peer;
    const previousChannel = channel;
    peer = undefined;
    channel = undefined;
    candidates = [];
    previousChannel?.close();
    previousPeer?.close();
  }

  function signal(message: Signal) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function bindDataChannel(dataChannel: RTCDataChannel) {
    channel = dataChannel;
    dataChannel.onopen = () => {
      if (channel !== dataChannel || disposed) return;
      state('connected');
      events.open();
    };
    dataChannel.onclose = () => {
      if (channel === dataChannel) state('disconnected');
    };
    dataChannel.onmessage = (event: MessageEvent) => {
      if (channel !== dataChannel || typeof event.data !== 'string' || event.data.length > 65536) return;
      try { events.receive(JSON.parse(event.data)); } catch { /* Ignore invalid JSON. */ }
    };
  }

  function startPeer() {
    resetPeer();
    window.clearTimeout(timer);
    const connection = new RTCPeerConnection({
      iceServers: import.meta.env.PROD ? [{ urls: 'stun:stun.cloudflare.com:3478' }] : [],
    });
    peer = connection;
    connection.onicecandidate = ({ candidate }) => {
      if (peer === connection && candidate) signal({ type: 'ice', candidate: candidate.toJSON() });
    };
    connection.onconnectionstatechange = () => {
      if (peer !== connection) return;
      if (connection.connectionState === 'failed') state('failed');
      if (connection.connectionState === 'disconnected') state('disconnected');
      if (connection.connectionState === 'connected' && channel?.readyState === 'open'
        && currentState === 'disconnected') {
        state('connected');
        events.open();
      }
    };
    connection.ondatachannel = ({ channel: incoming }) => {
      if (peer === connection && role === 'guest') bindDataChannel(incoming);
    };
    state('connecting');
    timer = window.setTimeout(() => state('failed'), 15000);
    return connection;
  }

  async function handle(message: RoomMessage) {
    switch (message.type) {
      case 'error':
        state(message.reason === 'full' ? 'full' : 'missing');
        return;
      case 'welcome':
        role = message.role;
        events.seat(role, message.token);
        state('waiting');
        return;
      case 'roster':
        events.roster(message.participants);
        return;
      case 'peer-left':
        if (channel?.readyState === 'open') return;
        resetPeer();
        state('disconnected');
        return;
      case 'paired': {
        const connection = startPeer();
        if (role === 'host') {
          bindDataChannel(connection.createDataChannel('game'));
          await connection.setLocalDescription();
          if (peer === connection && connection.localDescription?.sdp) {
            signal({ type: 'offer', sdp: connection.localDescription.sdp });
          }
        }
        return;
      }
      case 'ice':
        if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate);
        else if (peer) candidates.push(message.candidate);
        return;
      case 'offer':
      case 'answer': {
        const connection = peer;
        if (!connection) return;
        await connection.setRemoteDescription(message);
        if (peer !== connection) return;
        for (const candidate of candidates.splice(0)) await connection.addIceCandidate(candidate);
        if (message.type === 'offer' && peer === connection) {
          await connection.setLocalDescription();
          if (peer === connection && connection.localDescription?.sdp) {
            signal({ type: 'answer', sdp: connection.localDescription.sdp });
          }
        }
      }
    }
  }

  let queue = Promise.resolve();
  socket.onmessage = (event: MessageEvent<string>) => {
    queue = queue.then(async () => {
      if (!disposed) await handle(JSON.parse(event.data) as RoomMessage);
    }).catch(() => { if (!disposed) state('failed'); });
  };
  socket.onclose = () => {
    if (currentState === 'full' || currentState === 'missing') return;
    // A live data channel can continue while signaling is unavailable.
    if (channel?.readyState !== 'open') state('disconnected');
  };

  return {
    send(message: unknown) {
      if (channel?.readyState !== 'open' || channel.bufferedAmount > 65536) return false;
      channel.send(JSON.stringify(message));
      return true;
    },
    close() {
      disposed = true;
      window.clearTimeout(timer);
      resetPeer();
      socket.close();
    },
  };
}
import { apiUrl } from './api.ts';
