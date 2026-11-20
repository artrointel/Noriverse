import Phaser from 'phaser';
import type { ProfileGame } from '../../../../packages/protocol/profile.ts';
import type { AlkkagiStatus } from './alkkagi/rules.ts';
import { tableSize } from './table.ts';
import { alkkagiScene } from './alkkagi/scene.ts';
import { omokScene } from './omok/scene.ts';
import { othelloScene } from './othello/scene.ts';

export type GameId = ProfileGame;
export interface GameView {
  history: number[];
  cursor: number | null;
  dark: boolean;
  force: number;
  allowDoubleThree: boolean;
  canMove: boolean;
  finished: boolean;
  move: (index: number) => void;
  onAlkkagi: (status: AlkkagiStatus) => void;
}

export function mountGame(parent: HTMLElement, id: GameId, current: () => GameView, onReady: () => void) {
  const scene = { omok: omokScene, othello: othelloScene, physics: alkkagiScene }[id](current);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: tableSize,
    height: tableSize,
    backgroundColor: current().dark ? '#272132' : '#e8ddd1',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: id === 'physics' ? { default: 'arcade', arcade: { fps: 90 } } : undefined,
    scene: {
      key: id,
      ...scene,
      create(this: Phaser.Scene) {
        scene.create.call(this);
        onReady();
      },
    },
  });
  return () => game.destroy(true);
}
