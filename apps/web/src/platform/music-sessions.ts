import type { Arrangement, Percussion, Voice } from './music-arrangements.ts';

export type SessionBacking = 'swingJazz' | 'tango' | 'fluteDrone' | 'zither' | 'polka'
  | 'deepHouse' | 'cinematic' | 'salsa' | 'baroque' | 'stringElegy';

function bar(chord: readonly [number, number, number], melody: readonly number[]) {
  return { chord, melody };
}

export const sessionArrangements = {
  cornerBooth: { bpm: 112, steps: 8, swing: .31, accompaniment: 'swingJazz', lead: ['sine', 1.55, .012, .067], bars: [
    bar([50, 53, 60], [0, 69, 72, 0, 76, 74, 0, 72]), bar([55, 59, 65], [71, 0, 0, 74, 77, 0, 76, 0]),
    bar([48, 52, 59], [79, 0, 76, 0, 0, 72, 74, 76]), bar([57, 61, 67], [73, 0, 0, 76, 79, 0, 81, 0]),
    bar([53, 57, 64], [84, 0, 81, 79, 76, 0, 77, 0]), bar([54, 57, 60], [0, 78, 81, 0, 0, 84, 81, 78]),
    bar([55, 60, 64], [76, 0, 79, 0, 84, 0, 83, 0]), bar([55, 59, 65], [77, 0, 0, 74, 71, 0, 0, 69]),
    bar([52, 55, 62], [0, 67, 71, 0, 74, 0, 79, 0]), bar([57, 61, 67], [0, 76, 73, 0, 79, 76, 73, 0]),
    bar([50, 53, 60], [72, 0, 69, 0, 65, 0, 69, 0]), bar([55, 59, 65], [71, 0, 0, 74, 77, 74, 0, 71]),
  ] },
  redPlatform: { bpm: 116, steps: 8, swing: 0, accompaniment: 'tango', lead: ['triangle', 1.46, .036, .082], bars: [
    bar([45, 48, 52], [69, 0, 72, 76, 0, 75, 72, 0]), bar([44, 47, 50], [68, 0, 71, 74, 0, 76, 71, 0]),
    bar([45, 48, 52], [69, 0, 0, 76, 81, 0, 79, 76]), bar([50, 53, 57], [77, 0, 74, 0, 69, 0, 0, 0]),
    bar([41, 45, 48], [0, 72, 77, 81, 0, 84, 81, 77]), bar([47, 50, 53], [83, 0, 81, 77, 0, 74, 71, 0]),
    bar([40, 44, 50], [80, 0, 76, 74, 0, 71, 68, 0]), bar([45, 48, 52], [69, 0, 0, 0, 0, 64, 67, 68]),
    bar([48, 52, 55], [72, 0, 76, 79, 84, 0, 79, 76]), bar([43, 47, 50], [74, 0, 71, 0, 67, 0, 71, 74]),
    bar([46, 50, 53], [0, 77, 82, 0, 86, 84, 82, 77]), bar([40, 44, 50], [80, 0, 0, 76, 74, 71, 68, 0]),
  ] },
  saturnWind: { bpm: 74, steps: 7, swing: 0, accompaniment: 'fluteDrone', lead: ['sine', 2.5, .121, .071], bars: [
    bar([50, 57, 62], [0, 74, 0, 77, 0, 76, 0]), bar([50, 57, 64], [72, 0, 0, 69, 0, 0, 0]),
    bar([50, 57, 65], [0, 77, 0, 81, 0, 79, 0]), bar([50, 57, 67], [76, 0, 0, 74, 0, 0, 0]),
    bar([43, 50, 59], [0, 71, 74, 0, 76, 0, 79]), bar([45, 52, 60], [81, 0, 0, 76, 0, 0, 0]),
    bar([48, 55, 62], [0, 72, 76, 0, 74, 0, 72]), bar([50, 57, 62], [69, 0, 0, 74, 0, 0, 0]),
    bar([50, 57, 64], [0, 84, 0, 81, 0, 79, 0]), bar([50, 57, 65], [77, 0, 0, 76, 0, 74, 0]),
    bar([43, 50, 59], [0, 71, 0, 74, 0, 79, 0]), bar([50, 57, 62], [76, 0, 0, 69, 0, 0, 0]),
  ] },
  silkPond: { bpm: 67, steps: 8, swing: 0, accompaniment: 'zither', lead: ['triangle', 2.4, .008, .077], bars: [
    bar([55, 59, 62], [79, 0, 81, 0, 83, 0, 0, 0]), bar([52, 55, 59], [76, 0, 0, 74, 0, 71, 0, 0]),
    bar([50, 57, 62], [0, 74, 81, 0, 79, 0, 0, 0]), bar([55, 62, 67], [74, 0, 0, 0, 67, 0, 0, 0]),
    bar([57, 64, 69], [81, 0, 83, 0, 88, 0, 0, 0]), bar([52, 59, 64], [86, 0, 0, 83, 81, 0, 79, 0]),
    bar([55, 59, 62], [0, 71, 74, 0, 76, 0, 0, 0]), bar([50, 57, 62], [81, 0, 0, 79, 74, 0, 0, 0]),
    bar([52, 55, 59], [0, 88, 0, 83, 81, 0, 79, 0]), bar([57, 62, 67], [76, 0, 74, 0, 79, 0, 0, 0]),
    bar([50, 57, 62], [74, 0, 0, 76, 0, 81, 0, 0]), bar([55, 59, 62], [79, 0, 74, 0, 71, 0, 0, 0]),
  ] },
  starlightTroupe: { bpm: 144, steps: 4, swing: 0, accompaniment: 'polka', lead: ['triangle', .89, .015, .089], bars: [
    bar([60, 64, 67], [72, 76, 79, 76]), bar([60, 64, 67], [72, 0, 74, 76]),
    bar([55, 59, 62], [77, 74, 71, 74]), bar([55, 59, 62], [67, 0, 0, 71]),
    bar([53, 57, 60], [72, 77, 81, 77]), bar([53, 57, 60], [76, 0, 77, 79]),
    bar([55, 59, 62], [83, 79, 74, 71]), bar([60, 64, 67], [72, 0, 67, 0]),
    bar([57, 60, 64], [76, 81, 84, 81]), bar([52, 56, 59], [83, 80, 76, 0]),
    bar([57, 60, 64], [84, 83, 81, 79]), bar([53, 57, 60], [77, 0, 72, 0]),
    bar([50, 53, 57], [74, 77, 81, 86]), bar([55, 59, 62], [83, 79, 77, 74]),
    bar([60, 64, 67], [76, 72, 67, 76]), bar([55, 59, 65], [77, 74, 71, 0]),
    bar([60, 64, 67], [84, 79, 76, 79]), bar([53, 57, 60], [81, 77, 72, 77]),
    bar([50, 53, 57], [86, 81, 77, 74]), bar([55, 59, 65], [79, 77, 74, 71]),
  ] },
  glassDistrict: { bpm: 125, steps: 16, stepsPerBeat: 4, swing: 0, accompaniment: 'deepHouse', lead: ['sine', 1.6, .020, .067], bars: [
    bar([42, 49, 57], [0, 0, 81, 0, 0, 0, 76, 0, 0, 78, 0, 0, 0, 0, 0, 0]),
    bar([38, 45, 54], [0, 0, 85, 0, 0, 0, 81, 0, 0, 0, 78, 0, 76, 0, 0, 0]),
    bar([45, 52, 59], [0, 0, 83, 0, 0, 0, 88, 0, 0, 85, 0, 0, 0, 0, 81, 0]),
    bar([47, 54, 57], [0, 0, 0, 0, 0, 0, 81, 0, 0, 78, 0, 0, 76, 0, 0, 0]),
    bar([42, 49, 57], [0, 0, 81, 0, 0, 85, 0, 0, 0, 0, 88, 0, 0, 0, 90, 0]),
    bar([38, 45, 54], [0, 0, 88, 0, 0, 0, 85, 0, 0, 81, 0, 0, 0, 0, 0, 0]),
    bar([40, 47, 56], [0, 0, 80, 0, 0, 0, 83, 0, 0, 0, 86, 0, 85, 0, 0, 0]),
    bar([49, 56, 59], [0, 0, 85, 0, 0, 83, 0, 0, 80, 0, 0, 0, 0, 0, 76, 0]),
    bar([42, 49, 57], [0, 0, 78, 0, 0, 0, 81, 0, 0, 85, 0, 0, 0, 0, 0, 0]),
    bar([45, 52, 59], [0, 0, 88, 0, 0, 0, 85, 0, 0, 0, 81, 0, 0, 0, 83, 0]),
    bar([38, 45, 54], [0, 0, 86, 0, 0, 0, 81, 0, 0, 78, 0, 0, 0, 0, 0, 0]),
    bar([49, 56, 59], [0, 0, 85, 0, 0, 0, 80, 0, 0, 0, 76, 0, 73, 0, 0, 0]),
  ] },
  moonbaseSignal: { bpm: 93, steps: 12, stepsPerBeat: 3, swing: 0, accompaniment: 'cinematic', lead: ['triangle', 4.6, .105, .065], bars: [
    bar([38, 45, 53], [0, 0, 0, 62, 0, 0, 0, 0, 0, 65, 0, 0]),
    bar([38, 45, 51], [0, 0, 0, 61, 0, 0, 0, 0, 0, 63, 0, 0]),
    bar([34, 41, 50], [0, 0, 0, 65, 0, 0, 0, 0, 0, 70, 0, 0]),
    bar([33, 40, 49], [68, 0, 0, 0, 0, 0, 64, 0, 0, 61, 0, 0]),
    bar([38, 45, 53], [0, 0, 0, 74, 0, 0, 0, 0, 0, 69, 0, 0]),
    bar([39, 46, 55], [67, 0, 0, 0, 0, 0, 0, 0, 0, 70, 0, 0]),
    bar([41, 48, 56], [72, 0, 0, 0, 0, 0, 68, 0, 0, 65, 0, 0]),
    bar([40, 46, 49], [0, 0, 0, 73, 0, 0, 0, 0, 0, 70, 0, 0]),
    bar([38, 45, 53], [69, 0, 0, 0, 0, 0, 74, 0, 0, 77, 0, 0]),
    bar([34, 41, 50], [77, 0, 0, 0, 0, 0, 74, 0, 0, 70, 0, 0]),
    bar([39, 46, 55], [67, 0, 0, 0, 0, 0, 70, 0, 0, 67, 0, 0]),
    bar([33, 40, 49], [64, 0, 0, 0, 0, 0, 61, 0, 0, 0, 0, 0]),
  ] },
  harborSocial: { bpm: 106, steps: 8, swing: 0, accompaniment: 'salsa', lead: ['triangle', .98, .023, .080], bars: [
    bar([57, 60, 64], [0, 76, 0, 79, 81, 0, 0, 76]), bar([50, 53, 57], [77, 0, 74, 0, 0, 69, 72, 0]),
    bar([55, 59, 65], [0, 71, 0, 74, 77, 0, 79, 0]), bar([48, 52, 55], [76, 0, 0, 72, 0, 76, 79, 0]),
    bar([53, 57, 60], [0, 81, 0, 84, 0, 81, 77, 0]), bar([54, 57, 60], [78, 0, 0, 81, 0, 84, 81, 0]),
    bar([52, 55, 62], [0, 79, 76, 0, 0, 71, 74, 0]), bar([52, 56, 62], [80, 0, 0, 76, 0, 74, 71, 0]),
    bar([57, 60, 64], [0, 84, 0, 81, 79, 0, 81, 0]), bar([50, 53, 57], [86, 0, 81, 0, 77, 0, 0, 74]),
    bar([55, 59, 65], [0, 79, 0, 83, 0, 86, 83, 0]), bar([52, 56, 62], [80, 0, 0, 76, 0, 74, 68, 0]),
  ] },
  greenCathedral: { bpm: 101, steps: 8, swing: 0, accompaniment: 'baroque', lead: ['triangle', .83, .009, .078], bars: [
    bar([50, 53, 57], [74, 77, 81, 77, 76, 77, 74, 0]), bar([45, 49, 52], [73, 76, 81, 76, 74, 73, 69, 0]),
    bar([46, 50, 53], [70, 74, 77, 82, 81, 77, 74, 0]), bar([41, 45, 48], [69, 72, 77, 81, 79, 76, 72, 0]),
    bar([43, 46, 50], [70, 74, 79, 74, 77, 74, 70, 0]), bar([48, 52, 55], [72, 76, 79, 84, 82, 79, 76, 0]),
    bar([41, 45, 48], [77, 81, 84, 81, 89, 84, 81, 0]), bar([45, 49, 52], [81, 76, 73, 76, 74, 73, 69, 0]),
    bar([50, 53, 57], [0, 62, 65, 69, 0, 72, 69, 65]), bar([48, 52, 55], [0, 64, 67, 71, 0, 72, 76, 72]),
    bar([46, 50, 53], [77, 74, 70, 74, 82, 77, 74, 0]), bar([45, 49, 52], [76, 73, 69, 73, 76, 73, 69, 0]),
  ] },
  beforeFirstTrain: { bpm: 55, steps: 8, swing: 0, accompaniment: 'stringElegy', lead: ['triangle', 3.7, .21, .087], bars: [
    bar([47, 50, 54], [66, 0, 0, 0, 62, 0, 0, 0]), bar([43, 47, 50], [59, 0, 0, 0, 62, 0, 0, 0]),
    bar([50, 54, 57], [69, 0, 0, 0, 66, 0, 0, 0]), bar([45, 49, 52], [64, 0, 0, 0, 61, 0, 0, 0]),
    bar([40, 43, 47], [67, 0, 0, 0, 71, 0, 0, 0]), bar([43, 47, 50], [74, 0, 0, 0, 71, 0, 0, 0]),
    bar([47, 50, 54], [73, 0, 0, 0, 69, 0, 0, 0]), bar([42, 46, 49], [66, 0, 0, 0, 70, 0, 0, 0]),
    bar([47, 50, 54], [71, 0, 0, 0, 74, 0, 0, 0]), bar([45, 49, 52], [76, 0, 0, 0, 73, 0, 0, 0]),
    bar([43, 47, 50], [74, 0, 0, 0, 67, 0, 0, 0]), bar([42, 46, 49], [66, 0, 0, 0, 0, 0, 70, 0]),
  ] },
} as const satisfies Record<string, Arrangement<SessionBacking>>;

