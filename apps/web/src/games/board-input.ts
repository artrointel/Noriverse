import type Phaser from 'phaser';
import type { GameView } from './game-view.ts';

export function bindBoardInput(scene: Phaser.Scene, view: () => GameView, size: number, origin: number, pitch: number, snap = Math.floor) {
  scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    const current = view();
    if (!current.canMove && !current.canInspect) return;
    const point = scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const column = snap((point.x - origin) / pitch);
    const row = snap((point.y - origin) / pitch);
    if (column >= 0 && column < size && row >= 0 && row < size) current.move(row * size + column, pointer.wasTouch);
  });
}
