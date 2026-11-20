import type { Arrangement, Percussion, Voice } from './music-arrangements.ts';

export type EncoreBacking = 'lofi' | 'surf' | 'disco' | 'folk' | 'dub' | 'synthwave' | 'pizzicato' | 'kalimba' | 'garage' | 'chorale';

function bar(chord: readonly [number, number, number], melody: readonly number[]) {
  return { chord, melody };
}

export const encoreArrangements = {
  rooftopStatic: { bpm: 74, steps: 8, swing: .22, accompaniment: 'lofi', lead: ['sine', 1.35, .024, .12], bars: [
    bar([50, 53, 60], [0, 69, 0, 72, 76, 0, 74, 0]), bar([55, 59, 65], [0, 71, 0, 74, 77, 0, 76, 74]),
    bar([48, 52, 59], [72, 0, 76, 0, 79, 0, 83, 0]), bar([57, 60, 67], [81, 0, 79, 76, 0, 72, 0, 0]),
    bar([53, 57, 64], [69, 0, 72, 0, 76, 0, 77, 0]), bar([52, 55, 62], [79, 0, 76, 0, 74, 72, 0, 0]),
    bar([50, 53, 60], [0, 72, 0, 76, 77, 0, 74, 0]), bar([55, 59, 65], [71, 0, 0, 74, 72, 0, 0, 0]),
  ] },
  melonSurf: { bpm: 146, steps: 8, swing: .05, accompaniment: 'surf', lead: ['triangle', .52, .005, .09], bars: [
    bar([52, 55, 59], [76, 76, 79, 0, 83, 81, 79, 76]), bar([55, 59, 62], [79, 0, 83, 86, 83, 79, 74, 0]),
    bar([57, 60, 64], [81, 81, 84, 0, 88, 84, 81, 76]), bar([59, 63, 66], [83, 81, 78, 0, 75, 78, 83, 0]),
    bar([52, 55, 59], [88, 88, 83, 0, 79, 83, 88, 0]), bar([48, 52, 55], [84, 83, 79, 0, 76, 79, 84, 0]),
    bar([57, 60, 64], [81, 84, 88, 0, 84, 81, 76, 0]), bar([59, 63, 66], [83, 83, 81, 78, 75, 78, 83, 0]),
  ] },
  mirrorSteps: { bpm: 120, steps: 8, swing: 0, accompaniment: 'disco', lead: ['square', .55, .012, .039], bars: [
    bar([57, 60, 67], [0, 76, 0, 79, 81, 0, 84, 81]), bar([50, 53, 60], [0, 77, 0, 81, 84, 0, 81, 77]),
    bar([55, 59, 65], [0, 79, 0, 83, 86, 0, 89, 86]), bar([48, 52, 59], [0, 79, 76, 0, 83, 0, 79, 76]),
    bar([53, 57, 64], [0, 81, 0, 84, 89, 0, 84, 81]), bar([52, 56, 62], [0, 80, 83, 0, 86, 88, 0, 83]),
    bar([57, 60, 67], [84, 0, 81, 79, 0, 76, 79, 0]), bar([52, 56, 62], [80, 0, 83, 86, 88, 86, 83, 0]),
  ] },
  meadowTrail: { bpm: 100, steps: 6, swing: 0, accompaniment: 'folk', lead: ['triangle', 1.46, .012, .11], bars: [
    bar([55, 59, 62], [71, 0, 74, 79, 0, 78]), bar([50, 54, 57], [74, 0, 0, 69, 0, 74]),
    bar([52, 55, 59], [76, 0, 79, 83, 0, 79]), bar([48, 52, 55], [76, 0, 74, 72, 0, 0]),
    bar([57, 60, 64], [72, 0, 76, 81, 0, 83]), bar([55, 59, 62], [79, 0, 0, 74, 0, 71]),
    bar([48, 52, 55], [72, 76, 79, 84, 0, 83]), bar([50, 54, 57], [81, 0, 78, 74, 0, 69]),
  ] },
  pebbleDub: { bpm: 68, steps: 8, swing: .16, accompaniment: 'dub', lead: ['sine', .85, .016, .086], bars: [
    bar([45, 52, 55], [0, 0, 0, 72, 0, 0, 0, 0]), bar([43, 50, 53], [0, 0, 70, 0, 0, 0, 0, 67]),
    bar([41, 48, 52], [0, 0, 69, 0, 0, 0, 0, 0]), bar([40, 47, 50], [0, 0, 0, 0, 0, 71, 0, 0]),
    bar([45, 52, 55], [0, 0, 76, 0, 0, 0, 72, 0]), bar([48, 55, 58], [0, 0, 0, 74, 0, 0, 0, 0]),
    bar([41, 48, 52], [0, 0, 72, 0, 0, 0, 69, 0]), bar([40, 47, 50], [0, 0, 0, 0, 0, 71, 0, 0]),
  ] },
  prismDrive: { bpm: 103, steps: 8, swing: 0, accompaniment: 'synthwave', lead: ['sawtooth', 3.05, .065, .036], bars: [
    bar([45, 48, 52], [76, 0, 0, 0, 81, 0, 79, 0]), bar([41, 45, 48], [77, 0, 0, 0, 76, 0, 0, 0]),
    bar([48, 52, 55], [79, 0, 0, 0, 83, 0, 84, 0]), bar([43, 47, 50], [86, 0, 0, 0, 83, 0, 0, 0]),
    bar([45, 48, 52], [81, 0, 0, 0, 84, 0, 88, 0]), bar([41, 45, 48], [89, 0, 0, 0, 88, 0, 84, 0]),
    bar([50, 53, 57], [81, 0, 0, 0, 77, 0, 0, 0]), bar([40, 44, 47], [80, 0, 0, 0, 76, 0, 0, 0]),
  ] },
  pocketDetective: { bpm: 132, steps: 10, swing: .06, accompaniment: 'pizzicato', lead: ['triangle', .57, .005, .13], bars: [
    bar([45, 48, 52], [69, 0, 72, 0, 0, 76, 75, 0, 72, 0]), bar([44, 47, 52], [71, 0, 0, 68, 0, 71, 0, 76, 0, 0]),
    bar([43, 46, 50], [74, 0, 70, 0, 0, 67, 70, 0, 74, 0]), bar([42, 45, 48], [72, 0, 0, 69, 0, 66, 0, 69, 0, 0]),
    bar([41, 45, 48], [77, 0, 76, 0, 0, 72, 69, 0, 72, 0]), bar([46, 50, 53], [74, 0, 0, 77, 0, 82, 0, 77, 0, 0]),
    bar([45, 48, 52], [81, 0, 76, 0, 0, 72, 76, 0, 75, 0]), bar([40, 44, 50], [74, 0, 0, 71, 0, 68, 0, 71, 0, 0]),
  ] },
  bambooClock: { bpm: 92, steps: 7, swing: 0, accompaniment: 'kalimba', lead: ['sine', .95, .007, .125], bars: [
    bar([60, 64, 67], [72, 79, 0, 76, 0, 84, 0]), bar([55, 59, 62], [74, 0, 79, 0, 83, 79, 0]),
    bar([57, 60, 64], [76, 81, 0, 79, 0, 84, 0]), bar([53, 57, 60], [77, 0, 84, 0, 81, 77, 0]),
    bar([50, 53, 57], [74, 81, 0, 77, 0, 86, 0]), bar([52, 55, 59], [76, 0, 83, 0, 79, 76, 0]),
    bar([53, 57, 60], [77, 84, 0, 81, 0, 89, 0]), bar([55, 59, 62], [86, 0, 83, 0, 79, 74, 0]),
  ] },
  skyRelay: { bpm: 133, steps: 8, swing: .31, accompaniment: 'garage', lead: ['triangle', .85, .022, .085], bars: [
    bar([54, 57, 64], [0, 81, 0, 0, 78, 0, 76, 0]), bar([57, 61, 68], [0, 76, 0, 81, 0, 85, 0, 0]),
    bar([52, 56, 62], [0, 80, 0, 0, 83, 0, 86, 0]), bar([50, 54, 61], [0, 85, 83, 0, 81, 0, 0, 0]),
    bar([54, 57, 64], [0, 81, 0, 88, 0, 81, 0, 0]), bar([45, 49, 56], [0, 85, 0, 0, 81, 0, 76, 0]),
    bar([47, 50, 57], [0, 74, 0, 78, 0, 81, 0, 0]), bar([49, 53, 59], [0, 83, 0, 0, 80, 0, 77, 0]),
  ] },
  winterChorale: { bpm: 57, steps: 8, swing: 0, accompaniment: 'chorale', lead: ['sine', 4.1, .52, .095], bars: [
    bar([53, 57, 60], [72, 0, 0, 0, 76, 0, 0, 0]), bar([50, 53, 57], [77, 0, 0, 0, 76, 0, 0, 0]),
    bar([46, 50, 53], [74, 0, 0, 0, 72, 0, 0, 0]), bar([48, 52, 58], [70, 0, 0, 0, 67, 0, 0, 0]),
    bar([45, 48, 53], [69, 0, 0, 0, 72, 0, 0, 0]), bar([46, 50, 57], [77, 0, 0, 0, 81, 0, 0, 0]),
    bar([43, 46, 53], [79, 0, 0, 0, 77, 0, 0, 0]), bar([48, 52, 58], [76, 0, 0, 0, 70, 0, 0, 0]),
  ] },
} as const satisfies Record<string, Arrangement<EncoreBacking>>;

