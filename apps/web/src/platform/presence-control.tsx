import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PresenceMode } from '../../../../packages/protocol/profile.ts';

export type PresenceSetting = { mode: PresenceMode; change: (mode: PresenceMode) => Promise<void> };

export function PresenceControl({ mode, change }: PresenceSetting) {
  const id = useId();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  return <>
    <div className="setting-segments setting-segments-presence" role="group" aria-label={t('presenceSettings')}>
      {(['online', 'offline'] as const).map(value => <label key={value}>
        <input className="visually-hidden" type="radio" name={id} checked={mode === value} disabled={saving}
          onChange={async () => {
            setSaving(true);
            setFailed(false);
            try { await change(value); }
            catch { setFailed(true); }
            finally { setSaving(false); }
          }} />
        <span>{t(value === 'offline' ? 'appearOffline' : 'appearOnline')}</span>
      </label>)}
    </div>
    <p className="settings-hint">{t('presenceHelp')}</p>
    {failed && <p className="settings-hint" role="alert">{t('profileError')}</p>}
  </>;
}
