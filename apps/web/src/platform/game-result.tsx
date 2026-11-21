import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchReport } from '../../../../packages/protocol/profile.ts';
import type { Stone } from '../games/table.ts';
import type { AlkkagiWinner } from '../games/alkkagi/rules.ts';
import { sideLabel } from '../games/table.ts';
import { formatPlayTime } from './game-time.tsx';
import { RouteLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import type { ReactNode } from 'react';
import { BlurredSurface } from './blurred-surface.tsx';

export function GameResult({ report, winner, title, surrendered, timedOut, scores, details, visible, onClose, room, record, rematch, back, navigate }: {
  report: MatchReport;
  winner: AlkkagiWinner;
  title?: string;
  details?: ReactNode;
  surrendered?: Stone;
  timedOut?: Stone;
  scores?: readonly [number, number]; visible: boolean; onClose: () => void;
  room?: { canRematch: boolean; reconnect?: () => void; request?: () => void; notice?: 'sent' | 'incoming' };
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

  const label = title ?? (winner === 'draw' ? t('draw') : t('winner', { stone: t(sideLabel(report.game, winner)) }));
  return (
    <BlurredSurface className="result-card" role="dialog" aria-labelledby="match-result-title"
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
      {surrendered && <p>{t('resignedBy', { stone: t(sideLabel(report.game, surrendered)) })}</p>}
      {timedOut && <p>{t('turnTimeout', { stone: t(sideLabel(report.game, timedOut)) })}</p>}
      {scores && <p>{t('discScore', { black: scores[0], white: scores[1] })}</p>}
      <div className="result-summary">
        <div><span>{t('playTime')}</span><strong>{formatPlayTime(report.seconds)}</strong></div>
        <div><span>{t('gameMode')}</span><strong>{t(report.mode)}</strong></div>
      </div>
      {details}
      {record && <p className="muted" role="status">{t(saved === 'saved' ? 'savedResult' : saved === 'failed' ? 'failedResult' : 'savingResult')}</p>}
      {room?.notice && <p role="status">{t(room.notice === 'incoming' ? 'rematchIncoming' : 'rematchSent')}</p>}
      <div className="panel-actions">
        {(!room || room.canRematch) && <button type="button" className="button button-primary" onClick={rematch}>
          {t(report.game === 'sichuan' || report.game === 'memory' ? 'sichuanNew' : 'rematch')}
        </button>}
        {room?.request && <button type="button" className="button button-primary" disabled={room.notice === 'sent'} onClick={room.request}>{t('requestRematch')}</button>}
        {room?.reconnect && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}
        <RouteLink href={back} navigate={navigate} className="button button-secondary">{t(room ? 'goToRoom' : 'backToGames')}</RouteLink>
        {saved === 'failed' && <button type="button" className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>{t('saveResult')}</button>}
      </div>
    </BlurredSurface>
  );
}
