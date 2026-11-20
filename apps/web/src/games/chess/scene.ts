import type Phaser from 'phaser';
import type { Move } from 'chess.js';
import type { GameView } from '../scenes.ts';
import { chessIndex, chessPosition } from './rules.ts';
import { addStoneShadow, createStoneShadow } from '../board-art.ts';
import { playSound } from '../../platform/audio.ts';
import boardArt from '../../assets/chess-walnut-board.jpg';
import chessPieces from '../../assets/chess-staunton.png';

const offset = 32;
const cell = 52;
const pieceFrames = { k: 0, q: 1, r: 2, b: 3, n: 4, p: 5 };
const pieceTexture = 'chess-staunton';
const boardTexture = 'chess-walnut';
const moveDuration = 210;
type RenderedPiece = { art: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image };

function squareCenter(index: number) {
  return [offset + (index % 8 + .5) * cell, offset + (Math.floor(index / 8) + .5) * cell] as const;
}

export function chessScene(view: () => GameView) {
  let base: Phaser.GameObjects.Graphics;
  let board: Phaser.GameObjects.Image;
  let layer: Phaser.GameObjects.Graphics;
  let previous: GameView | undefined;
  const pieces = new Map<number, RenderedPiece>();
  const departing = new Set<RenderedPiece>();

  function destroyPiece(scene: Phaser.Scene, piece: RenderedPiece) {
    scene.tweens.killTweensOf([piece.art, piece.shadow]);
    piece.art.destroy();
    piece.shadow.destroy();
  }

  function resetPieces(scene: Phaser.Scene, history: number[]) {
    for (const piece of pieces.values()) destroyPiece(scene, piece);
    for (const piece of departing) destroyPiece(scene, piece);
    pieces.clear();
    departing.clear();
    chessPosition(history).board().flat().forEach((piece, index) => {
      if (!piece) return;
      const [x, y] = squareCenter(index);
      const frame = pieceFrames[piece.type] + (piece.color === 'w' ? 0 : 6);
      const art = scene.add.image(x, y, pieceTexture, frame).setDisplaySize(51, 51).setDepth(2);
      const shadow = addStoneShadow(scene, x + 1, y + 15, 26).setDisplaySize(39, 15).setDepth(1);
      pieces.set(index, { art, shadow });
    });
  }

  function slide(scene: Phaser.Scene, from: number, to: number, promotion?: number) {
    const piece = pieces.get(from);
    if (!piece) return;
    pieces.delete(from);
    pieces.set(to, piece);
    const [x, y] = squareCenter(to);
    scene.tweens.killTweensOf([piece.art, piece.shadow]);
    piece.art.setDepth(4);
    scene.tweens.add({
      targets: piece.art, x, y, duration: moveDuration, ease: 'Linear',
      onComplete: () => {
        if (promotion !== undefined) piece.art.setFrame(promotion);
        piece.art.setDepth(2);
      },
    });
    scene.tweens.add({ targets: piece.shadow, x: x + 2.8, y: y + 18.5, duration: moveDuration, ease: 'Linear' });
  }

  function animateMove(scene: Phaser.Scene, move: Move) {
    const from = chessIndex(move.from), to = chessIndex(move.to);
    const row = Math.floor(from / 8) * 8;
    const capturedSquare = move.isEnPassant() ? row + to % 8 : to;
    const captured = pieces.get(capturedSquare);
    if (captured) {
      pieces.delete(capturedSquare);
      departing.add(captured);
      scene.tweens.killTweensOf([captured.art, captured.shadow]);
      captured.art.setDepth(3);
      scene.tweens.add({
        targets: captured.art, x: captured.art.x + 6, y: captured.art.y + 12, angle: 28,
        scale: captured.art.scaleX * .72, alpha: 0, duration: 270, ease: 'Quad.In',
        onComplete: () => { departing.delete(captured); captured.art.destroy(); captured.shadow.destroy(); },
      });
      scene.tweens.add({ targets: captured.shadow, alpha: 0, duration: 250 });
      playSound('drop');
    } else playSound('place');
    const promoted = move.promotion === undefined ? undefined : pieceFrames[move.promotion] + (move.color === 'w' ? 0 : 6);
    slide(scene, from, to, promoted);
    if (move.isKingsideCastle()) slide(scene, row + 7, row + 5);
    if (move.isQueensideCastle()) slide(scene, row, row + 3);
  }

  function paint(current: GameView) {
    const { history, dark, chessSelected, chessTargets, cursor } = current;
    if (!previous || dark !== previous.dark) {
      base.clear();
      base.fillStyle(dark ? 0x272132 : 0xe8ddd1).fillRect(0, 0, 480, 480);
      for (let spread = 12; spread >= 3; spread -= 2) {
        base.fillStyle(0x20121c, .07).fillRoundedRect(15 - spread / 2 + 2, 15 - spread / 2 + 6, 450 + spread, 450 + spread, 5);
      }
      board.setTint(dark ? 0xffe4cf : 0xffffff);
    }
    layer.clear();
    const last = history.at(-1);
    const lastPair = last === undefined ? -1 : Math.floor(last / 5);
    const position = chessPosition(history);
    const king = position.inCheck() ? position.board().flat().find(piece => piece?.type === 'k' && piece.color === position.turn()) : null;
    const checked = king ? chessIndex(king.square) : -1;
    for (let index = 0; index < 64; index++) {
      const [cx, cy] = squareCenter(index);
      const x = cx - cell / 2, y = cy - cell / 2;
      if (index === Math.floor(lastPair / 64) || index === lastPair % 64) layer.fillStyle(0xffd978, .42).fillRect(x, y, cell, cell);
      if (index === checked) layer.fillStyle(0xc83857, .72).fillRect(x, y, cell, cell);
      if (index === chessSelected || index === cursor) layer.lineStyle(3, 0xffe299).strokeRect(x + 2, y + 2, cell - 4, cell - 4);
      if (chessTargets.includes(index)) {
        layer.fillStyle(0x194a46, .87).fillCircle(x + cell - 9, y + 9, 5);
        layer.lineStyle(1, 0xb8f3da, .9).strokeCircle(x + cell - 9, y + 9, 5);
      }
    }
  }

  return {
    preload(this: Phaser.Scene) {
      this.load.image(boardTexture, boardArt);
      this.load.spritesheet(pieceTexture, chessPieces, { frameWidth: 144, frameHeight: 144 });
    },
    create(this: Phaser.Scene) {
      base = this.add.graphics().setDepth(-2);
      board = this.add.image(240, 240, boardTexture).setDisplaySize(450, 450).setDepth(-1);
      layer = this.add.graphics();
      createStoneShadow(this);
      for (let i = 0; i < 8; i++) {
        const style = { color: '#fff0d4', fontSize: '10px', fontStyle: 'bold' };
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
      if (current.history !== previous?.history) {
        const earlier = previous?.history;
        const incremental = earlier && current.history.length === earlier.length + 1
          && earlier.every((move, index) => current.history[index] === move);
        const move = incremental ? chessPosition(current.history).history({ verbose: true }).at(-1) : undefined;
        if (move && !matchMedia('(prefers-reduced-motion: reduce)').matches) animateMove(this, move);
        else {
          resetPieces(this, current.history);
          if (move) playSound(move.captured ? 'drop' : 'place');
        }
      }
      if (!previous || current.history !== previous.history || current.dark !== previous.dark
        || current.chessSelected !== previous.chessSelected || current.chessTargets !== previous.chessTargets || current.cursor !== previous.cursor) {
        paint(current);
      }
      previous = current;
    },
  };
}
