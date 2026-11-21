import { mergeBadges, reachedBadges } from './badges.ts';
import type { EarnedBadge } from './badges.ts';
import type { RoomResult } from './room-history.ts';

export function roomStreakBadges(entries: readonly RoomResult[]) {
  const streaks = new Map<string, { wins: number; losses: number; badges: EarnedBadge[] }>();
  for (const entry of entries) for (const { profileId, outcome } of entry.players) {
    if (!profileId) continue;
    const streak = streaks.get(profileId) ?? { wins: 0, losses: 0, badges: [] };
    const awards = outcome === 'win'
      ? [...reachedBadges('winStreak', streak.wins + 1), ...reachedBadges('comeback', streak.losses)]
      : [];
    streak.badges = mergeBadges(streak.badges, awards.map(id => ({ id, earnedAt: entry.endedAt })));
    streak.wins = outcome === 'win' ? streak.wins + 1 : 0;
    streak.losses = outcome === 'loss' ? streak.losses + 1 : 0;
    streaks.set(profileId, streak);
  }
  return [...streaks].filter(([, streak]) => streak.badges.length).map(([id, { badges }]) => ({ id, badges }));
}
