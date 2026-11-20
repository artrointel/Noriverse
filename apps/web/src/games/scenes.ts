import Phaser from 'phaser';
import type { ProfileGame } from '../../../../packages/protocol/profile.ts';
import type { AlkkagiStatus, Flick, FlickRound, StonePosition } from './alkkagi/rules.ts';
import type { TargetMark } from './board-marks.ts';
import { tableSize } from './table.ts';
import { alkkagiScene } from './alkkagi/scene.ts';
import { omokScene } from './omok/scene.ts';
import { othelloScene } from './othello/scene.ts';
import { chessScene } from './chess/scene.ts';
import { sichuanScene } from './sichuan/scene.ts';
import type { Tile, TilePoint } from './sichuan/rules.ts';
import type { SichuanSize, SichuanTheme } from './sichuan/options.ts';
import type { RenderSize } from './render-resolution.ts';
import type { SichuanHudView } from './sichuan/hud.ts';

export type GameId = ProfileGame;
export interface GameView {
  history: number[];
  cursor: number | null;
  chessSelected?: number;
  chessTargets: ReadonlyMap<number, TargetMark>;
  dark: boolean;
  force: number;
  allowDoubleThree: boolean;
  canMove: boolean;
  deadline: number;
  finished: boolean;
  move: (index: number, touch?: boolean) => void;
  onAlkkagi: (status: AlkkagiStatus) => void;
  localFlick?: FlickRound;
  onlineFlick?: FlickRound & { host: boolean; send: (shot: Flick) => void; settle: (layout: StonePosition[], revision: number) => void };
  sichuan?: { board: readonly Tile[]; size: SichuanSize; theme: SichuanTheme; selected?: number;
    hint?: readonly [number, number]; match?: { path: readonly TilePoint[]; combo: number }; rejected?: { index: number };
    flip?: 'backs' | 'faces'; hud: SichuanHudView };
}

export function mountGame(parent: HTMLElement, id: GameId, antialias: boolean, initialSize: RenderSize, current: () => GameView, onReady: () => void) {
  const scene = { omok: omokScene, othello: othelloScene, chess: chessScene, physics: alkkagiScene, sichuan: sichuanScene }[id](current);
  let size = initialSize;
  let camera: Phaser.Cameras.Scene2D.Camera | undefined;

  function applyResolution(game: Phaser.Game) {
    if (!camera) return;
    if (game.scale.gameSize.width !== size.width || game.scale.gameSize.height !== size.height) game.scale.resize(size.width, size.height);
    camera.setSize(size.width, size.height).setOrigin(0, 0).setZoom(size.width / tableSize);
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: initialSize.width,
    height: initialSize.height,
    render: { antialias, antialiasGL: antialias, mipmapFilter: id === 'sichuan' && antialias ? 'LINEAR_MIPMAP_LINEAR' : undefined },
    backgroundColor: current().dark ? '#272132' : '#e8ddd1',
    scale: { mode: Phaser.Scale.NONE },
    physics: id === 'physics' ? { default: 'arcade', arcade: { fps: 90 } } : undefined,
    scene: {
      key: id,
      ...scene,
      create(this: Phaser.Scene) {
        camera = this.cameras.main;
        applyResolution(this.game);
        if (id === 'physics') this.physics.world.setBounds(0, 0, tableSize, tableSize);
        scene.create.call(this);
        onReady();
      },
    },
  });
  return {
    resize(next: RenderSize) { size = next; applyResolution(game); },
    refreshInputBounds() {
      if (!camera) return;
      const scale = game.scale;
      scale.updateBounds();
      const { width, height } = scale.canvasBounds;
      if (width && height) scale.displayScale.set(scale.baseSize.width / width, scale.baseSize.height / height);
    },
    destroy() { game.destroy(true); },
  };
}
