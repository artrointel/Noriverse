import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import { reactionTextLimit } from '../../../../packages/protocol/reactions.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { chooseSketchMap, drawer, sketchDeck, sketchOutcome, sketchRanking, wordIntroDuration } from '../games/sketch/rules.ts';
import type { Prompt, SketchMap, SketchRound, SketchSettings } from '../games/sketch/rules.ts';
import { editInk, emptyInk, eraserBrush, inkLimit, practiceInkLimit } from '../games/sketch/ink.ts';
import type { BoardEdit, Ink, InkHistory } from '../games/sketch/ink.ts';
import type { SketchHudView } from '../games/sketch/hud.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { MatchStage } from './match-stage.tsx';
import { EndRoundAction } from './end-round-action.tsx';
import { GameResult } from './game-result.tsx';
import { formatPlayTime, PlayTime, useCountdown, useElapsedPlayTime } from './game-time.tsx';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { playSound } from './audio.ts';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';
import { RoomPlayerAvatar } from './avatar.tsx';
import { SketchTools, useRecentInk } from './sketch-tools.tsx';
import './sketch-tools.css';

type SketchRoom = ReturnType<typeof useRoomBoard> & { sketch: SketchRound; role: Role };
type Practice = InkHistory & { id: string; deck: Prompt[]; map: SketchMap; turn: number; startedAt: number; opensAt: number; endedAt: number };
const newPractice = (settings: SketchSettings): Practice => ({
  ...emptyInk(), id: crypto.randomUUID(), deck: sketchDeck(settings.language), map: chooseSketchMap(settings.map),
  turn: 0, startedAt: 0, opensAt: 0, endedAt: 0,
});

