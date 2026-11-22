import type { BurgerLine } from './dialogue.ts';

export const tableCount = 6;
export const diningReplyMs = 2000;
export const seatWalkMs = 850;
export const diningExitMs = 1150;

export type DiningReaction = 'perfect' | 'mixed' | 'poor';
export const diningSatisfaction = ['love', 'delighted', 'content', 'puzzled', 'disappointed'] as const;
export type DiningSatisfaction = (typeof diningSatisfaction)[number];
export type Diner = {
  id: number;
  guest: number;
  at: number;
  table: number;
  walkAt: number;
  eatAt: number;
  doneAt: number;
  exitAt: number;
  reaction: DiningReaction;
  satisfaction?: DiningSatisfaction;
  tip?: number;
  line?: BurgerLine;
  thought?: BurgerLine;
};

export function seatDiner(diners: readonly Diner[], guest: Pick<Diner, 'id' | 'guest'>, at: number,
  reaction: DiningReaction, satisfaction?: DiningSatisfaction, tip = 0, tables = tableCount): Diner {
  const ready = at + diningReplyMs;
  const available = Array.from({ length: tables }, (_, table) => ({
    table,
    at: Math.max(ready, ...diners.filter(diner => diner.table === table).map(diner => diner.doneAt + 350)),
  })).sort((a, b) => a.at - b.at || a.table - b.table);
  const { table, at: walkAt } = available[0] ?? { table: -1, at: ready };
  const eatAt = walkAt + seatWalkMs;
  const doneAt = table < 0 ? eatAt : eatAt + 9000 + (guest.id % 3) * 1000;
  return { ...guest, at, table, walkAt, eatAt, doneAt, exitAt: doneAt + diningExitMs, reaction,
    ...(satisfaction && { satisfaction }), ...(tip && { tip }) };
}

export function shiftDiner(diner: Diner, pause: number): Diner {
  return { ...diner, at: diner.at + pause, walkAt: diner.walkAt + pause, eatAt: diner.eatAt + pause,
    doneAt: diner.doneAt + pause, exitAt: diner.exitAt + pause };
}
