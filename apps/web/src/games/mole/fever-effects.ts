import type Phaser from 'phaser';
import koreanTitle from '../../assets/mole/fever-ko.webp';
import englishTitle from '../../assets/mole/fever-en.webp';
import { tableSize } from '../table.ts';
import { feverDuration } from './rules.ts';

const titleDuration = 500;
const center = tableSize / 2;
const rays = Array.from({ length: 28 }, (_, index) => {
  const angle = index * Math.PI * 2 / 28 + Math.sin(index * 4.1) * .033;
  return { x: Math.cos(angle), y: Math.sin(angle), rate: 410 + index % 5 * 90, phase: (index * 67) % 251, length: 22 + index % 4 * 14 };
});

export function loadFeverEffects(scene: Phaser.Scene) {
  scene.load.image('mole-fever-ko', koreanTitle);
  scene.load.image('mole-fever-en', englishTitle);
}

export function createFeverEffects(scene: Phaser.Scene) {
  const light = scene.add.rectangle(center, center, tableSize, tableSize, 0xffd990)
    .setBlendMode('ADD').setDepth(81).setVisible(false);
  const trails = scene.add.graphics().setBlendMode('ADD').setDepth(82).setVisible(false);
  const title = scene.add.image(center, center, 'mole-fever-ko').setDepth(83).setVisible(false);
  let titleLanguage: string | undefined;

  return (remaining: number, time: number, language: 'ko' | 'en', motion: boolean) => {
    const active = remaining > 0;
    const age = feverDuration - remaining;
    light.setVisible(active);
    trails.setVisible(active && motion);
    title.setVisible(active && age >= 0 && age < titleDuration);
    if (!active) return;
    const intensity = Math.min(1, Math.max(0, age / titleDuration), remaining / 230);
    light.setAlpha(intensity * (motion ? .15 : .09));
    if (title.visible) {
      if (titleLanguage !== language) {
        title.setTexture('mole-fever-' + language);
        titleLanguage = language;
      }
      const enter = Math.min(1, age / 125);
      const scale = motion ? .83 + .22 * (1 - (1 - enter) ** 3) - .05 * Math.min(1, Math.max(0, age - 125) / 90) : 1;
      const width = tableSize * .76 * scale;
      title.setDisplaySize(width, width * title.height / title.width)
        .setAlpha(motion ? Math.min(1, age / 45, (titleDuration - age) / 110) : 1);
    }
    if (!motion) return;
    trails.clear();
    for (const [index, ray] of rays.entries()) {
      const distance = 151 + (time * ray.rate / 1000 + ray.phase) % 166;
      const end = distance + ray.length, fade = Math.sin((distance - 151) / 166 * Math.PI);
      trails.lineStyle(index % 4 === 0 ? 2.2 : 1.1, index % 3 ? 0xffcc81 : 0x80ecff, intensity * fade * .47);
      trails.beginPath().moveTo(center + ray.x * distance, center + ray.y * distance)
        .lineTo(center + ray.x * end, center + ray.y * end).strokePath();
    }
  };
}