function WordIntro({ word, opensAt }: { word: string; opensAt: number }) {
  const [offset] = useState(() => Math.min(wordIntroDuration, Math.max(0, Date.now() - opensAt + wordIntroDuration)));
  return <div className="sketch-word-intro" style={{ animationDelay: -offset + 'ms', animationDuration: wordIntroDuration + 'ms' }}>{word}</div>;
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
      placeholder={t('sketchGuess')} autoComplete="off" maxLength={reactionTextLimit} required />
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
  const [practice, setPractice] = useState(() => newPractice(settings));
  const [chosenColor, setColor] = useState<number>();
  const [width, setWidth] = useState(8);
  const [eraserWidth, setEraserWidth] = useState(24);
  const [erasing, setErasing] = useState(false);
  const colorPicker = useRef<HTMLInputElement>(null);
  const [brush, setBrush] = useState(0);
  const recents = useRecentInk();
  const [completedIntro, setCompletedIntro] = useState(0);
  const [wipe, setWipe] = useState(0);
  const [closedResult, setClosedResult] = useState('');
  const [feedback, setFeedback] = useState<{ epoch: string; label: 'sketchSent' | 'sketchTryAgain' }>();
  const round = room?.sketch;
  const id = room?.matchId ?? practice.id;
  const turn = round?.turn ?? practice.turn;
  const epoch = id + ':' + turn;
  const roundStart = useRoundStart(id, room, room?.displayStart ?? 0, startedAt =>
    setPractice(previous => ({ ...previous, startedAt, opensAt: startedAt + wordIntroDuration })));
  const opensAt = room?.sketchDisplayOpen ?? practice.opensAt;
  const map = round?.map ?? practice.map;
  const color = chosenColor ?? (map === 'chalkboard' ? 0xfffcf3 : 0x263044);
  const finishedAt = room?.finishedAt ?? practice.endedAt;
  const startedAt = room?.playStartedAt ?? practice.startedAt;
  const retired = Boolean(room && round?.retired.includes(room.role));
  const drawing = !round || Boolean(room && drawer(round) === room.role);
  const correct = Boolean(room && round?.solvedBy === room.role);
  const active = !finishedAt && roundStart.started && !retired && (!room || room.state === 'connected');
  const intro = active && Boolean(opensAt && completedIntro !== opensAt && opensAt > Date.now()) && (!round || round.phase === 'draw');
  const canDraw = active && !intro && drawing && (!round || round.phase === 'draw');
  const canGuess = active && !intro && !drawing && round?.phase === 'draw';
  const deadline = room && round?.phase === 'draw' && !intro && roundStart.started ? room.sketchDisplayDeadline : 0;
  const remaining = useCountdown(deadline);
  const elapsed = useElapsedPlayTime(!room && !intro && roundStart.started ? opensAt : 0, finishedAt);
  const seconds = deadline ? remaining : room && round?.phase === 'draw' ? room.sketchConfig?.seconds ?? settings.seconds : elapsed;
  const board = round?.board ?? practice.board;
  const limit = room ? inkLimit : practiceInkLimit;
  const answer = round ? drawing || round.phase !== 'draw' ? round.answer : undefined : practice.deck[turn].word;
  const outcome = finishedAt ? room ? sketchOutcome(room.sketch, room.role) : 'draw' : undefined;
  const report = useMemo<MatchReport | undefined>(() => outcome && finishedAt ? {
    id, game: 'sketch', mode: room ? 'online' : 'local', outcome, seconds: elapsedPlaySeconds(startedAt, finishedAt),
  } : undefined, [id, Boolean(room), outcome, finishedAt, startedAt]);
  const { ending, pending } = useRoundEnd(id, outcome === 'win' ? 'victory' : outcome === 'loss' ? 'defeat' : outcome && 'finished');
  const visible = Boolean(report && !pending && closedResult !== id);

  useEffect(() => { if (correct) playSound('place'); }, [epoch, correct]);
  useEffect(() => { void document.fonts.load('1rem "Sketch Jua"').catch(() => undefined); }, []);
  useEffect(() => {
    if (!opensAt) return;
    const timer = window.setTimeout(() => setCompletedIntro(opensAt), Math.max(0, opensAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [opensAt]);

  function submit(text: string) {
    if (!room || !canGuess) return;
    const accepted = room.sketchAction({ kind: 'guess', text });
    setFeedback({ epoch, label: room.role === 'host' && !accepted ? 'sketchTryAgain' : 'sketchSent' });
  }

  function send(lines: Ink[]) {
    if (!canDraw) return;
    if (lines[0] && lines[0][6] !== eraserBrush) recents.remember(lines[0][4]);
    if (room) room.sketchAction({ kind: 'ink', lines });
    else setPractice(previous => ({ ...previous, ...editInk(previous, lines, practiceInkLimit) }));
  }

  function edit(kind: BoardEdit) {
    setWipe(value => value + 1);
    if (room) room.sketchAction({ kind });
    else setPractice(previous => ({ ...previous, ...editInk(previous, kind) }));
  }

  function chooseColor(value: number) { setColor(value); setErasing(false); }
  function chooseBrush(value: number) {
    setErasing(value === eraserBrush);
    if (value !== eraserBrush) setBrush(value);
  }
  const next = room ? undefined : () => setPractice(previous => ({ ...previous, ...emptyInk(),
    turn: (previous.turn + 1) % previous.deck.length, opensAt: Date.now() + wordIntroDuration }));
  const shownWidth = erasing ? eraserWidth : width;
  const resizeBrush = erasing ? setEraserWidth : setWidth;
  const canUndo = Boolean(board.length);
  const canRedo = Boolean(round?.redoCount ?? practice.redo.length);

  const players = round?.players.map((role, index) => {
    const profile = room?.role === role && ownProfile ? ownProfile : room?.participants.find(person => person.role === role)?.profile;
    return { role, profile, name: profile?.name ?? t(role === 'host' ? 'host' : 'sketchGuest', { number: index }), score: round.scores[index] };
  }) ?? [];
  const currentDrawer = players.find(player => round && player.role === drawer(round));
  const ranked = round ? sketchRanking(round).flatMap(role => players.filter(player => player.role === role)) : [];
  const title = report ? room ? t('sketchWinner', { player: ranked[0]?.name }) : t('gameFinished') : undefined;
  const status = finishedAt ? t('gameFinished') : !roundStart.started ? t('roundWaiting') : retired ? t('roundResigned')
    : round?.phase === 'reveal' ? t('sketchRevealing') : drawing ? t('sketchDrawing') : t('sketchGuessing', { player: currentDrawer?.name });
  const score = room && <ol className="sketch-score" aria-label={t('sketchScores')}>
    {ranked.map((player, index) => <li key={player.role} data-drawing={player === currentDrawer && !finishedAt}>
      <small>#{index + 1}</small>
      <RoomPlayerAvatar appearance={player.profile} size={24} path={room.connectionPaths[player.role]} />
      <span>{player.name}</span>
      <strong>{player.score}</strong>
    </li>)}
  </ol>;
  const shownWord = roundStart.started || finishedAt ? answer : undefined;
  const wordLabel = round && round.phase !== 'draw' ? 'sketchAnswer' : 'sketchPrompt';
  const hintLabels = canGuess ? round?.hints.map(hint => hint.kind === 'length' ? t('sketchHintLength', { count: hint.value })
    : t(hint.kind === 'category' ? 'sketchHintCategory' : 'sketchHintColor', { value: t('sketchClue_' + hint.value) })) ?? [] : [];
  const hudStatus = canDraw && board.length >= limit ? t('sketchInkFull') : correct ? t('sketchEarned', { points: round?.points })
    : canGuess && feedback?.epoch === epoch ? t(room?.sketchWrongGuess ? 'sketchTryAgain' : feedback.label) : status;
  const hud: SketchHudView = {
    clock: formatPlayTime(seconds), low: Boolean(deadline && remaining <= 10),
    word: shownWord ?? '•••', wordLabel: t(wordLabel), status: hudStatus, hints: hintLabels,
    notice: canDraw && board.length >= limit ? t('sketchInkFull') : undefined,
    scores: ranked.map(player => ({ ...player, drawing: player === currentDrawer && !finishedAt })),
    tools: canDraw ? {
      labels: { palette: t('sketchPalette'), custom: t('sketchCustomColor'), recent: t('sketchRecentColors'),
        width: t('sketchHudWidth'), pen: t('sketchBrush_pen'), brush: t('sketchBrush_brush'),
        chalk: t('sketchBrush_chalk'), marker: t('sketchBrush_marker'), eraser: t('sketchEraser'), undo: t('sketchUndo'),
        redo: t('sketchRedo'), clear: t('sketchHudClear'), next: t('sketchHudNext') },
      color, brush: erasing ? eraserBrush : brush, width: shownWidth, recent: recents.colors, canUndo, canRedo,
      setColor: chooseColor, setBrush: chooseBrush, setWidth: resizeBrush, edit, next,
      custom: () => {
        const input = colorPicker.current;
        if (!input) return;
        try { input.showPicker(); } catch { input.click(); }
      },
    } : undefined,
  };
  const field = <>
    <div className="visually-hidden">
      <time dateTime={'PT' + seconds + 'S'} aria-label={t(room ? 'sketchTime' : 'playTime')}>{hud.clock}</time>
      <p aria-live="polite">{t(wordLabel)} {shownWord ?? t('sketchWordHidden')}</p>
      <p role="status">{hudStatus} {hintLabels.join(' · ')}</p>
      {score}
    </div>
    {canGuess && <div className="sketch-hud-guess"><GuessForm key={epoch} submit={submit} /></div>}
    {canDraw && <>
      <input ref={colorPicker} className="sketch-native-color" type="color" tabIndex={-1} aria-hidden="true"
        value={'#' + color.toString(16).padStart(6, '0')} onChange={event => chooseColor(Number.parseInt(event.currentTarget.value.slice(1), 16))} />
      <div className="sketch-keyboard-tools">
        <SketchTools color={color} setColor={chooseColor} recent={recents.colors} width={shownWidth} setWidth={resizeBrush} brush={brush}
          setBrush={chooseBrush} erasing={erasing} toggleEraser={() => setErasing(value => !value)} canUndo={canUndo} canRedo={canRedo} edit={edit} next={next} />
      </div>
    </>}
    {intro && drawing && answer && <WordIntro key={epoch + ':' + opensAt} word={answer} opensAt={opensAt} />}
  </>;
  const back = room ? '/room' : gamePath('sketch', 'setup');
  return <div className="site-width subpage play-page sketch-page">
    <BackLink fallback={back} fallbackLabel={room ? 'goToRoom' : 'settings'} navigate={navigate} />
    <div className="play-heading"><h1 tabIndex={-1}>{t('sketch')}</h1></div>
    <div className="play-layout">
      <MatchStage id="sketch" matchId={id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
        beginsAt={roundStart.beginsAt} ending={ending} onReady={roundStart.ready}
        playfieldContent={field}
        stageContext={{ mode: t(room ? 'sketchParty' : 'practice'), map: t('sketchMap_' + map) }}
        view={{ history: [], cursor: null, chessTargets: new Map(), dark, force: 1, allowDoubleThree: true, canMove: canDraw && board.length < limit,
          deadline: 0, finished: Boolean(finishedAt), move() {}, onAlkkagi() {}, sketch: {
            board, color, width: shownWidth, brush: erasing ? eraserBrush : brush, map, epoch: epoch + ':' + wipe, send, hud, online: Boolean(room) } }}
        setCursor={() => {}} yourTurn={Boolean(canDraw && room)} infoStatus={status}
        info={<>{room && <p role="status">{t(room.state ?? 'joining')}</p>}
          {room?.needsReconnect && <button type="button" className="button button-primary" onClick={room.reconnect}>{t('retry')}</button>}
          {startedAt > 0 && !finishedAt && <PlayTime startedAt={roundStart.beginsAt} />}
          {round && room && <p>{t('sketchRound', { current: turn + 1, total: round.players.length * (room.sketchConfig?.cycles ?? settings.cycles) })}</p>}{score}</>}
        endAction={!finishedAt && !retired && <EndRoundAction key={id} online={Boolean(room)} disabled={!active || intro}
          end={() => { if (room) room.surrender(); else setPractice(previous => ({ ...previous, endedAt: Date.now() })); }} />}
        result={report && <GameResult key={id} report={report} winner="draw" title={title} visible={visible} onClose={() => setClosedResult(id)}
          details={score} room={room && { canRematch: room.role === 'host' && room.canStart, returnToLobby: room.returnToLobby,
            request: room.role !== 'host' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
          record={room ? record : undefined} rematch={() => room ? room.rematch() : setPractice(newPractice(settings))}
          back={room ? '/room' : '/games'} navigate={navigate} />}
        resultVisible={visible} resultPending={pending} onShowResult={() => setClosedResult('')}
        showTouches={showTouches} onTouchDisplay={onTouchDisplay} touchStyle={touchStyle}
        remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch} ownProfile={ownProfile} reactions={room?.reactions} />
    </div>
  </div>;
}
