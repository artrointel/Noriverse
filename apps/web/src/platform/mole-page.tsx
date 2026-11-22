import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import type { MatchReport, ProfileSummary, TouchEffect } from '../../../../packages/protocol/profile.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import type { RenderResolution } from '../games/render-resolution.ts';
import { advanceMole, createMoleRound, moleOutcome, nextMoleAt, resignMole, startMoleRound, strikeMole } from '../games/mole/rules.ts';
import type { MoleRound, MoleSettings } from '../games/mole/rules.ts';
import type { useRoomBoard } from '../network/use-room-board.ts';
import { RoomPlayerAvatar } from './avatar.tsx';
import { EndRoundAction } from './end-round-action.tsx';
import { GameResult } from './game-result.tsx';
import { MatchStage } from './match-stage.tsx';
import { BackLink, gamePath } from './navigation.tsx';
import type { Navigate } from './navigation.tsx';
import { useRoundEnd, useRoundStart } from './use-round-cues.ts';

type MoleRoom = ReturnType<typeof useRoomBoard> & { role: Role; mole: MoleRound };
const newPractice = (settings: MoleSettings) => ({ id: crypto.randomUUID(), round: createMoleRound(settings, ['host']), finishedAt: 0 });

export function MolePage({ room, settings, ownProfile, navigate, dark, antialias, resolution, onResolution, onAntialias,
  showTouches, onTouchDisplay, touchStyle, record }: {
  room?: MoleRoom; settings: MoleSettings; ownProfile?: ProfileSummary; navigate: Navigate; dark: boolean; antialias: boolean;
  resolution: RenderResolution; onResolution: (value: RenderResolution) => void; onAntialias: (value: boolean) => void;
  showTouches: boolean; onTouchDisplay: (value: boolean) => void; touchStyle: TouchEffect;
  record?: (report: MatchReport) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [practice, setPractice] = useState(() => newPractice(settings));
  const [cursor, setCursor] = useState<number | null>(null);
  const [closedResult, setClosedResult] = useState('');
  const round = room?.mole ?? practice.round;
  const id = room?.matchId ?? practice.id;
  const role = room?.role ?? 'host';
  const board = round.boards[role]!;
  const clockOffset = room?.displayStart ? room.displayStart - round.start : 0;
  const finishedAt = room?.finishedAt ?? practice.finishedAt;
  const roundStart = useRoundStart(id, room, room?.displayStart ?? 0, at =>
    setPractice(current => ({ ...current, round: startMoleRound(current.round, at) })));
  const playable = roundStart.started && !finishedAt && (!room || room.state === 'connected' || room.testMatch && !room.recoveryAt);
  const canMove = Boolean(playable && !board.out);
  const deadline = nextMoleAt(practice.round);

  useEffect(() => {
    if (room || !deadline || practice.finishedAt) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setPractice(current => {
        if (current.id !== id || nextMoleAt(current.round) !== deadline) return current;
        const next = advanceMole(current.round, now);
        return next ? { ...current, round: next, finishedAt: next.winners ? now : 0 } : current;
      });
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [Boolean(room), id, deadline, practice.finishedAt]);

  function hit(target: number) {
    if (!canMove) return;
    if (room) { room.moleAction(target); return; }
    const now = Date.now();
    setPractice(current => {
      const next = strikeMole(current.round, role, target, now);
      return next ? { ...current, round: next, finishedAt: next.winners ? now : 0 } : current;
    });
  }

  function end() {
    if (room) { room.surrender(); return; }
    const now = Date.now();
    setPractice(current => {
      const next = resignMole(current.round, 'host');
      return next ? { ...current, round: next, finishedAt: now } : current;
    });
  }

  const labels = useMemo(() => ({
    score: t('moleScore'), time: t('moleClock'), combo: t('moleCombo'), fever: t('moleFever'),
    giant: t('moleGiant'), fog: t('moleFog'), decoys: t('moleDecoys'),
  }), [t]);
  const outcome = room ? moleOutcome(round, role) : 'practice';
  const { pending: resultPending, ending } = useRoundEnd(id, !finishedAt ? undefined
    : outcome === 'win' ? 'victory' : outcome === 'loss' ? 'defeat' : 'finished');
  const startedAt = room?.playStartedAt ?? round.start;
  const report = useMemo<MatchReport | undefined>(() => finishedAt && outcome ? {
    id, game: 'mole', mode: room ? 'online' : 'practice', outcome, seconds: elapsedPlaySeconds(startedAt, finishedAt),
  } : undefined, [id, Boolean(room), outcome, finishedAt, startedAt]);
  const status = finishedAt ? t(room && outcome ? 'outcome_' + outcome : board.resigned ? 'gameFinished' : 'moleExpired')
    : !roundStart.started ? t('roundWaiting') : board.out ? t('moleWaiting') : t('mole_' + round.settings.mode);
  const players = round.players.map((player, index) => {
    const participant = room?.participants.find(person => person.role === player);
    const profile = (player === role ? ownProfile : undefined) ?? participant?.profile;
    const name = profile?.name ?? t(participant?.mock ? 'mockSeat' : player === role ? 'me' : player === 'host' ? 'host' : 'anonymousSeat', { number: index + 1 });
    return { player, profile, name, data: round.boards[player]!, result: room && moleOutcome(round, player) };
  });
  const rivals = players.filter(player => player.player !== role).map(({ name, data }) => {
    const letters = Array.from(name);
    return { name: letters.length > 7 ? letters.slice(0, 7).join('') + '…' : name, score: data.score, out: data.out };
  });
  const stats = <section className="sichuan-score" aria-label={t('sichuanPlayerStats')}>
    {players.map(({ player, profile, name, data, result }) => <div key={player}>
        <strong>{room && <RoomPlayerAvatar appearance={profile} size={22} path={room.connectionPaths[player]} />}{name}
          {result && <small>{t('outcome_' + result)}</small>}</strong>
        <span>{labels.score} <b>{data.score}</b></span>
        <span>{t('moleBest')} <b>{data.best}</b></span>
        <span>{t('moleCaught')} <b>{data.caught}</b></span>
      </div>)}
  </section>;
  const resultVisible = Boolean(report && !resultPending && closedResult !== id);
  const result = report && <GameResult key={id} report={report} winner={outcome === 'draw' ? 'draw' : 1} title={status}
    details={stats} visible={resultVisible} onClose={() => setClosedResult(id)} record={room ? record : undefined}
    room={room && { canRematch: room.role === 'host' && room.canStart, returnToLobby: room.returnToLobby,
      reconnect: room.needsReconnect ? room.reconnect : undefined,
      request: room.role !== 'host' && room.state === 'connected' ? room.requestRematch : undefined, notice: room.rematchNotice }}
    rematch={() => { setCursor(null); if (room) room.rematch(); else setPractice(newPractice(settings)); }}
    back={room ? '/room' : '/games'} navigate={navigate} />;
  const size = round.settings.size;
  return <div className="site-width subpage play-page mole-page">
    <BackLink fallback={room ? '/room' : gamePath('mole', 'setup')} fallbackLabel={room ? 'goToRoom' : 'settings'} navigate={navigate} />
    <div className="play-heading"><h1 tabIndex={-1}>{t('mole')}</h1></div>
    <div className="play-layout">
      <MatchStage id="mole" matchId={id} antialias={antialias} resolution={resolution} onResolution={onResolution} onAntialias={onAntialias}
        onReady={roundStart.ready} beginsAt={roundStart.beginsAt} ending={ending}
        stageContext={{ mode: t('mole_' + round.settings.mode), map: `${size} × ${size}` }}
        endAction={!finishedAt && !board.out && <EndRoundAction key={id} online={Boolean(room)} disabled={!canMove} end={end} />}
        info={<><strong>{status}</strong>{stats}</>} infoStatus={status} yourTurn={false}
        result={result} resultVisible={resultVisible} resultPending={resultPending} onShowResult={() => setClosedResult('')}
        showTouches={showTouches} onTouchDisplay={onTouchDisplay} remoteTouch={room?.remoteTouch} onTouch={room?.sendTouch}
        reactions={room?.reactions} ownProfile={ownProfile} touchStyle={touchStyle} setCursor={setCursor}
        view={{ history: [], cursor, chessTargets: new Map(), dark, force: 1, allowDoubleThree: true, canMove,
          deadline: 0, finished: Boolean(finishedAt), onAlkkagi: () => {},
          move: cell => {
            if (canMove && board.giantUntil > Date.now() - clockOffset) hit(0);
            else {
              const target = board.targets.find(target => target.cell === cell);
              if (target) hit(target.id);
            }
          },
          mole: { id, size, board, labels, hit, active: canMove, clockOffset, start: round.start, rivals,
            limit: round.settings.mode === 'endless' ? 60 : round.settings.seconds } }} />
    </div>
  </div>;
}
