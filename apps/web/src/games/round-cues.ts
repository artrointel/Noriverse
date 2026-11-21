export const countdownDuration = 3500;
export const outcomeDuration = 1500;
export const resultDelay = outcomeDuration + 500;
export type OutcomeCue = 'victory' | 'defeat' | 'success' | 'finished';
export type RoundCue = '3' | '2' | '1' | 'go' | OutcomeCue;

export function countdownCue(beginsAt: number, now: number): { cue: RoundCue; at: number; duration: number } | undefined {
  const elapsed = now - (beginsAt - countdownDuration);
  if (!beginsAt || elapsed < 0 || elapsed >= countdownDuration) return;
  if (elapsed >= 3000) return { cue: 'go', at: beginsAt - 500, duration: 500 };
  const step = Math.floor(elapsed / 1000);
  return { cue: (['3', '2', '1'] as const)[step], at: beginsAt - countdownDuration + step * 1000, duration: 950 };
}
