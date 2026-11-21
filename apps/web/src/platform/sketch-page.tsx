import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { drawer, inkColors, inkLimit, inkWidths, sketchDeck, sketchOutcome } from '../games/sketch/rules.ts';
import type { Ink, SketchRound, SketchSettings } from '../games/sketch/rules.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { MatchStage } from './match-stage.tsx';
import { EndRoundAction } from './end-round-action.tsx';
import { GameResult } from './game-result.tsx';
import { formatPlayTime, PlayTime, useCountdown } from './game-time.tsx';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { playSound } from './audio.ts';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';
import { Avatar } from './avatar.tsx';

type SketchRoom = ReturnType<typeof useRoomBoard> & { sketch: SketchRound; role: Role };
type Practice = { id: string; deck: string[]; board: Ink[]; turn: number; startedAt: number; endedAt: number };
const newPractice = (language: SketchSettings['language']): Practice => ({
  id: crypto.randomUUID(), deck: sketchDeck(language), board: [], turn: 0, startedAt: 0, endedAt: 0,
});

function SketchTimer({ deadline }: { deadline: number }) {
  const seconds = useCountdown(deadline);
  return <time className="stage-clock" data-low={seconds <= 10} dateTime={'PT' + seconds + 'S'}>{formatPlayTime(seconds)}</time>;
}

function GuessForm({ submit }: { submit: (text: string) => void }) {
  const { t } = useTranslation();
  const [guess, setGuess] = useState('');
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = guess.trim();
    if (!text) return;
    submit(text);
    setGuess('');
  }
  return <form className="sketch-guess" onSubmit={send}>
    <input value={guess} onChange={event => setGuess(event.target.value)} aria-label={t('sketchGuess')}
      placeholder={t('sketchGuess')} autoComplete="off" maxLength={64} required />
    <button className="button button-primary" type="submit" disabled={!guess.trim()}>{t('sketchSubmit')}</button>
  </form>;
}

