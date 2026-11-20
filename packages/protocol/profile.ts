export const profileIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const profileGames = ['omok', 'physics', 'othello', 'chess'] as const;
export type ProfileGame = (typeof profileGames)[number];

export function isProfileGame(value: unknown): value is ProfileGame {
  return profileGames.some(game => game === value);
}
export const avatarIds = ['mint', 'amber', 'lunar', 'ink', 'violet'] as const;
export type AvatarId = (typeof avatarIds)[number];
export const defaultAvatar: AvatarId = 'mint';
export const avatarLevel: Record<AvatarId, number> = { mint: 1, amber: 1, lunar: 1, ink: 1, violet: 1 };
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
export interface PublicProfile {
  id: string;
  name: string;
  avatar: AvatarId;
  favorites: ProfileGame[];
  level: number;
  xp: number;
  totalSeconds: number;
  games: Record<ProfileGame, GameStats>;
  recent: (MatchReport & { playedAt: number })[];
}

export type ProfileSummary = Pick<PublicProfile, 'id' | 'name' | 'avatar' | 'level'>;

export function readFriendUpdate(value: unknown) {
  if (!value || typeof value !== 'object' || !('id' in value) || !('added' in value)
    || typeof value.id !== 'string' || !profileIdPattern.test(value.id) || typeof value.added !== 'boolean') return;
  return { id: value.id, added: value.added };
}

export type ProfilePreferences =
  | { avatar: AvatarId }
  | { favorite: { game: ProfileGame; selected: boolean } };

export function readProfilePreferences(value: unknown): ProfilePreferences | undefined {
  if (!value || typeof value !== 'object') return;
  if ('avatar' in value && avatarIds.includes(value.avatar as AvatarId)) return { avatar: value.avatar as AvatarId };
  if (!('favorite' in value) || !value.favorite || typeof value.favorite !== 'object') return;
  const favorite = value.favorite as { game?: unknown; selected?: unknown };
  if (isProfileGame(favorite.game) && typeof favorite.selected === 'boolean') {
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
  if (typeof id !== 'string' || !profileIdPattern.test(id) || !isProfileGame(game)
    || (mode !== 'local' && mode !== 'online' && mode !== 'practice')
    || (mode === 'practice' && game !== 'physics')
    || (outcome !== 'win' && outcome !== 'loss' && outcome !== 'draw' && outcome !== 'practice')
    || (mode === 'practice') !== (outcome === 'practice')
    || typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 2_147_483_647) return;
  return { id, game, mode, outcome, seconds };
}
