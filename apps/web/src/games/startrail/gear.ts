import type { Point } from './outpost.ts';

export const slots = ['primary', 'sidearm'] as const;
export type Slot = typeof slots[number];

export const weapons = {
  pulse: { name: '펄스 카빈', frame: 0, range: 270, damage: 1, impulse: 3.1, interval: .22, capacity: 9, reload: .95, color: '#a6f5ff', mode: 'beam' },
  eagle: { name: '데저트 이글', frame: 1, range: 290, damage: 3, impulse: 6.2, interval: .4, capacity: 7, reload: 1.18, color: '#ffe3a8', mode: 'ballistic', speed: 880 },
  scout: { name: '정찰 권총', frame: 2, range: 190, damage: 1, impulse: 1.7, interval: .33, capacity: 6, reload: .78, color: '#ffbf85', mode: 'ballistic', speed: 710 },
} as const;

export type Weapon = keyof typeof weapons;
export type BallisticWeapon = Exclude<Weapon, 'pulse'>;
export type Bullet = Point & { heading: number; traveled: number; weapon: BallisticWeapon };
export type SpentMetal = Point & {
  vx: number; vy: number; z: number; vz: number; angle: number; spin: number; age: number; kind: 'case' | 'slug';
};
export type Gun = {
  weapon: Weapon;
  ammo: number;
  firedAt: number;
  reloadAt?: number;
  reloadStage: number;
};

export function makeGun(weapon: Weapon): Gun {
  return { weapon, ammo: weapons[weapon].capacity, firedAt: -Infinity, reloadStage: 0 };
}

export const reloadStages = [.17, .54, .81] as const;