export function SketchPage({ room, settings, ownProfile, navigate, dark, antialias, resolution, onResolution, onAntialias,
  showTouches, onTouchDisplay, touchStyle, record }: {
  room?: SketchRoom; settings: SketchSettings; ownProfile?: ProfileSummary; navigate: Navigate; dark: boolean; antialias: boolean;
  resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  showTouches: boolean; onTouchDisplay: (value: boolean) => void; touchStyle: TouchEffect;
  record?: (report: MatchReport) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [practice, setPractice] = useState(() => newPractice(settings.language));
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);
  const [wipe, setWipe] = useState(0);
  const [closedResult, setClosedResult] = useState('');
  const [feedback, setFeedback] = useState<{ epoch: string; label: 'sketchSent' | 'sketchTryAgain' }>();
  const round = room?.sketch;
  const id = room?.matchId ?? practice.id;
  const turn = round?.turn ?? practice.turn;
  const epoch = id + ':' + turn;
  const roundStart = useRoundStart(id, room, room?.displayStart ?? 0, startedAt => setPractice(previous => ({ ...previous, startedAt })));
  const finishedAt = room?.finishedAt ?? practice.endedAt;
  const startedAt = room?.playStartedAt ?? practice.startedAt;
  const retired = Boolean(room && round?.retired.includes(room.role));
  const drawing = !round || Boolean(room && drawer(round) === room.role);
  const correct = Boolean(room && round?.correct.includes(room.role));
  const active = !finishedAt && roundStart.started && !retired && (!room || room.state === 'connected');
  const canDraw = active && drawing && (!round || round.phase === 'draw');
  const canGuess = active && !drawing && !correct && round?.phase === 'draw';
  const board = round?.board ?? practice.board;
  const answer = round ? drawing || round.phase !== 'draw' ? round.answer : undefined : practice.deck[turn];
  const outcome = finishedAt ? room ? sketchOutcome(room.sketch, room.role) : 'draw' : undefined;
  const report = useMemo<MatchReport | undefined>(() => outcome && finishedAt ? {
    id, game: 'sketch', mode: room ? 'online' : 'local', outcome, seconds: elapsedPlaySeconds(startedAt, finishedAt),
  } : undefined, [id, Boolean(room), outcome, finishedAt, startedAt]);
  const { ending, pending } = useRoundEnd(id, outcome === 'win' ? 'victory' : outcome === 'loss' ? 'defeat' : outcome && 'finished');
  const visible = Boolean(report && !pending && closedResult !== id);

  useEffect(() => { if (correct) playSound('place'); }, [epoch, correct]);

  function submit(text: string) {
    if (!room || !canGuess) return;
    const accepted = room.sketchAction({ kind: 'guess', text });
    setFeedback({ epoch, label: room.role === 'host' && !accepted ? 'sketchTryAgain' : 'sketchSent' });
  }

  function send(lines: Ink[]) {
    if (!canDraw) return;
    if (room) room.sketchAction({ kind: 'ink', lines });
    else setPractice(previous => ({ ...previous, board: [...previous.board, ...lines].slice(0, inkLimit) }));
  }

  function clear() {
    setWipe(value => value + 1);
    if (room) room.sketchAction({ kind: 'clear' });
    else setPractice(previous => ({ ...previous, board: [] }));
  }

  const players = round?.players.map((role, index) => {
    const profile = room?.role === role && ownProfile ? ownProfile : room?.participants.find(person => person.role === role)?.profile;
    return { role, profile, name: profile?.name ?? t(role === 'host' ? 'host' : 'sketchGuest', { number: index }), score: round.scores[index] };
  }) ?? [];
  const currentDrawer = players.find(player => round && player.role === drawer(round));
  const title = report ? t(room ? 'outcome_' + report.outcome : 'gameFinished') : undefined;
  const status = finishedAt ? t('gameFinished') : !roundStart.started ? t('roundWaiting') : retired ? t('roundResigned')
    : round?.phase === 'reveal' ? t('sketchRevealing') : drawing ? t('sketchDrawing') : t('sketchGuessing', { player: currentDrawer?.name });
  const score = room && <ol className="sketch-score" aria-label={t('sketchScores')}>
    {[...players].sort((a, b) => b.score - a.score).map(player => <li key={player.role} data-drawing={player === currentDrawer && !finishedAt}>
      {player.profile && <Avatar appearance={player.profile} size={24} />}
      <span>{player.name}</span>
      <strong>{player.score}</strong>
    </li>)}
  </ol>;
  const controls = <div className="sketch-interaction">
    <p className="sketch-word" aria-live="polite">{answer && (roundStart.started || finishedAt)
      ? <><span>{t(round && round.phase !== 'draw' ? 'sketchAnswer' : 'sketchPrompt')}</span><strong>{answer}</strong></>
      : <strong>{status}</strong>}</p>
    {canDraw && <div className="sketch-toolbar">
      <div className="sketch-colors" role="group" aria-label={t('sketchColors')}>
        {inkColors.map((tone, index) => <button key={tone} type="button" className="sketch-swatch" aria-pressed={color === index}
          aria-label={t('sketchColor_' + index)} title={t('sketchColor_' + index)} onClick={() => setColor(index)}>
          <i style={{ background: '#' + tone.toString(16).padStart(6, '0') }} /></button>)}
      </div>
      <div className="sketch-tools">
        <select aria-label={t('sketchWidth')} value={width} onChange={event => setWidth(Number(event.target.value))}>
          {inkWidths.map((_, index) => <option key={index} value={index}>{t('sketchWidth_' + index)}</option>)}
        </select>
        <button type="button" className="button button-secondary" disabled={!board.length} onClick={clear}>{t('sketchClear')}</button>
        {!room && <button type="button" className="button button-secondary" onClick={() => setPractice(previous =>
          ({ ...previous, turn: (previous.turn + 1) % previous.deck.length, board: [] }))}>{t('sketchNext')}</button>}
      </div>
      {board.length >= inkLimit && <small>{t('sketchInkFull')}</small>}
    </div>}
    {canGuess && <GuessForm key={epoch} submit={submit} />}
    {round?.phase === 'draw' && (correct || canGuess && feedback?.epoch === epoch) &&
      <small role="status">{t(correct ? 'sketchCorrect' : room?.sketchWrongGuess ? 'sketchTryAgain' : feedback!.label)}</small>}
    {room && <div className="sketch-round-score">{score}</div>}
  </div>;
  const back = room ? '/room' : gamePath('sketch', 'setup');
  return <div className="site-width subpage play-page sketch-page">
    <BackLink fallback={back} fallbackLabel={room ? 'goToRoom' : 'settings'} navigate={navigate} />
    <div className="play-heading"><h1 tabIndex={-1}>{t('sketch')}</h1></div>
    <div className="play-layout">
      <MatchStage id="sketch" matchId={id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
        beginsAt={roundStart.beginsAt} ending={ending} onReady={roundStart.ready} interaction={controls}
        stageContext={{ mode: t(room ? 'sketchParty' : 'practice'), map: round && room ? t('sketchRound', {
          current: turn + 1, total: round.players.length * (room.sketchConfig?.cycles ?? settings.cycles),
        }) : '' }}
        view={{ history: [], cursor: null, chessTargets: new Map(), dark, force: 1, allowDoubleThree: true, canMove: canDraw && board.length < inkLimit,
          deadline: 0, finished: Boolean(finishedAt), move() {}, onAlkkagi() {}, sketch: { board, color, width, epoch: epoch + ':' + wipe, send } }}
        setCursor={() => {}} yourTurn={Boolean(canDraw && room)} infoStatus={status}
        info={<>{room && <p role="status">{t(room.state ?? 'joining')}</p>}
          {room?.needsReconnect && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}
          {startedAt > 0 && !finishedAt && <PlayTime startedAt={roundStart.beginsAt} />}{score}</>}
        timer={room && room.sketchDisplayDeadline > 0 && !finishedAt && roundStart.started && <SketchTimer deadline={room.sketchDisplayDeadline} />}
        endAction={!finishedAt && !retired && <EndRoundAction key={id} online={Boolean(room)} disabled={!active}
          end={() => { if (room) room.surrender(); else setPractice(previous => ({ ...previous, endedAt: Date.now() })); }} />}
        result={report && <GameResult key={id} report={report} winner="draw" title={title} visible={visible} onClose={() => setClosedResult(id)}
          details={score} room={room && { canRematch: room.role === 'host' && room.canStart,
            request: room.role !== 'host' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
          record={room ? record : undefined} rematch={() => room ? room.rematch() : setPractice(newPractice(settings.language))}
          back={room ? '/room' : '/games'} navigate={navigate} />}
        resultVisible={visible} resultPending={pending} onShowResult={() => setClosedResult('')}
        showTouches={showTouches} onTouchDisplay={onTouchDisplay} touchStyle={touchStyle}
        remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch} ownProfile={ownProfile} reactions={room?.reactions} />
    </div>
  </div>;
}
