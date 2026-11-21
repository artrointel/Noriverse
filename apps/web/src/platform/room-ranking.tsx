import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { roomRoles } from '../../../../packages/protocol/rooms.ts';
import { defaultAvatar } from '../../../../packages/protocol/profile.ts';
import type { Participant, Role } from '../../../../packages/protocol/rooms.ts';
import { roomPoints, roomRankChange, roomRankingEntries, roomStandings } from '../../../../packages/protocol/room-history.ts';
import type { RoomResult } from '../../../../packages/protocol/room-history.ts';
import { games } from './game-catalog.ts';
import { formatPlayTime } from './game-time.tsx';
import { Avatar } from './avatar.tsx';

type Ranking = { entries: RoomResult[]; participants: Participant[]; test?: boolean; matchId?: string; roomTitle?: string; finished?: boolean };
type View = 'ranking' | 'history';

export const RoomRankingContext = createContext<Ranking | undefined>(undefined);

function forRankingScope(data: Ranking, test: boolean): Ranking {
  return { ...data, entries: roomRankingEntries(data.entries, test), participants: data.participants.filter(player => test || !player.mock), test };
}

function rankingName(player: { mock?: boolean; name?: string; role: Role }, t: TFunction) {
  return player.mock ? t('mockSeat', { number: roomRoles.indexOf(player.role) })
    : player.name ?? (player.role === 'host' ? t('host') : t('anonymousSeat', { number: roomRoles.indexOf(player.role) + 1 }));
}

const fireworkSparks = Array.from({ length: 10 }, (_, index) => {
  const angle = index * Math.PI / 5;
  const distance = index % 2 ? 24 : 34;
  return { '--spark-x': Math.round(Math.cos(angle) * distance) + 'px',
    '--spark-y': Math.round(Math.sin(angle) * distance) + 'px',
    '--spark-color': ['#f6be50', '#ec886f', '#a78dea', '#69c7ba'][index % 4] } as CSSProperties;
});

function fireworkPositions() {
  return [
    { insetInlineStart: 17 + Math.random() * 26 + '%', insetBlockStart: 19 + Math.random() * 16 + '%' },
    { insetInlineStart: 57 + Math.random() * 26 + '%', insetBlockStart: 26 + Math.random() * 21 + '%' },
  ];
}

function RankingFireworks() {
  const [positions, setPositions] = useState(fireworkPositions);
  return <span className="ranking-fireworks" aria-hidden="true">
    {positions.map((position, burst) => <span className="ranking-firework" key={burst} style={position}>
      {fireworkSparks.map((style, index) => <i key={index} style={style}
        onAnimationIteration={burst === 0 && index === 0 ? () => setPositions(fireworkPositions()) : undefined} />)}
    </span>)}
  </span>;
}

