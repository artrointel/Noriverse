import type Phaser from 'phaser';
import art from '../assets/round-announcements.webp';
import fontUrl from '../assets/round-announce-noto-kr.ttf';
import { countdownCue, outcomeDuration } from './round-cues.ts';
import type { OutcomeCue, RoundCue } from './round-cues.ts';

const textureKey = 'round-announcements';
const frameWidth = 512;
const frameHeight = 160;
const fontName = 'Noriverse Round';
const fontStack = `"${fontName}", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
const frames: Record<RoundCue, number> = { '3': 0, '2': 0, '1': 0, go: 1, victory: 2, success: 2, defeat: 3, finished: 3 };
const colors: Record<RoundCue, string> = {
  '3': '#f5f7fa', '2': '#f5f7fa', '1': '#f5f7fa', go: '#dbf5e7',
  victory: '#fff3e2', success: '#fff3e2', defeat: '#f7eef3', finished: '#f4f1f8',
};
let fontReady: Promise<void> | undefined;

export function loadRoundAnnouncementFont() {
  return fontReady ??= new FontFace(fontName, `url("${fontUrl}")`, { weight: '700' }).load()
    .then(font => { document.fonts.add(font); })
    .catch(() => { /* The local font stack still covers both languages. */ });
}

export type RoundAnnouncement = {
  beginsAt: number;
  ending?: { cue: OutcomeCue; at: number };
  labels: Record<RoundCue, string>;
};

export function preloadRoundAnnouncement(scene: Phaser.Scene) {
  scene.load.spritesheet(textureKey, art, { frameWidth, frameHeight });
}

function paintLabel(texture: Phaser.Textures.CanvasTexture, cue: RoundCue, copy: string) {
  const context = texture.getContext();
  const digit = /^\d$/.test(cue);
  const maxWidth = frameWidth * .67;
  context.clearRect(0, 0, frameWidth, frameHeight);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  if ('letterSpacing' in context) context.letterSpacing = digit || /[^\u0000-\u007F]/.test(copy) ? '0px' : '1.6px';
  let fontSize = digit ? 94 : 75;
  context.font = `700 ${fontSize}px ${fontStack}`;
  let metrics = context.measureText(copy);
  const inkWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
  if (inkWidth > maxWidth) {
    fontSize *= maxWidth / inkWidth;
    context.font = `700 ${fontSize}px ${fontStack}`;
    metrics = context.measureText(copy);
  }
  // Center the painted glyphs, independent of the font's line box and language.
  const x = (frameWidth + metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
  const y = (frameHeight + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
  context.fillStyle = colors[cue];
  context.fillText(copy, x, y);
  texture.refresh();
}

export function createRoundAnnouncement(scene: Phaser.Scene, x: number, y: number, width: number, sound: (cue: RoundCue) => boolean) {
  const displayWidth = width * .71;
  const displayHeight = displayWidth * frameHeight / frameWidth;
  const badge = scene.add.image(0, 0, textureKey, 0).setDisplaySize(displayWidth, displayHeight);
  const labelTexture = scene.textures.createCanvas('round-announcement-label', frameWidth, frameHeight)!;
  const label = scene.add.image(0, 0, labelTexture).setDisplaySize(displayWidth, displayHeight);
  const group = scene.add.container(x, y, [badge, label]).setDepth(1000).setVisible(false);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let played = '';
  let painted = '';

  return (announcement: RoundAnnouncement | undefined) => {
    const now = Date.now();
    const timing = announcement?.ending
      ? { ...announcement.ending, duration: outcomeDuration }
      : announcement && countdownCue(announcement.beginsAt, now);
    if (!announcement || !timing || now < timing.at || now - timing.at >= timing.duration) {
      group.setVisible(false);
      return;
    }
    const { cue, at, duration } = timing;
    const elapsed = Math.max(0, now - at);
    const key = cue + '/' + at;
    if (key !== played && elapsed < 550 && sound(cue)) played = key;
    const copy = announcement.labels[cue];
    const paintKey = cue + '/' + copy;
    if (painted !== paintKey) {
      badge.setFrame(frames[cue]);
      paintLabel(labelTexture, cue, copy);
      painted = paintKey;
    }
    const enter = Math.min(1, elapsed / 230);
    const exit = Math.min(1, (duration - elapsed) / 160);
    const lift = (1 - enter) ** 3;
    group.setVisible(true).setAlpha(Math.min(1, elapsed / 100) * exit)
      .setY(reduceMotion.matches ? y : y + width * .026 * lift - width * .012 * (1 - exit))
      .setScale(reduceMotion.matches ? 1 : 1 - .045 * lift);
  };
}
