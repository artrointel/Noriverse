import type Phaser from 'phaser';
import type { SichuanTheme } from './options.ts';

type Graphics = Phaser.GameObjects.Graphics;
type Point = readonly [x: number, y: number];
type ParticleShape = 'pixel' | 'crumb' | 'paw' | 'bolt' | 'ribbon' | 'paper' | 'digit';
type Skin = {
  colors: readonly [main: number, accent: number, highlight: number];
  shape: ParticleShape;
  lift: number;
  spread: number;
  spin: number;
  collapse: readonly [x: number, y: number];
  pull: number;
};

const skins: Record<SichuanTheme, Skin> = {
  pixel: { colors: [0xaa72ff, 0x66e9f7, 0xffec9c], shape: 'pixel', lift: 0, spread: 22, spin: 0, collapse: [.34, .34], pull: 0 },
  food: { colors: [0xf77f86, 0xffbf65, 0xffefce], shape: 'crumb', lift: -23, spread: 10, spin: 21, collapse: [.75, .36], pull: 1.7 },
  animals: { colors: [0x65c68e, 0xffd37c, 0xeaffce], shape: 'paw', lift: -27, spread: 16, spin: 14, collapse: [.61, .64], pull: 1.1 },
  electronics: { colors: [0x36dbff, 0x72fff0, 0xe6fcff], shape: 'bolt', lift: -7, spread: 13, spin: 0, collapse: [.92, .08], pull: -.5 },
  flags: { colors: [0xf37491, 0x80a9ff, 0xffe58a], shape: 'ribbon', lift: -19, spread: 24, spin: 38, collapse: [.28, .74], pull: .75 },
  school: { colors: [0x9978e2, 0x75cfc6, 0xfff3cf], shape: 'paper', lift: -26, spread: 18, spin: 54, collapse: [.58, .16], pull: -.45 },
  numbers: { colors: [0xef7fcf, 0x79cfff, 0xffed8b], shape: 'digit', lift: -34, spread: 9, spin: 12, collapse: [.53, .74], pull: -.8 },
};

type Particle = { x: number; y: number; vx: number; vy: number; spin: number; size: number; color: number; digit: number };
type Burst = { points: readonly Point[]; born: number; duration: number; power: number; particles: Particle[] };
const segments = [[-1, -2, 1, -2], [1, -2, 1, 0], [1, 0, 1, 2], [-1, 2, 1, 2],
  [-1, 0, -1, 2], [-1, -2, -1, 0], [-1, 0, 1, 0]] as const;
const digits = [63, 6, 91, 79, 102, 109, 125, 7, 127, 111];
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function paintParticle(layer: Graphics, shape: ParticleShape, dot: Particle, age: number, pull: number) {
  const travel = easeOut(age);
  const pixelStep = shape === 'pixel' ? 3 : 0;
  let x = dot.x + dot.vx * travel;
  let y = dot.y + dot.vy * travel + 22 * pull * age ** 2;
  if (pixelStep) {
    x = Math.round(x / pixelStep) * pixelStep;
    y = Math.round(y / pixelStep) * pixelStep;
  }
  const alpha = (1 - age) ** .65;
  const r = dot.size * (1 - age * .6);
  const angle = dot.spin * age;
  const ux = Math.cos(angle) * r, uy = Math.sin(angle) * r;
  const vx = -uy, vy = ux;
  layer.fillStyle(dot.color, alpha);
  switch (shape) {
    case 'pixel':
      layer.fillRect(x - r, y - r, r * 2, r * 2);
      return;
    case 'crumb':
      layer.fillCircle(x, y, r * .74).fillCircle(x - r, y + r * .82, r * .24);
      return;
    case 'paw':
      layer.fillCircle(x, y + r * .35, r * .6);
      for (const toe of [-1, 0, 1]) layer.fillCircle(x + toe * r * .7, y - r * (.75 - Math.abs(toe) * .2), r * .28);
      return;
    case 'bolt':
      layer.lineStyle(Math.max(1, r * .5), dot.color, alpha).beginPath()
        .moveTo(x - ux * 1.5, y - uy * 1.5).lineTo(x - vx * .65, y - vy * .65)
        .lineTo(x + vx * .6, y + vy * .6).lineTo(x + ux * 1.7, y + uy * 1.7).strokePath();
      return;
    case 'digit':
      layer.lineStyle(Math.max(.8, r * .27), dot.color, alpha);
      segments.forEach(([x1, y1, x2, y2], i) => {
        if (digits[dot.digit] & (1 << i)) layer.lineBetween(x + x1 * r * .52, y + y1 * r * .52, x + x2 * r * .52, y + y2 * r * .52);
      });
      return;
    default: {
      const width = shape === 'ribbon' ? .28 : .68;
      const length = shape === 'ribbon' ? 1.5 : 1;
      layer.fillTriangle(x - ux * length, y - uy * length, x + vx * width, y + vy * width, x + ux * length, y + uy * length);
      layer.fillTriangle(x - ux * length, y - uy * length, x - vx * width, y - vy * width, x + ux * length, y + uy * length);
      if (shape === 'paper') {
        layer.lineStyle(.7, 0x584577, alpha * .65).lineBetween(x - ux * .52, y - uy * .52, x + ux * .41, y + uy * .41);
      }
    }
  }
}

