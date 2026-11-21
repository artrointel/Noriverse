import type Phaser from 'phaser';
import { tableSize } from '../table.ts';
import { brushStyles, eraserBrush, inkColors, maxEraserWidth, maxInkWidth } from './ink.ts';
import type { BoardEdit } from './ink.ts';
import hudArt from '../../assets/sketch-hud.webp';

export const sketchMapTop = 42;
export const sketchMapBottom = sketchMapTop + tableSize;
export const sketchSceneHeight = 722;
const texture = 'sketch-hud';
type HudLabel = 'palette' | 'custom' | 'recent' | 'width' | 'eraser' | 'undo' | 'redo' | 'clear' | 'next' | typeof brushStyles[number];
export type SketchHudView = {
  clock: string; low: boolean; word: string; wordLabel: string; status: string; notice?: string; hints: string[];
  scores: { name: string; score: number; drawing: boolean }[];
  tools?: {
    labels: Record<HudLabel, string>; recent: number[]; color: number; brush: number; width: number;
    canUndo: boolean; canRedo: boolean;
    setBrush: (brush: number) => void; setWidth: (width: number) => void; setColor: (color: number) => void;
    custom: () => void; edit: (action: BoardEdit) => void; next?: () => void;
  };
};

export function loadSketchHud(scene: Phaser.Scene) { scene.load.image(texture, hudArt); }

