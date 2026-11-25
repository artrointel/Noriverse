import type { ExpeditionMap } from './expedition-maps.ts';
import { blockerClearance, distance, rayDistance, tileSize } from './outpost.ts';
import type { Box, EnemyKind, Point } from './outpost.ts';

export const encounters = {
  '1-1': { cap: 22, interval: 3.2, alertInterval: 2, packSize: 3, firstAt: 1.5,
    roster: ['mite', 'spore', 'grub', 'mite', 'scout', 'boar'] },
  '1-2': { cap: 28, interval: 2.6, alertInterval: 1.8, packSize: 4, firstAt: 1,
    roster: ['mite', 'grub', 'scout', 'spore', 'mite', 'boar', 'sentinel'] },
} as const satisfies Record<ExpeditionMap['id'], {
  cap: number; interval: number; alertInterval: number; packSize: number; firstAt: number; roster: readonly EnemyKind[];
}>;

export const encounterRange = { approach: 280, alert: 350, pursuitBuffer: 110, safe: 148, retire: 490 };
const margin = 40;

export function openPath(from: Point, to: Point, blockers: readonly Box[], padding = 0) {
  const span = distance(from, to);
  if (span < .01) return true;
  return rayDistance(from, (to.x - from.x) / span, (to.y - from.y) / span, span, blockers, 'front', padding) >= span;
}

export function concealed(point: Point, camera: Box, observer: Point, blockers: readonly Box[], lit: (point: Point) => boolean) {
  if (point.x < camera.x - margin || point.x > camera.x + camera.width + margin ||
    point.y < camera.y - margin || point.y > camera.y + camera.height + margin) return true;
  return !openPath(observer, point, blockers) && !lit(point);
}

type Cell = { point: Point; neighbors: { index: number; crossesGate: boolean }[] };

export class EnemyFlow {
  private readonly columns: number;
  private readonly rows: number;
  private readonly cells: (Cell | undefined)[];
  private readonly steps: Int16Array;
  private readonly reachable: number[] = [];
  private playerCell = -1;
  private source = -1;
  private gateClosed?: boolean;

  constructor(stage: Pick<ExpeditionMap, 'floor' | 'obstacles' | 'gate' | 'walkable'>) {
    const { floor, obstacles, gate, walkable } = stage;
    this.columns = floor[0].length;
    this.rows = floor.length;
    this.cells = floor.flatMap((row, y) => row.map((onFloor, x) => {
      const point = { x: (x + .5) * tileSize, y: (y + .5) * tileSize };
      return onFloor && walkable(point) && obstacles.every(box => blockerClearance(point, box) >= 8) ?
        { point, neighbors: [] } : undefined;
    }));
    const stride = this.columns;
    for (const [index, cell] of this.cells.entries()) {
      if (!cell) continue;
      const connect = (next: number) => {
        const neighbor = this.cells[next];
        if (!neighbor || !openPath(cell.point, neighbor.point, obstacles, 8)) return;
        const crossesGate = !openPath(cell.point, neighbor.point, [gate], 8);
        cell.neighbors.push({ index: next, crossesGate });
        neighbor.neighbors.push({ index, crossesGate });
      };
      if (index % stride + 1 < stride) connect(index + 1);
      connect(index + stride);
    }
    this.steps = new Int16Array(this.cells.length).fill(-1);
  }

  private nearby(point: Point) {
    const col = Math.floor(point.x / tileSize), row = Math.floor(point.y / tileSize);
    const result: number[] = [];
    for (let y = Math.max(0, row - 1); y <= Math.min(this.rows - 1, row + 1); y++) {
      for (let x = Math.max(0, col - 1); x <= Math.min(this.columns - 1, col + 1); x++) result.push(y * this.columns + x);
    }
    return result;
  }

  update(player: Point, gateClosed: boolean, walls: readonly Box[]) {
    const playerCell = Math.floor(player.y / tileSize) * this.columns + Math.floor(player.x / tileSize);
    if (playerCell === this.playerCell && gateClosed === this.gateClosed && this.source >= 0) return;
    this.playerCell = playerCell;
    let source = -1, reach = Infinity;
    for (const candidate of this.nearby(player)) {
      const cell = this.cells[candidate];
      if (!cell) continue;
      const span = distance(player, cell.point);
      if (span >= reach || !openPath(player, cell.point, walls)) continue;
      source = candidate; reach = span;
    }
    if (source === this.source && gateClosed === this.gateClosed) return;
    this.source = source;
    this.gateClosed = gateClosed;
    this.steps.fill(-1);
    this.reachable.length = 0;
    if (source < 0) return;
    this.reachable.push(source);
    this.steps[source] = 0;
    for (let head = 0; head < this.reachable.length; head++) {
      const at = this.reachable[head];
      for (const edge of this.cells[at]!.neighbors) {
        if (this.steps[edge.index] >= 0 || gateClosed && edge.crossesGate) continue;
        this.steps[edge.index] = this.steps[at] + 1;
        this.reachable.push(edge.index);
      }
    }
  }

  waypoint(enemy: Point, blockers: readonly Box[], radius: number) {
    const current = Math.floor(enemy.y / tileSize) * this.columns + Math.floor(enemy.x / tileSize);
    let best: Point | undefined, cost = Infinity;
    for (const index of this.nearby(enemy)) {
      const cell = this.cells[index];
      if (!cell || this.steps[index] < 0 || current === index) continue;
      const span = distance(enemy, cell.point);
      const score = this.steps[index] + span / (tileSize * 2);
      if (span <= 3 || score >= cost || !openPath(enemy, cell.point, blockers, radius * .45)) continue;
      best = cell.point; cost = score;
    }
    return best;
  }

  spawnPoint(player: Point, min: number, max: number, valid: (point: Point) => boolean, random = Math.random) {
    const count = this.reachable.length;
    const start = Math.floor(random() * count);
    for (let i = 0; i < count; i++) {
      const index = this.reachable[(start + i) % count];
      if (this.steps[index] > 12) continue;
      const point = this.cells[index]!.point;
      const span = distance(player, point);
      if (span >= min && span <= max && valid(point)) return point;
    }
  }
}
