export const turnLimits = [0, 10, 15, 30, 60, 120] as const;
export type TurnLimit = number;
export const maxTurnLimit = 3600;

export function isTurnLimit(value: unknown): value is TurnLimit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxTurnLimit;
}

export function nextDeadline(limit: TurnLimit, now: number) {
  return limit ? now + limit * 1000 : 0;
}

export function secondsRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
