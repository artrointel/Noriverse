import type Phaser from 'phaser';
import type { GameView } from '../scenes.ts';
import { chessIndex, chessPosition } from './rules.ts';
import { playSound } from '../../platform/audio.ts';
import chessPieces from '../../assets/chess-pieces.png';

const offset = 32;
const cell = 52;
const pieceFrames = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
const pieceTexture = 'chess-pieces';

export function chessScene(view: () => GameView) {
  let layer: Phaser.GameObjects.Graphics;
  let pieces: Phaser.GameObjects.Container;
  let previous: GameView | undefined;

  function paint(scene: Phaser.Scene, current: GameView) {
    const { history, dark, chessSelected, chessTargets, cursor } = current;
    if (history !== previous?.history || dark !== previous?.dark) {
      pieces.removeAll(true);
      chessPosition(history).board().flat().forEach((piece, index) => {
        if (!piece) return;
        const x = offset + (index % 8 + .5) * cell;
        const y = offset + (Math.floor(index / 8) + .5) * cell;
        const frame = pieceFrames[piece.type] + (piece.color === 'w' ? 0 : 6);
        pieces.add(scene.add.image(x, y, pieceTexture, frame).setDisplaySize(50, 50));
      });
    }
    layer.clear();
    layer.fillStyle(dark ? 0x30253c : 0x5c3c4a).fillRoundedRect(16, 16, 448, 448, 13);
    const last = history.at(-1);
    const lastPair = last === undefined ? -1 : Math.floor(last / 5);
    const position = chessPosition(history);
    const king = position.inCheck() ? position.board().flat().find(piece => piece?.type === 'k' && piece.color === position.turn()) : null;
    const checked = king ? chessIndex(king.square) : -1;
    for (let index = 0; index < 64; index++) {
      const col = index % 8, row = Math.floor(index / 8);
      const x = offset + col * cell, y = offset + row * cell;
      const light = (col + row) % 2 === 0;
      layer.fillStyle(light ? (dark ? 0xb6a7bc : 0xf2d6af) : (dark ? 0x685675 : 0xa67865)).fillRect(x, y, cell, cell);
      if (index === Math.floor(lastPair / 64) || index === lastPair % 64) layer.fillStyle(0xf7ce74, .42).fillRect(x, y, cell, cell);
      if (index === checked) layer.fillStyle(0xeb617d, .65).fillRect(x, y, cell, cell);
      if (index === chessSelected || index === cursor) layer.lineStyle(3, 0xffe299).strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      if (chessTargets.includes(index)) layer.fillStyle(0x265b4f, .78).fillCircle(x + cell - 9, y + 9, 4);
    }
  }

  return {
    preload(this: Phaser.Scene) { this.load.spritesheet(pieceTexture, chessPieces, { frameWidth: 96, frameHeight: 96 }); },
    create(this: Phaser.Scene) {
      layer = this.add.graphics();
      pieces = this.add.container(0, 0).setDepth(1);
      for (let i = 0; i < 8; i++) {
        const style = { color: '#ffe3bc', fontSize: '12px' };
        this.add.text(offset + (i + .5) * cell, 456, 'abcdefgh'[i], style).setOrigin(.5);
        this.add.text(23, offset + (i + .5) * cell, String(8 - i), style).setOrigin(.5);
      }
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = Math.floor((point.x - offset) / cell), y = Math.floor((point.y - offset) / cell);
        const current = view();
        if (current.canMove && x >= 0 && x < 8 && y >= 0 && y < 8) current.move(y * 8 + x);
      });
    },
    update(this: Phaser.Scene) {
      const current = view();
      if (previous && current.history.length === previous.history.length + 1) playSound('place');
      if (!previous || current.history !== previous.history || current.dark !== previous.dark
        || current.chessSelected !== previous.chessSelected || current.chessTargets !== previous.chessTargets || current.cursor !== previous.cursor) {
        paint(this, current);
      }
      previous = current;
    },
  };
}
