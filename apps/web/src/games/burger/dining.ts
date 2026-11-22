export const tableCount = 6;
export const diningReplyMs = 2000;
export const seatWalkMs = 850;
export const diningExitMs = 1150;

export type DiningReaction = 'perfect' | 'mixed' | 'poor';
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
};

export function seatDiner(diners: readonly Diner[], guest: Pick<Diner, 'id' | 'guest'>, at: number,
  reaction: DiningReaction): Diner {
  const ready = at + diningReplyMs;
  const available = Array.from({ length: tableCount }, (_, table) => ({
    table,
    at: Math.max(ready, ...diners.filter(diner => diner.table === table).map(diner => diner.doneAt + 350)),
  })).sort((a, b) => a.at - b.at || a.table - b.table);
  const { table, at: walkAt } = available[0];
  const eatAt = walkAt + seatWalkMs;
  const doneAt = eatAt + 9000 + (guest.id % 3) * 1000;
  return { ...guest, at, table, walkAt, eatAt, doneAt, exitAt: doneAt + diningExitMs, reaction };
}

export function shiftDiner(diner: Diner, pause: number): Diner {
  return { ...diner, at: diner.at + pause, walkAt: diner.walkAt + pause, eatAt: diner.eatAt + pause,
    doneAt: diner.doneAt + pause, exitAt: diner.exitAt + pause };
}
