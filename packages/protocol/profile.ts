export const profileIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export type ProfileGame = 'omok' | 'physics';
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
  level: number;
  xp: number;
  games: Record<ProfileGame, GameStats>;
  recent: (MatchReport & { playedAt: number })[];
}

export const matchXp: Record<MatchOutcome, number> = { win: 30, draw: 18, loss: 12, practice: 8 };

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
  if (typeof id !== 'string' || !profileIdPattern.test(id) || (game !== 'omok' && game !== 'physics')
    || (mode !== 'local' && mode !== 'online' && mode !== 'practice') || (mode === 'online' && game !== 'omok')
    || (mode === 'practice' && game !== 'physics')
    || (outcome !== 'win' && outcome !== 'loss' && outcome !== 'draw' && outcome !== 'practice')
    || (mode === 'practice') !== (outcome === 'practice')
    || typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > 10800) return;
  return { id, game, mode, outcome, seconds };
}
