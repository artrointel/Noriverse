export const badgeCatalog = {
  conquest1: { metric: 'games', target: 5, ko: ['게임 정복 1', '친구 방에서 서로 다른 게임 5종의 경기를 마쳤어요.'], en: ['Game Conquest 1', 'Finish matches in five different games in friend rooms.'] },
  goodSport: { metric: 'reactions', target: 10, ko: ['나는야 즐겜러', '이모티콘으로 감정을 누적 10회 표현했어요.'], en: ['Here for Fun', 'Send ten reactions.'] },
  gamerGold: { metric: 'winStreak', target: 5, ko: ['프로게이머:골드', '한 방에서 5경기 연속 우승했어요.'], en: ['Pro Gamer: Gold', 'Win five matches in a row in one room.'] },
  gamerDiamond: { metric: 'winStreak', target: 10, ko: ['프로게이머:다이아', '한 방에서 10경기 연속 우승했어요.'], en: ['Pro Gamer: Diamond', 'Win ten matches in a row in one room.'] },
  gamerMaster: { metric: 'winStreak', target: 15, ko: ['프로게이머:마스터', '한 방에서 15경기 연속 우승했어요.'], en: ['Pro Gamer: Master', 'Win fifteen matches in a row in one room.'] },
  gamerChallenger: { metric: 'winStreak', target: 20, ko: ['프로게이머:챌린저', '한 방에서 20경기 연속 우승했어요.'], en: ['Pro Gamer: Challenger', 'Win twenty matches in a row in one room.'] },
  ranker1: { metric: 'roomLeads', target: 1, ko: ['랭커 1', '랭킹 1위로 친구 방을 마쳤어요.'], en: ['Ranker 1', 'Finish a friend room at the top of the rankings.'] },
  ranker2: { metric: 'roomLeads', target: 5, ko: ['랭커 2', '랭킹 1위로 친구 방을 누적 5회 마쳤어요.'], en: ['Ranker 2', 'Finish five friend rooms at the top of the rankings.'] },
  ranker3: { metric: 'roomLeads', target: 10, ko: ['랭커 3', '랭킹 1위로 친구 방을 누적 10회 마쳤어요.'], en: ['Ranker 3', 'Finish ten friend rooms at the top of the rankings.'] },
  comeback: { metric: 'comeback', target: 3, ko: ['아픔을 딛고', '한 방에서 3경기 이상 연속으로 패배한 뒤 다음 경기에서 승리했어요.'], en: ['Back on Your Feet', 'Win after at least three consecutive losses in the same room.'] },
} as const;

export type BadgeId = keyof typeof badgeCatalog;
export type BadgeMetric = (typeof badgeCatalog)[BadgeId]['metric'];
export type EarnedBadge = { id: BadgeId; earnedAt: number };
export const badgeIds = Object.keys(badgeCatalog) as BadgeId[];

export function reachedBadges(metric: BadgeMetric, value: number) {
  return badgeIds.filter(id => badgeCatalog[id].metric === metric && value >= badgeCatalog[id].target);
}

export function readEarnedBadge(value: unknown): EarnedBadge | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, earnedAt } = value as Partial<EarnedBadge>;
  if (id && badgeIds.includes(id) && typeof earnedAt === 'number' && Number.isSafeInteger(earnedAt) && earnedAt > 0 && earnedAt <= 8.64e15) {
    return { id, earnedAt };
  }
}

export function mergeBadges(previous: readonly EarnedBadge[] = [], added: readonly EarnedBadge[] = []) {
  const byId = new Map(previous.map(badge => [badge.id, badge]));
  for (const badge of added) if (!byId.has(badge.id)) byId.set(badge.id, badge);
  return badgeIds.flatMap(id => byId.get(id) ?? []);
}
