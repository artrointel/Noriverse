const swings = [
  { x: 6, y: 19, angle: 43, contact: 17, recoil: 12, duration: 145 },
  { x: 2, y: 27, angle: 62, contact: 31, recoil: 15, duration: 160 },
  { x: 9, y: 14, angle: 32, contact: 6, recoil: 17, duration: 132 },
  { x: 4, y: 23, angle: 49, contact: 25, recoil: 14, duration: 151 },
] as const;

export const hammerGrip = { x: .25, y: .76 };
const hammerHead = { x: .71, y: .27 };

export function hammerHeadOffset(size: number, angle: number, mirrored: boolean) {
  const dx = (hammerHead.x - hammerGrip.x) * size * (mirrored ? -1 : 1);
  const dy = (hammerHead.y - hammerGrip.y) * size;
  const radians = angle * Math.PI / 180;
  return { x: dx * Math.cos(radians) - dy * Math.sin(radians), y: dx * Math.sin(radians) + dy * Math.cos(radians) };
}

export function hammerSwing(strikeId: number, quick: boolean) {
  const style = swings[(strikeId * 3 + 1) % swings.length];
  const side = strikeId % 2 === 0 ? 1 : -1;
  const contactAt = quick ? 92 : style.duration;
  const endAt = contactAt + (quick ? 89 : 120);
  return {
    contactAt, endAt, mirrored: side < 0,
    pose(at: number) {
      if (at <= contactAt) {
        const t = Math.max(0, at / contactAt);
        const fall = t * t * (2 - t);
        return { x: side * style.x * (1 - fall), y: -style.y * (1 - fall),
          angle: side * (-style.angle * (1 - fall) + style.contact * fall), alpha: Math.min(1, .52 + t * 3) };
      }
      const t = Math.min(1, (at - contactAt) / (endAt - contactAt));
      const rebound = Math.sin(Math.PI * t);
      return { x: side * style.recoil * rebound, y: -style.recoil * rebound,
        angle: side * (style.contact - style.recoil * 1.6 * rebound), alpha: 1 - t ** 1.8 };
    },
  };
}