export function playSessionBacking(style: SessionBacking, step: number, barIndex: number, interval: number,
  chord: readonly [number, number, number], pitch: number, note: Voice, noise: Percussion) {
  const [root, middle, upper] = chord;
  switch (style) {
    case 'swingJazz':
      if (step % 2 === 0) {
        const bass = [root - 12, middle - 12, upper - 12, upper - 11][step / 2];
        note(bass, .31, .17, 'triangle');
        note(bass + 12, .085, .029, 'sine');
      }
      if (step === 3 || step === 7) {
        for (const key of [middle, upper, root + 10]) note(key, .18, .035, 'triangle');
      }
      if (step === 2 || step === 6) noise(.15, .075, 1700);
      if (step === 3 || step === 5 || step === 7) noise(.06, .055, 5300);
      if (pitch) {
        note(pitch + 12, .24, .027, 'sine', .014);
        note(pitch + 24, .055, .016, 'sine');
      }
      break;
    case 'tango':
      if (step === 0 || step === 3 || step === 4 || step === 6) {
        note((step === 3 ? upper : root) - 12, step === 0 ? .36 : .18, .15, 'triangle', .018);
        noise(.046, step === 0 ? .11 : .052, 690);
      }
      if (step === 0 || step === 4 || step === 7) {
        for (const key of chord) note(key, step === 7 ? .12 : .34, .027, 'sawtooth', .045, undefined, .48);
      }
      if (pitch) note(pitch + 12, interval, .022, 'square', .041, undefined, .37);
      break;
    case 'fluteDrone':
      if (step === 0) {
        note(root - 12, interval * 7.3, .13, 'sine', .35, undefined, .65);
        note(upper - 12, interval * 6.7, .047, 'triangle', .48, undefined, .56);
      }
      if (step === 0 || step === 2 || step === 4) {
        note(41, .16, step === 0 ? .11 : .065, 'sine', .009, 34);
        noise(.08, .038, 800);
      }
      if (pitch) {
        note(pitch + 12, interval * 1.7, .027, 'sine', .139, undefined, .32);
        noise(.12, .026, 1950);
      }
      break;
    case 'zither':
      if (step === 0 || step === 5) note((step === 0 ? root : upper) - 12, .73, .115, 'sine');
      if (step === 1 || step === 4 || step === 6) {
        const pluck = chord[step === 1 ? 0 : step === 4 ? 1 : 2];
        note(pluck, .85, .066, 'triangle');
      }
      if (pitch) {
        note(pitch + 12, .18, .035, 'sine', .006);
        note(pitch + 19, .055, .022, 'triangle', .004, pitch + 18.6);
      }
      break;
    case 'polka':
      if (step === 0) {
        note((barIndex % 2 ? upper : root) - 12, .28, .15, 'triangle');
        note(root, .18, .037, 'triangle');
      }
      if (step === 2) {
        for (const key of chord) note(key + 12, .132, .029, 'sawtooth', .018, undefined, .35);
        noise(.07, .093, 2250);
      }
      if (step === 1 || step === 3) noise(.045, .045, 5700);
      if (pitch) note(pitch + 12, interval * .76, .025, 'square', .017);
      break;
    case 'deepHouse':
      if (step % 4 === 0) note(41, .23, .23, 'sine', .004, 29);
      if (step === 4 || step === 12) noise(.115, .10, 1740);
      if (step % 4 === 2) {
        const bass = (step === 14 ? upper : root) - 12;
        note(bass, interval * 1.65, .155, 'sine', .012, undefined, .28);
        note(bass + 12, interval * 1.3, .036, 'triangle');
        noise(.085, .061, 6700);
      }
      if (step === 3 || step === 10) {
        for (const key of [middle, upper, root + 14]) note(key, .31, .035, 'triangle', .047, undefined, .35);
      }
      if (pitch) note(pitch + 12, .15, .023, 'triangle');
      break;
    case 'cinematic':
      if (step === 0) {
        note(root - 12, interval * 12, .135, 'sine', .34, undefined, .68);
        note(upper, interval * 10, .022, 'sawtooth', .51, undefined, .68);
      }
      if (step % 3 === 0) note((step === 6 ? middle : root) - 12, .23, .081, 'triangle', .07);
      if (step === 0 || step === 7 || (step === 10 && barIndex % 2 !== 0)) {
        note(step === 0 ? 43 : 49, .29, .125, 'sine', .007, 31);
        noise(.18, .066, step === 0 ? 480 : 1100);
      }
      if (pitch) note(pitch - 12, interval * 3.8, .039, 'sawtooth', .17, undefined, .58);
      break;
    case 'salsa': {
      // Alternate the three-stroke and two-stroke measures of son clave.
      const clave = barIndex % 2 ? [2, 4] : [0, 3, 6];
      if (clave.includes(step)) {
        note(85, .044, .078, 'triangle', .003, 82);
        noise(.039, .057, 2240);
      }
      if (step === 3 || step === 6) note((step === 6 ? root : upper) - 12, .31, .145, 'sine');
      if (step % 2) {
        const keys = step % 4 === 1 ? [middle, upper] : [root + 12, upper];
        for (const key of keys) note(key, .16, .057, 'triangle', .012);
        note(step === 7 ? 49 : 55, .096, .083, 'sine', .005, 44);
      }
      if (pitch) note(pitch, interval * .72, .028, 'sawtooth', .018, undefined, .3);
      break;
    }
    case 'baroque':
      if (step === 0 || step === 4) note((step === 0 ? root : upper) - 12, interval * 3.2, .13, 'triangle');
      note([root, upper, middle, upper, middle, root, middle, upper][step], .19, .055, 'triangle', .006);
      if (pitch) {
        note(pitch + 12, .082, .036, 'triangle', .004);
        note(pitch + 19, .061, .019, 'sine', .004);
      }
      break;
    case 'stringElegy':
      if (step === 0) {
        note(root - 12, interval * 8.2, .13, 'triangle', .49, undefined, .69);
        note(middle - 12, interval * 7.6, .052, 'sine', .55, undefined, .72);
      }
      if (step === 4) note(upper - 12, interval * 3.8, .069, 'triangle', .39, undefined, .65);
      if (pitch) {
        note(pitch - 12, interval * 3.75, .028, 'sawtooth', .29, undefined, .71);
        note(pitch + .042, interval * 3.45, .032, 'sine', .34, pitch - .04, .74);
      }
      break;
  }
}
