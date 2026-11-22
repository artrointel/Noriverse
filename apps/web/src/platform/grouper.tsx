import type { ReactNode } from 'react';
import './grouper.css';

export function Grouper({ title, summaryValue, variant = 'divider', initiallyOpen = false, children }: {
  title: string;
  summaryValue?: string;
  variant?: 'divider' | 'panel';
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  return <details className="grouper" data-variant={variant} open={initiallyOpen}>
    <summary>{title}{summaryValue && <small className="grouper-summary-value">{summaryValue}</small>}</summary>
    <div className="grouper-content">{children}</div>
  </details>;
}
