import Phaser from 'phaser';
import type { AlkkagiStatus } from './alkkagi/rules.ts';
import { tableSize } from './table.ts';
import { alkkagiScene } from './alkkagi/scene.ts';
import { omokScene } from './omok/scene.ts';

export type GameId = 'omok' | 'physics';
export interface GameView {
  history: number[];
  cursor: number | null;
  dark: boolean;
  force: number;
  practice: boolean;
  allowDoubleThree: boolean;
  canMove: boolean;
  move: (index: number) => void;
  onAlkkagi: (status: AlkkagiStatus) => void;
}

export function mountGame(parent: HTMLElement, id: GameId, current: () => GameView, onReady: () => void) {
  const scene = id === 'omok' ? omokScene(current) : alkkagiScene(current);
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
