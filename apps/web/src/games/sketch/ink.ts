export const inkColors = [0x263044, 0x4967e9, 0xee5770, 0xf2a538, 0x32a581, 0x8b5ad0, 0x8c5b40, 0xfffcf3];
export const brushStyles = ['pen', 'brush', 'chalk', 'marker'] as const;
export const maxInkWidth = 36;
export const eraserBrush = brushStyles.length;
export const maxEraserWidth = 72;
export const inkLimit = 1100;
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
    && integer(line[7], 1, 999_999))) return value as Ink[];
}

export function editInk(ink: InkHistory, edit: BoardEdit | Ink[]): InkHistory | undefined {
  const { board, redo } = ink;
  if (Array.isArray(edit)) {
    const sequence = edit[0]?.[7];
    if (!sequence || edit.some(line => line[7] !== sequence) || board.length >= inkLimit
      || sequence < (board.at(-1)?.[7] ?? 0)) return;
    return { board: [...board, ...edit.slice(0, inkLimit - board.length)], redo: [] };
  }
  if (edit === 'clear') return board.length ? emptyInk() : undefined;
  if (edit === 'redo') return redo.length ? { board: [...board, ...redo.at(-1)!], redo: redo.slice(0, -1) } : undefined;
  const last = board.at(-1)?.[7];
  if (!last) return;
  const split = board.findIndex(line => line[7] === last);
  return { board: board.slice(0, split), redo: [...redo, board.slice(split)] };
}
