import { Popup } from './popup.tsx';
import { createContext, useContext, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roomRoles } from '../../../../packages/protocol/rooms.ts';
import type { Participant } from '../../../../packages/protocol/rooms.ts';
import { recoveryExitDelay, relayRecoveryDelay } from '../network/room-recovery.ts';

type MatchRecovery = { since: number; players: Participant[]; exit: () => void };
export const MatchRecoveryContext = createContext<MatchRecovery | undefined>(undefined);

export function MatchRecoveryDialog() {
  const recovery = useContext(MatchRecoveryContext);
  return recovery && <RecoveryDialog key={recovery.since} {...recovery} />;
}

function RecoveryDialog({ since, players, exit }: MatchRecovery) {
  const { t } = useTranslation();
  const heading = useId();
  const [minimized, setMinimized] = useState(false);
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - since));
  const canExit = elapsed >= recoveryExitDelay;
  const directRemaining = Math.max(0, Math.ceil((relayRecoveryDelay - elapsed) / 1000));
  useEffect(() => {
    let timer: number;
    function tick() {
      const next = Math.max(0, Date.now() - since);
      setElapsed(next);
      if (next < Math.max(recoveryExitDelay, relayRecoveryDelay)) timer = window.setTimeout(tick, 1000 - next % 1000);
    }
    tick();
    return () => window.clearTimeout(timer);
  }, [since]);

  if (minimized) return <button type="button" className="button button-secondary recovery-reopen"
    onClick={() => setMinimized(false)}>{t('recoveryTitle')}</button>;

  return <Popup aria-labelledby={heading} className="match-recovery" onDismiss={() => setMinimized(true)}>
    <h2 id={heading}>{t('recoveryTitle')}</h2>
    <p>{directRemaining ? t('recoveryDirect', { count: directRemaining }) : t('recoveryRelay')}</p>
    {players.length > 0 && <div className="match-recovery-players" role="status">
      <strong>{t('recoveryPlayers')}</strong>
      <ul>{players.map(({ role, profile }) => <li key={role}>
        {profile?.name ?? (role === 'host' ? t('host') : t('recoveryGuest', { number: roomRoles.indexOf(role) }))}
      </li>)}</ul>
    </div>}
    <div className="match-recovery-actions">
      {canExit && <span>{t('recoveryExitReady')}</span>}
      <button type="button" className="button button-secondary" disabled={!canExit} onClick={exit}>{t('recoveryExit')}</button>
    </div>
  </Popup>;
}
