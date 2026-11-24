import Phaser from 'phaser';
import type { CupSize, DrinkKind } from './rules.ts';
import { drinkKinds } from './rules.ts';

export const kitchenShade = 'burger-surface-shade';
export const kitchenCup = 'burger-cup';
export const pattyOilTexture = 'burger-patty-oil';
export const pattyOilGlint = 'burger-patty-oil-glint';
export const burgerFoodFrames = { bunTop: 0, bun: 1, riceTop: 2, rice: 3, cheese: 4, lettuce: 5, onion: 6,
  pickle: 7, tomato: 8, egg: 9, bacon: 10, wrap: 11 } as const;
export const assemblerArt = {
  texture: 'burger-assembler', frameWidth: 224, frameHeight: 280,
  waiting: 0, assembling: 1, cooldown: 2,
} as const;
const textureSize = 64;
const fillLevels = { small: .36, medium: .61, large: .87 } as const;

export function cupTexture(kind?: DrinkKind, size?: CupSize) {
  return kind && size ? kitchenCup + '-' + kind + '-' + size : kitchenCup;
}

export function createKitchenArt(scene: Phaser.Scene) {
  const shade = scene.textures.createCanvas(kitchenShade, textureSize, textureSize);
  if (shade) {
    const context = shade.getContext();
    const pixels = context.createImageData(textureSize, textureSize);
    for (let y = 0; y < textureSize; y++) {
      for (let x = 0; x < textureSize; x++) {
        const u = (x + .5) / textureSize * 2 - 1;
        const v = (y + .5) / textureSize * 2 - 1;
        // A short contact lobe anchors the sprite. The broader lobe falls away from the upper-left light.
        const ambient = Math.max(0, 1 - ((u - .12) / .87) ** 2 - ((v - .18) / .78) ** 2) ** 1.7;
        const contact = Math.max(0, 1 - ((u + .09) / .66) ** 2 - ((v + .03) / .45) ** 2) ** 1.6;
        const i = (y * textureSize + x) * 4;
        pixels.data[i] = 17;
        pixels.data[i + 1] = 11;
        pixels.data[i + 2] = 22;
        pixels.data[i + 3] = (1 - (1 - .55 * ambient) * (1 - .89 * contact)) * 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    shade.refresh();
  }
  paintCup(scene, kitchenCup);
  paintOilTexture(scene, pattyOilTexture, false);
  paintOilTexture(scene, pattyOilGlint, true);
  for (const kind of drinkKinds) {
    for (const size of Object.keys(fillLevels) as CupSize[]) paintCup(scene, cupTexture(kind, size), kind, fillLevels[size]);
  }
}

function paintOilTexture(scene: Phaser.Scene, key: string, glint: boolean) {
  const size = 32;
  const texture = scene.textures.createCanvas(key, size, size);
  if (!texture) return;
  const ctx = texture.getContext();
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) / size * 2 - 1;
      const v = (y + .5) / size * 2 - 1;
      const edge = Math.max(0, 1 - u * u - v * v);
      const curve = v + .55 * u * u - .18;
      const highlight = Math.exp(-9 * curve * curve) * (.78 + .22 * Math.cos(u * 7));
      const offset = (y * size + x) * 4;
      pixels.data.set([255, glint ? 229 : 201, glint ? 170 : 119,
        glint ? edge * (26 + 155 * highlight) : Math.min(1, edge * 2.5) * 20], offset);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export function pattyShadowTexture(scene: Phaser.Scene, frame: Phaser.Textures.Frame) {
  const key = 'burger-patty-shade-' + frame.name;
  if (scene.textures.exists(key)) return key;
  const shade = scene.textures.createCanvas(key, textureSize, textureSize);
  if (!shade) return kitchenShade;
  const context = shade.getContext();
  context.filter = 'blur(2px)';
  context.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
    0, 0, textureSize, textureSize);
  context.filter = 'none';
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = '#1b1119';
  context.fillRect(0, 0, textureSize, textureSize);
  context.globalCompositeOperation = 'source-over';
  shade.refresh();
  shade.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

function paintCup(scene: Phaser.Scene, key: string, kind?: DrinkKind, level = 0) {
  const texture = scene.textures.createCanvas(key, textureSize, textureSize);
  if (!texture) return;
  const ctx = texture.getContext();
  const glass = new Path2D('M10 12 Q10 6 32 6 Q54 6 54 12 L47 54 Q46 60 32 60 Q18 60 17 54 Z');
  const sides = ctx.createLinearGradient(10, 0, 54, 0);
  sides.addColorStop(0, 'rgba(218, 246, 255, .78)');
  sides.addColorStop(.22, 'rgba(191, 216, 232, .39)');
  sides.addColorStop(.7, 'rgba(219, 235, 242, .25)');
  sides.addColorStop(1, 'rgba(96, 124, 144, .67)');
  ctx.fillStyle = sides;
  ctx.fill(glass);
  if (kind) {
    const cola = kind === 'cola';
    const y = 57 - 44 * level;
    const radius = 14 + 7 * level;
    const liquid = ctx.createLinearGradient(10, y, 54, y);
    liquid.addColorStop(0, cola ? '#75301d' : '#c7a848');
    liquid.addColorStop(.3, cola ? '#ad5732' : '#f3d66f');
    liquid.addColorStop(.56, cola ? '#813620' : '#ead477');
    liquid.addColorStop(1, cola ? '#4c211b' : '#a58637');
    ctx.beginPath();
    ctx.moveTo(32 - radius, y);
    ctx.quadraticCurveTo(32, y + 8, 32 + radius, y);
    ctx.lineTo(46, 54);
    ctx.quadraticCurveTo(32, 61, 18, 54);
    ctx.closePath();
    ctx.fillStyle = liquid;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(32, y, radius, 4, 0, 0, 2 * Math.PI);
    ctx.fillStyle = cola ? '#e39d64' : '#fff1a0';
    ctx.fill();
    ctx.fillStyle = cola ? '#ad5c38' : '#e5c35c';
    ctx.beginPath();
    ctx.ellipse(35, y + 1, radius * .77, 2, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(80, 99, 118, .7)';
  ctx.stroke(glass);
  ctx.strokeStyle = 'rgba(255, 250, 228, .8)';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.ellipse(32, 12, 21, 5.4, 0, 0, 2 * Math.PI);
  ctx.moveTo(14, 19);
  ctx.lineTo(19, 45);
  ctx.stroke();
  texture.refresh();
}

export function createFootprintReader() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const frames = new WeakMap<Phaser.Textures.Frame, { width: number; bottom: number }>();
  return (frame: Phaser.Textures.Frame) => {
    const cached = frames.get(frame);
    if (cached) return cached;
    const { cutX, cutY, cutWidth, cutHeight } = frame;
    if (!context || !cutWidth || !cutHeight) return { width: .8, bottom: .84 };
    canvas.width = cutWidth;
    canvas.height = cutHeight;
    context.drawImage(frame.source.image as CanvasImageSource, cutX, cutY, cutWidth, cutHeight, 0, 0, cutWidth, cutHeight);
    const { data } = context.getImageData(0, 0, cutWidth, cutHeight);
    let left = cutWidth, right = 0, bottom = 0;
    for (let y = 0; y < cutHeight; y++) {
      for (let x = 0; x < cutWidth; x++) {
        if (data[(y * cutWidth + x) * 4 + 3] < 112) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        bottom = y + 1;
      }
    }
    const bounds = bottom ? { width: (right - left) / cutWidth, bottom: bottom / cutHeight } : { width: .8, bottom: .84 };
    frames.set(frame, bounds);
    return bounds;
  };
}
