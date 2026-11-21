import type Phaser from 'phaser';
import type { SceneFactory } from '../scene-loader.ts';
import { tableSize } from '../table.ts';
import { inkBatch, inkColors, inkWidths } from './rules.ts';
import type { Ink } from './rules.ts';

const paper = 0xfffcf3;
const unit = tableSize / 1000;

function lineOn(graphics: Phaser.GameObjects.Graphics, [x, y, endX, endY, color, width]: Ink) {
  const radius = inkWidths[width] / 2;
  graphics.lineStyle(radius * 2, inkColors[color]).lineBetween(x * unit, y * unit, endX * unit, endY * unit);
  graphics.fillStyle(inkColors[color]).fillCircle(endX * unit, endY * unit, radius);
}

export const sketchScene: SceneFactory = current => {
  let canvas: Phaser.GameObjects.Graphics;
  let preview: Phaser.GameObjects.Graphics;
  let last: [number, number] | undefined;
  let pointerId: number | undefined;
  let queued: Ink[] = [];
  let displayed: readonly Ink[] = [];
  let previewInk: { line: Ink; expires: number }[] = [];
  let nextSend = 0;
  let epoch: string | undefined;

  function flush(now: number) {
    if (!queued.length) return;
    current().sketch?.send(queued.splice(0, inkBatch));
    nextSend = now + 50;
  }

  function point(pointer: Phaser.Input.Pointer): [number, number] {
    const bound = (position: number) => Math.max(0, Math.min(1000, Math.round(position / unit)));
    return [bound(pointer.worldX), bound(pointer.worldY)];
  }

  function add(position: [number, number]) {
    const view = current().sketch;
    if (!view || !current().canMove || !last) return;
    const line: Ink = [...last, ...position, view.color, view.width];
    queued.push(line);
    previewInk.push({ line, expires: performance.now() + 230 });
    last = position;
    if (queued.length >= inkBatch) flush(performance.now());
  }

  return {
    create() {
      this.add.graphics().fillStyle(paper).fillRect(0, 0, tableSize, tableSize);
      const grid = this.add.graphics().fillStyle(0xe4dece);
      for (let y = 14; y < tableSize; y += 16) for (let x = 14; x < tableSize; x += 16) grid.fillCircle(x, y, .63);
      canvas = this.add.graphics();
      preview = this.add.graphics();
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!current().canMove || pointerId !== undefined || !pointer.leftButtonDown()) return;
        last = point(pointer);
        pointerId = pointer.id;
        add(last);
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (pointer.id !== pointerId || !pointer.isDown || !last) return;
        const position = point(pointer);
        if (Math.hypot(position[0] - last[0], position[1] - last[1]) >= 3) add(position);
      });
      const up = (pointer: Phaser.Input.Pointer) => {
        if (pointer.id !== pointerId) return;
        pointerId = undefined;
        last = undefined;
        flush(performance.now());
      };
      this.input.on('pointerup', up);
      this.input.on('pointerupoutside', up);
    },
    update() {
      const view = current().sketch;
      if (!view) return;
      if (epoch !== view.epoch) {
        epoch = view.epoch;
        queued = [];
        previewInk = [];
        pointerId = undefined;
        last = undefined;
      }
      const board = view.board;
      if (board !== displayed) {
        let start = displayed.length;
        if (board.length < start || board[0] !== displayed[0]) { canvas.clear(); start = 0; }
        for (let i = start; i < board.length; i++) lineOn(canvas, board[i]);
        displayed = board;
      }
      const now = performance.now();
      if (current().canMove && now >= nextSend) flush(now);
      if (previewInk.length) {
        preview.clear();
        previewInk = previewInk.filter(entry => entry.expires > now && current().canMove);
        for (const entry of previewInk) lineOn(preview, entry.line);
      } else preview.clear();
    },
  };
};
