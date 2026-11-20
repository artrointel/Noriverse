import type { AnimationEventHandler, CSSProperties } from 'react';

const particles = [[14, -4], [10, 11], [-4, 17], [-15, 6], [-12, -11], [3, -15]];

export function TouchBurst({ style, remote = false, onEnd }: { style?: CSSProperties; remote?: boolean; onEnd?: AnimationEventHandler<HTMLSpanElement> }) {
  return <span className="touch-burst" data-remote={remote} style={style} aria-hidden="true" onAnimationEnd={event => {
    if (event.target === event.currentTarget) onEnd?.(event);
  }}>
    {particles.map(([x, y]) => <i key={x} style={{ '--dx': x + 'px', '--dy': y + 'px' } as CSSProperties} />)}
  </span>;
}
