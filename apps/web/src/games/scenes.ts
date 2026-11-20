import Phaser from 'phaser';
import type { ProfileGame } from '../../../../packages/protocol/profile.ts';
import type { AlkkagiStatus, Flick, FlickRound, StonePosition } from './alkkagi/rules.ts';
import type { TargetMark } from './board-marks.ts';
import { tableSize } from './table.ts';
import { alkkagiScene } from './alkkagi/scene.ts';
import { omokScene } from './omok/scene.ts';
import { othelloScene } from './othello/scene.ts';
import { chessScene } from './chess/scene.ts';

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
  onlineFlick?: FlickRound & { host: boolean; send: (shot: Flick) => void; settle: (layout: StonePosition[], revision: number) => void };
}

export function mountGame(parent: HTMLElement, id: GameId, antialias: boolean, initialSize: number, current: () => GameView, onReady: (size: number) => void) {
  const scene = { omok: omokScene, othello: othelloScene, chess: chessScene, physics: alkkagiScene }[id](current);
  let size = initialSize;
  let camera: Phaser.Cameras.Scene2D.Camera | undefined;

  function applyResolution(game: Phaser.Game) {
    if (camera && game.scale.gameSize.width !== size) game.scale.setGameSize(size, size);
    camera?.setSize(size, size).setOrigin(0, 0).setZoom(size / tableSize);
    return game.canvas?.width || initialSize;
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: initialSize,
    height: initialSize,
    render: { antialias, antialiasGL: antialias },
    backgroundColor: current().dark ? '#272132' : '#e8ddd1',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: id === 'physics' ? { default: 'arcade', arcade: { fps: 90 } } : undefined,
    scene: {
      key: id,
      ...scene,
      create(this: Phaser.Scene) {
        camera = this.cameras.main;
        const applied = applyResolution(this.game);
        if (id === 'physics') this.physics.world.setBounds(0, 0, tableSize, tableSize);
        scene.create.call(this);
        onReady(applied);
      },
    },
  });
  return {
    resize(next: number) { size = next; return applyResolution(game); },
    destroy() { game.destroy(true); },
  };
}
