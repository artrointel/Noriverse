import type Phaser from 'phaser';
import { tableSize } from '../table.ts';
import { brushStyles, eraserBrush, inkColors, maxEraserWidth, maxInkWidth } from './ink.ts';
import type { BoardEdit } from './ink.ts';
import hudToolArt from '../../assets/sketch-hud-tools.webp';
import hudPlateArt from '../../assets/sketch-hud-plates.webp';

export const sketchMapTop = 0;
export const sketchMapBottom = sketchMapTop + tableSize;
export const sketchSceneHeight = 594;
const toolsTexture = 'sketch-hud-tools';
const platesTexture = 'sketch-hud-plates';
const toolOrder = ['palette', ...brushStyles, 'eraser', 'undo', 'redo', 'clear', 'next', 'custom', 'clock'] as const;
const plateOrder = ['clock', 'word', 'panel', 'action'] as const;
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

export function loadSketchHud(scene: Phaser.Scene) {
  const atlas = (names: readonly string[], cols: number, w: number, h: number) => ({
    frames: Object.fromEntries(names.map((name, index) => [name, { frame: { x: index % cols * w, y: Math.floor(index / cols) * h, w, h } }])),
  });
  scene.load.atlas(toolsTexture, hudToolArt, atlas(toolOrder, 4, 128, 128));
  scene.load.atlas(platesTexture, hudPlateArt, atlas(plateOrder, 2, 384, 112));
}

export function createSketchHud(scene: Phaser.Scene) {
  const textLabels: Phaser.GameObjects.Text[] = [];
  const text = (x: number, y: number, size: number) => {
    const label = scene.add.text(x, y, '', {
      fontFamily: '"Sketch Jua", "Malgun Gothic", sans-serif', fontSize: size, color: '#fff8ee',
      stroke: '#21142f', strokeThickness: 2,
    }).setOrigin(.5).setResolution(2);
    textLabels.push(label);
    return label;
  };
  const rail = (key: typeof plateOrder[number], x: number, y: number, width: number, height: number) =>
    scene.add.image(x, y, platesTexture, key).setDisplaySize(width, height);
  const icon = (key: typeof toolOrder[number], x: number, y: number, size: number) =>
    scene.add.image(x, y, toolsTexture, key).setDisplaySize(size, size);
  rail('panel', 240, 537, 480, 114);
  rail('clock', 240, 22, 108, 36);
  icon('clock', 206, 22, 23);
  const clock = text(248, 22, 24);
  const wordPlate = rail('word', 240, 455, 224, 39);
  const word = text(240, 455, 22).setShadow(0, 1, '#13091e', 5, false, true);
  const status = text(240, 497, 15);
  const hints = text(240, 554, 15);
  const notice = text(240, 577, 13);
  const score = Array.from({ length: 4 }, (_, index) => text(63 + index * 117, 578, 15));
  const controls = scene.add.container();
  const widthLabel = text(32, 548, 13);
  const widthNumber = text(196, 548, 15);
  const recent = text(242, 548, 13);
  const track = scene.add.rectangle(108, 548, 84, 4, 0xaf9fd0).setOrigin(.5);
  const thumb = scene.add.circle(66, 548, 6, 0xffde9a);
  const sample = scene.add.circle(174, 548, 7, 0xffffff);
  controls.add([widthLabel, widthNumber, recent, track, thumb, sample]);

  function fit(label: Phaser.GameObjects.Text, value: string, width: number) {
    label.setText(value).setScale(Math.min(1, width / Math.max(1, label.width)), 1);
  }

  const button = (key: typeof toolOrder[number], i: number) => {
    const x = 24 + 48 * i;
    const plate = icon(key, x, 499, 33);
    const label = text(x, 520, 13);
    controls.add([plate, label]);
    return { key, x, y: 505, width: 45, height: 47, plate, label };
  };
  const buttons = (['palette', ...brushStyles, 'eraser'] as const).map((key, i) => ({ ...button(key, i), key }));
  const edits = (['undo', 'redo', 'clear', 'next'] as const).map((key, i) => ({ ...button(key, i + 6), key }));
  const custom = { x: 411, y: 575, width: 110, height: 29, plate: rail('action', 411, 575, 110, 28),
    icon: icon('custom', 367, 575, 21), label: text(421, 575, 13) };
  controls.add([custom.plate, custom.icon, custom.label]);
  const swatch = (x: number, y: number) => {
    const tile = scene.add.circle(x, y, 9, 0xffffff).setStrokeStyle(1.5, 0xe5c9e8);
    controls.add(tile);
    return tile;
  };
  const recentColors = Array.from({ length: 7 }, (_, index) => swatch(289 + index * 27, 548));
  const palette = inkColors.map((_, index) => swatch(28 + index * 40, 575));
  let view: SketchHudView | undefined;
  let paletteOpen = false;
  let slider: number | undefined;

  void document.fonts.load('16px "Sketch Jua"').then(() => {
    if (!scene.sys.isActive()) return;
    for (const label of textLabels) label.updateText();
    if (view) { const next = view; view = undefined; update(next); }
  }).catch(() => undefined);

  function update(next: SketchHudView) {
    if (view === next) return;
    view = next;
    const tool = next.tools;
    clock.setText(next.clock).setColor(next.low ? '#ffb777' : '#fff8ee');
    fit(word, next.wordLabel + '  ·  ' + next.word, 382);
    wordPlate.setDisplaySize(Math.max(136, Math.min(430, word.width + 48)), 39);
    fit(status, tool ? '' : next.status, 416);
    fit(hints, tool ? '' : next.hints.join('  ·  '), 421);
    fit(notice, tool && !paletteOpen ? next.notice ?? '' : '', 421);
    score.forEach((label, i) => {
      const player = next.scores[i];
      const width = 448 / Math.max(1, next.scores.length);
      label.setX(16 + width * (i + .5));
      fit(label, player && !(tool && (paletteOpen || next.notice)) ? player.name + '  ' + player.score : '', width - 8);
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
    custom.icon.setVisible(paletteOpen);
    fit(custom.label, paletteOpen ? tool.labels.custom : '', 81);
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
      if (x >= 59 && x <= 157 && Math.abs(y - 548) <= 13) {
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
      const last = recentColors.findIndex(tile => tile.visible && Math.hypot(tile.x - x, tile.y - y) <= 13);
      if (last >= 0) tool.setColor(tool.recent[last]);
      if (paletteOpen) {
        const tone = palette.findIndex(tile => Math.hypot(tile.x - x, tile.y - y) <= 15);
        if (tone >= 0) tool.setColor(inkColors[tone]);
        if (matches(custom, x, y)) tool.custom();
      }
      return true;
    },
    move(pointer: Phaser.Input.Pointer) { if (slider === pointer.id && pointer.isDown) changeWidth(pointer.worldX); },
    up(pointer: Phaser.Input.Pointer) { if (slider === pointer.id) slider = undefined; },
    cancel() { slider = undefined; },
  };
}
