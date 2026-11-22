import type Phaser from 'phaser';
import type { GameId } from '../../../../packages/protocol/games.ts';
import type { GameView } from './game-view.ts';

export type SceneFactory = (view: () => GameView) => {
  preload?(this: Phaser.Scene): void;
  create(this: Phaser.Scene): void;
  update?(this: Phaser.Scene, time: number, delta: number): void;
};

export const sceneLoaders: Record<GameId, () => Promise<SceneFactory>> = {
  omok: () => import('./omok/scene.ts').then(module => module.omokScene),
  physics: () => import('./alkkagi/scene.ts').then(module => module.alkkagiScene),
  othello: () => import('./othello/scene.ts').then(module => module.othelloScene),
  chess: () => import('./chess/scene.ts').then(module => module.chessScene),
  sichuan: () => import('./sichuan/scene.ts').then(module => module.sichuanScene),
  memory: () => import('./sichuan/scene.ts').then(module => module.sichuanScene),
  sketch: () => import('./sketch/scene.ts').then(module => module.sketchScene),
  liar: () => import('./liar/scene.ts').then(module => module.liarScene),
  slime: () => import('./slime/scene.ts').then(module => module.slimeScene),
  mole: () => import('./mole/scene.ts').then(module => module.moleScene),
};
