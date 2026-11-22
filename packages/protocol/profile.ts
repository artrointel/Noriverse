import { isGameId } from './games.ts';
import type { GameId } from './games.ts';
import type { EarnedBadge } from './badges.ts';
import { explorerIds } from './explorers.ts';

export const profileIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export { gameIds as profileGames, isGameId as isProfileGame } from './games.ts';
export type ProfileGame = GameId;
export const basicAvatarIds = ['mint', 'amber', 'lunar', 'ink', 'violet', 'die', 'heart', 'star', 'clover', 'cloud',
  'pixelCherry', 'pixelAxolotl', 'pixelUfo', 'pixelPotion', 'pixelFox'] as const;
export const avatarIds = [...basicAvatarIds, ...explorerIds] as const;
export type AvatarId = (typeof avatarIds)[number];
export const defaultAvatar: AvatarId = 'mint';
export type AvatarLayers = { avatar: AvatarId; avatarBackground?: string | null };
export const isAvatarId = (value: unknown): value is AvatarId => avatarIds.includes(value as AvatarId);

export function readAvatarBackground(value: unknown) {
  if (value === null) return null;
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
}

export const touchEffects = ['soft', 'ripple', 'petals', 'pixelDrift', 'pixelBurst', 'none'] as const;
export type TouchEffect = typeof touchEffects[number];
export type TouchParticle = Exclude<TouchEffect, 'none'>;
export const isTouchEffect = (value: unknown): value is TouchEffect => touchEffects.includes(value as TouchEffect);
export type PresenceMode = 'online' | 'offline';
export const avatarLevel: Record<AvatarId, number> = {
  mint: 1, amber: 1, lunar: 1, ink: 1, violet: 1, die: 1, heart: 1, star: 1, clover: 1, cloud: 1,
  pixelCherry: 1, pixelAxolotl: 1, pixelUfo: 1, pixelPotion: 1, pixelFox: 1,
  toring: 1, solori: 1, kommi: 1, noeulbi: 1, muruon: 1, parumi: 1, pulsori: 1, guriong: 1, bilmong: 1, talgak: 1, jiena: 1,
};
export const secondsPerLevel = 3600;

export function levelFromPlayTime(seconds: number) {
  return 1 + Math.floor(seconds / secondsPerLevel);
}

export function elapsedPlaySeconds(startedAt: number, finishedAt: number) {
  return Math.max(0, Math.floor((finishedAt - startedAt) / 1000));
}

export function winRate(stats: Pick<GameStats, 'wins' | 'losses' | 'draws'>) {
  const matches = stats.wins + stats.losses + stats.draws;
  return matches ? stats.wins / matches : null;
}
export type MatchMode = 'local' | 'online' | 'practice';
export type MatchOutcome = 'win' | 'loss' | 'draw' | 'practice';
export interface MatchReport {
  id: string;
  game: ProfileGame;
  mode: MatchMode;
  outcome: MatchOutcome;
  seconds: number;
}
export interface GameStats { seconds: number; wins: number; losses: number; draws: number; sessions: number }
export interface PublicProfile extends AvatarLayers {
  id: string;
  name: string;
  favorites: ProfileGame[];
  touchEffect?: TouchEffect;
  level: number;
  xp: number;
  totalSeconds: number;
  badges?: EarnedBadge[];
  games: Record<ProfileGame, GameStats>;
  recent: (MatchReport & { playedAt: number })[];
}

export type ProfileSummary = AvatarLayers & Pick<PublicProfile, 'id' | 'name' | 'level'>;
export type OwnProfile = PublicProfile & { presence?: PresenceMode };
export type FriendRoom = { code: string; game: ProfileGame; joinable: boolean };
export type FriendSummary = ProfileSummary & { online?: boolean; lastOnlineAt?: number; room?: FriendRoom };
export type FriendAction = 'request' | 'accept' | 'decline' | 'remove' | 'cancel';
export type FriendList = { friends: FriendSummary[]; incoming: (ProfileSummary & { requestId?: string })[]; outgoing: ProfileSummary[] };

export function readFriendUpdate(value: unknown) {
  if (!value || typeof value !== 'object' || !('id' in value) || !('added' in value)
    || typeof value.id !== 'string' || !profileIdPattern.test(value.id) || typeof value.added !== 'boolean') return;
  return { id: value.id, added: value.added };
}

export type ProfilePreferences =
  | AvatarLayers
  | { touchEffect: TouchEffect }
  | { presence: PresenceMode }
  | { favorite: { game: ProfileGame; selected: boolean } };

export function readProfilePreferences(value: unknown): ProfilePreferences | undefined {
  if (!value || typeof value !== 'object') return;
  if ('avatar' in value) {
    if (!isAvatarId(value.avatar)) return;
    if (!('avatarBackground' in value)) return { avatar: value.avatar };
    const avatarBackground = readAvatarBackground(value.avatarBackground);
    if (avatarBackground !== undefined) return { avatar: value.avatar, avatarBackground };
    return;
  }
  if ('touchEffect' in value && isTouchEffect(value.touchEffect)) return { touchEffect: value.touchEffect };
  if ('presence' in value && (value.presence === 'online' || value.presence === 'offline')) return { presence: value.presence };
  if (!('favorite' in value) || !value.favorite || typeof value.favorite !== 'object') return;
  const favorite = value.favorite as { game?: unknown; selected?: unknown };
  if (isGameId(favorite.game) && typeof favorite.selected === 'boolean') {
    return { favorite: { game: favorite.game, selected: favorite.selected } };
  }
}

export function readName(value: unknown) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim().normalize('NFC');
  if (trimmed.length < 1 || trimmed.length > 24 || /[\p{Cc}\p{Cf}]/u.test(trimmed)) return;
  return trimmed;
}

export function readReport(value: unknown): MatchReport | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Partial<MatchReport>;
  const { id, game, mode, outcome, seconds } = data;
  if (typeof id !== 'string' || !profileIdPattern.test(id) || !isGameId(game)
    || (mode !== 'local' && mode !== 'online' && mode !== 'practice')
    || (mode === 'practice' && game !== 'physics')
    || (outcome !== 'win' && outcome !== 'loss' && outcome !== 'draw' && outcome !== 'practice')
    || (mode === 'practice') !== (outcome === 'practice')
    || typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 2_147_483_647) return;
  return { id, game, mode, outcome, seconds };
}
