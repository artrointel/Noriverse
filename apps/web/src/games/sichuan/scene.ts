import type Phaser from 'phaser';
import type { GameView } from '../scenes.ts';
import { tableSize } from '../table.ts';
import { paintTileMark } from '../board-marks.ts';
import { createSichuanEffects } from './effects.ts';
import { createComboBanner, loadComboBanner } from './combo-banner.ts';
import { createSichuanHud, loadSichuanHud } from './hud.ts';
import { cardFaceKey, loadCardFaces, motifKey, motifSourceKey, prepareTileMotifs } from './tile-art.ts';
import { sichuanSceneHeight } from './options.ts';
import { isMatchTile, obstacle, tilePoint } from './rules.ts';
import type { Tile, TilePoint } from './rules.ts';

const boardKey = 'sichuan-board';
const textures = import.meta.glob<string>('../../assets/sichuan-themes/*.jpg', { eager: true, query: '?url', import: 'default' });

type RenderedTile = {
  container: Phaser.GameObjects.Container;
  art: Phaser.GameObjects.Image;
  tile: number;
  veil?: Phaser.GameObjects.Graphics;
  rejection?: { progress: number };
};

export function sichuanScene(view: () => GameView) {
  const start = view().sichuan;
  const size = start?.size ?? 8;
  const theme = start?.theme ?? 'classic';
  const blockFrame = theme === 'classic' ? 16 : 14;
  const backFrame = blockFrame + 1;
  const frameName = (tile: number) => 'motif-' + (tile === obstacle ? blockFrame : tile);
  const pitch = 450 / (size + 1);
  const offset = 15 + pitch;
  const center = ([x, y]: TilePoint) => [offset + x * pitch, offset + y * pitch] as const;
  const tileCenter = (index: number) => center(tilePoint(index, size));
  let base: Phaser.GameObjects.Graphics;
  let hints: Phaser.GameObjects.Graphics;
  let effects: ReturnType<typeof createSichuanEffects>;
  let comboBanner: ReturnType<typeof createComboBanner>;
  let hud: ReturnType<typeof createSichuanHud>;
  let previous: GameView | undefined;
  const pieces = new Map<number, RenderedTile>();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function paintTable(dark: boolean) {
    base.clear().fillStyle(dark ? 0x241f32 : 0xeaddca).fillRect(0, 0, tableSize, sichuanSceneHeight);
    base.fillStyle(0x181724, .35).fillRoundedRect(20, 27, 440, 435, 24);
  }

  function syncTiles(scene: Phaser.Scene, board: readonly Tile[], combo?: number) {
    for (let index = 0; index < board.length; index++) {
      const tile = board[index];
      if (tile === previous?.sichuan?.board[index]) continue;
      const existing = pieces.get(index);
      if (existing) {
        pieces.delete(index);
        if (tile === null && combo !== undefined && !motion.matches) {
          existing.veil?.setAlpha(0);
          effects.depart(existing.container, index === previous?.sichuan?.selected ? -1 : 1, combo);
        }
        else { scene.tweens.killTweensOf(existing.container); existing.container.destroy(); }
      }
      if (tile === null) continue;
      const [x, y] = tileCenter(index);
      const block = tile === obstacle;
      const shadow = scene.add.image(0, 3, cardFaceKey, theme).setDisplaySize(46, 46).setTint(0x251627).setAlpha(.56);
      const plate = scene.add.image(0, 0, cardFaceKey, theme).setDisplaySize(46, 46);
      if (block) plate.setTint(0x988a9e);
      const art = scene.add.image(0, 0, motifKey, frameName(tile)).setDisplaySize(36, 36);
      const container = scene.add.container(x, y, [shadow, plate, art]).setDepth(1).setScale(pitch / 50);
      pieces.set(index, { art, tile, container });
    }
  }

  function tintTile(scene: Phaser.Scene, tile: RenderedTile, color: number, border: number) {
    if (!tile.veil) {
      tile.veil = scene.add.graphics();
      tile.container.add(tile.veil);
    }
    return tile.veil.clear().fillStyle(color, .34).fillRoundedRect(-22, -22, 44, 44, 6)
      .lineStyle(2, border, 1).strokeRoundedRect(-21.5, -21.5, 43, 43, 6);
  }

  function rejectTile(scene: Phaser.Scene, index: number) {
    const tile = pieces.get(index);
    if (!tile || tile.tile !== obstacle) return;
    if (tile.rejection) scene.tweens.killTweensOf(tile.rejection);
    const feedback = { progress: 0 };
    tile.rejection = feedback;
    const [x] = tileCenter(index);
    const reduced = motion.matches;
    const veil = tintTile(scene, tile, 0xf03950, 0xff7990).setAlpha(reduced ? 1 : 0);
    tile.container.x = x;
    scene.tweens.add({ targets: feedback, progress: 1, duration: 500, ease: 'Linear',
      onUpdate: () => {
        if (reduced) return;
        const t = feedback.progress;
        veil.setAlpha(Math.sin(t * Math.PI * 2) ** 2);
        tile.container.x = x + Math.sin(t * Math.PI * 8) * (1 - t) * Math.min(7, pitch * .15);
      },
      onComplete: () => {
        veil.setAlpha(0);
        tile.container.x = x;
        tile.rejection = undefined;
      } });
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
    if (current.cursor !== null && current.cursor !== data.selected) paintTileMark(hints, ...tileCenter(current.cursor), pitch, 'focus');
  }

  return {
    preload(this: Phaser.Scene) {
      this.load.image(motifSourceKey, textures['../../assets/sichuan-themes/' + theme + '-atlas.jpg']);
      this.load.image(boardKey, textures['../../assets/sichuan-themes/' + theme + '-board.jpg']);
      loadCardFaces(this);
      loadSichuanHud(this);
      loadComboBanner(this);
    },
    create(this: Phaser.Scene) {
      prepareTileMotifs(this, theme, backFrame + 1);
      base = this.add.graphics();
      this.add.image(240, 240, boardKey).setDisplaySize(438, 438);
      hints = this.add.graphics().setDepth(2);
      effects = createSichuanEffects(this, theme, pitch);
      comboBanner = createComboBanner(this);
      hud = createSichuanHud(this);
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        hud.setHover(hud.hitTest(point.x, point.y));
      });
      this.input.on('gameout', () => hud.setHover(undefined));
      this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const current = view();
        if (!current.canMove) return;
        const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const down = this.cameras.main.getWorldPoint(pointer.downX, pointer.downY);
        const action = hud.hitTest(point.x, point.y);
        if (action && action === hud.hitTest(down.x, down.y)) current.sichuan?.hud[action]?.();
        if (point.y >= tableSize || down.y >= tableSize) return;
        const x = Math.round((point.x - offset) / pitch), y = Math.round((point.y - offset) / pitch);
        if (x >= 0 && x < size && y >= 0 && y < size) current.move(y * size + x);
      });
    },
    update(this: Phaser.Scene, time: number) {
      const current = view(), data = current.sichuan;
      if (!data) return;
      const before = previous?.sichuan;
      if (current.dark !== previous?.dark) paintTable(current.dark);
      const match = data.match !== before?.match ? data.match : undefined;
      if (data.board !== before?.board) syncTiles(this, data.board, match?.combo);
      if (data.flip && data.flip !== before?.flip) flipTiles(this, data.flip);
      if (data.selected !== before?.selected || data.hint !== before?.hint || current.cursor !== previous?.cursor) paintHints(current);
      if (data.selected !== before?.selected) {
        if (before?.selected !== undefined) pieces.get(before.selected)?.veil?.setAlpha(0);
        const selected = data.selected === undefined ? undefined : pieces.get(data.selected);
        if (selected) tintTile(this, selected, 0xffce39, 0xffda53).setAlpha(1);
      }
      if (data.rejected && data.rejected !== before?.rejected) rejectTile(this, data.rejected.index);
      if (match) {
        effects.emit(match.path.map(center), match.combo, time, motion.matches);
        if (match.combo > 1 && previous) comboBanner(match.combo, motion.matches);
      }
      effects.update(time);
      hud.update(data.hud, current.deadline);
      previous = current;
    },
  };
}
