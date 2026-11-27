import type { EnemyKind, ExplorerKind } from './outpost.ts';

// Illustrated base height over opaque sprite height. Keep the ratio stable within each pose group.
export const explorerGroundRatio = {
  solori: { upright: 19 / 108, roll: 17 / 70 },
  kommi: { upright: 16 / 98, roll: 14 / 71 },
} satisfies Record<ExplorerKind, { upright: number; roll: number }>;

export const enemyGroundRatio = {
  mite: { upright: 13 / 55, falling: 22 / 92 },
  boar: { upright: 19 / 85, falling: 22 / 88 },
  scout: { upright: 17 / 97, falling: 24 / 95 },
  sentinel: { upright: 19 / 99, falling: 25 / 84 },
  spore: { upright: 26 / 100, falling: 25 / 85 },
  grub: { upright: 13 / 70, falling: 17 / 69 },
  starTick: { upright: .22, falling: .27 },
  coralHopper: { upright: .21, falling: .28 },
  rimeSkitter: { upright: .25, falling: .30 },
} satisfies Record<EnemyKind, { upright: number; falling: number }>;

export const fixtureGroundRatio = {
  crate: 16 / 110,
  crystal: 23 / 106,
  relay: 19 / 76,
  liftClosed: 14 / 66,
  liftOpen: 22 / 66,
  supplies: 12 / 89,
  vent: 24 / 65,
  antenna: 23 / 103,
  turretBase: 27 / 92,
  medicalDummy: 26 / 118,
  // The security gate is drawn procedurally. Use the closed panel's dimensions as the reference.
  gate: 6 / 48,
};
