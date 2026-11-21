import pixelArt from '../assets/round-cues-pixel.webp';
import { countdownCue, outcomeDuration } from './round-cues.ts';
import type { OutcomeCue, RoundCue } from './round-cues.ts';

const atlas = { src: pixelArt, columns: 4, rows: 3, frameWidth: 512, frameHeight: 192 };
const columns: Record<RoundCue, number> = { '3': 0, '2': 1, '1': 2, go: 3, victory: 0, defeat: 1, success: 2, finished: 3 };
let assetsReady: Promise<void> | undefined;

export function loadRoundAnnouncementAssets() {
  if (assetsReady) return assetsReady;
  const image = new Image();
  image.src = atlas.src;
  assetsReady = image.decode().catch(() => { assetsReady = undefined; });
  return assetsReady;
}

export type RoundAnnouncement = {
  beginsAt: number;
  ending?: { cue: OutcomeCue; at: number };
  language: 'en' | 'ko';
  labels: Record<RoundCue, string>;
};

export function createRoundAnnouncement(parent: HTMLElement, sound: (cue: RoundCue) => boolean) {
  const art = document.createElement('div');
  art.className = 'round-announcement';
  art.setAttribute('role', 'img');
  art.hidden = true;
  art.style.backgroundImage = `url("${atlas.src}")`;
  art.style.backgroundSize = `${atlas.columns * 100}% ${atlas.rows * 100}%`;
  art.style.aspectRatio = `${atlas.frameWidth} / ${atlas.frameHeight}`;
  parent.append(art);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let played = '';
  let painted = '';

  function render(announcement: RoundAnnouncement | undefined) {
    const now = Date.now();
    const timing = announcement?.ending
      ? { ...announcement.ending, duration: outcomeDuration }
      : announcement && countdownCue(announcement.beginsAt, now);
    if (!announcement || !timing || now < timing.at || now - timing.at >= timing.duration) {
      art.hidden = true;
      return;
    }
    const { cue, at, duration } = timing;
    const elapsed = now - at;
    const key = cue + '/' + at;
    if (key !== played && elapsed < 550 && sound(cue)) played = key;
    const row = announcement.ending ? (announcement.language === 'ko' ? 2 : 1) : 0;
    const frame = row + '/' + cue;
    if (painted !== frame) {
      art.style.backgroundPosition = `${columns[cue] / (atlas.columns - 1) * 100}% ${row / (atlas.rows - 1) * 100}%`;
      art.setAttribute('aria-label', announcement.labels[cue]);
      art.dataset.cue = cue;
      painted = frame;
    }
    const enter = Math.min(1, elapsed / 185), exit = Math.min(1, (duration - elapsed) / 130);
    const settle = 1 - enter;
    const scale = 1 - .55 * settle ** 3 + .19 * settle ** 2;
    art.hidden = false;
    art.style.opacity = String(Math.min(1, elapsed / 70) * exit);
    art.style.setProperty('--cue-shift', (motion.matches ? 0 : 10 * settle ** 2 - 7 * (1 - exit)) + '%');
    art.style.setProperty('--cue-scale', String(motion.matches ? 1 : scale));
  }

  return { render, destroy: () => art.remove() };
}
