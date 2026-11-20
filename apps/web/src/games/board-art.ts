import type Phaser from 'phaser';
import boardArt from '../assets/baduk-board.jpg';
import blackStone from '../assets/baduk-black.png';
import whiteStone from '../assets/baduk-white.png';
import type { Stone } from './table.ts';
import { tableSize } from './table.ts';

const boardTexture = 'kaya-board';
const shadowTexture = 'stone-shadow';
export const stoneTexture = (color: Stone) => color === 1 ? 'black-stone' : 'white-stone';

export function preloadBoard(scene: Phaser.Scene) {
  scene.load.image(boardTexture, boardArt);
  scene.load.image(stoneTexture(1), blackStone);
  scene.load.image(stoneTexture(2), whiteStone);
}

export function createBoardArt(scene: Phaser.Scene, edge: number, gridInset: number, lines: number,
  marks: readonly (readonly [number, number])[] = [[(lines - 1) / 2, (lines - 1) / 2]]) {
  const bg = scene.add.graphics().setDepth(-4);
  const length = tableSize - edge * 2;
  const wood = scene.add.image(tableSize / 2, tableSize / 2, boardTexture).setDisplaySize(length, length).setDepth(-3);
  const details = scene.add.graphics().setDepth(-2);
  const gridEdge = edge + gridInset;
  const gridEnd = tableSize - gridEdge;
  const spacing = (gridEnd - gridEdge) / (lines - 1);
  const coordinate = (index: number) => gridEdge + spacing * index;

  function paint(dark: boolean) {
    bg.clear();
    bg.fillStyle(dark ? 0x272132 : 0xe8ddd1).fillRect(0, 0, tableSize, tableSize);
    for (let spread = 13; spread >= 3; spread -= 2) {
      bg.fillStyle(0x20121c, .05).fillRoundedRect(edge - spread / 2 + 2, edge - spread / 2 + 7,
        length + spread, length + spread, 5);
    }
    bg.fillStyle(dark ? 0x543720 : 0x925e37).fillRect(edge, edge + 5, length + 2, length + 2);
    wood.setTint(dark ? 0xffe1c4 : 0xffffff);
    details.clear();
    details.lineStyle(1, 0xfff0c9, .68);
    details.lineBetween(edge, edge, tableSize - edge, edge);
    details.lineBetween(edge, edge, edge, tableSize - edge);
    details.lineStyle(1, 0x674526, lines > 10 ? .72 : .43);
    for (let index = 0; index < lines; index++) {
      const value = coordinate(index);
      details.lineBetween(gridEdge, value, gridEnd, value);
      details.lineBetween(value, gridEdge, value, gridEnd);
    }
    details.fillStyle(0x50311f, .8);
    for (const [x, y] of marks) details.fillCircle(coordinate(x), coordinate(y), 2.4);
  }

  const shadow = scene.textures.createCanvas(shadowTexture, 64, 64);
  if (shadow) {
    const context = shadow.getContext();
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(24, 11, 6, 0.48)');
    gradient.addColorStop(.57, 'rgba(24, 11, 6, 0.25)');
    gradient.addColorStop(1, 'rgba(24, 11, 6, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    shadow.refresh();
  }
  return { paint, coordinate };
}

export function addStoneShadow(scene: Phaser.Scene, x: number, y: number, diameter: number) {
  return scene.add.image(x + 1.8, y + 3.5, shadowTexture).setDisplaySize(diameter * 1.5, diameter * 1.28).setDepth(0);
}
