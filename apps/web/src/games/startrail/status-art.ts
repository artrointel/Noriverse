import { statusSpecs } from './status.ts';
import type { BlockingStatus, StatusEffect, StatusLevel } from './status.ts';
import type { Point } from './outpost.ts';

export function drawBlockedStatus(ctx: CanvasRenderingContext2D, point: Point, kind: BlockingStatus, age: number, reducedMotion: boolean) {
  const visibleFor = .65;
  if (age >= visibleFor) return;
  const shake = Math.min(1, age / .2);
  const offset = reducedMotion ? 0 : Math.sin(shake * Math.PI * 4) * (1 - shake) * 4;
  const color = statusSpecs[kind].color;
  ctx.save();
  ctx.translate(point.x + offset, point.y);
  ctx.globalAlpha *= Math.min(1, (visibleFor - age) / .15);
  ctx.fillStyle = '#121a2ff5'; ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-9, -9, 18, 18, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 'poison') {
    ctx.moveTo(0, -6); ctx.bezierCurveTo(2, -3, 5, -.4, 5, 2);
    ctx.bezierCurveTo(5, 7, -5, 7, -5, 2); ctx.bezierCurveTo(-5, -.4, -2, -3, 0, -6);
    ctx.fill();
    ctx.fillStyle = '#302245'; ctx.beginPath();
    ctx.arc(-1.75, 1, 1, 0, Math.PI * 2); ctx.moveTo(2.75, 1); ctx.arc(1.75, 1, 1, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'shock') {
    ctx.moveTo(1, -6); ctx.lineTo(-4, 1); ctx.lineTo(-.4, 1); ctx.lineTo(-1, 6);
    ctx.lineTo(5, -1.7); ctx.lineTo(.8, -1.7); ctx.closePath(); ctx.fill();
  } else {
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5 - Math.PI / 2;
      const radius = i % 2 ? 2.4 : 6;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawFreeze(ctx: CanvasRenderingContext2D, time: number, level: StatusLevel) {
  const severe = level === 2;
  const radius = severe ? 21 : 17;
  const aura = ctx.createRadialGradient(0, -9, 1, 0, -9, radius + 3);
  aura.addColorStop(0, severe ? '#5bc9ff44' : '#5bc9ff28');
  aura.addColorStop(.62, severe ? '#4ac6ff33' : '#4ac6ff21');
  aura.addColorStop(1, '#4ac6ff00');
  ctx.fillStyle = aura;
  ctx.fillRect(-radius - 3, -radius - 12, (radius + 3) * 2, (radius + 3) * 2);

  ctx.beginPath(); ctx.ellipse(0, 1, radius, severe ? 7 : 5.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#43baff42'; ctx.fill();
  ctx.strokeStyle = '#123d68'; ctx.lineWidth = 3.4; ctx.stroke();
  ctx.strokeStyle = '#a6eeff'; ctx.lineWidth = severe ? 1.75 : 1.35; ctx.stroke();

  for (let i = 0; i < (severe ? 7 : 5); i++) {
    const angle = i * 2.399 + time * .46;
    const life = (time * .95 + i * .31) % 1;
    const x = Math.cos(angle) * (radius - 1), y = -2 - life * (severe ? 29 : 23);
    const size = (severe ? 5 : 3.8) * (.72 + Math.sin(life * Math.PI) * .28);
    ctx.beginPath(); ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * .57, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size * .57, y); ctx.closePath();
    ctx.fillStyle = '#7ddfff'; ctx.fill();
    ctx.strokeStyle = '#123d68'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - size * .66); ctx.lineTo(x - size * .28, y); ctx.lineTo(x, y + size * .14);
    ctx.strokeStyle = '#e1fcff'; ctx.lineWidth = 1.15; ctx.stroke();
  }
}

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
    if (kind === 'freeze') { drawFreeze(ctx, time, level); continue; }
    const count = level === 2 ? 6 : 4;
    ctx.strokeStyle = ctx.fillStyle = statusSpecs[kind].color;
    ctx.lineWidth = level === 2 ? 1.5 : 1;
    for (let i = 0; i < count; i++) {
      const angle = (time * (kind === 'stun' ? 2.8 : 1.5) + i * Math.PI * 2 / count);
      const x = Math.cos(angle) * (kind === 'stun' ? 10 : 15);
      const pulse = (time * 2.5 + i * .37) % 1;
      const y = kind === 'stun' ? -32 + Math.sin(angle) * 3 : -pulse * 16 - 2;
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
