import { Popup } from './popup.tsx';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { timeoutExtraSeconds } from '../games/turn-clock.ts';
import type { TimeoutChoice } from '../games/turn-clock.ts';

export function TimeoutDecision({ timedPlayer, decisionPlayer, mayChoose, canSubmit, choose, reconnect }: {
  timedPlayer: string; decisionPlayer: string; mayChoose: boolean; canSubmit: boolean; choose: (choice: TimeoutChoice) => void;
  reconnect?: () => void;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => { if (mayChoose && !minimized) heading.current?.focus({ preventScroll: true }); }, [mayChoose, minimized]);
  if (minimized) return <button type="button" className="button button-primary decision-reopen" onClick={() => setMinimized(false)}>
    {t('turnTimeout', { stone: timedPlayer })}
  </button>;
  return <Popup mode="board" className="result-card timeout-card" role={mayChoose ? 'dialog' : 'status'}
    aria-labelledby="timeout-decision-title" onDismiss={() => setMinimized(true)}>
    <h2 id="timeout-decision-title" tabIndex={-1} ref={heading}>{t('turnTimeout', { stone: timedPlayer })}</h2>
    <p>{t(mayChoose ? 'timeoutChoiceHelp' : 'timeoutChoiceWait', { player: decisionPlayer, count: timeoutExtraSeconds })}</p>
    {mayChoose && <div className="panel-actions">
      <button className="button button-primary" type="button" disabled={!canSubmit} onClick={() => choose('claim')}>{t('timeoutClaim')}</button>
      <button className="button button-secondary" type="button" disabled={!canSubmit} onClick={() => choose('extend')}>{t('timeoutExtend', { count: timeoutExtraSeconds })}</button>
    </div>}
    {reconnect && <button className="button button-secondary" type="button" onClick={reconnect}>{t('retry')}</button>}
  </Popup>;
}
