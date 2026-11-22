import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export function ScrollingLabel({ text }: { text: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);
  useLayoutEffect(() => {
    const frame = viewport.current;
    const content = label.current;
    if (!frame || !content) return;
    const measure = () => {
      const width = content.getBoundingClientRect().width;
      setDistance(width > frame.clientWidth ? width + 16 : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [text]);
  const motion = distance ? { '--scrolling-label-offset': -distance + 'px',
    '--scrolling-label-duration': Math.max(4, distance / 28) + 's' } as CSSProperties : undefined;
  return <span className="scrolling-label" ref={viewport} aria-hidden="true">
    <span className="scrolling-label-track" data-overflow={Boolean(distance)} style={motion}>
      <span ref={label}>{text}</span>
      {distance > 0 && <span>{text}</span>}
    </span>
  </span>;
}
