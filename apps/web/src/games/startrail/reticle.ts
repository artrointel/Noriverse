import { weapons } from './gear.ts';
import type { Weapon } from './gear.ts';
import { screen } from './outpost.ts';
import type { Point } from './outpost.ts';

const quarter = Math.PI / 2;

export function isHudPointer(point: Point) { return point.y >= screen.height - 44; }

export function drawGamePointer(ctx: CanvasRenderingContext2D, point: Point, weapon?: Weapon, shotAge = Infinity) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (!weapon) {
    ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(3, 14); ctx.lineTo(6, 10);
    ctx.lineTo(10, 14); ctx.lineTo(12, 12); ctx.lineTo(8, 8); ctx.lineTo(13, 7); ctx.closePath();
    ctx.fillStyle = '#e5fff7'; ctx.strokeStyle = '#04131e'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fill();
    ctx.restore(); return;
  }
  const r = 5 + (1 - weapons[weapon].accuracy) * 8 + 3.4 * Math.max(0, 1 - shotAge / .18);
  ctx.beginPath();
  if (weapon === 'pulse') {
    for (const side of [-1, 1]) {
      ctx.moveTo(side * (r + 3), -r); ctx.lineTo(side * r, -r); ctx.lineTo(side * (r - 2), 0);
      ctx.lineTo(side * r, r); ctx.lineTo(side * (r + 3), r);
    }
    ctx.moveTo(0, -r - 3); ctx.lineTo(0, -r + 1); ctx.moveTo(0, r - 1); ctx.lineTo(0, r + 3);
  } else if (weapon === 'eagle') {
    ctx.moveTo(0, -r - 1); ctx.lineTo(r + 1, 0); ctx.lineTo(0, r + 1); ctx.lineTo(-r - 1, 0); ctx.closePath();
    ctx.moveTo(-r - 4, 0); ctx.lineTo(-r - 2, 0); ctx.moveTo(r + 2, 0); ctx.lineTo(r + 4, 0);
  } else if (weapon === 'scout') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.moveTo(0, -r - 3); ctx.lineTo(0, -r + 1);
  } else if (weapon === 'ak') {
    for (let i = 0; i < 4; i++) {
      const dx = Math.cos(i * quarter), dy = Math.sin(i * quarter);
      ctx.moveTo(dx * r, dy * r); ctx.lineTo(dx * (r + 5), dy * (r + 5));
    }
  } else if (weapon === 'shotgun') {
    for (const angle of [-Math.PI, 0]) {
      ctx.moveTo(Math.cos(angle - .79) * r, Math.sin(angle - .79) * r);
      ctx.arc(0, 0, r, angle - .79, angle + .79);
    }
    ctx.moveTo(-r - 3, 0); ctx.lineTo(-r + 3, 0); ctx.moveTo(r - 3, 0); ctx.lineTo(r + 3, 0);
  } else {
    ctx.roundRect(-r, -r, r * 2, r * 2, 3);
    ctx.moveTo(-2.2, 0); ctx.lineTo(2.2, 0); ctx.moveTo(0, -2.2); ctx.lineTo(0, 2.2);
  }
  ctx.strokeStyle = '#04131edb'; ctx.lineWidth = 2.75; ctx.stroke();
  ctx.strokeStyle = weapons[weapon].color; ctx.lineWidth = 1; ctx.stroke();
  if (weapon !== 'medical') {
    ctx.fillStyle = '#f0ffff'; ctx.fillRect(-.65, -.65, 1.3, 1.3);
  }
  ctx.restore();
}
