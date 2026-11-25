import { balance, screen, world } from './outpost.ts';
import type { Box, Point } from './outpost.ts';

export const maxCameraSpan = 1.5;

export function playerHitFeedback(age: number, heading: number, healthFraction: number, reducedMotion: boolean) {
  const { duration, shake, tint } = balance.hitFeedback;
  const progress = Math.max(0, Math.min(1, age / duration));
  const missing = 1 - Math.max(0, Math.min(1, healthFraction));
  const decay = (1 - progress) ** 2;
  const angle = progress * Math.PI * 4;
  const amplitude = reducedMotion ? 0 : (shake[0] + (shake[1] - shake[0]) * missing) * decay;
  const along = Math.cos(angle) * amplitude, across = Math.sin(angle) * amplitude * .48;
  return {
    offset: { x: Math.cos(heading) * along - Math.sin(heading) * across,
      y: Math.sin(heading) * along + Math.cos(heading) * across },
    tint: (tint[0] + (tint[1] - tint[0]) * missing) * (1 - progress) * (reducedMotion ? 1 : .62 + Math.cos(angle) * .38),
  };
}

export function cameraView(origin: Point, span: number, bounds = world): Box {
  const width = screen.width * span, height = screen.height * span;
  return {
    x: Math.max(0, Math.min(bounds.width - width, origin.x)),
    y: Math.max(0, Math.min(bounds.height - height, origin.y)),
    width, height,
  };
}

export function projectToScreen(point: Point, camera: Box): Point {
  return { x: (point.x - camera.x) * screen.width / camera.width, y: (point.y - camera.y) * screen.height / camera.height };
}

export function projectToWorld(point: Point, camera: Box): Point {
  return { x: camera.x + point.x * camera.width / screen.width, y: camera.y + point.y * camera.height / screen.height };
}
