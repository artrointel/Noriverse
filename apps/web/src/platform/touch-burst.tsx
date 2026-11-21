import { useEffect, useEffectEvent, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TouchParticle } from '../../../../packages/protocol/profile.ts';

const bursts: Record<TouchParticle, { duration: number; particles: [number, number][] }> = {
  soft: { duration: 500, particles: [[14, -4], [10, 11], [-4, 17], [-15, 6], [-12, -11], [3, -15]] },
  ripple: { duration: 640, particles: [[23, -6], [15, 14], [-12, 14], [-22, -4], [-3, -20]] },
  petals: { duration: 740, particles: [[-24, -21], [-9, -28], [11, -23], [24, -14], [27, 3], [-22, 9], [10, 22]] },
  pixelDrift: { duration: 810, particles: [[-16, -13], [-6, -24], [9, -28], [18, -17], [13, -8], [-12, 4]] },
  pixelBurst: { duration: 500, particles: [[-31, -6], [-23, -20], [-8, -27], [12, -26], [25, -17],
    [32, 1], [21, 17], [10, 24], [-8, 22], [-23, 14]] },
};

export function TouchBurst({ effect = 'soft', style, remote = false, repeat = false, onEnd }: {
  effect?: TouchParticle; style?: CSSProperties; remote?: boolean; repeat?: boolean; onEnd?: () => void;
}) {
  const { duration, particles } = bursts[effect];
  const [visible, setVisible] = useState(true);
  const [cycle, setCycle] = useState(0);
  const finish = useEffectEvent(() => { setVisible(false); onEnd?.(); });
  useEffect(() => {
    if (repeat) {
      const timer = window.setInterval(() => setCycle(current => current + 1), duration + 420);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(finish, duration);
    return () => window.clearTimeout(timer);
  }, [duration, repeat]);
  if (!visible) return null;
  return <span key={cycle} className="touch-burst" data-effect={effect} data-remote={remote}
    style={{ ...style, '--burst-duration': duration + 'ms' } as CSSProperties} aria-hidden="true">
    {particles.map(([x, y], index) => <i key={index} style={{ '--dx': x + 'px', '--dy': y + 'px',
      '--spin': (index % 2 ? -1 : 1) * (70 + index * 12) + 'deg' } as CSSProperties} />)}
  </span>;
}
