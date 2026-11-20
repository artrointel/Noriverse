import type Phaser from 'phaser';
import { playSound } from '../../platform/audio.ts';
import { addStoneShadow, createStoneShadow, preloadStones, stoneTexture } from '../board-art.ts';
import type { GameView } from '../scenes.ts';
import { tableSize } from '../table.ts';
import type { Stone } from '../table.ts';
import { othelloSize, othelloState } from './rules.ts';

const edge = 32;
const width = tableSize - edge * 2;
const cell = width / othelloSize;
const diameter = 44;
const coordinate = (index: number) => edge + (index + .5) * cell;

export function othelloScene(view: () => GameView) {
  let field: Phaser.GameObjects.Graphics;
  let marks: Phaser.GameObjects.Graphics;
  let previous: GameView | undefined;
  let state = othelloState([]);
  const pieces = new Map<number, { color: Stone; disc: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }>();

  function drawBoard(dark: boolean) {
    field.clear();
    field.fillStyle(dark ? 0x211b34 : 0xede6f7).fillRect(0, 0, tableSize, tableSize);
    field.fillStyle(0x16152f, .35).fillRoundedRect(edge - 12, edge - 8, width + 24, width + 26, 17);
    field.fillStyle(0x163335).fillRoundedRect(edge - 11, edge - 11, width + 22, width + 22, 15);
    field.lineStyle(1.3, 0xb5e3bb, .48).strokeRoundedRect(edge - 8, edge - 8, width + 16, width + 16, 11);
    for (let row = 0; row < othelloSize; row++) {
      for (let col = 0; col < othelloSize; col++) {
        const light = (row + col) % 2 === 0;
        field.fillStyle(dark ? light ? 0x1e634e : 0x195744 : light ? 0x2a8a69 : 0x23805f);
        field.fillRect(edge + col * cell, edge + row * cell, cell, cell);
      }
    }
    field.lineStyle(1, 0x103e35, .8);
    for (let index = 0; index <= othelloSize; index++) {
      const value = edge + index * cell;
      field.lineBetween(value, edge, value, edge + width);
      field.lineBetween(edge, value, edge + width, value);
    }
  }

  return {
    preload(this: Phaser.Scene) { preloadStones(this); },
    create(this: Phaser.Scene) {
      createStoneShadow(this);
      field = this.add.graphics().setDepth(-1);
      marks = this.add.graphics().setDepth(2);
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (!view().canMove) return;
        const x = Math.floor((pointer.x - edge) / cell);
        const y = Math.floor((pointer.y - edge) / cell);
        if (x >= 0 && x < othelloSize && y >= 0 && y < othelloSize) view().move(y * othelloSize + x);
      });
    },
    update(this: Phaser.Scene) {
      const current = view();
      if (current.dark !== previous?.dark) drawBoard(current.dark);
      if (current.history !== previous?.history) {
        const single = previous && current.history.length === previous.history.length + 1
          && previous.history.every((move, index) => move === current.history[index]);
        const animate = single && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        state = othelloState(current.history);
        for (let index = 0; index < state.board.length; index++) {
          const color = state.board[index];
          const existing = pieces.get(index);
          if (existing?.color === color) continue;
          if (!color) {
            if (existing) {
              this.tweens.killTweensOf(existing.disc);
              existing.disc.destroy();
              existing.shadow.destroy();
              pieces.delete(index);
            }
            continue;
          }
          if (existing) {
            const disc = existing.disc;
            this.tweens.killTweensOf(disc);
            existing.color = color;
            disc.setDisplaySize(diameter, diameter);
            const scale = disc.scaleX;
            if (animate) {
              this.tweens.add({
                targets: disc, scaleX: .015, duration: 112, ease: 'Sine.In',
                onComplete: () => {
                  disc.setTexture(stoneTexture(color));
                  this.tweens.add({ targets: disc, scaleX: scale, duration: 124, ease: 'Sine.Out' });
                },
              });
            } else disc.setTexture(stoneTexture(color));
          } else {
            const x = coordinate(index % othelloSize);
            const y = coordinate(Math.floor(index / othelloSize));
            const shadow = addStoneShadow(this, x, y, diameter);
            const disc = this.add.image(x, y, stoneTexture(color)).setDisplaySize(diameter, diameter).setDepth(1);
            pieces.set(index, { color, disc, shadow });
          }
        }
        if (single) playSound('place');
      }
      if (!previous || current.history !== previous.history || current.cursor !== previous.cursor || current.canMove !== previous.canMove) {
        marks.clear();
        if (current.canMove) {
          marks.fillStyle(0xe5ffc7, .7);
          for (const move of state.legal) marks.fillCircle(coordinate(move % othelloSize), coordinate(Math.floor(move / othelloSize)), 4);
        }
        const last = current.history.at(-1);
        if (last !== undefined) marks.lineStyle(1.6, 0xffd890).strokeCircle(coordinate(last % othelloSize), coordinate(Math.floor(last / othelloSize)), 4);
        if (current.cursor !== null) {
          const x = edge + current.cursor % othelloSize * cell;
          const y = edge + Math.floor(current.cursor / othelloSize) * cell;
          marks.lineStyle(2, 0xffe2a4).strokeRoundedRect(x + 3, y + 3, cell - 6, cell - 6, 6);
        }
      }
      previous = current;
    },
  };
}