export function createSketchHud(scene: Phaser.Scene) {
  const text = (x: number, y: number, size: number) => scene.add.text(x, y, '', {
    fontFamily: 'system-ui, "Malgun Gothic", sans-serif', fontSize: size, fontStyle: 'bold', color: '#fff8ee',
    stroke: '#21142f', strokeThickness: 2,
  }).setOrigin(.5).setResolution(2);
  const rail = (x: number, y: number, width: number, height: number) => scene.add.image(x, y, texture).setDisplaySize(width, height);
  rail(240, 21, 132, 39);
  rail(240, 620, 475, 194);
  const clock = text(240, 21, 24);
  const word = text(240, 544, 20);
  const status = text(240, 571, 15);
  const hints = text(240, 644, 15);
  const notice = text(240, 673, 13);
  const score = Array.from({ length: 4 }, (_, index) => text(63 + index * 117, 699, 15));
  const controls = scene.add.container();
  const widthLabel = text(32, 613, 13);
  const widthNumber = text(197, 613, 15);
  const recent = text(42, 648, 13);
  const track = scene.add.rectangle(108, 613, 84, 4, 0x9584a6).setOrigin(.5);
  const thumb = scene.add.circle(66, 613, 7, 0xffde9a);
  const sample = scene.add.circle(174, 613, 7, 0xffffff);
  controls.add([widthLabel, widthNumber, recent, track, thumb, sample]);

  function fit(label: Phaser.GameObjects.Text, value: string, width: number) {
    label.setText(value).setScale(Math.min(1, width / Math.max(1, label.width)), 1);
  }

  const button = (x: number, y: number, width: number, height = 32) => {
    const plate = rail(x, y, width, height).setAlpha(.77);
    const label = text(x, y, 15);
    controls.add([plate, label]);
    return { x, y, width, height, plate, label };
  };
  const buttons = (['palette', ...brushStyles, 'eraser'] as const).map((key, i) => ({ key, ...button(45 + 78 * i, 576, 74) }));
  const edits = (['undo', 'redo', 'clear', 'next'] as const).map((key, i) => ({ key, ...button(242 + 65 * i, 613, 62) }));
  const custom = button(418, 673, 91, 29);
  const swatch = (x: number, y: number) => {
    const tile = scene.add.circle(x, y, 12, 0xffffff).setStrokeStyle(1.5, 0xe5c9e8);
    controls.add(tile);
    return tile;
  };
  const recentColors = Array.from({ length: 7 }, (_, index) => swatch(92 + index * 43, 648));
  const palette = inkColors.map((_, index) => swatch(43 + index * 41, 673));
  let view: SketchHudView | undefined;
  let paletteOpen = false;
  let slider: number | undefined;

  function update(next: SketchHudView) {
    if (view === next) return;
    view = next;
    const tool = next.tools;
    clock.setText(next.clock).setColor(next.low ? '#ffb777' : '#fff8ee');
    fit(word, next.wordLabel + '  ·  ' + next.word, 419);
    fit(status, tool ? '' : next.status, 416);
    fit(hints, tool ? '' : next.hints.join('  ·  '), 421);
    fit(notice, tool && !paletteOpen ? next.notice ?? '' : '', 421);
    score.forEach((label, i) => {
      const player = next.scores[i];
      const width = 448 / Math.max(1, next.scores.length);
      label.setX(16 + width * (i + .5));
      fit(label, player ? player.name + '  ' + player.score : '', width - 8);
      label.setColor(player?.drawing ? '#ffe3a6' : '#fff8ee');
    });
    controls.setVisible(Boolean(tool));
    if (!tool) { paletteOpen = false; slider = undefined; return; }
    const erasing = tool.brush === eraserBrush;
    const max = erasing ? maxEraserWidth : maxInkWidth;
    fit(widthLabel, tool.labels.width, 56);
    widthNumber.setText(String(tool.width));
    fit(recent, tool.labels.recent, 59);
    thumb.setX(66 + 84 * (tool.width - 1) / (max - 1));
    sample.setRadius(Math.min(14, Math.max(1, tool.width / 4))).setFillStyle(tool.color, erasing ? 0 : 1)
      .setStrokeStyle(erasing ? 1.4 : 0, 0xffe3a6);
    for (const [index, item] of buttons.entries()) {
      fit(item.label, tool.labels[item.key], item.width - 8);
      const selected = index === 0 ? paletteOpen : index === tool.brush + 1;
      item.plate.setTint(selected ? 0xffc77d : 0xffffff);
      item.label.setColor(selected ? '#ffe4a7' : '#fff8ee');
    }
    for (const item of edits) {
      const disabled = item.key === 'redo' ? !tool.canRedo : item.key === 'next' ? !tool.next : !tool.canUndo;
      item.plate.setVisible(item.key !== 'next' || Boolean(tool.next)).setAlpha(disabled ? .28 : .8);
      fit(item.label, item.key === 'next' && !tool.next ? '' : tool.labels[item.key], item.width - 7);
      item.label.setAlpha(disabled ? .45 : 1);
    }
    recentColors.forEach((tile, index) => {
      const color = tool.recent[index];
      tile.setVisible(color !== undefined).setFillStyle(color ?? 0).setStrokeStyle(color === tool.color && !erasing ? 3 : 1.5, 0xe5c9e8);
    });
    palette.forEach((tile, i) => tile.setVisible(paletteOpen).setFillStyle(inkColors[i])
      .setStrokeStyle(inkColors[i] === tool.color && !erasing ? 3 : 1.5, 0xe5c9e8));
    custom.plate.setVisible(paletteOpen);
    fit(custom.label, paletteOpen ? tool.labels.custom : '', 83);
  }

  const matches = (hit: { x: number; y: number; width: number; height: number }, x: number, y: number) =>
    Math.abs(hit.x - x) <= hit.width / 2 && Math.abs(hit.y - y) <= hit.height / 2;

  function changeWidth(x: number) {
    if (!view?.tools) return;
    const range = view.tools.brush === eraserBrush ? maxEraserWidth : maxInkWidth;
    const width = Math.round(1 + (range - 1) * Math.min(1, Math.max(0, (x - 66) / 84)));
    if (width !== view.tools.width) view.tools.setWidth(width);
  }

  return {
    update,
    down(pointer: Phaser.Input.Pointer) {
      const tool = view?.tools;
      const { worldX: x, worldY: y } = pointer;
      if (!tool || y < sketchMapBottom) return false;
      if (x >= 59 && x <= 157 && Math.abs(y - 613) <= 17) {
        slider = pointer.id;
        changeWidth(x);
        return true;
      }
      const brush = buttons.findIndex(item => matches(item, x, y));
      if (brush === 0 && view) { paletteOpen = !paletteOpen; const next = view; view = undefined; update(next); }
      if (brush > 0) tool.setBrush(brush - 1);
      const apply = edits.find(item => matches(item, x, y))?.key;
      if (apply === 'next') tool.next?.();
      else if (apply && (apply === 'redo' ? tool.canRedo : tool.canUndo)) tool.edit(apply);
      const last = recentColors.findIndex(tile => tile.visible && Math.hypot(tile.x - x, tile.y - y) <= 17);
      if (last >= 0) tool.setColor(tool.recent[last]);
      if (paletteOpen) {
        const tone = palette.findIndex(tile => Math.hypot(tile.x - x, tile.y - y) <= 17);
        if (tone >= 0) tool.setColor(inkColors[tone]);
        if (matches(custom, x, y)) tool.custom();
      }
      return true;
    },
    move(pointer: Phaser.Input.Pointer) { if (slider === pointer.id && pointer.isDown) changeWidth(pointer.worldX); },
    up(pointer: Phaser.Input.Pointer) { if (slider === pointer.id) slider = undefined; },
  };
}