export function createSichuanEffects(scene: Phaser.Scene, theme: SichuanTheme, tilePitch: number) {
  const skin = skins[theme];
  const layer = scene.add.graphics().setDepth(3);
  const bursts: Burst[] = [];
  const scale = tilePitch / 50;

  return {
    emit(points: readonly Point[], combo: number, now: number, reduced: boolean) {
      const power = Math.min(combo, 9);
      const particles: Particle[] = [];
      if (!reduced) {
        const count = 6 + power * 2;
        for (const [x, y] of [points[0], points[points.length - 1]]) {
          for (let index = 0; index < count; index++) {
            const angle = index / count * Math.PI * 2 + Math.random() * .35;
            const travel = scale * (18 + power * 3 + Math.random() * 24);
            particles.push({ x, y, vx: Math.cos(angle) * travel, vy: Math.sin(angle) * travel,
              size: Math.max(1.55, scale * (2.2 + power * .13 + Math.random() * 2)), spin: angle + Math.random() * 6,
              color: skin.colors[index % skin.colors.length], digit: index % 10 });
          }
        }
      }
      bursts.push({ points, born: now, duration: reduced ? 185 : 420 + power * 32, power, particles });
      if (bursts.length > 5) bursts.shift();
    },
    depart(container: Phaser.GameObjects.Container, direction: number, combo: number) {
      const power = Math.min(combo, 9);
      const { x, y, angle, scaleX, scaleY } = container;
      scene.tweens.add({ targets: container, x: x + direction * skin.spread * scale, y: y + skin.lift * scale,
        angle: angle + direction * skin.spin, scaleX: scaleX * skin.collapse[0], scaleY: scaleY * skin.collapse[1],
        alpha: 0, duration: 255 + power * 18, ease: theme === 'food' ? 'Back.Out' : 'Cubic.Out',
        onComplete: () => container.destroy() });
    },
    update(now: number) {
      if (!bursts.length) return;
      layer.clear();
      for (let index = bursts.length - 1; index >= 0; index--) {
        const burst = bursts[index];
        const age = (now - burst.born) / burst.duration;
        if (age >= 1) { bursts.splice(index, 1); continue; }
        const { points, power, particles } = burst;
        const alpha = (1 - age) ** 1.55;
        for (const [width, color, opacity] of [[8 + power, skin.colors[0], .16], [3 + power * .36, skin.colors[1], .78], [1.25, skin.colors[2], 1]]) {
          layer.lineStyle(width, color, alpha * opacity).beginPath().moveTo(...points[0]);
          for (let point = 1; point < points.length; point++) layer.lineTo(...points[point]);
          layer.strokePath();
        }
        if (particles.length > 0) {
          for (const [x, y] of [points[0], points[points.length - 1]]) {
            layer.lineStyle(1.1, skin.colors[1], alpha * .8).strokeCircle(x, y, scale * (8 + (14 + power * 2.5) * easeOut(age)));
            if (power >= 4) layer.lineStyle(1.45, skin.colors[2], alpha * .6).strokeCircle(x, y, scale * (5 + (12 + power) * easeOut(age)));
          }
          for (const particle of particles) paintParticle(layer, skin.shape, particle, age, skin.pull);
        }
      }
    },
  };
}
