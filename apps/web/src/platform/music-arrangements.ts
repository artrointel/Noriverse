import { encoreArrangements, playEncoreBacking } from './music-encore.ts';
import type { EncoreBacking } from './music-encore.ts';

type Backing = 'arcade' | 'piano' | 'funk' | 'waltz' | 'ambient' | 'bossa' | 'breakbeat' | 'march' | 'musicBox' | 'reggae' | EncoreBacking;

export type Arrangement<Style extends string = Backing> = {
  bpm: number; steps: number; swing: number;
  bars: readonly { chord: readonly [number, number, number]; melody: readonly number[] }[];
  lead: readonly [wave: OscillatorType, length: number, attack: number, gain: number];
  accompaniment: Style;
};

export const arrangements = {
  lemonSprint: { bpm: 152, steps: 8, swing: 0, accompaniment: 'arcade', lead: ['square', .38, .005, .038], bars: [
    { chord: [60, 64, 67], melody: [72, 76, 79, 84, 0, 79, 76, 77] }, { chord: [57, 60, 64], melody: [81, 79, 76, 0, 72, 76, 79, 0] },
    { chord: [65, 69, 72], melody: [77, 81, 84, 81, 0, 79, 76, 77] }, { chord: [67, 71, 74], melody: [79, 83, 86, 83, 81, 79, 77, 76] },
    { chord: [60, 64, 67], melody: [84, 0, 79, 76, 84, 0, 79, 76] }, { chord: [52, 55, 59], melody: [83, 79, 76, 74, 76, 0, 79, 0] },
    { chord: [50, 53, 57], melody: [81, 77, 74, 77, 81, 84, 81, 77] }, { chord: [67, 71, 74], melody: [79, 0, 83, 0, 86, 83, 86, 0] },
    { chord: [57, 60, 64], melody: [88, 84, 81, 0, 84, 81, 76, 0] }, { chord: [53, 57, 60], melody: [77, 81, 84, 89, 84, 81, 79, 0] },
    { chord: [50, 53, 57], melody: [74, 77, 81, 84, 81, 77, 74, 0] }, { chord: [67, 71, 74], melody: [79, 83, 86, 89, 86, 83, 79, 71] },
  ] },
  rainAtMidnight: { bpm: 62, steps: 8, swing: 0, accompaniment: 'piano', lead: ['triangle', 2.4, .022, .073], bars: [
    { chord: [57, 60, 64], melody: [76, 0, 0, 72, 71, 0, 0, 0] }, { chord: [53, 57, 60], melody: [69, 0, 0, 0, 72, 0, 76, 0] },
    { chord: [50, 53, 57], melody: [74, 0, 0, 72, 69, 0, 0, 0] }, { chord: [52, 56, 59], melody: [68, 0, 71, 0, 76, 0, 0, 0] },
    { chord: [57, 60, 64], melody: [81, 0, 0, 76, 74, 0, 0, 0] }, { chord: [55, 59, 62], melody: [71, 0, 0, 0, 74, 0, 79, 0] },
    { chord: [53, 57, 60], melody: [77, 0, 0, 76, 72, 0, 69, 0] }, { chord: [52, 56, 59], melody: [71, 0, 0, 68, 0, 0, 0, 0] },
  ] },
  neonAvenue: { bpm: 109, steps: 8, swing: .19, accompaniment: 'funk', lead: ['triangle', .58, .014, .095], bars: [
    { chord: [52, 55, 62], melody: [0, 76, 0, 79, 81, 0, 79, 74] }, { chord: [57, 60, 67], melody: [72, 0, 76, 0, 79, 77, 0, 76] },
    { chord: [55, 59, 65], melody: [0, 74, 77, 0, 81, 0, 84, 0] }, { chord: [50, 54, 60], melody: [78, 76, 0, 74, 0, 69, 0, 0] },
    { chord: [48, 52, 59], melody: [0, 76, 79, 0, 83, 84, 0, 83] }, { chord: [54, 57, 64], melody: [81, 0, 76, 74, 0, 76, 0, 0] },
    { chord: [59, 63, 69], melody: [0, 75, 78, 0, 81, 0, 78, 75] }, { chord: [52, 55, 62], melody: [76, 0, 0, 74, 76, 0, 0, 0] },
    { chord: [57, 60, 67], melody: [0, 81, 84, 0, 88, 0, 86, 84] }, { chord: [55, 59, 65], melody: [83, 81, 0, 79, 0, 77, 76, 0] },
    { chord: [54, 57, 64], melody: [0, 78, 81, 0, 84, 0, 81, 78] }, { chord: [59, 63, 69], melody: [75, 78, 0, 81, 0, 78, 75, 0] },
  ] },
  velvetCarousel: { bpm: 94, steps: 6, swing: 0, accompaniment: 'waltz', lead: ['sine', 1.7, .012, .12], bars: [
    { chord: [62, 66, 69], melody: [78, 0, 81, 78, 76, 0] }, { chord: [59, 62, 66], melody: [74, 0, 78, 74, 71, 0] },
    { chord: [55, 59, 62], melody: [67, 0, 71, 74, 79, 0] }, { chord: [57, 61, 64], melody: [81, 76, 73, 0, 76, 0] },
    { chord: [66, 69, 73], melody: [78, 81, 85, 0, 81, 0] }, { chord: [59, 62, 66], melody: [83, 0, 81, 78, 74, 0] },
    { chord: [52, 55, 59], melody: [76, 79, 83, 0, 79, 0] }, { chord: [57, 61, 64], melody: [81, 0, 76, 73, 76, 0] },
    { chord: [55, 59, 62], melody: [74, 79, 83, 0, 81, 0] }, { chord: [62, 66, 69], melody: [78, 0, 76, 74, 69, 0] },
    { chord: [52, 55, 59], melody: [67, 71, 76, 0, 79, 0] }, { chord: [57, 61, 64], melody: [76, 73, 69, 0, 0, 0] },
  ] },
  belowTheTide: { bpm: 49, steps: 8, swing: 0, accompaniment: 'ambient', lead: ['sine', 4.4, .46, .055], bars: [
    { chord: [48, 55, 62], melody: [0, 0, 74, 0, 0, 0, 67, 0] }, { chord: [46, 53, 60], melody: [0, 0, 72, 0, 0, 77, 0, 0] },
    { chord: [41, 48, 55], melody: [0, 0, 67, 0, 0, 0, 72, 0] }, { chord: [43, 50, 57], melody: [0, 0, 69, 0, 0, 0, 0, 0] },
    { chord: [45, 52, 59], melody: [0, 0, 76, 0, 0, 0, 71, 0] }, { chord: [41, 48, 55], melody: [0, 0, 0, 72, 0, 0, 79, 0] },
    { chord: [38, 45, 52], melody: [0, 0, 76, 0, 0, 0, 69, 0] }, { chord: [43, 50, 57], melody: [0, 0, 74, 0, 0, 0, 0, 0] },
  ] },
  citrusTerrace: { bpm: 118, steps: 8, swing: 0, accompaniment: 'bossa', lead: ['triangle', 1.24, .012, .085], bars: [
    { chord: [60, 64, 71], melody: [79, 0, 76, 74, 0, 76, 0, 71] }, { chord: [57, 60, 67], melody: [72, 0, 0, 76, 79, 76, 74, 0] },
    { chord: [50, 53, 60], melody: [77, 0, 74, 72, 0, 74, 0, 69] }, { chord: [55, 59, 65], melody: [71, 0, 74, 77, 0, 76, 74, 0] },
    { chord: [53, 57, 64], melody: [81, 0, 79, 76, 0, 72, 0, 76] }, { chord: [54, 57, 64], melody: [78, 0, 76, 72, 0, 69, 0, 72] },
    { chord: [55, 60, 65], melody: [77, 0, 74, 72, 0, 76, 0, 77] }, { chord: [55, 59, 65], melody: [79, 77, 0, 74, 71, 0, 74, 0] },
  ] },
  midnightCourier: { bpm: 172, steps: 8, swing: .11, accompaniment: 'breakbeat', lead: ['triangle', .9, .018, .068], bars: [
    { chord: [45, 52, 57], melody: [0, 0, 69, 0, 0, 0, 72, 0] }, { chord: [43, 50, 58], melody: [0, 0, 67, 0, 74, 0, 0, 70] },
    { chord: [41, 48, 56], melody: [0, 68, 72, 0, 0, 72, 0, 0] }, { chord: [40, 47, 55], melody: [0, 67, 0, 71, 0, 74, 0, 0] },
    { chord: [45, 52, 57], melody: [76, 0, 0, 72, 0, 79, 0, 0] }, { chord: [48, 55, 60], melody: [0, 0, 72, 0, 79, 0, 82, 0] },
    { chord: [46, 53, 57], melody: [81, 0, 0, 77, 0, 72, 0, 74] }, { chord: [40, 47, 55], melody: [0, 71, 0, 67, 0, 0, 0, 64] },
    { chord: [45, 52, 57], melody: [0, 69, 0, 0, 72, 0, 76, 0] }, { chord: [46, 53, 58], melody: [0, 70, 77, 0, 0, 81, 0, 0] },
    { chord: [41, 48, 57], melody: [0, 81, 0, 76, 0, 72, 0, 0] }, { chord: [40, 47, 55], melody: [76, 0, 74, 0, 71, 0, 67, 0] },
  ] },
  highlandParade: { bpm: 106, steps: 8, swing: 0, accompaniment: 'march', lead: ['sawtooth', 1.6, .045, .043], bars: [
    { chord: [48, 55, 60], melody: [67, 0, 67, 0, 72, 0, 76, 0] }, { chord: [43, 50, 55], melody: [74, 0, 0, 71, 67, 0, 0, 0] },
    { chord: [45, 52, 57], melody: [69, 0, 72, 0, 76, 0, 81, 0] }, { chord: [41, 48, 53], melody: [79, 0, 0, 77, 72, 0, 0, 0] },
    { chord: [46, 53, 58], melody: [77, 0, 70, 0, 74, 0, 77, 0] }, { chord: [48, 55, 60], melody: [79, 0, 0, 76, 84, 0, 0, 0] },
    { chord: [45, 52, 57], melody: [81, 0, 81, 0, 79, 0, 76, 0] }, { chord: [43, 50, 55], melody: [74, 0, 0, 71, 67, 0, 0, 0] },
  ] },
  paperConstellation: { bpm: 76, steps: 10, swing: 0, accompaniment: 'musicBox', lead: ['sine', 2.3, .009, .09], bars: [
    { chord: [57, 60, 64], melody: [81, 0, 84, 0, 88, 0, 83, 0, 84, 0] }, { chord: [53, 57, 64], melody: [89, 0, 88, 0, 84, 0, 81, 0, 0, 0] },
    { chord: [50, 53, 60], melody: [86, 0, 0, 84, 81, 0, 77, 0, 81, 0] }, { chord: [52, 56, 62], melody: [80, 0, 83, 0, 86, 0, 88, 0, 0, 0] },
    { chord: [48, 52, 59], melody: [91, 0, 88, 0, 83, 0, 86, 0, 0, 0] }, { chord: [47, 50, 57], melody: [86, 0, 81, 0, 77, 0, 81, 0, 0, 0] },
    { chord: [53, 57, 64], melody: [84, 0, 88, 0, 89, 0, 88, 0, 81, 0] }, { chord: [52, 56, 62], melody: [86, 0, 83, 0, 80, 0, 76, 0, 0, 0] },
  ] },
  islandPostcard: { bpm: 86, steps: 8, swing: .07, accompaniment: 'reggae', lead: ['triangle', 1.25, .017, .088], bars: [
    { chord: [55, 59, 62], melody: [0, 74, 0, 71, 69, 0, 67, 0] }, { chord: [48, 52, 55], melody: [0, 72, 0, 76, 74, 0, 0, 72] },
    { chord: [52, 55, 59], melody: [0, 71, 0, 67, 71, 0, 76, 0] }, { chord: [50, 54, 57], melody: [0, 74, 0, 69, 66, 0, 0, 69] },
    { chord: [55, 59, 62], melody: [79, 0, 0, 74, 71, 0, 74, 0] }, { chord: [57, 60, 64], melody: [0, 76, 0, 72, 69, 0, 0, 72] },
    { chord: [48, 52, 55], melody: [0, 79, 0, 76, 72, 0, 76, 0] }, { chord: [50, 54, 57], melody: [0, 74, 0, 72, 69, 0, 66, 0] },
  ] },
  ...encoreArrangements,
} as const satisfies Record<string, Arrangement>;

