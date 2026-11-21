import type { OrbitInput } from './rules.ts';

export type OrbitControl = Exclude<OrbitInput, 'drop'>;
export type OrbitPress = { id: string; serial: number; at: number };

export const orbitControls = ['left', 'down', 'right', 'rotate'] as const satisfies readonly OrbitControl[];
export const orbitKeys = new Map<string, OrbitControl>([['ArrowLeft', 'left'], ['ArrowDown', 'down'],
  ['ArrowRight', 'right'], ['ArrowUp', 'rotate']]);

export function resolveOrbitControl(control: OrbitControl, press: OrbitPress, previous?: OrbitPress): { input: OrbitInput; down?: OrbitPress } {
  if (control !== 'down') return { input: control };
  if (previous?.id === press.id && previous.serial === press.serial && press.at - previous.at <= 500) return { input: 'drop' };
  return { input: 'down', down: press };
}
