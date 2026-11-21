export const inkColors = [0x263044, 0x4967e9, 0xee5770, 0xf2a538, 0x32a581, 0x8b5ad0, 0x8c5b40, 0xfffcf3];
export const brushStyles = ['pen', 'brush', 'chalk', 'marker'] as const;
export const maxInkWidth = 36;
export const eraserBrush = brushStyles.length;
export const maxEraserWidth = 72;
export const inkLimit = 2800;
export const practiceInkLimit = 18_000;
export const inkBatch = 20;
export type Ink = [x: number, y: number, endX: number, endY: number, color: number, width: number, brush: number, stroke: number];
export type BoardEdit = 'undo' | 'redo' | 'clear';
export type InkHistory = { board: Ink[]; redo: Ink[][] };
export function emptyInk(): InkHistory { return { board: [], redo: [] }; }

export const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export function readInk(value: unknown, max: number): Ink[] | undefined {
  if (!Array.isArray(value) || value.length > max) return;
  if (value.every(line => Array.isArray(line) && line.length === 8
    && line.slice(0, 4).every(value => integer(value, 0, 1000))
    && integer(line[4], 0, 0xffffff) && integer(line[6], 0, eraserBrush)
    && integer(line[5], 1, line[6] === eraserBrush ? maxEraserWidth : maxInkWidth)
    && integer(line[7], 1, 65_535))) return value as Ink[];
}

export function editInk(ink: InkHistory, edit: BoardEdit | Ink[], limit = inkLimit): InkHistory | undefined {
  const { board, redo } = ink;
  if (Array.isArray(edit)) {
    const sequence = edit[0]?.[7];
    if (!sequence || edit.some(line => line[7] !== sequence) || board.length >= limit
      || sequence < (board.at(-1)?.[7] ?? 0)) return;
    return { board: [...board, ...edit.slice(0, limit - board.length)], redo: [] };
  }
  if (edit === 'clear') return board.length ? emptyInk() : undefined;
  if (edit === 'redo') return redo.length ? { board: [...board, ...redo.at(-1)!], redo: redo.slice(0, -1) } : undefined;
  const last = board.at(-1)?.[7];
  if (!last) return;
  const split = board.findIndex(line => line[7] === last);
  return { board: board.slice(0, split), redo: [...redo, board.slice(split)] };
}

const packedLineBytes = 12;

export function packInk(board: readonly Ink[]) {
  // Four 10-bit coordinates, RGB, width, tool, and a 16-bit stroke number.
  const bytes = new Uint8Array(board.length * packedLineBytes);
  for (const [i, [x, y, endX, endY, color, width, brush, stroke]] of board.entries()) {
    bytes.set([x >> 2, (x << 6) | (y >> 4), (y << 4) | (endX >> 6), (endX << 2) | (endY >> 8), endY,
      color >> 16, color >> 8, color, width, brush, stroke >> 8, stroke], i * packedLineBytes);
  }
  let packed = '';
  for (let i = 0; i < bytes.length; i += 8192) packed += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(packed);
}

export function unpackInk(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length > limit * packedLineBytes * 4 / 3 || value.length % 16 !== 0) return;
  try {
    const bytes = atob(value);
    const board: Ink[] = [];
    for (let i = 0; i < bytes.length; i += packedLineBytes) {
      const a = bytes.charCodeAt(i), b = bytes.charCodeAt(i + 1), c = bytes.charCodeAt(i + 2), d = bytes.charCodeAt(i + 3);
      board.push([(a << 2) | (b >> 6), ((b & 63) << 4) | (c >> 4), ((c & 15) << 6) | (d >> 2),
        ((d & 3) << 8) | bytes.charCodeAt(i + 4),
        (bytes.charCodeAt(i + 5) << 16) | (bytes.charCodeAt(i + 6) << 8) | bytes.charCodeAt(i + 7),
        bytes.charCodeAt(i + 8), bytes.charCodeAt(i + 9), (bytes.charCodeAt(i + 10) << 8) | bytes.charCodeAt(i + 11)]);
    }
    return readInk(board, limit);
  } catch { return; }
}

export function brushWidth(base: number, speed: number, previous: number) {
  const target = base * (.25 + .75 * Math.exp(-1.4 * Math.max(0, speed)));
  return Math.min(base, Math.max(1, Math.round(previous * .28 + target * .72)));
}
