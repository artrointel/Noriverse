import { useId } from 'react';
import type { ReactNode } from 'react';

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section className="setup-section" aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <div className="setup-section-fields">{children}</div>
  </section>;
}

export function SettingsSelect({ label, description, value, change, children }: {
  label: string; description?: string; value: number | string; change: (value: string) => void; children: ReactNode;
}) {
  const id = useId();
  return <div className="setup-row">
    <div className="setup-field-label"><label htmlFor={id}>{label}</label>
      {description && <small id={id + '-description'}>{description}</small>}
    </div>
    <div className="setup-select">
      <select id={id} value={value} aria-describedby={description ? id + '-description' : undefined}
        onChange={event => change(event.target.value)}>{children}</select>
    </div>
  </div>;
}
