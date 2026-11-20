import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchReport } from '../../../../packages/protocol/profile.ts';
import type { Stone } from '../games/table.ts';
import { formatPlayTime } from './profiles.tsx';
import { RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';

export function GameResult({ report, winner, surrendered, scores, visible, onClose, room, record, rematch, back, navigate }: {
  report: MatchReport;
  winner: Stone | 'draw';
  surrendered?: Stone;
  scores?: readonly [number, number]; visible: boolean; onClose: () => void;
  room?: { canRematch: boolean; reconnect?: () => void };
  record?: (report: MatchReport) => Promise<boolean>;
  rematch: () => void; back: string; navigate: Navigate;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<'waiting' | 'saved' | 'failed'>('waiting');
  useEffect(() => { if (visible) heading.current?.focus({ preventScroll: true }); }, [visible]);
  useEffect(() => {
    if (!record) return;
    let current = true;
    setSaved('waiting');
    void record(report).then(ok => { if (current) setSaved(ok ? 'saved' : 'failed'); });
    return () => { current = false; };
  }, [attempt, record, report]);

  const label = winner === 'draw' ? t('draw')
    : t('winner', { stone: t(winner === 1 ? 'black' : 'white') });
  return (
    <section className="surface result-card" role="dialog" aria-labelledby="match-result-title"
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}>
      <button type="button" className="settings-close result-close" aria-label={t('viewBoard')} onClick={onClose}><span aria-hidden="true" /></button>
      <div className="result-medal" aria-hidden="true">✦</div>
      <p>{t('matchResult', { game: t(report.game) })}</p>
      <h2 id="match-result-title" ref={heading} tabIndex={-1}>{label}</h2>
      {surrendered && <p>{t('resignedBy', { stone: t(surrendered === 1 ? 'black' : 'white') })}</p>}
      {scores && <p>{t('discScore', { black: scores[0], white: scores[1] })}</p>}
      <div className="result-summary">
        <div><span>{t('playTime')}</span><strong>{formatPlayTime(report.seconds)}</strong></div>
        <div><span>{t('gameMode')}</span><strong>{t(report.mode)}</strong></div>
      </div>
      {record && <p className="muted" role="status">{t(saved === 'saved' ? 'savedResult' : saved === 'failed' ? 'failedResult' : 'savingResult')}</p>}
      {record && report.mode === 'local' && <p className="muted result-note">{t('localRecord')}</p>}
      <div className="panel-actions">
        {(!room || room.canRematch) && <button type="button" className="button button-primary" onClick={rematch}>
          {t('rematch')}
        </button>}
        {room?.reconnect && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}
        <RouteLink href={back} navigate={navigate} className="button button-secondary">{t(room ? 'goToRoom' : 'backToGames')}</RouteLink>
        {saved === 'failed' && <button type="button" className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>{t('saveResult')}</button>}
      </div>
    </section>
  );
}