export type ArrangementTrack = keyof typeof arrangements;

export const musicMoods = {
  orbit: ['cosmic', 'calm'], skylight: ['bright', 'soft'], lantern: ['warm', 'calm'], paperComet: ['playful', 'bright'],
  chess: ['moody', 'soft'], physics: ['energetic', 'rhythmic'], starBop: ['energetic', 'rhythmic'],
  lemonSprint: ['energetic', 'bright', 'arcade'], rainAtMidnight: ['melancholy', 'slow', 'piano'], neonAvenue: ['funky', 'rhythmic', 'night'],
  velvetCarousel: ['whimsical', 'waltz'], belowTheTide: ['ambient', 'slow', 'cosmic'],
  citrusTerrace: ['bossa', 'warm'], midnightCourier: ['breakbeat', 'night', 'energetic'], highlandParade: ['march', 'bright'],
  paperConstellation: ['musicBox', 'moody'], islandPostcard: ['reggae', 'calm'],
  rooftopStatic: ['lofi', 'warm'], melonSurf: ['surf', 'playful'], mirrorSteps: ['disco', 'rhythmic'], meadowTrail: ['folk', 'bright'],
  pebbleDub: ['dub', 'slow'], prismDrive: ['synthwave', 'night'], pocketDetective: ['pizzicato', 'playful'],
  bambooClock: ['kalimba', 'rhythmic'], skyRelay: ['garage', 'energetic'], winterChorale: ['chorale', 'calm'],
} as const;

