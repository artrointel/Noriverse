import { screen, world } from './outpost.ts';
import type { Box, Point } from './outpost.ts';

export function cameraView(origin: Point, span: number): Box {
  const width = screen.width * span, height = screen.height * span;
  return {
    x: Math.max(0, Math.min(world.width - width, origin.x)),
    y: Math.max(0, Math.min(world.height - height, origin.y)),
    width, height,
  };
}

export function projectToScreen(point: Point, camera: Box): Point {
  return { x: (point.x - camera.x) * screen.width / camera.width, y: (point.y - camera.y) * screen.height / camera.height };
}

export function projectToWorld(point: Point, camera: Box): Point {
  return { x: camera.x + point.x * camera.width / screen.width, y: camera.y + point.y * camera.height / screen.height };
}
