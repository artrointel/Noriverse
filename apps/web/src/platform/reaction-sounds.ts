import type { DefaultEmoji, Emoji } from '../../../../packages/protocol/reactions.ts';

type Note = [at: number, length: number, start: number, end: number, gain: number, voice?: 'coo' | 'bell'];
type Noise = [at: number, length: number, gain: number, center: number];
type Cue = { notes: Note[]; noise?: Noise[] };

const cues: Record<DefaultEmoji, Cue> = {
  smile: { notes: [[0, .11, 495, 570, .09, 'coo'], [.102, .19, 625, 738, .10, 'coo']] },
  laugh: { notes: [[0, .105, 586, 510, .11, 'coo'], [.103, .093, 654, 548, .13, 'coo'],
    [.195, .10, 716, 567, .11, 'coo'], [.297, .15, 594, 474, .075, 'coo']], noise: [[.02, .049, .025, 1100], [.20, .049, .021, 1350]] },
  surprise: { notes: [[0, .16, 360, 860, .13, 'coo'], [.112, .19, 870, 788, .066, 'bell']], noise: [[0, .075, .035, 1600]] },
  thinking: { notes: [[0, .22, 391, 365, .10, 'coo'], [.22, .22, 365, 486, .082, 'coo'], [.34, .11, 728, 705, .038, 'bell']] },
  sad: { notes: [[0, .17, 525, 680, .091, 'coo'], [.126, .27, 680, 465, .11, 'coo'],
    [.34, .23, 470, 348, .065, 'coo']], noise: [[0, .068, .018, 1290], [.35, .105, .016, 1000]] },
  anger: { notes: [[0, .115, 401, 284, .103, 'coo'], [.138, .17, 447, 324, .105, 'coo']], noise: [[.029, .10, .054, 1250], [.18, .117, .062, 1550]] },
  hearts: { notes: [[0, .21, 660, 668, .083, 'bell'], [.091, .24, 831, 831, .084, 'bell'], [.19, .33, 990, 989, .075, 'bell'], [.253, .25, 1320, 1316, .044, 'bell']] },
  clap: { notes: [[0, .047, 602, 410, .055], [.107, .046, 660, 445, .055], [.214, .049, 640, 445, .057]],
    noise: [[0, .068, .25, 1900], [.107, .075, .24, 2100], [.214, .085, .22, 1770]] },
  thumbsUp: { notes: [[0, .072, 275, 505, .086], [.054, .20, 755, 785, .09, 'bell'], [.098, .15, 988, 988, .051, 'bell']] },
  handshake: { notes: [[0, .069, 325, 306, .083], [.084, .085, 375, 337, .081], [.164, .17, 580, 631, .064, 'bell']],
    noise: [[0, .077, .07, 920], [.084, .084, .064, 1260]] },
  fire: { notes: [[0, .105, 246, 470, .068], [.095, .058, 767, 678, .048], [.155, .075, 895, 617, .045]],
    noise: [[0, .25, .10, 1250], [.04, .042, .13, 3140], [.11, .04, .092, 2460], [.17, .061, .073, 2900]] },
  celebrate: { notes: [[0, .075, 302, 539, .09], [.063, .17, 588, 588, .09, 'bell'], [.154, .19, 740, 740, .09, 'bell'],
    [.245, .28, 880, 880, .095, 'bell'], [.25, .25, 1175, 1175, .048, 'bell']], noise: [[0, .16, .17, 2470]] },
};

type Tone = (at: number, start: number, length: number, gain: number, wave: OscillatorType, end: number, attack: number, sustain?: number) => void;
type Texture = (at: number, length: number, gain: number, center: number) => void;

export function playReactionCue(emoji: Emoji, tone: Tone, texture: Texture) {
  if (!Object.hasOwn(cues, emoji)) return;
  const cue = cues[emoji as DefaultEmoji];
  for (const [at, length, start, end, gain, voice] of cue.notes) {
    tone(at, start, length, gain, 'sine', end, voice === 'coo' ? .02 : .006, voice === 'coo' ? .48 : undefined);
    if (voice === 'coo') {
      tone(at, start * 2, length * .94, gain * .29, 'triangle', end * 2, .027, .4);
      tone(at + .012, start * 3, length * .72, gain * .12, 'sine', end * 3, .022);
    } else if (voice === 'bell') {
      tone(at, start * 2.01, length * .65, gain * .24, 'sine', end * 2.01, .005);
    }
  }
  for (const burst of cue.noise ?? []) texture(...burst);
}