export type Voice = (note: number, length: number, gain: number, wave?: OscillatorType, attack?: number) => void;
export type Percussion = (length: number, gain: number, hz: number) => void;

export function playArrangement(track: ArrangementTrack, beat: number, note: Voice, noise: Percussion) {
  const { bpm, steps, swing, bars, lead, accompaniment }: Arrangement = arrangements[track];
  const step = beat % steps;
  const interval = 30 / bpm;
  const { chord, melody } = bars[Math.floor(beat / steps) % bars.length];
  const [root, middle, upper] = chord;
  const pitch = melody[step];
  if (pitch) note(pitch, lead[1] * interval, lead[3], lead[0], lead[2]);

  switch (accompaniment) {
    case 'arcade':
      if (step % 2 === 0) note(step === 4 ? upper - 12 : root - 12, .14, .13, 'triangle');
      if (step === 2 || step === 6) noise(.07, .13, 1700);
      else if (step % 2) noise(.032, .062, 5400);
      break;
    case 'piano':
      if (step === 0 || step === 4) note(step === 0 ? root - 12 : upper - 12, 1.75, .15, 'sine', .045);
      if (step === 2 || step === 6) note(step === 2 ? middle : upper, 1.15, .062, 'triangle', .025);
      if (pitch) note(pitch + 12, .34, .019, 'sine');
      break;
    case 'funk':
      if ([0, 3, 4, 6].includes(step)) note((step === 6 ? upper : root) - 12, .16, .17, 'triangle');
      if (step === 1 || step === 5) for (const chordNote of chord) note(chordNote, .13, .039, 'triangle');
      if (step === 2 || step === 6) noise(.095, .16, 1370);
      else if (step % 2) noise(.036, .07, 6900);
      break;
    case 'waltz':
      if (step === 0) note(root - 12, .56, .16, 'triangle');
      if (step === 2 || step === 4) for (const chordNote of [middle, upper]) note(chordNote, .27, .062, 'triangle');
      if (pitch) note(pitch + 19, .42, .025, 'sine');
      break;
    case 'ambient':
      if (step === 0) for (const chordNote of [root - 12, ...chord]) note(chordNote, interval * 9, .12, 'sine', 1.25);
      if (step === 4) note(middle + 12, interval * 4, .034, 'triangle', .57);
      break;
    case 'bossa':
      if (step === 0 || step === 4) note((step === 0 ? root : upper) - 12, .35, .13, 'sine');
      if (step === 0 || step === 3 || step === 5 || step === 7) for (const tone of chord) note(tone, .19, .034, 'triangle');
      if (step === 2 || step === 6) noise(.054, .083, 2200);
      else if (step % 2) noise(.036, .045, 6200);
      break;
    case 'breakbeat':
      if (step === 0 || step === 3 || step === 5) note(step === 5 ? middle - 12 : root - 12, .29, .25, 'sine');
      if (step === 2 || step === 6) noise(.105, .21, 1400);
      else if (step % 2) noise(.05, .095, 7700);
      if (step === 0) for (const tone of chord) note(tone + 12, 1.25, .018, 'triangle', .26);
      break;
    case 'march':
      if (step === 0 || step === 4) note((step === 0 ? root : middle) - 12, .33, .15, 'triangle');
      if (step === 2 || step === 6) for (const tone of chord) note(tone, .24, .034, 'sawtooth', .045);
      if (step % 2 === 0 || step === 7) noise(.062, step % 4 === 0 ? .12 : .066, 2800);
      break;
    case 'musicBox':
      if (step % 2 === 0) note([root, middle, upper, middle, upper][step / 2], .74, .075, 'sine');
      if (pitch) note(pitch + 19, .24, .023, 'sine', .004);
      break;
    case 'reggae':
      if (step === 0 || step === 3 || step === 6) note((step === 0 ? root : step === 3 ? upper : middle) - 12, .5, .19, 'sine');
      if (step % 2) for (const tone of chord) note(tone + 12, .105, .035, 'triangle');
      if (step === 4) noise(.09, .13, 1950);
      else if (step % 2) noise(.034, .055, 6500);
      break;
    default:
      playEncoreBacking(accompaniment, step, chord, pitch, note, noise);
  }
  return interval * (1 + (step % 2 ? -swing : swing));
}
