import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popup } from './popup.tsx';

export function EndRoundAction({ online, disabled, end }: { online: boolean; disabled?: boolean; end: () => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const prompt = useId();
  const action = t(online ? 'surrender' : 'endPractice');
  return <div className="stage-end-action">
    <button type="button" className="button button-secondary stage-control" disabled={disabled}
      aria-haspopup="dialog" aria-expanded={confirm} onClick={() => setConfirm(true)}>{action}</button>
    {confirm && <Popup aria-labelledby={prompt} onDismiss={() => setConfirm(false)}>
      <h2 id={prompt}>{t(online ? 'confirmResign' : 'confirmEndPractice')}</h2>
      <div className="panel-actions">
        <button type="button" className="button button-secondary stage-control" disabled={disabled} onClick={() => { setConfirm(false); end(); }}>{action}</button>
        <button type="button" className="button button-secondary stage-control" onClick={() => setConfirm(false)}>{t('cancel')}</button>
      </div>
    </Popup>}
  </div>;
}
