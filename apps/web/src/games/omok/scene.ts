import type Phaser from 'phaser';
import { playSound } from '../../platform/audio.ts';
import { addStoneShadow, createBoardArt, preloadBoard, stoneTexture } from '../board-art.ts';
import { createMoveGhost, paintStoneImprint, paintTileMark, revealMoveMarks } from '../board-marks.ts';
import type { GameView } from '../game-view.ts';
import { bindBoardInput } from '../board-input.ts';
import { tableSize } from '../table.ts';
import type { Stone } from '../table.ts';
import { boardSize, doubleThreeAxes, nextStone } from './rules.ts';

const edge = 9;
const inset = 24;
const pitch = (tableSize - 2 * (edge + inset)) / (boardSize - 1);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function omokScene(view: () => GameView) {
  let board: ReturnType<typeof createBoardArt>;
  let markers: Phaser.GameObjects.Graphics;
  let focus: Phaser.GameObjects.Graphics;
  let showGhost: ReturnType<typeof createMoveGhost>;
  let previous: GameView | undefined;
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
      focus = this.add.graphics().setDepth(.5);
      showGhost = createMoveGhost(this, 28);
      bindBoardInput(this, view, boardSize, edge + inset, pitch, Math.round);
    },
    update(this: Phaser.Scene) {
      const current = view();
      const history = current.history;
      if (previous && current.dark !== previous.dark) board.paint(current.dark);
      if (!previous || current.cursor !== previous.cursor || current.canMove !== previous.canMove
        || current.movePreview !== previous.movePreview || history !== previous.history) {
        focus.clear();
        const preview = current.canMove ? current.movePreview : undefined;
        const cursor = preview ?? current.cursor;
        if (current.canMove && cursor !== null) paintTileMark(focus, ...position(cursor), pitch, 'focus', 'green');
        showGhost(preview === undefined ? undefined : position(preview), stoneTexture(nextStone(history)));
      }
      if (history === previous?.history) {
        previous = current;
        return;
      }

      const singleMove = previous && history.length === pieces.length + 1 && pieces.every((entry, index) => history[index] === entry.index);
      const animate = Boolean(singleMove) && !reduceMotion();
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
        if (animate) {
          const scale = stone.scaleX;
          stone.setScale(scale * (doubleThree ? 1.56 : 1.23)).setAlpha(.58);
          this.tweens.add({ targets: stone, scale, alpha: 1, duration: doubleThree ? 310 : 160, ease: 'Cubic.Out' });
        }
      }
      if (singleMove) playSound(doubleThree ? 'doubleThree' : 'place');

      markers.clear();
      if (last !== undefined) {
        const [x, y] = position(last);
        paintStoneImprint(markers, x, y);
        if (doubleThree) {
          for (const [dx, dy] of forks) {
            const scale = 28 / Math.hypot(dx, dy);
            markers.lineStyle(5, 0x154d39, .54).lineBetween(x - dx * scale, y - dy * scale, x + dx * scale, y + dy * scale);
            markers.lineStyle(1.8, 0xb8f5cf, .98).lineBetween(x - dx * scale, y - dy * scale, x + dx * scale, y + dy * scale);
          }
          markers.lineStyle(2, 0xc0f6d5).strokeCircle(x, y, 17);
        }
      }
      revealMoveMarks(this, markers, animate);
      previous = current;
    },
  };
}
