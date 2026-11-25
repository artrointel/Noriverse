import type { Weapon } from './gear.ts';
import type { Point } from './outpost.ts';

export const gunArt = {
  pulse: { size: 36, tip: 55 / 128, tipY: -13 / 128, grip: [29, 85], support: [81, 72], kick: 2.5, lift: .9, duration: .11, flash: .42, glow: '111,232,255' },
  eagle: { size: 29, tip: 54 / 128, tipY: -21 / 128, grip: [32, 88], support: [49, 72], kick: 5, lift: 1.9, duration: .16, flash: .72, glow: '255,213,148' },
  scout: { size: 28, tip: 52 / 128, tipY: -15 / 128, grip: [31, 86], support: [56, 75], kick: 3, lift: 1.25, duration: .10, flash: .57, glow: '255,198,142' },
  ak: { size: 39, tip: 54 / 128, tipY: -9 / 128, grip: [46, 83], support: [87, 72], kick: 3.75, lift: .9, duration: .10, flash: .74, glow: '255,207,135' },
  shotgun: { size: 38, tip: 54 / 128, tipY: -6 / 128, grip: [32, 77], support: [80, 77], kick: 7, lift: 2.15, duration: .20, flash: .96, glow: '255,201,120' },
  medical: { size: 32, tip: 54 / 128, tipY: -4 / 128, grip: [31, 87], support: [81, 75], kick: 0, lift: 0, duration: .12, flash: .22, glow: '139,255,221' },
} as const;

const turretBaseSize = 34, turretBaseOffset = 9, turretBarrelSize = 34;
const baseSocket = { x: .5, y: 25 / 128 }, barrelSocket = { x: 48 / 128, y: .5 };
export const turretArt = { baseSize: turretBaseSize, barrelSize: turretBarrelSize, baseSocket, barrelSocket,
  barrelCenter: (.5 - barrelSocket.x) * turretBarrelSize, muzzleReach: (121 / 128 - barrelSocket.x) * turretBarrelSize,
  lift: turretBaseOffset + (.5 - baseSocket.y) * turretBaseSize } as const;

export function turretBaseCenter(point: Point): Point {
  return { x: point.x, y: point.y - turretBaseOffset };
}

export function yawProjection(heading: number, depth = .61) {
  const x = Math.cos(heading), y = Math.sin(heading) * depth;
  return { angle: Math.atan2(y, x), scale: Math.hypot(x, y) };
}

export type BarrelProjection = { scale: number; depthPerPixel: number };

export function projectBarrelPoint(pose: BarrelProjection, x: number, y: number): Point {
  // The grip stays at the focal plane. The front of the gun comes closer on downward yaw.
  const scale = 1 / Math.max(.46, 1 - x * pose.depthPerPixel);
  return { x: x * pose.scale * scale, y: y * scale };
}

function barrel(mount: Point, heading: number, lift: number, length: number, tilt = 0, tipY = 0, focalLength = 0, axialScale = 1) {
  const view = yawProjection(heading, focalLength ? .8 : .61);
  const projection = { scale: view.scale * axialScale, depthPerPixel: focalLength ? Math.sin(heading) * .34 / focalLength : 0 };
  const angle = view.angle + tilt;
  const tip = projectBarrelPoint(projection, length, tipY), x = Math.cos(angle), y = Math.sin(angle);
  const muzzle = { x: mount.x + x * tip.x - y * tip.y, y: mount.y + y * tip.x + x * tip.y };
  return { ...projection, angle, mount, muzzle, lift, ground: { x: muzzle.x, y: muzzle.y + lift } };
}

export function heldPose(point: Point, heading: number, weapon: Weapon, age: number, lean = 0, drawn = 1, bob = 0) {
  const stats = gunArt[weapon];
  const recoil = Math.max(0, 1 - age / stats.duration) ** 1.65;
  const side = Math.cos(heading) < 0 ? -1 : 1;
  const lift = 13 - Math.sin(heading) * 5 - Math.abs(Math.cos(heading)) * 2;
  const grip = stats.size * .29 + 3;
  const center = grip - recoil * stats.kick - lean * 3;
  const pivot = { x: point.x, y: point.y - lift + bob + (1 - drawn) * 13 - recoil * stats.lift };
  return { ...barrel(pivot, heading, lift, center + stats.size * stats.tip, -side * (lean * .62 + recoil * .16),
    stats.size * stats.tipY * side, grip + stats.size * stats.tip),
    center, side, recoil };
}

export function supportPose(point: Point, heading: number, kind: 'turret' | 'drone', time: number, firedAt: number) {
  const flash = Math.max(0, 1 - (time - firedAt) / .11);
  if (kind === 'turret') {
    const { lift, muzzleReach, barrelCenter } = turretArt;
    // Recoil contracts the cannon about the socket, so the receiver remains seated.
    return { ...barrel({ x: point.x, y: point.y - lift }, heading, lift, muzzleReach, 0, 0, muzzleReach, 1 - .14 * flash), center: barrelCenter };
  }
  const lift = 30 + Math.sin(time * 10) * 2;
  const center = -flash * 2;
  const pose = barrel({ x: point.x, y: point.y - lift }, heading, lift, 9.5 + center);
  return { ...pose, center };
}
