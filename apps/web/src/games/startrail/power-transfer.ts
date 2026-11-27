import type { InteractionChallenge } from './challenge.ts';

const startX = 112, step = 128, y = 142;
const emergencyPower = {
  title: '비상 전력 전환',
  labels: ['관측 장비', '예비 전력선', '비상 승강기'],
  instruction: '왼쪽에서 오른쪽으로 스위치를 연결해 전력을 돌리세요.',
  hint: '전환 후에는 주황색 비상등이 켜집니다.',
};
const colors = ['#76d8f5', '#b5a4fb', '#ffd082'];

export function powerTransfer({ title, labels, instruction, hint } = emergencyPower): InteractionChallenge {
  let progress = 0;
  let mistake = -Infinity;
  return {
    get solved() { return progress === labels.length; },
    pointerDown(_id, point, time) {
      if (point.x > 418 && point.x < 454 && point.y > 24 && point.y < 54) return 'close';
      const station = labels.findIndex((_, i) => Math.hypot(point.x - (startX + i * step), point.y - y) < 32);
      if (station < 0 || station < progress) return;
      if (station !== progress) { mistake = time; return 'miss'; }
      progress++;
      return this.solved ? 'solved' : 'placed';
    },
    pointerMove() {}, pointerUp() { return undefined; }, cancelDrag() {},
    draw(ctx, time) {
      ctx.save();
      ctx.fillStyle = '#040b18cc'; ctx.fillRect(0, 0, 480, 270);
      ctx.beginPath(); ctx.roundRect(26, 24, 428, 216, 15);
      ctx.fillStyle = '#101c30'; ctx.fill(); ctx.strokeStyle = '#4e7487'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = "20px 'Sketch Jua', sans-serif"; ctx.fillStyle = '#eafaff';
      ctx.fillText(title, 48, 57); ctx.fillText('×', 429, 49);
      ctx.font = "11px 'Sketch Jua', sans-serif"; ctx.fillStyle = '#b6cddd';
      ctx.fillText(instruction, 48, 78);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      labels.forEach((label, index) => {
        const x = startX + index * step, active = index < progress, next = index === progress;
        if (index > 0) {
          ctx.beginPath(); ctx.moveTo(x - step + 29, y); ctx.lineTo(x - 29, y);
          ctx.lineWidth = active ? 3 : 2; ctx.strokeStyle = active ? '#ffd082' : '#32475a'; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#225244' : '#16283e'; ctx.fill();
        ctx.strokeStyle = active || next ? colors[index] : '#597487'; ctx.lineWidth = next ? 2 : 1; ctx.stroke();
        ctx.font = "18px 'Sketch Jua', sans-serif"; ctx.fillStyle = active || next ? colors[index] : '#aabfcd';
        ctx.fillText(active ? '✓' : String(index + 1), x, y + 1);
        ctx.font = "12px 'Sketch Jua', sans-serif"; ctx.fillText(label, x, y + 44);
      });
      ctx.fillStyle = time - mistake < 1.1 ? '#ffd08d' : '#7fabbf';
      ctx.font = "10px 'Sketch Jua', sans-serif";
      ctx.fillText(time - mistake < 1.1 ? '지금 빛나는 스위치부터 연결하세요.' : hint, 240, 216);
      ctx.restore();
    },
  };
}
