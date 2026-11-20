const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const roomCodePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

export type Role = 'host' | 'guest';
interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}
export type Signal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: IceCandidate };
export type RoomMessage =
  | Signal
  | { type: 'welcome'; role: Role; token: string }
  | { type: 'paired' | 'peer-left' }
  | { type: 'error'; reason: 'missing' | 'full' | 'token' };

export function createRoomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)),
    value => alphabet[value % alphabet.length]).join('');
}

export function readSignal(raw: unknown, role: Role): Signal | undefined {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
  if (raw.type === 'ice' && 'candidate' in raw) {
    const candidate = raw.candidate as IceCandidate | null;
    if (candidate && typeof candidate.candidate === 'string'
      && candidate.candidate.length <= 2048
      && (candidate.sdpMid == null || typeof candidate.sdpMid === 'string')
      && (candidate.sdpMLineIndex == null || Number.isInteger(candidate.sdpMLineIndex))) {
      return { type: 'ice', candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      } };
    }
  }
  const expected = role === 'host' ? 'offer' : 'answer';
  if (raw.type === expected && 'sdp' in raw && typeof raw.sdp === 'string' && raw.sdp.length <= 16000) {
    return { type: expected, sdp: raw.sdp };
  }
}
