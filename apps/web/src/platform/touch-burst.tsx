import { useEffect, useEffectEvent, useState } from 'react';
import type { CSSProperties } from 'react';
import type { TouchParticle } from '../../../../packages/protocol/profile.ts';

const bursts: Record<TouchParticle, { duration: number; radius: number; particles: [number, number][] }> = {
  soft: { duration: 500, radius: 20, particles: [[14, -4], [10, 11], [-4, 17], [-15, 6], [-12, -11], [3, -15]] },
  ripple: { duration: 640, radius: 28, particles: [[23, -6], [15, 14], [-12, 14], [-22, -4], [-3, -20]] },
  petals: { duration: 740, radius: 34, particles: [[-24, -21], [-9, -28], [11, -23], [24, -14], [27, 3], [-22, 9], [10, 22]] },
  pixelDrift: { duration: 810, radius: 31, particles: [[-16, -13], [-6, -24], [9, -28], [18, -17], [13, -8], [-12, 4]] },
  pixelBurst: { duration: 500, radius: 40, particles: [[-31, -6], [-23, -20], [-8, -27], [12, -26], [25, -17],
    [32, 1], [21, 17], [10, 24], [-8, 22], [-23, 14]] },
};

// Match the nominal radius of the particle trails and center accents in each preset.
const displayRadius = bursts.pixelBurst.radius * .8;

function createPlayback(effect: TouchParticle, cycle: number) {
  const preset = bursts[effect];
  const particles = preset.particles.map(([x, y], index) => {
    const angle = Math.atan2(y, x) + (Math.random() - .5) * .65;
    const distance = Math.hypot(x, y) * (.8 + Math.random() * .38);
    return {
      '--dx': Math.cos(angle) * distance + 'px',
      '--dy': Math.sin(angle) * distance + 'px',
      '--particle-duration': Math.round(preset.duration * (.78 + Math.random() * .22)) + 'ms',
      '--particle-scale': .85 + Math.random() * .3,
      '--spin': (index % 2 ? -1 : 1) * (60 + Math.random() * 100) + 'deg',
    } as CSSProperties;
  });
  return { cycle, particles };
}

export function TouchBurst({ effect = 'soft', style, remote = false, repeat = false, onEnd }: {
  effect?: TouchParticle; style?: CSSProperties; remote?: boolean; repeat?: boolean; onEnd?: () => void;
}) {
  const { duration, radius } = bursts[effect];
  const [visible, setVisible] = useState(true);
  const [playback, setPlayback] = useState(() => createPlayback(effect, 0));
  const finish = useEffectEvent(() => { setVisible(false); onEnd?.(); });
  useEffect(() => {
    if (repeat) {
      let cycle = 0;
      const timer = window.setInterval(() => setPlayback(createPlayback(effect, ++cycle)), duration + 420);
      return () => window.clearInterval(timer);
    }
    const timer = window.setTimeout(finish, duration);
    return () => window.clearTimeout(timer);
  }, [duration, effect, repeat]);
  if (!visible) return null;
  return <span key={playback.cycle} className="touch-burst" data-effect={effect} data-remote={remote}
    style={{ ...style, '--burst-duration': duration + 'ms', '--burst-scale': displayRadius / radius } as CSSProperties} aria-hidden="true">
    {playback.particles.map((particleStyle, index) => <i key={index} style={particleStyle} />)}
  </span>;
}
