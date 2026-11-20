import type { ComponentPropsWithoutRef } from 'react';
import './blurred-surface.css';

export function BlurredSurface({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section {...props} className={className ? 'blurred-surface ' + className : 'blurred-surface'} />;
}
