import type Phaser from 'phaser';
import type { GameView } from '../scenes.ts';
import { paintTileMark } from '../board-marks.ts';
import { sichuanMotifs, sichuanSize, tilePoint } from './rules.ts';
import type { Tile, TilePoint } from './rules.ts';
import tileAtlas from '../../assets/sichuan-atlas.jpg';

const atlasKey = 'sichuan-motifs';
const frameSize = 192;
const frameName = (tile: number) => 'motif-' + tile;
const atlas = { frames: Object.fromEntries(Array.from({ length: sichuanMotifs }, (_, tile) => [frameName(tile), {
  frame: { x: (tile % 4) * frameSize, y: Math.floor(tile / 4) * frameSize, w: frameSize, h: frameSize },
}])) };
const pitch = 50;
const offset = 65;
const center = ([x, y]: TilePoint) => [offset + x * pitch, offset + y * pitch] as const;

export function sichuanScene(view: () => GameView) {
  let base: Phaser.GameObjects.Graphics;
  let hints: Phaser.GameObjects.Graphics;
  let trail: Phaser.GameObjects.Graphics;
  let previous: GameView | undefined;
  const pieces = new Map<number, Phaser.GameObjects.Container>();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function paintTable(dark: boolean) {
    base.clear().fillStyle(dark ? 0x241f32 : 0xeaddca).fillRect(0, 0, 480, 480);
    base.fillStyle(0x181724, .35).fillRoundedRect(20, 27, 440, 435, 24);
    base.fillStyle(dark ? 0x243e3b : 0x365b4c).fillRoundedRect(20, 20, 440, 440, 24);
    base.lineStyle(1.5, 0xf0cb8d, .55).strokeRoundedRect(23, 23, 434, 434, 21);
    base.lineStyle(1, 0xd6c1a0, .13).strokeRoundedRect(34, 34, 412, 412, 11);
    for (let index = 0; index < sichuanSize ** 2; index++) {
      const [x, y] = center(tilePoint(index));
      base.fillStyle(0x081c19, .14).fillRoundedRect(x - 22, y - 22, 44, 44, 7);
    }
  }

  function syncTiles(scene: Phaser.Scene, board: readonly Tile[], animate: boolean) {
    for (let index = 0; index < board.length; index++) {
      const tile = board[index];
      if (tile === previous?.sichuan?.board[index]) continue;
      const existing = pieces.get(index);
      if (existing) {
        pieces.delete(index);
        if (tile === null && animate) scene.tweens.add({ targets: existing, alpha: 0, scale: .86, duration: 190,
          ease: 'Cubic.Out', onComplete: () => existing.destroy() });
        else existing.destroy();
      }
      if (tile === null) continue;
      const [x, y] = center(tilePoint(index));
      const plate = scene.add.graphics();
      plate.fillStyle(0x142921, .5).fillRoundedRect(-23, -19, 46, 46, 7);
      plate.fillStyle(0xb5905f).fillRoundedRect(-23, -20, 46, 45, 7);
      plate.fillStyle(0xfaf0dc).fillRoundedRect(-23, -23, 46, 46, 7);
      plate.lineStyle(1, 0xfffbef).strokeRoundedRect(-22.5, -22.5, 45, 45, 6);
      const art = scene.add.image(0, 0, atlasKey, frameName(tile)).setDisplaySize(40, 40);
      pieces.set(index, scene.add.container(x, y, [plate, art]).setDepth(1));
    }
  }

  function paintHints(current: GameView) {
    const data = current.sichuan;
    hints.clear();
    if (!data) return;
    for (const index of data.hint ?? []) paintTileMark(hints, ...center(tilePoint(index)), pitch, 'capture');
    if (data.selected !== undefined) paintTileMark(hints, ...center(tilePoint(data.selected)), pitch, 'arrival');
    if (current.cursor !== null && current.cursor !== data.selected) paintTileMark(hints, ...center(tilePoint(current.cursor)), pitch, 'focus');
  }

  return {
    preload(this: Phaser.Scene) { this.load.atlas(atlasKey, tileAtlas, atlas); },
    create(this: Phaser.Scene) {
      base = this.add.graphics();
      hints = this.add.graphics().setDepth(2);
      trail = this.add.graphics().setDepth(3);
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const current = view();
        if (!current.canMove) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = Math.round((point.x - offset) / pitch), y = Math.round((point.y - offset) / pitch);
        if (x >= 0 && x < sichuanSize && y >= 0 && y < sichuanSize) current.move(y * sichuanSize + x);
      });
    },
    update(this: Phaser.Scene) {
      const current = view(), data = current.sichuan;
      if (!data) return;
      const before = previous?.sichuan;
      if (current.dark !== previous?.dark) paintTable(current.dark);
      if (data.board !== before?.board) syncTiles(this, data.board, Boolean(data.path) && !motion.matches);
      if (data.selected !== before?.selected || data.hint !== before?.hint || current.cursor !== previous?.cursor) paintHints(current);
      if (data.path !== before?.path) {
        this.tweens.killTweensOf(trail);
        trail.clear().setAlpha(1);
        if (data.path) {
          const points = data.path.map(center);
          for (const [width, color, alpha] of [[7, 0x1a312c, .8], [4, 0x70d9ae, .8], [1.5, 0xf6fff3, 1]]) {
            trail.lineStyle(width, color, alpha).beginPath().moveTo(...points[0]);
            for (const point of points.slice(1)) trail.lineTo(...point);
            trail.strokePath();
          }
          this.tweens.add({ targets: trail, alpha: 0, delay: 160, duration: motion.matches ? 1 : 270 });
        }
      }
      previous = current;
    },
  };
}
