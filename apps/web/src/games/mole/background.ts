import type Phaser from 'phaser';
import field from '../../assets/mole/field.webp';
import grove from '../../assets/mole/grove.webp';
import mist from '../../assets/mole/mist.webp';
import foliage from '../../assets/mole/foliage.webp';
import { tableSize } from '../table.ts';

const center = tableSize / 2;
const layerFrame = 256;

export function loadMoleBackground(scene: Phaser.Scene) {
  scene.load.image('mole-field', field);
  scene.load.image('mole-grove', grove);
  scene.load.spritesheet('mole-mist', mist, { frameWidth: layerFrame, frameHeight: layerFrame });
  scene.load.spritesheet('mole-foliage', foliage, { frameWidth: layerFrame, frameHeight: layerFrame });
}

export function createMoleBackground(scene: Phaser.Scene) {
  scene.add.image(center, center, 'mole-field').setDisplaySize(tableSize, tableSize).setDepth(-12);
  scene.add.image(center, 268, 'mole-grove').setDisplaySize(444, 365).setDepth(-11);
  scene.add.rectangle(center, 268, 444, 365, 0x181331, .22).setStrokeStyle(1, 0xc68feb, .38).setDepth(-10);

  const mistAnchors = [{ x: 130, y: 177 }, { x: 335, y: 318 }];
  const clouds = mistAnchors.map(({ x, y }, index) => scene.add.image(x, y, 'mole-mist', index)
    .setDisplaySize(255, 180).setAlpha(.65).setDepth(-9));
  const foliageAnchors = [{ x: 18, y: 420, width: 124, height: 153 }, { x: 460, y: 405, width: 119, height: 148 }];
  const leaves = foliageAnchors.map(({ x, y, width, height }, index) =>
    scene.add.image(x, y, 'mole-foliage', index).setDisplaySize(width, height)
      .setOrigin(index ? .9 : .1, .86).setDepth(-8).setAlpha(.88));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  return (time: number) => {
    const phase = reducedMotion.matches ? 0 : time;
    for (const [i, cloud] of clouds.entries()) {
      const anchor = mistAnchors[i];
      cloud.setPosition(anchor.x + Math.sin(phase / 6600 + i * 2.7) * 20,
        anchor.y + Math.sin(phase / 8300 + i * 1.8) * 15);
    }
    for (const [i, leaf] of leaves.entries()) leaf.setAngle(Math.sin(phase / (1650 + i * 430) + i * 2.3) * 5.5);
  };
}
