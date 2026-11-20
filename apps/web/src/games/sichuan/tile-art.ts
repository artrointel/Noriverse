import type Phaser from 'phaser';
import cardFaces from '../../assets/sichuan-card-faces.webp';
import { sichuanThemes } from './options.ts';
import type { SichuanTheme } from './options.ts';

export const cardFaceKey = 'sichuan-card-faces';
export const motifKey = 'sichuan-motifs';
export const motifSourceKey = 'sichuan-motif-source';
const frameSize = 192;
const motifAtlasSize = 1024;

export function loadCardFaces(scene: Phaser.Scene) {
  scene.load.atlas(cardFaceKey, cardFaces, { frames: Object.fromEntries(sichuanThemes.map((theme, index) => [theme, {
    frame: { x: index % 4 * frameSize, y: Math.floor(index / 4) * frameSize, w: frameSize, h: frameSize },
  }])) });
}

function clearMatte(pixels: ImageData, clearHoles: boolean) {
  const { data, width, height } = pixels;
  const corners = [2 * width + 2, 3 * width - 3, (height - 3) * width + 2, (height - 2) * width - 3];
  const background = [0, 1, 2].map(channel => {
    const values = corners.map(index => data[index * 4 + channel]).sort((a, b) => a - b);
    return (values[1] + values[2]) / 2;
  });
  const distance = (byte: number) => Math.max(Math.abs(data[byte] - background[0]), Math.abs(data[byte + 1] - background[1]), Math.abs(data[byte + 2] - background[2]));
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(visited.length);
  let total = 0;
  function visit(index: number) {
    if (visited[index]) return;
    visited[index] = 1;
    const delta = distance(index * 4);
    if (delta > 40) return;
    data[index * 4 + 3] = Math.max(0, Math.round((delta - 21) * 255 / 19));
    queue[total++] = index;
  }
  // Follow the outside matte so light areas enclosed by an illustrated motif stay opaque.
  for (let x = 0; x < width; x++) { visit(x); visit(x + (height - 1) * width); }
  for (let y = 1; y < height - 1; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let head = 0; head < total; head++) {
    const index = queue[head], x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < width * (height - 1)) visit(index + width);
  }
  if (clearHoles) {
    for (let byte = 0; byte < data.length; byte += 4) {
      if (distance(byte) <= 12) data[byte + 3] = 0;
    }
  }
}

export function prepareTileMotifs(scene: Phaser.Scene, theme: SichuanTheme, frameCount: number) {
  const source = scene.textures.get(motifSourceKey).getSourceImage() as HTMLImageElement;
  const texture = scene.textures.createCanvas(motifKey, motifAtlasSize, motifAtlasSize);
  if (!texture) return;
  const canvas = document.createElement('canvas');
  canvas.width = frameSize;
  canvas.height = frameSize;
  const scratch = canvas.getContext('2d', { willReadFrequently: true })!;
  const output = texture.getContext();
  for (let index = 0; index < frameCount; index++) {
    const x = index % 4 * frameSize, y = Math.floor(index / 4) * frameSize;
    scratch.drawImage(source, x, y, frameSize, frameSize, 0, 0, frameSize, frameSize);
    const pixels = scratch.getImageData(0, 0, frameSize, frameSize);
    clearMatte(pixels, theme === 'numbers' && index < 10);
    output.putImageData(pixels, x, y);
    texture.add('motif-' + index, 0, x, y, frameSize, frameSize);
  }
  texture.refresh();
  scene.textures.remove(motifSourceKey);
}
