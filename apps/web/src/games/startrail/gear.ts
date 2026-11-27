import type { Point } from './outpost.ts';

export const slots = ['primary', 'sidearm'] as const;
export type Slot = typeof slots[number];
export type WeaponSwap = { from: Slot | 'knife'; to: Slot; startedAt: number; reload?: boolean };

export const weapons = {
  pulse: { name: '펄스 카빈', cell: [0, 0], range: 540, accuracy: .98, damage: 3, impulse: 3.1, interval: .18, capacity: 16, magazines: 6, reload: .83, color: '#a6f5ff', mode: 'beam' },
  eagle: { name: '데저트 이글', cell: [0, 1], range: 290, accuracy: .92, damage: 5, impulse: 6.2, interval: .34, capacity: 9, magazines: 6, reload: 1.06, color: '#ffe3a8', mode: 'ballistic', speed: 880, spread: [0] },
  scout: { name: '정찰 권총', cell: [0, 2], range: 190, accuracy: .88, damage: 2, impulse: 1.7, interval: .27, capacity: 10, magazines: 7, reload: .7, color: '#ffbf85', mode: 'ballistic', speed: 710, spread: [0] },
  ak: { name: 'AK 소총', cell: [1, 0], range: 270, accuracy: .79, damage: 2, impulse: 2.7, interval: .11, capacity: 30, magazines: 6, reload: 1.17, color: '#ffdc9b', mode: 'ballistic', speed: 910, spread: [0] },
  shotgun: { name: '산탄총', cell: [1, 1], range: 141, accuracy: .67, damage: 2, impulse: 2.25, interval: .56, capacity: 7, magazines: 6, reload: 1.28, color: '#ffc696', mode: 'ballistic', speed: 745, spread: [-.235, -.125, 0, .125, .235] },
  medical: { name: '의료총', cell: [1, 0], range: 145, accuracy: .97, damage: 0, impulse: 0, interval: .5, capacity: 10, magazines: 3, reload: 1.10, color: '#a7ffed', mode: 'medical' },
} as const;

export type Weapon = keyof typeof weapons;
export function dispersedHeading(heading: number, accuracy: number, random = Math.random) {
  return heading + (random() + random() - 1) * (1 - accuracy) * .46;
}
export type Impact = { damage: number; impulse: number; color: string };
export type BulletSpec = { speed: number; range: number; impact: Impact; expiresClean?: boolean };
export type Bullet = Point & BulletSpec & { heading: number; traveled: number; lift: number };
export type SpentMetal = Point & {
  vx: number; vy: number; z: number; vz: number; angle: number; spin: number; age: number; kind: 'case' | 'slug'; volume: number;
};
export type MagazineSpec = { capacity: number; magazines: number; reload: number };
export type Magazine = {
  ammo: number;
  spare: number;
  reloadAt?: number;
};
export type Gun = Magazine & {
  weapon: Weapon;
  firedAt: number;
  reloadStage: number;
};

export function outOfAmmo(gun: Gun) {
  return gun.ammo === 0 && gun.spare === 0 && gun.reloadAt === undefined;
}

export function refillMagazine(magazine: Magazine, stats: MagazineSpec) {
  magazine.ammo = stats.capacity;
  magazine.spare = stats.magazines - 1;
  magazine.reloadAt = undefined;
}

export function startReload(magazine: Magazine, stats: MagazineSpec, now: number) {
  if (magazine.reloadAt !== undefined || magazine.spare <= 0 || magazine.ammo === stats.capacity) return false;
  magazine.ammo = 0;
  magazine.spare--;
  magazine.reloadAt = now;
  return true;
}

export function finishReload(magazine: Magazine, stats: MagazineSpec) {
  magazine.ammo = stats.capacity;
  magazine.reloadAt = undefined;
}

export function makeGun(weapon: Weapon): Gun {
  const { capacity, magazines } = weapons[weapon];
  return { weapon, ammo: capacity, spare: magazines - 1, firedAt: -Infinity, reloadStage: 0 };
}

export const reloadStages = [.17, .54, .81] as const;
export const swapDuration = .3;
export const medical = { heal: 12, slow: .7, slowChance: .55, slowDuration: 1.1, cleanse: .5, aimCone: .62, selfRadius: 16 } as const;
export const knife = {
  cell: [0, 2], reach: 42, arc: .83, windup: .10, duration: .36, recovery: .13 * 1.3, comboWindow: 1,
  damage: 4, impulse: 4, color: '#acffe6',
} as const;

export function knifeSwingDirection(previous: { at: number; direction: 1 | -1 } | undefined, now: number): 1 | -1 {
  return previous && now - previous.at <= knife.comboWindow + 1e-7 ? previous.direction === 1 ? -1 : 1 : 1;
}

