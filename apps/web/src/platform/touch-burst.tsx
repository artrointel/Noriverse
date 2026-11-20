import { useEffect, useEffectEvent, useState } from 'react';
import type { CSSProperties } from 'react';

const particles = [[14, -4], [10, 11], [-4, 17], [-15, 6], [-12, -11], [3, -15]];

export function TouchBurst({ style, remote = false, onEnd }: { style?: CSSProperties; remote?: boolean; onEnd?: () => void }) {
  const [visible, setVisible] = useState(true);
  const finish = useEffectEvent(() => { setVisible(false); onEnd?.(); });
  useEffect(() => {
    const timer = window.setTimeout(finish, 500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <span className="touch-burst" data-remote={remote} style={style} aria-hidden="true">
    {particles.map(([x, y]) => <i key={x} style={{ '--dx': x + 'px', '--dy': y + 'px' } as CSSProperties} />)}
  </span>;
}
