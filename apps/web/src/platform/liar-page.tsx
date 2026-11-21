import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import { roomRoles } from '../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { liarHintLimit, liarSpeaker } from '../games/liar/rules.ts';
import type { LiarView } from '../games/liar/rules.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { roomRankingEntries, roomStandings } from '../../../../packages/protocol/room-history.ts';
import { Avatar } from './avatar.tsx';
import { MatchStage } from './match-stage.tsx';
import { EndRoundAction } from './end-round-action.tsx';
import { GameResult } from './game-result.tsx';
import { formatPlayTime, PlayTime, useCountdown } from './game-time.tsx';
import { BackLink } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';
import { playSound } from './audio.ts';

type Room = ReturnType<typeof useRoomBoard> & { liar: LiarView; role: Role };
const away = () => {};

function LiarInput({ label, sendLabel, limit, disabled, send }: {
  label: string; sendLabel: string; limit: number; disabled: boolean; send: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return <form className="liar-input" onSubmit={event => {
    event.preventDefault();
    const value = text.trim();
    if (!disabled && value) send(value);
  }}>
    <input maxLength={limit} autoComplete="off" value={text} onChange={event => setText(event.target.value)}
      disabled={disabled} aria-label={label} placeholder={label} required />
    <button className="button button-primary" type="submit" disabled={disabled || !text.trim()}>{sendLabel}</button>
  </form>;
}

export function LiarPage({ room, ownProfile, dark, antialias, resolution, onResolution, onAntialias, navigate,
  showTouches, onTouchDisplay, touchStyle, record }: {
  room: Room; ownProfile?: ProfileSummary; dark: boolean; antialias: boolean; resolution: RenderResolution;
  onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void; navigate: Navigate;
  showTouches: boolean; onTouchDisplay: (value: boolean) => void; touchStyle: TouchEffect;
  record?: (report: MatchReport) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { liar: round, matchId: id, role } = room;
  const [opened, setOpened] = useState('');
  const [closedResult, setClosedResult] = useState('');
  const roundStart = useRoundStart(id, room, room.displayStart, away);
  const clockActive = roundStart.started && room.liarDisplayDeadline > 0;
  const seconds = useCountdown(clockActive ? room.liarDisplayDeadline : 0, left => { if (left >= 1 && left <= 3) playSound('tick'); });
  const outcome = room.roundOutcome;
  const report = useMemo<MatchReport | undefined>(() => outcome && room.finishedAt ? {
    id, game: 'liar', mode: 'online', outcome, seconds: elapsedPlaySeconds(room.playStartedAt, room.finishedAt),
  } : undefined, [id, outcome, room.finishedAt, room.playStartedAt]);
  const { ending, pending } = useRoundEnd(id, outcome === 'win' ? 'victory' : outcome === 'loss' ? 'defeat' : outcome && 'finished');
  const visible = Boolean(report && !pending && closedResult !== id);
  const speaker = round.phase === 'hint' ? liarSpeaker(round) : undefined;
  const retired = round.retired.includes(role);
  const connected = room.state === 'connected';
  const active = connected && roundStart.started && !retired && !outcome;
  const yours = active && (speaker === role || round.phase === 'guess' && round.accused === role);
  const voted = round.voted.includes(role);
  const standings = useMemo(() => roomStandings(roomRankingEntries(room.roomHistory, room.testMatch),
    room.participants.filter(player => room.testMatch || !player.mock), 'liar'), [room.roomHistory, room.participants, room.testMatch]);
  const players = round.players.map((player, index) => {
    const participant = room.participants.find(person => person.role === player);
    const profile = (player === role ? ownProfile : undefined) ?? participant?.profile;
    return { player, profile, total: standings.find(row => row.current && row.role === player)?.points ?? 0,
      name: profile?.name ?? (participant?.mock ? t('mockPlayer') + ' ' + roomRoles.indexOf(player) : t('sketchGuest', { number: index + 1 })) };
  });
  const name = (player?: Role) => players.find(entry => entry.player === player)?.name ?? t('anonymousPlayer');
  const topic = t('liarTopic_' + round.topic);
  const status = !roundStart.started ? t('roundWaiting') : outcome ? t('gameFinished') : retired ? t('roundResigned')
    : round.phase === 'hint' ? t(speaker === role ? 'liarYourHint' : 'liarTheirHint', { player: name(speaker) })
      : round.phase === 'vote' ? t('liarVoteStage') : t('liarGuessStage');
  const compactStatus = !roundStart.started || outcome || retired ? status : t(yours ? 'yourTurn'
    : round.phase === 'hint' ? 'liarClueStep' : round.phase === 'vote' ? 'liarVoteStep' : 'liarGuessStep');
  const card = opened === id ? round.card : undefined;
  const cardTitle = card ? card.side === 'citizens' ? card.word : t('liarRole') : t('liarRevealCard');
  const cardSubtitle = card ? t(card.side === 'citizens' ? 'liarCitizenCard' : 'liarNoWord') : t('liarPrivateCard');
  const cardPanel = <div className="liar-playfield">
    <button type="button" className="liar-card" aria-pressed={opened === id}
      disabled={!roundStart.started || !round.card} onClick={() => setOpened(opened === id ? '' : id)}>
      <span className="visually-hidden">{topic} · {cardTitle} · {cardSubtitle}</span>
    </button>
  </div>;
  const ballot = round.tally && <ul className="liar-tally" aria-label={t('liarTally')}>
    {round.tally.map(entry => <li key={entry.player}><span>{name(entry.player)}</span><b>{entry.votes}</b></li>)}
  </ul>;
  const roundScores = room.roomHistory.find(entry => entry.id === id)?.players;
  const details = <div className="liar-reveal">
    {round.result && <><p><span>{t('liarTopic')}</span><strong>{topic}</strong></p>
    <p><span>{t('liarWho')}</span><strong>{name(round.result.liar)}</strong></p>
    <p><span>{t('liarWord')}</span><strong>{round.result.word}</strong></p>
    {round.result.guess && <p><span>{t('liarFinalGuess')}</span><strong>{round.result.guess}</strong></p>}
    {ballot}</>}
    {roundScores && <section aria-label={t('liarSeriesPoints')}>
      <strong>{t('liarSeriesPoints')}</strong>
      <ul className="liar-tally">{players.map(entry => <li key={entry.player}><span>{entry.name}</span>
        <b>+{roundScores.find(score => score.role === entry.player)?.liarPoints ?? 0} · {t('rankingPoints', { points: entry.total })}</b>
      </li>)}</ul>
    </section>}
  </div>;
  const controls = <div className="liar-interaction">
    <section className="surface liar-desk" aria-label={t('liarPhase')}>
      <div className="liar-phase"><strong>{status}</strong>
        {round.phase === 'vote' && <span>{t('liarVoteCount', {
          count: round.voted.filter(player => !round.retired.includes(player)).length, total: round.players.length - round.retired.length,
        })}</span>}
      </div>
      {round.phase === 'hint' && speaker === role && roundStart.started && !retired && <LiarInput key={id + role}
        label={t('liarHintEntry')} sendLabel={t('liarSendHint')} limit={liarHintLimit} disabled={!active}
        send={text => room.liarAction({ kind: 'hint', text })} />}
      {round.phase === 'vote' && !retired && <div className="liar-voting">
        {voted ? <p role="status">{t('liarVoteSaved', { player: name(round.selected) })}</p> : <fieldset className="liar-vote-options" disabled={!active}>
          <legend className="visually-hidden">{t('liarVoteStage')}</legend>
          {players.filter(entry => entry.player !== role && !round.retired.includes(entry.player)).map(entry =>
            <button key={entry.player} className="button button-secondary" type="button"
              onClick={() => room.liarAction({ kind: 'vote', target: entry.player })}>
              {entry.profile && <Avatar appearance={entry.profile} size={23} />}{entry.name}
            </button>)}
        </fieldset>}
      </div>}
      {round.phase === 'guess' && <>
        <p className="liar-caught">{t('liarAccused', { player: name(round.accused) })}</p>
        {round.accused === role && <LiarInput key={id + 'guess'} label={t('liarGuessLabel')}
          sendLabel={t('liarSubmitGuess')} limit={64} disabled={!active} send={text => room.liarAction({ kind: 'guess', text })} />}
      </>}
      {round.hints.length > 0 && <ul className="liar-hints" aria-label={t('liarHints')} aria-live="polite">
        {round.hints.map(hint => <li key={hint.player}><b>{name(hint.player)}</b><span>{hint.text ?? t('liarSkipped')}</span></li>)}
      </ul>}
    </section>
  </div>;

  return <div className="site-width subpage play-page liar-page">
    <BackLink fallback="/room" fallbackLabel="goToRoom" navigate={navigate} />
    <div className="play-heading"><h1 tabIndex={-1}>{t('liar')}</h1></div>
    <div className="play-layout">
      <MatchStage id="liar" matchId={id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
        beginsAt={roundStart.beginsAt} ending={ending} onReady={roundStart.ready} playfieldContent={cardPanel} interaction={controls}
        stageContext={{ mode: t('liarTopic'), map: topic }} infoStatus={compactStatus} yourTurn={yours}
        info={<><p role="status">{t(room.state ?? 'joining')}</p>
          {clockActive && <time dateTime={'PT' + seconds + 'S'}>{formatPlayTime(seconds)}</time>}
          {room.needsReconnect && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}
          {roundStart.started && !outcome && <PlayTime startedAt={roundStart.beginsAt} />}
          <ul className="liar-tally">{players.map(entry => <li key={entry.player}><span>{entry.name}</span>
            <small>{t('rankingPoints', { points: entry.total })}{(speaker === entry.player || round.retired.includes(entry.player))
              && ' · ' + t(speaker === entry.player ? 'liarSpeaking' : 'roundResigned')}</small>
          </li>)}</ul></>}
        view={{ history: [], cursor: null, chessTargets: new Map(), dark, force: 1, allowDoubleThree: true, canMove: false,
          deadline: 0, finished: Boolean(outcome), move: away, onAlkkagi: away,
          liar: { phase: status, clock: clockActive ? formatPlayTime(seconds) : undefined, lowTime: clockActive && seconds <= 3,
            card: { open: Boolean(card), topic, title: cardTitle, subtitle: cardSubtitle }, scoreLabel: t('liarSeriesPoints'),
            players: players.map(entry => ({ name: entry.name, score: t('rankingPoints', { points: entry.total }) })) } }} setCursor={away}
        endAction={!outcome && !retired && <EndRoundAction key={id} online disabled={!active} end={room.surrender} />}
        result={report && <GameResult key={id} report={report} winner="draw"
          title={t(round.result?.winner === 'liar' ? 'liarWins' : 'liarCitizensWin')} visible={visible} onClose={() => setClosedResult(id)}
          details={details} room={{ canRematch: role === 'host' && room.canStart,
            request: role !== 'host' && connected ? room.requestRematch : undefined, notice: room.rematchNotice }}
          record={record} rematch={room.rematch} back="/room" navigate={navigate} />}
        resultVisible={visible} resultPending={pending} onShowResult={() => setClosedResult('')}
        ownProfile={ownProfile} reactions={room.reactions} showTouches={showTouches} onTouchDisplay={onTouchDisplay}
        touchStyle={touchStyle} remoteTouch={room.remoteTouch} onTouch={room.sendTouch} />
    </div>
  </div>;
}
