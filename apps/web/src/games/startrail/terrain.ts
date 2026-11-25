import type { Box, Point } from './outpost.ts';

type Edge = { from: Point; to: Point };
export type WallPolygon = { vertices: Point[]; center: Point; planes: { x: number; y: number; limit: number }[] };

function boundaryLoops(floor: readonly (readonly boolean[])[], tile: number) {
  const edges: Edge[] = [];
  const byStart = new Map<string, Edge[]>();
  const key = ({ x, y }: Point) => `${x},${y}`;
  function add(ax: number, ay: number, bx: number, by: number) {
    const edge = { from: { x: ax * tile, y: ay * tile }, to: { x: bx * tile, y: by * tile } };
    const at = key(edge.from);
    const exits = byStart.get(at);
    if (exits) exits.push(edge);
    else byStart.set(at, [edge]);
    edges.push(edge);
  }
  floor.forEach((row, y) => row.forEach((open, x) => {
    if (!open) return;
    if (!floor[y - 1]?.[x]) add(x, y, x + 1, y);
    if (!row[x + 1]) add(x + 1, y, x + 1, y + 1);
    if (!floor[y + 1]?.[x]) add(x + 1, y + 1, x, y + 1);
    if (!row[x - 1]) add(x, y + 1, x, y);
  }));
  const loops: Point[][] = [];
  const visited = new Set<Edge>();
  for (const start of edges) {
    if (visited.has(start)) continue;
    const points: Point[] = [];
    let edge = start;
    while (!visited.has(edge)) {
      visited.add(edge);
      points.push(edge.from);
      const exits = byStart.get(key(edge.to))!;
      const x = edge.to.x - edge.from.x, y = edge.to.y - edge.from.y;
      // Turning toward the floor keeps diagonally touching cells on separate loops.
      edge = exits.find(next => x * (next.to.y - next.from.y) - y * (next.to.x - next.from.x) > 0) ?? exits[0];
    }
    loops.push(points.filter((point, i) => {
      const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length];
      return !(before.x === point.x && point.x === after.x || before.y === point.y && point.y === after.y);
    }));
  }
  return loops;
}

function direction(from: Point, to: Point) {
  const x = to.x - from.x, y = to.y - from.y;
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length, length };
}

type DiagonalCorner = Point & { cut: number };

function sculptBoundary(loop: Point[], tile: number, diagonals: readonly DiagonalCorner[]) {
  const trim = tile * .44;
  const cuts = loop.map(point => diagonals.find(corner => point.x === corner.x && point.y === corner.y)?.cut ?? trim);
  function available(i: number, next: number, span: number) {
    return cuts[i] * Math.min(1, (span - tile * .08) / (cuts[i] + cuts[next]));
  }
  const corners = loop.map((point, i) => {
    const prev = (i + loop.length - 1) % loop.length, next = (i + 1) % loop.length;
    const before = direction(point, loop[prev]), after = direction(point, loop[next]);
    const lead = available(i, prev, before.length), tail = available(i, next, after.length);
    return { point, diagonal: cuts[i] !== trim, from: { x: point.x + before.x * lead, y: point.y + before.y * lead },
      to: { x: point.x + after.x * tail, y: point.y + after.y * tail } };
  });
  const curve: Point[] = [];
  for (const [i, { point, from, to, diagonal }] of corners.entries()) {
    if (diagonal) curve.push(from, to);
    else for (let step = 0; step <= 4; step++) {
      const t = step / 4, s = 1 - t;
      curve.push({ x: s * s * from.x + 2 * s * t * point.x + t * t * to.x,
        y: s * s * from.y + 2 * s * t * point.y + t * t * to.y });
    }
    const end = corners[(i + 1) % corners.length].from;
    const side = direction(to, end);
    if (side.length < tile * 2.75 || Math.round((point.x + point.y) / tile) % 3 === 0) continue;
    const steps = Math.max(5, Math.ceil(side.length / 42));
    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const inset = Math.sin(t * Math.PI) ** 2 * tile * .24;
      curve.push({ x: to.x + (end.x - to.x) * t - side.y * inset,
        y: to.y + (end.y - to.y) * t + side.x * inset });
    }
  }
  return curve;
}

function wallPolygon(vertices: Point[]): Box {
  let area = 0, x = 0, y = 0;
  const planes = vertices.map((point, i) => {
    const next = vertices[(i + 1) % vertices.length];
    const cross = point.x * next.y - point.y * next.x;
    area += cross; x += (point.x + next.x) * cross; y += (point.y + next.y) * cross;
    const edge = direction(point, next);
    return { x: -edge.y, y: edge.x, limit: -edge.y * point.x + edge.x * point.y };
  });
  const xs = vertices.map(p => p.x), ys = vertices.map(p => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top,
    polygon: { vertices, planes, center: { x: x / (3 * area), y: y / (3 * area) } } };
}

export function buildTerrainGeometry(floor: readonly (readonly boolean[])[], tile: number, diagonals: readonly DiagonalCorner[] = []) {
  const outlines = boundaryLoops(floor, tile).map(loop => sculptBoundary(loop, tile, diagonals));
  const walls: Box[] = [];
  const edges: (Edge & { face: Point })[] = [];
  for (const outline of outlines) {
    const directions = outline.map((from, i) => direction(from, outline[(i + 1) % outline.length]));
    const outside = outline.map((point, i) => {
      const before = directions[(i + outline.length - 1) % outline.length], after = directions[i];
      const depth = tile * .22 / (1 + before.x * after.x + before.y * after.y);
      return { x: point.x + (before.y + after.y) * depth, y: point.y - (before.x + after.x) * depth };
    });
    outline.forEach((from, i) => {
      const next = (i + 1) % outline.length, to = outline[next], side = directions[i];
      walls.push(wallPolygon([from, to, outside[next], outside[i]]));
      const pieces = Math.ceil(side.length / (tile / 4));
      for (let j = 0; j < pieces; j++) {
        const start = j / pieces, end = (j + 1) / pieces, mid = (start + end) / 2;
        edges.push({ from: { x: from.x + (to.x - from.x) * start, y: from.y + (to.y - from.y) * start },
          to: { x: from.x + (to.x - from.x) * end, y: from.y + (to.y - from.y) * end },
          face: { x: from.x + (to.x - from.x) * mid + side.y * 4, y: from.y + (to.y - from.y) * mid - side.x * 4 } });
      }
    });
  }
  return { outlines, walls, edges };
}

export function insideTerrain(point: Point, outlines: readonly (readonly Point[])[]) {
  let inside = false;
  for (const outline of outlines) outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)) inside = !inside;
  });
  return inside;
}
