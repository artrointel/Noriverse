import type { InteractionChallenge } from './challenge.ts';
import type { Point } from './outpost.ts';

const pads = [
  { x: 112, y: 139, color: '#9ce6f9' },
  { x: 240, y: 139, color: '#d7baff' },
  { x: 368, y: 139, color: '#ffc785' },
] as const;
const flightPath = {
  title: '항로 주파수 교정', labels: ['북쪽', '남쪽', '궤도'], sequence: [1, 0, 2, 1],
  input: '봤던 순서대로 안테나 신호를 누르세요.',
};
const beat = .68, leadIn = .48;

export function routeSignal(startedAt: number, { title, labels, sequence, input } = flightPath): InteractionChallenge {
  let progress = 0, replayAt = startedAt, missedAt = -Infinity;
  const signalDuration = leadIn + sequence.length * beat;
  return {
    get solved() { return progress === sequence.length; },
    pointerDown(_id: number, point: Point, time: number) {
      if (point.x > 418 && point.x < 454 && point.y > 24 && point.y < 54) return 'close';
      if (this.solved || time < replayAt + signalDuration) return;
      const pad = pads.findIndex(({ x, y }) => Math.hypot(point.x - x, point.y - y) < 31);
      if (pad < 0) return;
      if (pad !== sequence[progress]) {
        progress = 0; missedAt = time; replayAt = time + .65;
        return 'miss';
      }
      progress++;
      return this.solved ? 'solved' : 'placed';
    },
    pointerMove() {},
    pointerUp() { return undefined; },
    cancelDrag() {},
    draw(ctx, time) {
      const elapsed = time - replayAt;
      const signal = elapsed - leadIn;
      const showing = elapsed < signalDuration;
      const pulse = signal >= 0 && signal % beat < .44 ? sequence[Math.floor(signal / beat)] : undefined;
      ctx.save();
      ctx.fillStyle = '#070c19cc'; ctx.fillRect(0, 0, 480, 270);
      ctx.beginPath(); ctx.roundRect(26, 24, 428, 216, 15);
      ctx.fillStyle = '#142037'; ctx.fill(); ctx.strokeStyle = '#56738e'; ctx.stroke();
      ctx.fillStyle = '#e9f6ff'; ctx.font = "20px 'Sketch Jua', sans-serif";
      ctx.fillText(title, 48, 57); ctx.fillText('×', 429, 49);
      ctx.font = "12px 'Sketch Jua', sans-serif"; ctx.fillStyle = '#b7cede';
      ctx.fillText(time - missedAt < .65 ? '신호가 어긋났어요. 순서를 다시 보여줍니다.'
        : showing ? '불빛이 켜지는 순서를 기억하세요.' : input, 48, 79);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [index, { x, y, color }] of pads.entries()) {
        ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2);
        ctx.fillStyle = pulse === index ? color : '#20374c'; ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = pulse === index ? 3 : 1.2; ctx.stroke();
        ctx.fillStyle = pulse === index ? '#121b2d' : color;
        ctx.font = "18px 'Sketch Jua', sans-serif"; ctx.fillText(String(index + 1), x, y + 1);
        ctx.fillStyle = color; ctx.font = "11px 'Sketch Jua', sans-serif"; ctx.fillText(labels[index], x, y + 39);
      }
      const previewProgress = Math.max(0, Math.min(sequence.length, Math.floor(signal / beat) + 1));
      for (let i = 0; i < sequence.length; i++) {
        ctx.fillStyle = i < (showing ? previewProgress : progress) ? '#9cebd8' : '#435971';
        ctx.fillRect(211 + i * 16, 211, 10, 3);
      }
      ctx.restore();
    },
  };
}