export function playEncoreBacking(style: EncoreBacking, step: number, chord: readonly [number, number, number], pitch: number, note: Voice, noise: Percussion) {
  const [root, middle, upper] = chord;
  switch (style) {
    case 'lofi':
      if (step === 0 || step === 3 || step === 4) note((step === 3 ? upper : root) - 12, .33, .16, 'sine');
      if (step === 1 || step === 5) for (const key of chord) note(key, .68, .047, 'triangle', .055);
      if (step === 2 || step === 6) noise(.105, .16, 1120);
      else if (step % 2) noise(.047, .065, 4450);
      break;
    case 'surf':
      if (step % 2 === 0) note(chord[(step / 2) % 3] - 12, .118, .145, 'triangle');
      if (pitch) note(pitch + 12, .105, .023, 'triangle');
      if (step === 2 || step === 6) noise(.104, .13, 1630);
      else if (step % 2) noise(.055, .048, 3200);
      break;
    case 'disco':
      if (step % 2 === 0) note(root - 19, .16, .19, 'sine');
      else note(step === 7 ? upper - 12 : root, .12, .11, 'triangle');
      if (step === 1 || step === 5) for (const key of chord) note(key + 12, .12, .027, 'triangle');
      if (step === 2 || step === 6) noise(.10, .12, 2100);
      if (step % 2) noise(.055, .057, 6950);
      break;
    case 'folk':
      if (step === 0 || step === 3) note((step === 0 ? root : upper) - 12, .49, .13, 'triangle');
      note(chord[step % 3], .34, .07, 'sine');
      if (step === 2 || step === 5) noise(.056, .038, 1550);
      break;
    case 'dub':
      if (step === 0 || step === 4 || step === 7) note((step === 7 ? upper : root) - 12, .64, .215, 'sine', .044);
      if (step === 3 || step === 6) for (const key of chord) note(key + 12, .16, step === 3 ? .046 : .026, 'triangle');
      if (step === 4 || step === 7) noise(.082, step === 4 ? .10 : .045, 1920);
      break;
    case 'synthwave':
      if (step === 0) for (const key of chord) note(key + 12, 1.7, .026, 'triangle', .27);
      note((step % 2 ? root : root - 12), .17, .092, 'triangle');
      note(chord[step % 3] + 24, .18, .038, 'sine');
      if (step === 2 || step === 6) noise(.12, .13, 1840);
      break;
    case 'pizzicato':
      if ([0, 3, 5, 8].includes(step)) note((step === 3 ? middle : step === 8 ? upper : root) - 12, .18, .16, 'triangle');
      if (step === 2 || step === 7) for (const key of chord) note(key, .135, .031, 'sine');
      if (step === 4 || step === 9) noise(.043, .057, 930);
      break;
    case 'kalimba':
      if (step === 0 || step === 2 || step === 4) note(chord[step / 2] - 12, .28, .13, 'sine');
      if (pitch) note(pitch + 17, .12, .027, 'sine');
      if (step === 1 || step === 4 || step === 6) noise(.069, .07, step === 4 ? 910 : 1820);
      break;
    case 'garage':
      if (step === 0 || step === 3 || step === 7) note((step === 3 ? upper : root) - 12, .2, .20, 'sine');
      if (step === 1 || step === 5) for (const key of chord) note(key + 12, .15, .037, 'triangle', .017);
      if (step === 2 || step === 6) noise(.089, .18, 2530);
      else if (step === 1 || step === 4 || step === 5 || step === 7) noise(.049, .075, 6350);
      break;
    case 'chorale':
      if (step === 0) {
        note(root - 12, 4, .10, 'sine', .55);
        for (const key of chord) note(key, 2.7, .061, 'triangle', .49);
      }
      if (step === 4) for (const key of [middle, upper]) note(key + 12, 2.25, .042, 'sine', .50);
      break;
  }
}
