import type Phaser from 'phaser';
import art from '../assets/round-announcements.webp';
import { countdownCue, outcomeDuration } from './round-cues.ts';
import type { OutcomeCue, RoundCue } from './round-cues.ts';

const textureKey = 'round-announcements';
const frames: Record<RoundCue, number> = { '3': 0, '2': 0, '1': 0, go: 1, victory: 2, success: 2, defeat: 3, finished: 3 };
const colors: Record<RoundCue, string> = {
  '3': '#f5eeff', '2': '#f5eeff', '1': '#f5eeff', go: '#fff5ac',
  victory: '#fff2b3', success: '#fff2b3', defeat: '#ffe0f4', finished: '#eeeaff',
};

export type RoundAnnouncement = {
  beginsAt: number;
  ending?: { cue: OutcomeCue; at: number };
  labels: Record<RoundCue, string>;
};

export function preloadRoundAnnouncement(scene: Phaser.Scene) {
  scene.load.spritesheet(textureKey, art, { frameWidth: 512, frameHeight: 512 });
}

export function createRoundAnnouncement(scene: Phaser.Scene, x: number, y: number, width: number, sound: (cue: RoundCue) => boolean) {
  const badge = scene.add.image(0, 0, textureKey).setDisplaySize(width * .82, width * .82);
  const label = scene.add.text(0, width * .013, '', {
    fontFamily: 'system-ui, sans-serif', fontStyle: '900', stroke: '#18112c', strokeThickness: 5,
  }).setOrigin(.5).setShadow(0, 2, '#241146', 4, false, true);
  const group = scene.add.container(x, y, [badge, label]).setDepth(1000).setVisible(false);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let played = '';

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
    if (label.text !== copy) {
      badge.setFrame(frames[cue]);
      const fontSize = width * (/^\d$/.test(cue) ? .145 : .114);
      label.setText(copy).setColor(colors[cue]).setFontSize(fontSize);
      if (label.width > width * .57) label.setFontSize(fontSize * width * .57 / label.width);
    }
    const enter = Math.min(1, elapsed / 260);
    const exit = Math.max(0, Math.min(1, (duration - elapsed) / 155));
    const offset = enter - 1;
    const overshoot = 1 + 2.9 * offset ** 3 + 1.9 * offset ** 2;
    group.setVisible(true).setAlpha(Math.min(1, elapsed / 85) * exit)
      .setScale(reduceMotion.matches ? 1 : (.54 + .46 * overshoot) * (.93 + .07 * exit));
  };
}
