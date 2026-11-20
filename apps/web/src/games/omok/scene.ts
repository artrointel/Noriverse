import type Phaser from 'phaser';
import { playSound } from '../../platform/audio.ts';
import { addStoneShadow, createBoardArt, preloadBoard, stoneTexture } from '../board-art.ts';
import type { GameView } from '../scenes.ts';
import { tableSize } from '../table.ts';
import type { Stone } from '../table.ts';
import { boardSize, doubleThreeAxes } from './rules.ts';

const edge = 9;
const inset = 24;
const pitch = (tableSize - 2 * (edge + inset)) / (boardSize - 1);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function omokScene(view: () => GameView) {
  let board: ReturnType<typeof createBoardArt>;
  let markers: Phaser.GameObjects.Graphics;
  let previous = view();
  const pieces: { index: number; stone: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }[] = [];

  function position(index: number) {
    return [board.coordinate(index % boardSize), board.coordinate(Math.floor(index / boardSize))] as const;
  }

  return {
    preload(this: Phaser.Scene) { preloadBoard(this); },
    create(this: Phaser.Scene) {
      board = createBoardArt(this, edge, inset, boardSize, [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]]);
      board.paint(view().dark);
      markers = this.add.graphics().setDepth(3);
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = Math.round((point.x - (edge + inset)) / pitch);
        const y = Math.round((point.y - (edge + inset)) / pitch);
        const current = view();
        if (current.canMove && x >= 0 && y >= 0 && x < boardSize && y < boardSize) current.move(y * boardSize + x, pointer.wasTouch);
      });
    },
    update(this: Phaser.Scene) {
      const current = view();
      const history = current.history;
      if (current.dark !== previous.dark) board.paint(current.dark);
      const changed = history !== previous.history || pieces.length !== history.length || current.cursor !== previous.cursor;
      if (!changed) {
        previous = current;
        return;
      }

      const singleMove = history.length === pieces.length + 1 && pieces.every((entry, index) => history[index] === entry.index);
      const last = history.at(-1);
      const forks = current.allowDoubleThree && last !== undefined ? doubleThreeAxes(history.slice(0, -1), last) : [];
      const doubleThree = forks.length >= 2;
      const difference = pieces.findIndex((entry, index) => history[index] !== entry.index);
      if (difference !== -1) {
        for (const entry of pieces.splice(difference)) {
          this.tweens.killTweensOf(entry.stone);
          entry.stone.destroy();
          entry.shadow.destroy();
        }
      }

      for (let turn = pieces.length; turn < history.length; turn++) {
        const index = history[turn];
        const color: Stone = turn % 2 === 0 ? 1 : 2;
        const [x, y] = position(index);
        const shadow = addStoneShadow(this, x, y, 28);
        const stone = this.add.image(x, y, stoneTexture(color)).setDisplaySize(28, 28).setDepth(1);
        pieces.push({ index, stone, shadow });
        if (singleMove && history !== previous.history && !reduceMotion()) {
          const scale = stone.scaleX;
          stone.setScale(scale * (doubleThree ? 1.56 : 1.23)).setAlpha(.58);
          this.tweens.add({ targets: stone, scale, alpha: 1, duration: doubleThree ? 310 : 160, ease: 'Cubic.Out' });
        }
      }
      if (singleMove && history !== previous.history) playSound(doubleThree ? 'doubleThree' : 'place');

      markers.clear();
      if (last !== undefined) {
        const [x, y] = position(last);
        markers.lineStyle(1.5, history.length % 2 === 1 ? 0xe8c377 : 0x874829, .9).strokeCircle(x, y, 3.6);
        if (doubleThree) {
          for (const [dx, dy] of forks) {
            const scale = 28 / Math.hypot(dx, dy);
            markers.lineStyle(5, 0x5c2399, .54).lineBetween(x - dx * scale, y - dy * scale, x + dx * scale, y + dy * scale);
            markers.lineStyle(1.8, 0xffe29a, .98).lineBetween(x - dx * scale, y - dy * scale, x + dx * scale, y + dy * scale);
          }
          markers.lineStyle(2, 0xffeaaa).strokeCircle(x, y, 17);
        }
      }
      if (current.cursor !== null) {
        const [x, y] = position(current.cursor);
        markers.lineStyle(2, 0x7140cb).strokeCircle(x, y, 12);
      }
      previous = current;
    },
  };
}
