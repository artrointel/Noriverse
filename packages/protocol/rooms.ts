import { profileIdPattern, readName } from './profile.ts';
import type { ProfileGame, ProfileSummary } from './profile.ts';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const roomCodePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
export type RoomGame = ProfileGame;
export const roomCapacity = { omok: 2, physics: 4, othello: 2, chess: 2, sichuan: 4 } satisfies Record<RoomGame, number>;
export const isRoomGame = (value: unknown): value is RoomGame => typeof value === 'string' && Object.hasOwn(roomCapacity, value);

export const roomRoles = ['host', 'guest', 'guest2', 'guest3'] as const;
export type Role = (typeof roomRoles)[number];
export const isRoomRole = (value: unknown): value is Role => roomRoles.some(role => role === value);
export interface Participant { role: Role; profile?: ProfileSummary }
export type TouchPoint = { x: number; y: number };
export const touchResolution = 1000;

export function readTouch(value: unknown): TouchPoint | undefined {
  if (!value || typeof value !== 'object' || !('x' in value) || !('y' in value)) return;
  const { x, y } = value;
  if (typeof x === 'number' && typeof y === 'number' && Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && x <= touchResolution && y >= 0 && y <= touchResolution) return { x, y };
}

export type RoomInvite = { id: string; sender: string; name: string; game: RoomGame; code: string; expires: number };

export function readInvite(value: unknown): RoomInvite | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, sender, name, game, code, expires } = value as Partial<RoomInvite>;
  if (typeof id !== 'string' || !profileIdPattern.test(id) || typeof sender !== 'string' || !profileIdPattern.test(sender)
    || typeof name !== 'string' || !readName(name) || !isRoomGame(game) || typeof code !== 'string' || !roomCodePattern.test(code)
    || typeof expires !== 'number' || !Number.isSafeInteger(expires)) return;
  return { id, sender, name, game, code, expires };
}
interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}
export type Signal =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: IceCandidate };
export const maxRelayMessageLength = 48_000;
export type RelayData = { type: string } & Record<string, unknown>;
export function readRelayData(value: unknown): RelayData | undefined {
  if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string'
    && value.type.length > 0 && value.type.length <= 48 && value.type !== 'touch') return value as RelayData;
}
export type RoomMessage =
  | (Signal & { peer?: Role })
  | { type: 'welcome'; role: Role; token: string }
  | { type: 'roster'; participants: Participant[] }
  | { type: 'paired' | 'peer-left'; peer?: Role }
  | { type: 'relay-request' | 'relay-open'; peer: Role }
  | { type: 'relay-data'; peer: Role; data: RelayData }
  | { type: 'room-closed' }
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
