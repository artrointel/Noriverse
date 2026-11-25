import { statusSpecs } from './status.ts';
import type { StatusEffect } from './status.ts';
import type { Point } from './outpost.ts';

export function drawStatuses(ctx: CanvasRenderingContext2D, point: Point, time: number, effects: readonly StatusEffect[], medicSlow = false) {
  if (!effects.length && !medicSlow) return;
  ctx.save();
  ctx.translate(point.x, point.y - 3);
  if (medicSlow) {
    ctx.strokeStyle = '#a0ffe992'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 1, 13, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const effect of effects) {
    const { kind, level } = effect;
    const count = level === 2 ? 6 : 4;
    ctx.strokeStyle = ctx.fillStyle = statusSpecs[kind].color;
    ctx.lineWidth = level === 2 ? 1.5 : 1;
    if (kind === 'freeze') {
      ctx.globalAlpha *= .62;
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha /= .62;
    }
    for (let i = 0; i < count; i++) {
      const angle = (time * (kind === 'stun' ? 2.8 : 1.5) + i * Math.PI * 2 / count);
      const x = Math.cos(angle) * (kind === 'stun' ? 10 : 15);
      const pulse = (time * 2.5 + i * .37) % 1;
      let y = kind === 'stun' ? -32 + Math.sin(angle) * 3 : -pulse * 16 - 2;
      if (kind === 'freeze') y = Math.sin(angle) * 4;
      ctx.beginPath();
      if (kind === 'ignition') {
        ctx.moveTo(x - 2, y + 5); ctx.quadraticCurveTo(x - 4, y + 1, x + 1, y - 3 - level);
        ctx.quadraticCurveTo(x + 5, y + 4, x + 2, y + 5); ctx.fill();
      } else if (kind === 'shock') {
        if (pulse > .7) continue;
        ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 2, y - 4); ctx.lineTo(x, y + 1); ctx.lineTo(x + 4, y + 1);
        ctx.stroke();
      } else if (kind === 'poison') {
        ctx.arc(x, y, 1.5 + level * .35, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y);
        ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
      }
    }
  }
  ctx.restore();
}
