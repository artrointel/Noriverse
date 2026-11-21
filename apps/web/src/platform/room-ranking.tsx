import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { roomRoles } from '../../../../packages/protocol/rooms.ts';
import type { Participant } from '../../../../packages/protocol/rooms.ts';
import { roomPoints, roomStandings } from '../network/room-history.ts';
import type { RoomResult } from '../network/room-history.ts';
import { games } from './game-catalog.ts';
import { formatPlayTime } from './game-time.tsx';

type Ranking = { entries: RoomResult[]; participants: Participant[] };
type View = 'ranking' | 'history';

export const RoomRankingContext = createContext<Ranking | undefined>(undefined);

function RankingRows({ entries, participants }: Ranking) {
  const { t } = useTranslation();
  const rows = roomStandings(entries, participants);
  return rows.length ? <ol className="ranking-rows">
    {rows.map((row, i) => <li key={row.key} data-leading={i === 0 && row.played > 0}>
      <span className="ranking-position">{i + 1}</span>
      <strong>{row.name ?? (row.role === 'host' ? t('host') : t('anonymousSeat', { number: roomRoles.indexOf(row.role) + 1 }))}</strong>
      <small>{t('roomRankingStats', { played: row.played, wins: row.wins })}</small>
      <b>{t('rankingPoints', { points: row.points })}</b>
    </li>)}
  </ol> : <p className="lobby-empty">{t('roomHistoryEmpty')}</p>;
}

function MatchHistory({ entries }: Pick<Ranking, 'entries'>) {
  const { t, i18n } = useTranslation();
  const clock = new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: 'numeric', minute: '2-digit' });
  return entries.length ? <ol className="room-history-list">
    {entries.map(entry => <li key={entry.id}>
      <img src={games[entry.game].art} alt="" width="56" height="42" loading="lazy" />
      <div className="room-history-match"><strong>{t(entry.game)}</strong>
        <small><time dateTime={new Date(entry.endedAt).toISOString()}>{clock.format(entry.endedAt)}</time> · {formatPlayTime(entry.seconds)}</small>
        <ul>{entry.players.map((player, index) => <li key={player.role}>
          {player.name ?? (player.role === 'host' ? t('host') : t('anonymousSeat', { number: index + 1 }))}
          <span data-outcome={player.outcome}>{t('outcome_' + player.outcome)}</span>
          <b className="ranking-award">+{roomPoints(player)}</b>
        </li>)}</ul>
      </div>
    </li>)}
  </ol> : <p className="lobby-empty">{t('roomHistoryEmpty')}</p>;
}

function RankingDialog({ data, initial, close }: { data: Ranking; initial: View; close: () => void }) {
  const { t } = useTranslation();
  const title = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState(initial);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  return <dialog ref={dialog} className="surface profile-dialog room-ranking-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className="room-panel-heading">
      <h2 id={title}>{t(view === 'ranking' ? 'roomRanking' : 'roomHistory')}</h2>
      <button className="settings-close" type="button" aria-label={t('close')} onClick={close}><span aria-hidden="true" /></button>
    </header>
    {view === 'ranking' ? <RankingRows {...data} /> : <MatchHistory entries={data.entries} />}
    {initial === 'ranking' && <button type="button" className="button button-secondary"
      onClick={() => setView(view === 'ranking' ? 'history' : 'ranking')}>
      {t(view === 'ranking' ? 'viewRoomHistory' : 'roomRanking')}
    </button>}
  </dialog>;
}

export function RoomRankingBoard({ status, ...data }: Ranking & { status?: ReactNode }) {
  const { t } = useTranslation();
  const title = useId();
  const [open, setOpen] = useState(false);
  return <section className="surface lobby-panel room-ranking-board" aria-labelledby={title}>
    <header className="room-panel-heading"><h2 id={title}>{t('roomRanking')}</h2>
      <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>{t('viewRoomHistory')}</button>
    </header>
    {status}
    <RankingRows {...data} />
    {open && <RankingDialog data={data} initial="history" close={() => setOpen(false)} />}
  </section>;
}

export function RoomRankingControl() {
  const { t } = useTranslation();
  const data = useContext(RoomRankingContext);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return <>
    <button type="button" className="button button-secondary stage-control stage-control-icon" aria-label={t('roomRanking')}
      title={t('roomRanking')} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 20v-8h6v8M9 20V5h6v15m0 0v-6h6v6zM3 20h12" />
      </svg>
    </button>
    {open && <RankingDialog data={data} initial="ranking" close={() => setOpen(false)} />}
  </>;
}
