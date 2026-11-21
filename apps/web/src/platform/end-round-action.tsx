import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlurredSurface } from './blurred-surface.tsx';

export function EndRoundAction({ online, disabled, end }: { online: boolean; disabled?: boolean; end: () => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const action = t(online ? 'surrender' : 'endPractice');
  return <div className="stage-end-action" onKeyDown={event => {
    if (event.key === 'Escape' && confirm) { event.preventDefault(); setConfirm(false); }
  }}>
    <button type="button" className="button button-secondary stage-control" disabled={disabled} aria-expanded={confirm} onClick={() => setConfirm(!confirm)}>{action}</button>
    {confirm && <BlurredSurface className="stage-end-prompt">
      <p>{t(online ? 'confirmResign' : 'confirmEndPractice')}</p>
      <div className="panel-actions">
        <button type="button" className="button button-secondary stage-control" disabled={disabled} onClick={() => { setConfirm(false); end(); }}>{action}</button>
        <button type="button" className="button button-secondary stage-control" onClick={() => setConfirm(false)}>{t('cancel')}</button>
      </div>
    </BlurredSurface>}
  </div>;
}
