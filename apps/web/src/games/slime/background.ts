import Phaser from 'phaser';
import { tableSize } from '../table.ts';
import { orbitBoardFrame, orbitGrid, orbitPanePixels, orbitPanes, orbitPixel } from './layout.ts';
import { orbitSceneHeight } from './rules.ts';

const worlds = ['violet-ring', 'teal-aurora', 'ember-dunes', 'blue-tide', 'rose-garden',
  'sakura-shrine', 'persimmon-hanok', 'lantern-pavilion'] as const;
type World = typeof worlds[number];
const layers = ['base', 'far', 'near'] as const;
type Layer = typeof layers[number];
const art = import.meta.glob<string>('../../assets/slime-worlds/*.webp', { eager: true, import: 'default', query: '?url' });
const center = { x: orbitGrid.x + orbitGrid.width / 2, y: orbitGrid.y + orbitGrid.height / 2 };
const textureKey = (world: World, layer: Layer) => 'orbit-world-' + world + '-' + layer;

export function orbitWorld(matchId: string): World {
  let hash = 0;
  for (const character of matchId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return worlds[(hash >>> 0) % worlds.length];
}

export function queueOrbitWorld(scene: Phaser.Scene, world: World) {
  for (const layer of layers) {
    const key = textureKey(world, layer);
    const url = art[`../../assets/slime-worlds/${world}-${layer}.webp`];
    if (url && !scene.textures.exists(key)) scene.load.image(key, url);
  }
}

function createDrift(sprite: Phaser.GameObjects.Image, xRadius: number, yRadius: number, pace: number) {
  let angle = Math.random() * 2 * Math.PI;
  let elapsed = 0;
  let duration = 0;
  let start = center;
  let destination = center;

  function chooseTarget() {
    // Each leg changes direction, while keeping the layer close to its original framing.
    angle += (1 + Math.random()) * Math.PI * .75;
    const radius = .7 + Math.random() * .3;
    destination = { x: center.x + Math.cos(angle) * xRadius * radius, y: center.y + Math.sin(angle) * yRadius * radius };
    duration = pace * (.8 + .4 * Math.random());
    elapsed = 0;
  }

  chooseTarget();
  return (delta: number) => {
    elapsed = Math.min(elapsed + delta, duration);
    const step = elapsed / duration;
    const progress = step * step * (3 - 2 * step);
    sprite.setPosition(start.x + (destination.x - start.x) * progress, start.y + (destination.y - start.y) * progress);
    if (elapsed === duration) {
      start = destination;
      chooseTarget();
    }
  };
}

function addOrbitWindowFrame(scene: Phaser.Scene) {
  const texture = scene.textures.createCanvas('orbit-window-frame', tableSize / orbitPixel, orbitSceneHeight / orbitPixel);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.scale(1 / orbitPixel, 1 / orbitPixel);
  ctx.fillStyle = '#181a2e';
  ctx.fillRect(0, 0, tableSize, orbitSceneHeight);
  const { x, y, width, height } = orbitBoardFrame;
  ctx.fillStyle = '#343856';
  ctx.fillRect(x + orbitPixel, y, width - orbitPixel * 2, height);
  ctx.fillRect(x, y + orbitPixel, width, height - orbitPixel * 2);
  ctx.fillStyle = '#262a45';
  ctx.fillRect(x + orbitPixel, y + orbitPixel, width - orbitPixel * 2, height - orbitPixel * 2);

  // Match the three stepped rows of the window sprite on its native pixel lattice.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#fff';
  const size = orbitPanePixels * orbitPixel;
  for (const pane of orbitPanes) {
    ctx.fillRect(pane.x + 2 * orbitPixel, pane.y, size - 4 * orbitPixel, size);
    ctx.fillRect(pane.x + orbitPixel, pane.y + orbitPixel, size - 2 * orbitPixel, size - 2 * orbitPixel);
    ctx.fillRect(pane.x, pane.y + 2 * orbitPixel, size, size - 4 * orbitPixel);
  }
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  scene.add.image(0, 0, texture.key).setOrigin(0).setScale(orbitPixel).setDepth(-7);
}

export function createOrbitBackground(scene: Phaser.Scene, world: World) {
  const backing = scene.add.graphics().setDepth(-12);
  backing.fillGradientStyle(0x282752, 0x253051, 0x141b35, 0x211733).fillRect(orbitGrid.x, orbitGrid.y, orbitGrid.width, orbitGrid.height);
  const images = layers.map((layer, i) => {
    const key = textureKey(world, layer);
    if (!scene.textures.exists(key)) return;
    return scene.add.image(center.x, center.y, key).setDepth(-11 + i).setAlpha([1, .76, .82][i])
      .setDisplaySize(orbitGrid.width, orbitGrid.height);
  });
  const far = images[1] && createDrift(images[1], 12, 11, 19_000);
  const near = images[2] && createDrift(images[2], 22, 19, 12_000);
  scene.add.rectangle(center.x, center.y, orbitGrid.width, orbitGrid.height, 0x0b1128, .16).setDepth(-8);
  addOrbitWindowFrame(scene);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  return (delta: number) => {
    if (reducedMotion.matches) return;
    far?.(delta);
    near?.(delta);
  };
}
