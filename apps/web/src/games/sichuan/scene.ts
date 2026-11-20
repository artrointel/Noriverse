import type Phaser from 'phaser';
import type { GameView } from '../scenes.ts';
import { paintTileMark } from '../board-marks.ts';
import { isMatchTile, obstacle, tilePoint } from './rules.ts';
import type { Tile, TilePoint } from './rules.ts';

const atlasKey = 'sichuan-motifs';
const boardKey = 'sichuan-board';
const frameSize = 192;
const textures = import.meta.glob<string>('../../assets/sichuan-themes/*.jpg', { eager: true, query: '?url', import: 'default' });

export function sichuanScene(view: () => GameView) {
  const start = view().sichuan;
  const size = start?.size ?? 8;
  const theme = start?.theme ?? 'classic';
  const blockFrame = theme === 'classic' ? 16 : 14;
  const backFrame = blockFrame + 1;
  const frameName = (tile: number) => 'motif-' + (tile === obstacle ? blockFrame : tile);
  const atlas = { frames: Object.fromEntries(Array.from({ length: backFrame + 1 }, (_, tile) => [frameName(tile), {
    frame: { x: (tile % 4) * frameSize, y: Math.floor(tile / 4) * frameSize, w: frameSize, h: frameSize },
  }])) };
  const pitch = 450 / (size + 1);
  const offset = 15 + pitch;
  const center = ([x, y]: TilePoint) => [offset + x * pitch, offset + y * pitch] as const;
  const tileCenter = (index: number) => center(tilePoint(index, size));
  let base: Phaser.GameObjects.Graphics;
  let hints: Phaser.GameObjects.Graphics;
  let trail: Phaser.GameObjects.Graphics;
  let previous: GameView | undefined;
  const pieces = new Map<number, { container: Phaser.GameObjects.Container; art: Phaser.GameObjects.Image; tile: number }>();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function paintTable(dark: boolean) {
    base.clear().fillStyle(dark ? 0x241f32 : 0xeaddca).fillRect(0, 0, 480, 480);
    base.fillStyle(0x181724, .35).fillRoundedRect(20, 27, 440, 435, 24);
  }

  function syncTiles(scene: Phaser.Scene, board: readonly Tile[], animate: boolean) {
    for (let index = 0; index < board.length; index++) {
      const tile = board[index];
      if (tile === previous?.sichuan?.board[index]) continue;
      const existing = pieces.get(index);
      if (existing) {
        pieces.delete(index);
        if (tile === null && animate) scene.tweens.add({ targets: existing.container, alpha: 0, scaleX: existing.container.scaleX * .86,
          scaleY: existing.container.scaleY * .86, duration: 190, ease: 'Cubic.Out', onComplete: () => existing.container.destroy() });
        else { scene.tweens.killTweensOf(existing.container); existing.container.destroy(); }
      }
      if (tile === null) continue;
      const [x, y] = tileCenter(index);
      const plate = scene.add.graphics();
      const block = tile === obstacle;
      plate.fillStyle(0x142921, .5).fillRoundedRect(-23, -19, 46, 46, 7);
      plate.fillStyle(block ? 0x40384b : 0xb5905f).fillRoundedRect(-23, -20, 46, 45, 7);
      plate.fillStyle(block ? 0x827b91 : 0xfaf0dc).fillRoundedRect(-23, -23, 46, 46, 7);
      plate.lineStyle(1, block ? 0xb9afca : 0xfffbef).strokeRoundedRect(-22.5, -22.5, 45, 45, 6);
      const art = scene.add.image(0, 0, atlasKey, frameName(tile)).setDisplaySize(40, 40);
      const container = scene.add.container(x, y, [plate, art]).setDepth(1).setScale(pitch / 50);
      pieces.set(index, { art, tile, container });
    }
  }

  function flipTiles(scene: Phaser.Scene, phase: 'backs' | 'faces') {
    const normal = pitch / 50;
    for (const { container, art, tile } of pieces.values()) {
      if (!isMatchTile(tile)) continue;
      scene.tweens.killTweensOf(container);
      if (phase === 'backs') {
        scene.tweens.add({ targets: container, scaleX: normal * .1, duration: 125, ease: 'Sine.In',
          onComplete: () => {
            art.setFrame(frameName(backFrame));
            scene.tweens.add({ targets: container, scaleX: normal * .72, duration: 85, ease: 'Sine.Out' });
          } });
      } else {
        art.setFrame(frameName(tile));
        container.setScale(normal * .12, normal);
        scene.tweens.add({ targets: container, scaleX: normal, duration: 200, ease: 'Sine.Out' });
      }
    }
  }

  function paintHints(current: GameView) {
    const data = current.sichuan;
    hints.clear();
    if (!data) return;
    for (const index of data.hint ?? []) paintTileMark(hints, ...tileCenter(index), pitch, 'capture');
    if (data.selected !== undefined) paintTileMark(hints, ...tileCenter(data.selected), pitch, 'arrival');
    if (current.cursor !== null && current.cursor !== data.selected) paintTileMark(hints, ...tileCenter(current.cursor), pitch, 'focus');
  }

  return {
    preload(this: Phaser.Scene) {
      this.load.atlas(atlasKey, textures['../../assets/sichuan-themes/' + theme + '-atlas.jpg'], atlas);
      this.load.image(boardKey, textures['../../assets/sichuan-themes/' + theme + '-board.jpg']);
    },
    create(this: Phaser.Scene) {
      base = this.add.graphics();
      this.add.image(240, 240, boardKey).setDisplaySize(438, 438);
      hints = this.add.graphics().setDepth(2);
      trail = this.add.graphics().setDepth(3);
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const current = view();
        if (!current.canMove) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x = Math.round((point.x - offset) / pitch), y = Math.round((point.y - offset) / pitch);
        if (x >= 0 && x < size && y >= 0 && y < size) current.move(y * size + x);
      });
    },
    update(this: Phaser.Scene) {
      const current = view(), data = current.sichuan;
      if (!data) return;
      const before = previous?.sichuan;
      if (current.dark !== previous?.dark) paintTable(current.dark);
      if (data.board !== before?.board) syncTiles(this, data.board, Boolean(data.path) && !motion.matches);
      if (data.flip && data.flip !== before?.flip) flipTiles(this, data.flip);
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
