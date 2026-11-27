import type { InteractionChallenge } from './challenge.ts';
import type { Box, Point } from './outpost.ts';
import { screen } from './outpost.ts';

export function createGridPuzzle(size: number, random = Math.random) {
  if (!Number.isInteger(size) || size < 2 || size > 8) throw new RangeError('Invalid puzzle size');
  const count = size ** 2;
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const placed = new Set(order.slice(0, Math.floor(count / 2)));
  const rack = order.slice(placed.size);
  return {
    size, count, rack,
    isPlaced: (piece: number) => placed.has(piece),
    get progress() { return placed.size; },
    get solved() { return placed.size === count; },
    place(piece: number, cell: number) {
      if (piece !== cell || !rack.includes(piece) || placed.has(cell)) return false;
      placed.add(cell);
      return true;
    },
  };
}

const board = { x: 82, y: 64, width: 161, height: 161 };
const dismiss = { x: 391, y: 34, width: 25, height: 21 };
const isInside = (point: Point, box: Box) => point.x >= box.x && point.x < box.x + box.width && point.y >= box.y && point.y < box.y + box.height;

function piecePath(size: number, id: number, point: Point, scale: number) {
  const path = new Path2D();
  const col = id % size, row = Math.floor(id / size);
  const tab = (key: number) => (key * 71 + Math.floor(key / 3)) % 5 < 2 ? -1 : 1;
  const edge = (x: number, y: number, dx: number, dy: number, shape: number) => {
    const at = (a: number, b: number): [number, number] =>
      [point.x + (x + dx * a + dy * b * shape) * scale, point.y + (y + dy * a - dx * b * shape) * scale];
    if (shape) {
      path.lineTo(...at(.38, 0));
      path.bezierCurveTo(...at(.32, .09), ...at(.37, .18), ...at(.50, .18));
      path.bezierCurveTo(...at(.63, .18), ...at(.68, .09), ...at(.62, 0));
    }
    path.lineTo(...at(1, 0));
  };
  path.moveTo(point.x, point.y);
  edge(0, 0, 1, 0, row ? -tab(id - size + size ** 2) : 0);
  edge(1, 0, 0, 1, col < size - 1 ? tab(id) : 0);
  edge(1, 1, -1, 0, row < size - 1 ? tab(id + size ** 2) : 0);
  edge(0, 1, 0, -1, col ? -tab(id - 1) : 0);
  path.closePath();
  return path;
}

function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string) {
  ctx.font = `${size}px "Sketch Jua", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function piecePuzzle(image: CanvasImageSource, size: number, title: string): InteractionChallenge {
  const layout = createGridPuzzle(size);
  const cell = board.width / size;
  const columns = Math.max(4, size);
  const rows = Math.ceil(layout.rack.length / columns);
  const stride = Math.min(37, 151 / columns, 102 / rows);
  const trayCell = stride * .72;
  let drag: { id: number; piece: number; cursor: Point } | undefined;
  let feedback: { at: number; correct: boolean; cell: number } | undefined;
  const forCell = (n: number) => ({ x: board.x + n % size * cell, y: board.y + Math.floor(n / size) * cell });
  const forRack = (n: number) => ({ x: 262 + n % columns * stride, y: 83 + Math.floor(n / columns) * stride });

  function drawPiece(ctx: CanvasRenderingContext2D, piece: number, location: Point, w: number, stroke: string) {
    const path = piecePath(size, piece, location, w);
    ctx.save(); ctx.clip(path);
    ctx.drawImage(image, location.x - piece % size * w, location.y - Math.floor(piece / size) * w, w * size, w * size);
    ctx.restore();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = .75;
    ctx.stroke(path);
  }

  return {
    get solved() { return layout.solved; },
    pointerDown(id, point) {
      if (isInside(point, dismiss)) return 'close';
      if (drag) return;
      const index = layout.rack.findIndex((piece, i) => !layout.isPlaced(piece) && isInside(point, { ...forRack(i), width: stride, height: stride }));
      if (index < 0) return;
      drag = { id, piece: layout.rack[index], cursor: point };
      return 'pickup';
    },
    pointerMove(id, point) {
      if (drag?.id === id) drag.cursor = point;
    },
    pointerUp(id, point, time) {
      if (drag?.id !== id) return;
      const { piece } = drag;
      drag = undefined;
      if (!isInside(point, board)) return 'miss';
      const target = Math.floor((point.y - board.y) / cell) * size + Math.floor((point.x - board.x) / cell);
      const correct = layout.place(piece, target);
      feedback = { at: time, correct, cell: target };
      return layout.solved ? 'solved' : correct ? 'placed' : 'miss';
    },
    cancelDrag() { drag = undefined; },
    draw(ctx, time) {
      ctx.save();
      const opacity = ctx.globalAlpha;
      ctx.fillStyle = '#020c1990'; ctx.fillRect(0, 0, screen.width, screen.height);
      const panel = new Path2D();
      panel.roundRect(64, 27, 361, 218, 9);
      ctx.fillStyle = '#081b2aed'; ctx.fill(panel);
      ctx.strokeStyle = '#5a9faa'; ctx.lineWidth = 1; ctx.stroke(panel);
      label(ctx, title, 82, 45, 13, '#e8fbff');
      label(ctx, `${layout.progress} / ${layout.count}`, 259, 67, 11, '#a7e8df');
      label(ctx, 'ESC / 닫기', 357, 231, 8, '#8dc2c8');
      label(ctx, '×', dismiss.x + 8, dismiss.y + 10, 15, '#cdebf4');
      label(ctx, '조각을 빈칸에 끌어 놓으세요', 257, 195, 9, '#b3d4d9');
      label(ctx, '수리 중에도 공격받을 수 있어요', 257, 210, 8, '#ffd896');
      ctx.fillStyle = '#040f1c'; ctx.fillRect(board.x - 2, board.y - 2, board.width + 4, board.height + 4);
      ctx.globalAlpha = .23 * opacity;
      ctx.drawImage(image, board.x, board.y, board.width, board.height);
      ctx.globalAlpha = opacity;
      for (let i = 0; i < layout.count; i++) {
        if (layout.isPlaced(i)) continue;
        ctx.strokeStyle = '#7cb5c26b'; ctx.lineWidth = .65;
        ctx.stroke(piecePath(size, i, forCell(i), cell));
      }
      for (let i = 0; i < layout.count; i++) {
        if (layout.isPlaced(i)) drawPiece(ctx, i, forCell(i), cell, '#e2f4f969');
      }
      for (const [i, piece] of layout.rack.entries()) {
        const box = forRack(i);
        ctx.fillStyle = '#112e3b'; ctx.fillRect(box.x - 1, box.y - 1, stride - 3, stride - 3);
        if (drag?.piece === piece || layout.isPlaced(piece)) continue;
        drawPiece(ctx, piece, { x: box.x + 3, y: box.y + 3 }, trayCell, '#d7f8efb5');
      }
      if (feedback && time - feedback.at < .4) {
        const path = piecePath(size, feedback.cell, forCell(feedback.cell), cell);
        ctx.globalAlpha = opacity * (1 - (time - feedback.at) / .4);
        ctx.strokeStyle = feedback.correct ? '#92ffbb' : '#ff8d81';
        ctx.lineWidth = 2; ctx.stroke(path); ctx.globalAlpha = opacity;
      }
      if (drag) drawPiece(ctx, drag.piece, { x: drag.cursor.x - cell / 2, y: drag.cursor.y - cell / 2 }, cell, '#baf8ee');
      ctx.restore();
    },
  };
}
