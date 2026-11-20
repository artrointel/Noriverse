import type { Stone } from './table.ts';

export const turnLimits = [0, 10, 15, 30, 60, 120] as const;
export type TurnLimit = number;
export const maxTurnLimit = 3600;
export const timeoutExtraSeconds = 15;
export type PendingTimeout = { color: Stone; at: number };
export type TimeoutChoice = 'claim' | 'extend';

export function readPendingTimeout(value: unknown, startedAt: number): PendingTimeout | undefined {
  if (!value || typeof value !== 'object' || !('color' in value) || !('at' in value)) return;
  const { color, at } = value;
  if ((color === 1 || color === 2) && typeof at === 'number' && Number.isSafeInteger(at) && startedAt > 0 && at >= startedAt) return { color, at };
}

export function resolveTurnTimeout(pending: PendingTimeout, choice: TimeoutChoice, now: number) {
  return choice === 'claim'
    ? { timeoutPending: undefined, timedOut: pending.color, deadline: 0, finishedAt: now }
    : { timeoutPending: undefined, timedOut: undefined, deadline: nextDeadline(timeoutExtraSeconds, now), finishedAt: 0 };
}

export function isTurnLimit(value: unknown): value is TurnLimit {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxTurnLimit;
}

export function nextDeadline(limit: TurnLimit, now: number) {
  return limit ? now + limit * 1000 : 0;
}

export function secondsRemaining(deadline: number, now: number) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
