import type Phaser from 'phaser';
import type { SceneFactory } from '../scene-loader.ts';
import { tableSize } from '../table.ts';
import { brushWidth, eraserBrush, inkBatch } from './ink.ts';
import type { Ink } from './ink.ts';
import type { SketchMap } from './rules.ts';
import { createSketchHud, loadSketchHud, sketchMapTop } from './hud.ts';
import laptop from '../../assets/sketch-maps/laptop.webp';
import notebook from '../../assets/sketch-maps/notebook.webp';
import chalkboard from '../../assets/sketch-maps/chalkboard.webp';
import easel from '../../assets/sketch-maps/easel.webp';
import postcard from '../../assets/sketch-maps/postcard.webp';

const maps = { laptop, notebook, chalkboard, easel, postcard };
const unit = tableSize / 1000;
const mapTexture = (map: SketchMap) => 'sketch-map-' + map;
const inkTexture = 'sketch-ink-layer';
const rasterScale = 2;
const rasterSize = tableSize * rasterScale;

function dab(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function lineOn(context: CanvasRenderingContext2D, [x, y, endX, endY, color, width, brush]: Ink) {
  const startX = x * unit, startY = y * unit, stopX = endX * unit, stopY = endY * unit;
  const length = Math.hypot(stopX - startX, stopY - startY);
  const ink = '#' + color.toString(16).padStart(6, '0');
  context.globalCompositeOperation = brush === eraserBrush ? 'destination-out' : 'source-over';
  context.fillStyle = ink;
  context.strokeStyle = ink;
  if (brush === 2) {
    const count = Math.max(4, Math.min(36, Math.ceil(length * 1.4)));
    for (let i = 0; i < count; i++) {
      const scatter = ((x * 23 + y * 41 + endX * 7 + endY * 47 + i * 179) % 113) / 113;
      const angle = i * 2.39996 + scatter;
      const radius = scatter * width * .53;
      const px = startX + (stopX - startX) * i / count + Math.cos(angle) * radius;
      const py = startY + (stopY - startY) * i / count + Math.sin(angle) * radius;
      context.globalAlpha = .33 + scatter * .46;
      dab(context, px, py, Math.max(.5, width * (.055 + scatter * .045)));
    }
    return;
  }
  context.globalAlpha = brush === 3 ? .34 : 1;
  if (length === 0) {
    dab(context, stopX, stopY, width / 2);
    return;
  }
  context.lineWidth = width;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(stopX, stopY);
  context.stroke();
}

export const sketchScene: SceneFactory = current => {
  let texture: Phaser.Textures.CanvasTexture;
  let hud: ReturnType<typeof createSketchHud>;
  const ink = document.createElement('canvas');
  ink.width = rasterSize;
  ink.height = rasterSize;
  const committed = ink.getContext('2d')!;
  committed.scale(rasterScale, rasterScale);
  let last: [number, number] | undefined;
  let drawingPointer: Phaser.Input.Pointer | undefined;
  let sampleAt = 0;
  let sampledSegments = 0;
  let sampledWidth = 1;
  let queued: Ink[] = [];
  let displayed: readonly Ink[] = [];
  let previewInk: { line: Ink; expires: number }[] = [];
  let redraw = true;
  let nextSend = 0;
  let epoch: string | undefined;
  let stroke = 0;
  let background: Phaser.GameObjects.Image;
  let map: SketchMap | undefined;
  let loading: SketchMap | undefined;

  function flush(now: number) {
    if (!queued.length) return;
    current().sketch?.send(queued.splice(0, inkBatch));
    nextSend = now + 50;
  }

  function point(pointer: Phaser.Input.Pointer): [number, number] {
    const bound = (position: number) => Math.max(0, Math.min(1000, Math.round(position / unit)));
    return [bound(pointer.worldX), bound(pointer.worldY - sketchMapTop)];
  }

  function add(position: [number, number], now: number) {
    const view = current().sketch;
    if (!view || !current().canMove || !last) return;
    const speed = Math.hypot(position[0] - last[0], position[1] - last[1]) * unit / Math.max(4, now - sampleAt);
    sampledWidth = view.brush === 1 ? brushWidth(view.width, speed, sampledWidth) : view.width;
    const line: Ink = [...last, ...position, view.brush === eraserBrush ? 0 : view.color, sampledWidth, view.brush, stroke];
    queued.push(line);
    previewInk.push({ line, expires: now + 230 });
    redraw = true;
    last = position;
    sampleAt = now;
    sampledSegments++;
    if (queued.length >= inkBatch) flush(now);
  }

  function samplingInterval() {
    const view = current().sketch;
    const count = view?.online ? Math.max(view.board.length + queued.length, sampledSegments) : 0;
    return count >= 2100 ? 150 : count >= 1100 ? 82 : 0;
  }

  function finishStroke() {
    drawingPointer = undefined;
    last = undefined;
    if (current().canMove) flush(performance.now());
    else queued = [];
  }

  return {
    preload() {
      loadSketchHud(this);
      const first = current().sketch?.map;
      if (first) this.load.image(mapTexture(first), maps[first]);
    },
    create() {
      this.add.graphics().fillStyle(0xfffcf3).fillRect(0, sketchMapTop, tableSize, tableSize);
      background = this.add.image(0, sketchMapTop, '__MISSING').setOrigin(0).setVisible(false);
      const layer = this.textures.createCanvas(inkTexture, rasterSize, rasterSize);
      if (!layer) throw new Error('Could not create sketch ink texture');
      texture = layer;
      texture.getContext().scale(rasterScale, rasterScale);
      this.add.image(0, sketchMapTop, inkTexture).setOrigin(0).setDisplaySize(tableSize, tableSize);
      hud = createSketchHud(this);
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.leftButtonDown() || hud.down(pointer) || !current().canMove || drawingPointer) return;
        if ([pointer.worldX, pointer.worldY - sketchMapTop].some(coordinate => coordinate < 0 || coordinate > tableSize)) return;
        stroke = Math.max(stroke, current().sketch?.board.at(-1)?.[7] ?? 0) + 1;
        last = point(pointer);
        drawingPointer = pointer;
        sampledWidth = current().sketch?.width ?? 1;
        const now = performance.now();
        if (now - sampleAt >= samplingInterval()) add(last, now);
      });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        hud.move(pointer);
        if (pointer !== drawingPointer || !pointer.isDown || !last) return;
        const position = point(pointer);
        const now = performance.now();
        if (Math.hypot(position[0] - last[0], position[1] - last[1]) >= 3 && now - sampleAt >= samplingInterval()) add(position, now);
      });
      const up = (pointer: Phaser.Input.Pointer) => {
        hud.up(pointer);
        if (pointer === drawingPointer) finishStroke();
      };
      this.input.on('pointerup', up);
      this.input.on('pointerupoutside', up);
      const release = () => {
        if (drawingPointer) finishStroke();
        hud.cancel();
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
      window.addEventListener('blur', release);
      this.events.once('shutdown', () => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        window.removeEventListener('blur', release);
      });
    },
    update() {
      const view = current().sketch;
      if (!view) return;
      hud.update(view.hud);
      if (map !== view.map) {
        const texture = mapTexture(view.map);
        if (this.textures.exists(texture)) {
          background.setTexture(texture).setDisplaySize(tableSize, tableSize).setVisible(true);
          map = view.map;
        } else if (loading !== view.map) {
          loading = view.map;
          this.load.image(texture, maps[view.map]).start();
        }
      }
      if (epoch !== view.epoch) {
        epoch = view.epoch;
        queued = [];
        previewInk = [];
        redraw = true;
        drawingPointer = undefined;
        last = undefined;
        sampleAt = 0;
        sampledSegments = view.board.length;
      }
      if (drawingPointer && (!drawingPointer.isDown || !current().canMove)) finishStroke();
      const board = view.board;
      if (board !== displayed) {
        let start = displayed.length;
        if (board.length < start || board[0] !== displayed[0] || board[Math.max(0, start - 1)] !== displayed[Math.max(0, start - 1)]) {
          committed.clearRect(0, 0, tableSize, tableSize);
          start = 0;
        }
        for (let i = start; i < board.length; i++) lineOn(committed, board[i]);
        if (previewInk.length) {
          const accepted = new Set(board.slice(-inkBatch * 2).map(line => line.join()));
          previewInk = previewInk.filter(({ line }) => !accepted.has(line.join()));
        }
        displayed = board;
        redraw = true;
      }
      const now = performance.now();
      if (current().canMove && now >= nextSend) flush(now);
      if (previewInk.length && (!current().canMove || previewInk[0].expires <= now)) {
        previewInk = previewInk.filter(entry => entry.expires > now && current().canMove);
        redraw = true;
      }
      if (redraw) {
        const context = texture.getContext();
        context.clearRect(0, 0, tableSize, tableSize);
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 1;
        context.drawImage(ink, 0, 0, tableSize, tableSize);
        for (const entry of previewInk) lineOn(context, entry.line);
        texture.refresh();
        redraw = false;
      }
    },
  };
};
