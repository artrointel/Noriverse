import type Phaser from 'phaser';
import sprites from '../../assets/sichuan-combo.webp';

const texture = 'sichuan-combo';
const frame = (x: number, y: number, w: number, h: number) => ({ frame: { x, y, w, h } });
const frames = {
  word: frame(16, 4, 528, 146),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [String(digit),
    frame(6 + digit % 5 * 110, 158 + Math.floor(digit / 5) * 124, 108, 120)])),
};

export function loadComboBanner(scene: Phaser.Scene) {
  scene.load.atlas(texture, sprites, { frames });
}

export function createComboBanner(scene: Phaser.Scene) {
  const centerX = 240, centerY = 109;
  const size = .5, opacity = .7;
  const sparks = scene.add.graphics().setDepth(5).setPosition(centerX, centerY).setScale(size).setAlpha(opacity);
  const banner = scene.add.container(centerX, centerY).setDepth(6).setVisible(false);
  const animation = { progress: 0 };

  function play(count: number, reduced: boolean) {
    scene.tweens.killTweensOf(animation);
    banner.removeAll(true);
    const digits = String(count).split('');
    const start = -(digits.length * 50 + 156) / 2;
    digits.forEach((digit, index) => {
      banner.add(scene.add.image(start + index * 50 + 25, -2, texture, digit).setDisplaySize(61.2, 68));
    });
    banner.add(scene.add.image(start + digits.length * 50 + 78, 5, texture, 'word').setDisplaySize(168, 46.45));
    banner.setVisible(true);
    animation.progress = 0;
    const intensity = Math.min(1, (count - 2) / 8);
    const particles = Array.from({ length: 14 + Math.round(intensity * 12) }, (_, index) => ({
      angle: index * 2.39996,
      reach: 52 + index % 6 * 9 + intensity * 28,
      color: [0xffe58f, 0xff8762, 0xffb241, 0xfff9e8][index % 4],
    }));

    function paint() {
      const p = animation.progress;
      const exit = Math.max(0, (p - .68) / .32);
      sparks.clear();
      if (reduced) {
        sparks.fillStyle(0x28162f, .8 * (1 - exit)).fillRoundedRect(start - 16, -39, -start * 2 + 32, 78, 22);
        banner.setPosition(centerX, centerY).setScale(size).setAngle(0).setAlpha(opacity * (1 - exit));
        return;
      }

      const entrance = Math.min(1, p / .24);
      const spring = 1 + 2.4 * (entrance - 1) ** 3 + 1.4 * (entrance - 1) ** 2;
      banner.setPosition(centerX + exit * 16 * size, centerY + ((1 - entrance) * 35 - exit ** 2 * 40) * size)
        .setAngle(-11 * (1 - entrance) + exit * 10).setScale((.35 + spring * .65 + .28 * exit) * size)
        .setAlpha(opacity * Math.min(1, p * 15) * (1 - exit ** 1.35));
      const ringEase = 1 - (1 - p) ** 3;
      sparks.fillStyle(0x341630, .67 * Math.min(1, p * 14) * (1 - exit)).fillEllipse(0, 2, 238 + intensity * 24, 76);
      sparks.lineStyle(2.5 + intensity, 0xffd078, .7 * (1 - p) ** 2)
        .strokeEllipse(0, 0, 40 + ringEase * 245, 25 + ringEase * 100);
      for (const { angle, reach, color } of particles) {
        const x = Math.cos(angle) * (44 + ringEase * reach * 1.33);
        const y = Math.sin(angle) * (23 + ringEase * reach * .65);
        const radius = (2.5 + intensity * 2) * (1 - p);
        sparks.fillStyle(color, (1 - p) ** 1.2)
          .fillTriangle(x - radius, y, x, y - radius * 1.7, x + radius, y)
          .fillTriangle(x - radius, y, x, y + radius * 1.7, x + radius, y);
      }
    }

    paint();
    scene.tweens.add({ targets: animation, progress: 1, duration: 820, onUpdate: paint,
      onComplete: () => { sparks.clear(); banner.setVisible(false); banner.removeAll(true); } });
  }

  return play;
}