function RankingRows({ entries, participants }: Ranking) {
  const { t } = useTranslation();
  if (!entries.length && participants.length) return <ul className="ranking-rows ranking-roster" aria-label={t('participants')}>
    {participants.map(player => <li key={player.role}>
      <Avatar appearance={{ avatar: player.profile?.avatar ?? (player.mock ? 'die' : defaultAvatar) }} size={32} characterOnly />
      <strong>{rankingName({ ...player, name: player.profile?.name }, t)}</strong>
    </li>)}
  </ul>;
  const rows = roomStandings(entries, participants);
  return rows.length ? <ol className="ranking-rows" data-podium-count={Math.min(3, rows.length)}>
    {rows.map((row, i) => <li key={row.key} data-medal={i < 3 ? i + 1 : undefined} data-leading={i === 0 && row.played > 0}>
      {i === 0 && <RankingFireworks key={row.wins} />}
      <span className="ranking-position">
        {i < 3 && <>
          <Avatar className="ranking-avatar" appearance={{ avatar: row.avatar ?? (row.mock ? 'die' : defaultAvatar) }}
            size={i === 0 ? 66 : 54} characterOnly />
          <span className="ranking-medal-art" aria-hidden="true" />
        </>}
        <span className="ranking-number">{i + 1}</span>
      </span>
      <div className="ranking-player">
        <strong>{rankingName(row, t)}</strong>
        <small>{t('roomRankingStats', { played: row.played, wins: row.wins })}</small>
      </div>
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
          {player.mock ? rankingName(player, t)
            : player.name ?? (player.role === 'host' ? t('host') : t('anonymousSeat', { number: index + 1 }))}
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
  const rankingTitle = t(data.test ? 'roomTestRanking' : 'roomRanking');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);

  return <dialog ref={dialog} className="surface profile-dialog room-ranking-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header className="room-panel-heading">
      <div>
        <h2 id={title}>{view === 'ranking' ? rankingTitle : t(data.test ? 'roomTestHistory' : 'roomHistory')}</h2>
        {data.roomTitle && <p className="ranking-room-title">{data.roomTitle}</p>}
      </div>
      <button className="settings-close" type="button" aria-label={t('close')} onClick={close}><span aria-hidden="true" /></button>
    </header>
    {view === 'ranking' ? <RankingRows {...data} /> : <MatchHistory entries={data.entries} />}
    {initial === 'ranking' && <button type="button" className="button button-secondary"
      onClick={() => setView(view === 'ranking' ? 'history' : 'ranking')}>
      {view === 'ranking' ? t('viewRoomHistory') : rankingTitle}
    </button>}
  </dialog>;
}

export function RoomRankingBoard({ status, ...data }: Ranking & { status?: ReactNode }) {
  const { t } = useTranslation();
  const title = useId();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<boolean>();
  const testing = Boolean(data.test || data.participants.some(player => player.mock));
  const testAvailable = testing || data.entries.some(entry => entry.test);
  const test = testAvailable && (scope ?? testing);
  const ranking = forRankingScope(data, test);
  return <section className="surface lobby-panel room-ranking-board" aria-labelledby={title}>
    <header className="room-panel-heading"><h2 id={title}>{t(test ? 'roomTestRanking' : 'roomRanking')}</h2>
      <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>{t('viewRoomHistory')}</button>
    </header>
    {status}
    {testAvailable && <select className="ranking-scope" aria-label={t('roomRankingScope')}
      value={test ? 'test' : 'room'} onChange={event => setScope(event.target.value === 'test')}>
      <option value="room">{t('roomRanking')}</option>
      <option value="test">{t('roomTestRanking')}</option>
    </select>}
    <RankingRows {...ranking} />
    {open && <RankingDialog data={ranking} initial="history" close={() => setOpen(false)} />}
  </section>;
}

export function RoomRankingControl() {
  const { t } = useTranslation();
  const data = useContext(RoomRankingContext);
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState<ReturnType<typeof roomRankChange>>();
  const observed = useRef<{ matchId?: string; complete: boolean; wasPlaying: boolean }>(undefined);
  useEffect(() => {
    if (!data) { observed.current = undefined; return; }
    const result = data.entries.find(entry => entry.id === data.matchId && Boolean(entry.test) === Boolean(data.test));
    const previous = observed.current;
    const current = previous?.matchId === data.matchId ? previous : undefined;
    observed.current = { matchId: data.matchId, complete: Boolean(result), wasPlaying: !data.finished || Boolean(current?.wasPlaying) };
    if (result && current?.wasPlaying && !current.complete) {
      const ranking = forRankingScope(data, Boolean(data.test));
      const next = roomRankChange(ranking.entries, ranking.participants, result);
      if (next) setChange(next);
    }
  }, [data]);
  useEffect(() => {
    if (!change) return;
    const expiry = window.setTimeout(() => setChange(undefined), 3000);
    return () => window.clearTimeout(expiry);
  }, [change]);
  if (!data) return null;
  return <div className="ranking-control">
    <button type="button" className="button button-secondary stage-control stage-control-icon" aria-label={t('roomRanking')}
      title={t('roomRanking')} onClick={() => { setChange(undefined); setOpen(true); }}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 20v-8h6v8M9 20V5h6v15m0 0v-6h6v6zM3 20h12" />
      </svg>
    </button>
    <div className="ranking-change-status" role="status">
      {change && <span className="ranking-change">{t('roomRankingChange', {
        player: rankingName(change.player, t), passed: rankingName(change.passed, t), rank: change.rank,
      })}</span>}
    </div>
    {open && <RankingDialog data={forRankingScope(data, Boolean(data.test))} initial="ranking" close={() => setOpen(false)} />}
  </div>;
}
