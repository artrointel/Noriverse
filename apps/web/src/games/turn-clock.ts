export const turnLimits = [0, 10, 15, 30, 60, 120] as const;
export type TurnLimit = typeof turnLimits[number];

export function isTurnLimit(value: unknown): value is TurnLimit {
  return turnLimits.some(limit => limit === value);
}

export function nextDeadline(limit: TurnLimit, now: number) {
  return limit ? now + limit * 1000 : 0;
}

export function secondsRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
