import { useEffect, useRef, useState } from 'react';
import { readTouch, roomCapacity, roomCodePattern, roomRoles } from '../../../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomGame, TouchPoint } from '../../../../packages/protocol/rooms.ts';
import { elapsedPlaySeconds, profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { ProfileSummary } from '../../../../packages/protocol/profile.ts';
import { assignReactionSlots, isEmoji, readRoomReaction, showReaction } from '../../../../packages/protocol/reactions.ts';
import type { Emoji, Reaction, TimedReaction } from '../../../../packages/protocol/reactions.ts';
import { boardRules, isBoardGame, isTurnBasedGame } from '../games/board-rules.ts';
import { advanceFlickRound, createFlickRound, defaultFlickSettings, flickPlayers, pieceOwner, readFlick, readLayout, settledStatus } from '../games/alkkagi/rules.ts';
import type { Flick, FlickPlayer, FlickRound, StonePosition } from '../games/alkkagi/rules.ts';
import { connectToRoom } from './room-connection.ts';
import type { ConnectionState } from './room-connection.ts';
import { forgetGuestSeat, readGuestRoom, readGuestSeat, rememberRecentRoom, saveGuestSeat, writeGuestRoom } from './guest-seat.ts';
import { apiFetch } from './api.ts';
import type { Stone } from '../games/table.ts';
import { oppositeStone, rematchPlayerColor } from '../games/table.ts';
import { nextDeadline, resolveTurnTimeout } from '../games/turn-clock.ts';
import type { TimeoutChoice } from '../games/turn-clock.ts';
import { defaultSichuanRoomSettings } from '../games/sichuan/options.ts';
import { applyPuzzleAction, makePuzzleRound, puzzleEnd, readyPuzzle, resignPuzzle } from '../games/sichuan/multiplayer.ts';
import type { PuzzleAction, PuzzleRound } from '../games/sichuan/multiplayer.ts';
import { defaultMatchSettings } from '../games/match-settings.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { mergeRoomHistory, readRoomResult, roomHistoryBatchSize } from './room-history.ts';
import type { RoomResult } from './room-history.ts';
import { blankMatch, inRound, lobbyMatch, matchBeginsAt, matchColor, matchInProgress, matchOutcome, matchTurn, matchWinner, readMatchSnapshot, roundSeats } from './room-match.ts';
import type { Match } from './room-match.ts';
import { countdownDuration } from '../games/round-cues.ts';
import { advanceSketch, applySketchAction, defaultSketchSettings, inkBatch, inkLimit, makeSketchRound, readInk, sketchDeck, visibleSketch } from '../games/sketch/rules.ts';
import type { SketchAction, SketchRound } from '../games/sketch/rules.ts';
import { advanceLiar, applyLiarAction, defaultLiarSettings, isLiarRound, makeLiarRound, visibleLiar } from '../games/liar/rules.ts';
import type { LiarAction, LiarRound } from '../games/liar/rules.ts';

type Seat = { code: string; role: Role; token: string };
const lobbySlots = assignReactionSlots(roomRoles);
const matchDeadline = (match: Match) => match.liar?.deadline ?? match.sketch?.deadline ?? (match.puzzle ? puzzleEnd(match.puzzle) : match.deadline);

export function useRoomBoard(profile?: ProfileSummary) {
  const [code, setCode] = useState<string>();
  const [role, setRole] = useState<Role>();
  const [state, setState] = useState<ConnectionState>();
  const [round, setRound] = useState(blankMatch);
  const [sketchFeedback, setSketchFeedback] = useState<{ id: string; turn: number; wrong: boolean }>();
  const [roomHistory, setRoomHistory] = useState<RoomResult[]>([]);
  const results = useRef<RoomResult[]>([]);
  const matchRoster = useRef<{ seats: Role[]; names: Map<Role, string>; reactionSlots: ReturnType<typeof assignReactionSlots<Role>> }>(undefined);
  const preparedSeats = useRef(new Set<Role>());
  const drawingDeck = useRef<string[]>([]);
  const previousMatch = useRef<Match>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const roster = useRef<Participant[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<Role[]>([]);
  const [assignedSeat, setAssignedSeat] = useState<Seat>();
  const [guestRoom, setGuestRoom] = useState(readGuestRoom);
  const [changingGame, setChangingGame] = useState(false);
  const [rematchNotice, setRematchNotice] = useState<{ id: string; kind: 'incoming' | 'sent' }>();
  const [remoteTouch, setRemoteTouch] = useState<TouchPoint & { matchId: string; receivedAt: number }>();
  const [reactions, setReactions] = useState<TimedReaction[]>([]);
  const [lobbyReactions, setLobbyReactions] = useState<TimedReaction[]>([]);
  const lastIncomingTouch = useRef(-Infinity);
  const lastOutgoingTouch = useRef(-Infinity);
  const { id: matchId, game, hostColor, startedAt, finishedAt, allowDoubleThree, overline, history, surrendered, timedOut, timeoutPending, turnLimit, deadline } = round;
  const playerColor = role && matchColor(round, role);
  const started = startedAt > 0;
  const seat = useRef<Seat | undefined>(undefined);
  const link = useRef<ReturnType<typeof connectToRoom> | undefined>(undefined);
  const match = useRef<Match>(blankMatch);
  const operation = useRef(0);
  const ready = useRef(false);
  const gameChange = useRef<Seat | undefined>(undefined);
  const ownProfile = useRef(profile);
  useEffect(() => { ownProfile.current = profile; }, [profile]);

  useEffect(() => () => {
    operation.current++;
    link.current?.close();
  }, []);

  useEffect(() => {
    if (!profile?.id || !assignedSeat) return;
    const { code, token } = assignedSeat;
    const request = new AbortController();
    let retry: number | undefined;
    async function identify(attempt: number) {
      const response = await apiFetch('/api/rooms/' + code + '/participants', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: token }), signal: request.signal,
      }).catch(() => undefined);
      if (!request.signal.aborted && attempt < 2 && (!response || response.status >= 500)) {
        retry = window.setTimeout(() => void identify(attempt + 1), 500 * (attempt + 1));
      }
    }
    void identify(0);
    return () => { request.abort(); window.clearTimeout(retry); };
  }, [assignedSeat, profile?.id, profile?.name, profile?.avatar, profile?.avatarBackground, profile?.level]);

  function rememberGuestRoom(code: string, game?: RoomGame) {
    writeGuestRoom(code, game);
    setGuestRoom(previous => game
      ? previous?.code === code && previous.game === game ? previous : { code, game }
      : previous?.code === code ? undefined : previous);
  }

  function update(next: Match) {
    const currentSeat = seat.current;
    const previous = match.current;
    if (next.id !== previous.id) setReactions([]);
    if (currentSeat && next.startedAt && (previous.id !== next.id || !previous.startedAt)) rememberRecentRoom(currentSeat.code, next.game);
    if (currentSeat && currentSeat.role !== 'host' && next.id && (previous.id !== next.id || previous.startedAt !== next.startedAt || previous.finishedAt !== next.finishedAt)) {
      rememberGuestRoom(currentSeat.code, next.startedAt && !next.finishedAt && inRound(next, currentSeat.role) ? next.game : undefined);
    }
    if (currentSeat?.role === 'host' && next.finishedAt && !previous.finishedAt && matchRoster.current) {
      const players = matchRoster.current.seats.flatMap(role => {
        const outcome = matchOutcome(next, role);
        return outcome ? [{ role, name: role === 'host' ? ownProfile.current?.name : matchRoster.current?.names.get(role), outcome }] : [];
      });
      if (players.length) {
        const entry: RoomResult = { id: next.id, game: next.game, endedAt: next.finishedAt,
          seconds: elapsedPlaySeconds(matchBeginsAt(next), next.finishedAt),
          players,
        };
        results.current = [...results.current, entry];
        setRoomHistory(previous => mergeRoomHistory(previous, [entry]));
        link.current?.send({ type: 'room-history-entry', entry });
      }
    }
    match.current = next;
    setRound(next);
  }

  function snapshot(target?: Role) {
    const current = match.current;
    const sentAt = Date.now();
    if (current.sketch || current.liar) {
      const sketch = current.sketch;
      const liar = current.liar;
      for (const peer of target ? [target] : link.current?.connectedPeers() ?? []) {
        link.current?.send({ type: 'snapshot', ...current, sketch: sketch && visibleSketch(sketch, peer),
          liar: liar && isLiarRound(liar) ? visibleLiar(liar, peer) : undefined, sentAt }, peer);
      }
    } else link.current?.send({ type: 'snapshot', ...current, sentAt }, target);
  }

  function displayReaction(reaction: Reaction, lobby: boolean) {
    const now = performance.now();
    (lobby ? setLobbyReactions : setReactions)(previous => showReaction(previous, reaction, now));
  }

  function broadcastReaction(role: Role, emoji: Emoji, lobby: boolean) {
    const current = match.current;
    if (!lobby && (!ready.current || !current.startedAt || !inRound(current, role))) return;
    const corner = (lobby ? lobbySlots : matchRoster.current?.reactionSlots)?.get(role);
    if (!corner) return;
    const profile = (role === 'host' ? ownProfile.current : undefined) ?? roster.current.find(person => person.role === role)?.profile;
    const reaction = { id: crypto.randomUUID(), role, emoji, corner, sender: profile && { name: profile.name, avatar: profile.avatar } };
    displayReaction(reaction, lobby);
    link.current?.send({ type: 'reaction', scope: lobby ? 'lobby' : undefined, matchId: lobby ? undefined : current.id, reaction });
  }

  function clearRoomHistory() {
    results.current = [];
    matchRoster.current = undefined;
    previousMatch.current = undefined;
    setRoomHistory([]);
    setLobbyReactions([]);
  }

  function resetRoom() {
    seat.current = undefined;
    ready.current = false;
    roster.current = [];
    gameChange.current = undefined;
    setChangingGame(false);
    setAssignedSeat(undefined);
    setParticipants([]);
    setConnectedPeers([]);
    setRole(undefined);
    clearRoomHistory();
    update(blankMatch);
  }

  function sendRoomHistory(peer: Role, offset: number) {
    const entries = results.current.slice(offset, offset + roomHistoryBatchSize);
    link.current?.send({ type: 'room-history', entries, next: offset + entries.length < results.current.length ? offset + entries.length : undefined }, peer);
  }

  function syncPuzzle(puzzle: PuzzleRound, finishedAt = 0) {
    update({ ...match.current, puzzle, finishedAt });
    snapshot();
  }

  function markPuzzleReady(actor: Role) {
    const current = match.current;
    const next = !current.finishedAt && current.puzzle && readyPuzzle(current.puzzle, actor, Date.now());
    if (next) syncPuzzle(next);
  }

  function markRoundReady(actor: Role) {
    const current = match.current;
    if (!current.startedAt || current.finishedAt || !inRound(current, actor)) return;
    if (current.puzzle) { markPuzzleReady(actor); return; }
    const seats = matchRoster.current?.seats;
    if (current.beginsAt !== 0 || !seats?.includes(actor)) return;
    preparedSeats.current.add(actor);
    if (!seats.every(player => preparedSeats.current.has(player))) return;
    const beginsAt = Date.now() + countdownDuration;
    const sketch = current.sketch && current.sketchConfig
      ? { ...current.sketch, deadline: beginsAt + current.sketchConfig.seconds * 1000 } : undefined;
    const liar = current.liar && current.liarConfig ? { ...current.liar, deadline: beginsAt + current.liarConfig.seconds * 1000 } : undefined;
    update({ ...current, beginsAt, deadline: nextDeadline(current.turnLimit, beginsAt), sketch, liar });
    snapshot();
  }

  function commitPuzzle(actor: Role, action: unknown) {
    const current = match.current;
    const now = Date.now();
    if (!current.puzzle || !current.puzzleConfig || current.finishedAt || expireTurn(now)) return;
    const next = applyPuzzleAction(current.puzzle, current.puzzleConfig.mode, actor, action, now);
    if (next) syncPuzzle(next, next.result ? now : 0);
  }

  function syncSketch(sketch: SketchRound, now: number) {
    update({ ...match.current, sketch, finishedAt: sketch.phase === 'done' ? now : 0 });
    snapshot();
  }

  function syncLiar(liar: LiarRound, now: number) {
    update({ ...match.current, liar, finishedAt: liar.result ? now : 0 });
    snapshot();
  }

  function commitLiar(actor: Role, action: unknown) {
    const current = match.current;
    const now = Date.now();
    if (!current.liar || !isLiarRound(current.liar) || !current.liarConfig || !matchInProgress(current, now) || expireTurn(now)) return false;
    const next = applyLiarAction(current.liar, actor, action, current.liarConfig, now);
    if (!next) return false;
    syncLiar(next, now);
    return true;
  }

  function commitSketch(actor: Role, action: unknown) {
    const current = match.current;
    const now = Date.now();
    if (!current.sketch || !matchInProgress(current, now)) return false;
    if (expireTurn(now)) return false;
    const sketch = applySketchAction(current.sketch, actor, action, now);
    if (!sketch) return false;
    if (sketch.board.length > current.sketch.board.length) {
      const lines = sketch.board.slice(current.sketch.board.length);
      update({ ...current, sketch });
      link.current?.send({ type: 'sketch-ink', id: current.id, turn: sketch.turn, revision: sketch.revision, lines });
    } else syncSketch(sketch, now);
    return true;
  }

  function commitMove(history: number[]) {
    const current = match.current;
    const now = Date.now();
    if (!matchInProgress(current, now) || current.timeoutPending || expireTurn(now)) return;
    const finishedAt = matchWinner({ ...current, history }) ? now : 0;
    update({ ...current, history, finishedAt, deadline: finishedAt ? 0 : nextDeadline(current.turnLimit, now) });
    snapshot();
  }

  function acceptFlick(raw: unknown, color: FlickPlayer, revision: unknown) {
    const current = match.current;
    const now = Date.now();
    if (!matchInProgress(current, now) || !current.physics || current.timeoutPending || current.physics.revision !== revision || matchTurn(current) !== color || expireTurn(now)) return;
    const shot = readFlick(raw, current.physics, current.power ?? 1);
    if (!shot) return;
    update({ ...current, physics: { ...current.physics, shot }, deadline: 0 });
    link.current?.send({ type: 'launch', id: current.id, revision, shot });
  }

  function syncFlick(physics: FlickRound, now: number, deadline?: number) {
    const finishedAt = settledStatus(physics).winner ? now : 0;
    update({ ...match.current, physics, finishedAt, deadline: finishedAt ? 0 : deadline ?? nextDeadline(match.current.turnLimit, now) });
    snapshot();
  }

  function settleFlick(layout: StonePosition[], revision: number) {
    const current = match.current;
    if (seat.current?.role !== 'host' || current.finishedAt || !current.physics?.shot || current.physics.revision !== revision) return;
    const safe = readLayout(layout, current.physics.settings, current.physics.players);
    if (!safe || safe.some((point, index) => point && !current.physics?.layout[index])) return;
    syncFlick(advanceFlickRound(current.physics, safe), Date.now());
  }

  function eliminateFlick(color: FlickPlayer, now: number) {
    const { physics, deadline } = match.current;
    if (!physics || physics.shot || !settledStatus(physics).remaining[color - 1]) return false;
    const layout = physics.layout.map((point, index) => pieceOwner(index, physics.players) === color ? null : point);
    syncFlick(advanceFlickRound(physics, layout, color), now, physics.turn !== color ? deadline : undefined);
    return true;
  }

  function expireTurn(now: number) {
    const current = match.current;
    if (current.liar && isLiarRound(current.liar) && current.liarConfig) {
      const next = advanceLiar(current.liar, current.liarConfig, now);
      if (!next) return false;
      syncLiar(next, now);
      return true;
    }
    if (current.sketch && current.sketchConfig) {
      const next = advanceSketch(current.sketch, current.sketchConfig, drawingDeck.current, now);
      if (!next) return false;
      syncSketch(next, now);
      return true;
    }
    if (current.puzzle) {
      const end = puzzleEnd(current.puzzle);
      if (!end || now < end || current.finishedAt) return false;
      syncPuzzle({ ...current.puzzle, result: 'timeout', event: undefined, revision: current.puzzle.revision + 1 }, end);
      return true;
    }
    if (!current.deadline || now < current.deadline || current.finishedAt) return false;
    const loser = matchTurn(current);
    if (loser === undefined) return false;
    if ((current.physics?.players ?? 2) > 2) return eliminateFlick(loser, now);
    if (loser !== 1 && loser !== 2) return false;
    update({ ...current, timeoutPending: { color: loser, at: current.deadline }, deadline: 0 });
    snapshot();
    return true;
  }

  function decideTimeout(choice: TimeoutChoice, at: unknown, actor: Stone) {
    const current = match.current;
    const pending = current.timeoutPending;
    if (!pending || pending.at !== at || current.finishedAt || actor === pending.color) return false;
    update({ ...current, ...resolveTurnTimeout(pending, choice, Date.now()) });
    snapshot();
    return true;
  }

  const activeDeadline = matchDeadline(round);
  useEffect(() => {
    if (role !== 'host' || !activeDeadline || finishedAt) return;
    const timer = window.setTimeout(() => {
      const current = match.current;
      if (current.id === matchId && matchDeadline(current) === activeDeadline) expireTurn(Date.now());
    }, Math.max(0, activeDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [role, matchId, activeDeadline, finishedAt]);

  function finishBySurrender(color: FlickPlayer, actor: Role) {
    const current = match.current;
    if (current.sketch) return commitSketch(actor, { kind: 'resign' });
    if (current.liar) return commitLiar(actor, { kind: 'resign' });
    const now = Date.now();
    if (!matchInProgress(current, now) || expireTurn(now)) return false;
    if ((current.physics?.players ?? 2) > 2) return eliminateFlick(color, now);
    if (current.puzzle && current.puzzleConfig) {
      const next = resignPuzzle(current.puzzle, current.puzzleConfig.mode, actor);
      if (!next) return false;
      syncPuzzle(next, next.result ? now : 0);
      return true;
    }
    if (color !== 1 && color !== 2) return false;
    update({ ...current, surrendered: color, finishedAt: now, deadline: 0, timeoutPending: undefined });
    snapshot();
    return true;
  }

  function connect(target: string, token?: string) {
    link.current?.close();
    ready.current = false;
    roster.current = [];
    setCode(target);
    setState('joining');
    setConnectedPeers([]);
    link.current = connectToRoom(target, token, {
      state(next) {
        if (next === 'closed' || next === 'missing') {
          forgetGuestSeat(target);
          rememberGuestRoom(target);
          clearRoomHistory();
        }
        ready.current = next === 'connected';
        setState(next);
      },
      seat(assignedRole, assignedToken) {
        if (assignedRole !== 'host') saveGuestSeat(target, assignedToken);
        seat.current = { code: target, role: assignedRole, token: assignedToken };
        setAssignedSeat(seat.current);
        setRole(assignedRole);
      },
      roster(people) {
        roster.current = people;
        setParticipants(people);
        for (const person of people) if (person.profile) matchRoster.current?.names.set(person.role, person.profile.name);
      },
      connections: setConnectedPeers,
      open(peer) {
        if (seat.current?.role === 'host') {
          if (!expireTurn(Date.now())) snapshot(peer);
          sendRoomHistory(peer, 0);
        }
      },
      receive(raw, peer) {
        if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
        if (raw.type === 'room-history-request' && seat.current?.role === 'host' && 'offset' in raw
          && typeof raw.offset === 'number' && Number.isSafeInteger(raw.offset) && raw.offset >= 0) {
          sendRoomHistory(peer, raw.offset);
          return;
        }
        if (peer === 'host' && raw.type === 'room-history-entry' && 'entry' in raw) {
          const entry = readRoomResult(raw.entry);
          if (entry) setRoomHistory(previous => mergeRoomHistory(previous, [entry]));
          return;
        }
        if (peer === 'host' && raw.type === 'room-history' && 'entries' in raw && Array.isArray(raw.entries)
          && raw.entries.length <= roomHistoryBatchSize) {
          const entries = raw.entries.map(readRoomResult).filter(entry => entry !== undefined);
          if (entries.length) setRoomHistory(previous => mergeRoomHistory(previous, entries));
          if ('next' in raw && typeof raw.next === 'number' && Number.isSafeInteger(raw.next) && raw.next > 0) {
            link.current?.send({ type: 'room-history-request', offset: raw.next });
          }
          return;
        }
        const current = match.current;
        if (raw.type === 'reaction-request' || raw.type === 'reaction') {
          const lobby = 'scope' in raw && raw.scope === 'lobby';
          const matches = 'matchId' in raw && raw.matchId === current.id && current.startedAt > 0 && inRound(current, peer);
          if (!lobby && !matches) return;
          if (raw.type === 'reaction-request' && seat.current?.role === 'host' && 'emoji' in raw && isEmoji(raw.emoji)) {
            broadcastReaction(peer, raw.emoji, lobby);
          } else if (raw.type === 'reaction' && peer === 'host' && 'reaction' in raw) {
            const event = readRoomReaction(raw.reaction);
            if (event) displayReaction(event, lobby);
          }
          return;
        }
        if (seat.current?.role === 'host' && current.startedAt && !inRound(current, peer)) return;
        if (raw.type === 'touch') {
          const now = performance.now();
          if (!current.startedAt || current.finishedAt || !('id' in raw) || raw.id !== current.id || !('point' in raw)
            || now - lastIncomingTouch.current < 60) return;
          const point = readTouch(raw.point);
          if (point) {
            lastIncomingTouch.current = now;
            setRemoteTouch({ ...point, matchId: current.id, receivedAt: now });
            if (seat.current?.role === 'host') for (const target of link.current?.connectedPeers() ?? []) {
              if (target !== peer && inRound(current, target)) link.current?.send({ type: 'touch', id: current.id, point }, target);
            }
          }
          return;
        }
        if (seat.current?.role === 'host') {
          if (raw.type === 'request-rematch' && 'id' in raw && raw.id === current.id && current.finishedAt) {
            setRematchNotice(previous => previous?.id === current.id ? previous : { id: current.id, kind: 'incoming' });
            return;
          }
          if (!('id' in raw) || raw.id !== current.id || !current.startedAt || current.finishedAt) return;
          if (raw.type === 'sketch-sync' && current.sketch) { snapshot(peer); return; }
          if (raw.type === 'round-ready' || raw.type === 'puzzle-ready') { markRoundReady(peer); return; }
          if (!matchInProgress(current, Date.now())) return;
          if (raw.type === 'puzzle-action' && 'action' in raw) { commitPuzzle(peer, raw.action); return; }
          if (raw.type === 'liar-action' && current.liar && 'phase' in raw && raw.phase === current.liar.phase && 'action' in raw) {
            commitLiar(peer, raw.action);
            return;
          }
          if (raw.type === 'sketch-action' && current.sketch && 'turn' in raw && raw.turn === current.sketch.turn && 'action' in raw) {
            const accepted = commitSketch(peer, raw.action);
            if (current.sketch && raw.action && typeof raw.action === 'object' && 'kind' in raw.action && raw.action.kind === 'guess') {
              link.current?.send({ type: 'sketch-guess-result', id: current.id, turn: current.sketch.turn, wrong: !accepted }, peer);
            }
            return;
          }
          const guestColor = matchColor(current, peer);
          if (!guestColor) return;
          if (raw.type === 'surrender') {
            finishBySurrender(guestColor, peer);
            return;
          }
          if (raw.type === 'timeout-choice' && 'choice' in raw && (raw.choice === 'claim' || raw.choice === 'extend') && 'at' in raw) {
            if (guestColor === 1 || guestColor === 2) decideTimeout(raw.choice, raw.at, guestColor);
            return;
          }
          if (raw.type === 'flick' && 'shot' in raw && 'revision' in raw) {
            acceptFlick(raw.shot, guestColor, raw.revision);
            return;
          }
          if (!isBoardGame(current.game) || raw.type !== 'move' || !('index' in raw) || !('revision' in raw)
            || raw.revision !== current.history.length || matchTurn(current) !== guestColor) return;
          const next = boardRules[current.game].place(current.history, raw.index, current.allowDoubleThree, current.overline);
          if (next) commitMove(next);
        } else if (peer === 'host' && raw.type === 'sketch-guess-result' && current.sketch && 'id' in raw && raw.id === current.id
          && 'turn' in raw && raw.turn === current.sketch.turn && 'wrong' in raw && typeof raw.wrong === 'boolean') {
          setSketchFeedback({ id: current.id, turn: current.sketch.turn, wrong: raw.wrong });
        } else if (peer === 'host' && raw.type === 'sketch-ink' && current.sketch && 'id' in raw && raw.id === current.id && 'turn' in raw
          && raw.turn === current.sketch.turn && 'revision' in raw && typeof raw.revision === 'number' && Number.isSafeInteger(raw.revision)
          && raw.revision > current.sketch.revision && 'lines' in raw) {
          const sketch = current.sketch;
          const lines = readInk(raw.lines, inkBatch);
          if (raw.revision === sketch.revision + 1 && sketch.phase === 'draw' && lines?.length && sketch.board.length + lines.length <= inkLimit) {
            update({ ...current, sketch: { ...sketch, revision: raw.revision, board: [...sketch.board, ...lines] } });
          } else link.current?.send({ type: 'sketch-sync', id: current.id });
        } else if (raw.type === 'launch') {
          if (!current.physics || current.physics.shot || current.timeoutPending || !current.startedAt || current.finishedAt || !('id' in raw) || current.id !== raw.id
            || !('revision' in raw) || current.physics.revision !== raw.revision || !('shot' in raw)) return;
          const shot = readFlick(raw.shot, current.physics, current.power ?? 1);
          if (shot) update({ ...current, physics: { ...current.physics, shot }, deadline: 0 });
        } else if (raw.type === 'snapshot') {
          const next = readMatchSnapshot(raw, current, Date.now());
          if (next) update(next);
        }
      },
    });
  }

  async function create(game: RoomGame, settings = defaultMatchSettings) {
    const attempt = ++operation.current;
    link.current?.close();
    link.current = undefined;
    resetRoom();
    setCode(undefined);
    setState('joining');
    try {
      const response = await apiFetch('/api/rooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }),
      });
      if (!response.ok) throw new Error();
      const room = await response.json() as { code: string; token: string };
      if (attempt !== operation.current) return false;
      if (!roomCodePattern.test(room.code) || !profileIdPattern.test(room.token)) throw new Error();
      seat.current = { ...room, role: 'host' };
      setRole('host');
      update(lobbyMatch(game, settings));
      connect(room.code, room.token);
      return true;
    } catch {
      if (attempt === operation.current) setState('failed');
      return false;
    }
  }

  function join(target: string) {
    if (!roomCodePattern.test(target)) return;
    operation.current++;
    resetRoom();
    connect(target, readGuestSeat(target));
  }

  function leave() {
    operation.current++;
    if (code && seat.current?.role !== 'host') rememberGuestRoom(code);
    const releaseSeat = !match.current.startedAt;
    if (releaseSeat && code) forgetGuestSeat(code);
    link.current?.close(releaseSeat);
    link.current = undefined;
    resetRoom();
    setCode(undefined);
    setState(undefined);
  }

  async function changeGame(game: RoomGame) {
    const host = seat.current;
    const attempt = operation.current;
    if (host?.role !== 'host' || gameChange.current === host || game === match.current.game
      || Math.max(participants.length, ready.current ? 2 : 1) > roomCapacity[game]) return false;
    gameChange.current = host;
    setChangingGame(true);
    try {
      const response = await apiFetch('/api/rooms/' + host.code + '/game', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: host.token, game }),
      });
      if (!response.ok || operation.current !== attempt || seat.current !== host) return false;
      const { allowDoubleThree, overline, power, turnLimit } = match.current;
      previousMatch.current = undefined;
      update(lobbyMatch(game, { ...defaultMatchSettings, allowDoubleThree, overline, power: power ?? 1, turnLimit }));
      snapshot();
      return true;
    } catch { return false; }
    finally {
      if (gameChange.current === host) gameChange.current = undefined;
      if (operation.current === attempt) setChangingGame(false);
    }
  }

  function move(index: number) {
    const current = match.current;
    if (!ready.current || !current.id || !matchInProgress(current, Date.now()) || current.timeoutPending || !isBoardGame(current.game)) return;
    const rules = boardRules[current.game];
    const turn = rules.turn(current.history);
    const next = rules.place(current.history, index, current.allowDoubleThree, current.overline);
    if (!next) return;
    if (seat.current?.role === 'host' && turn === current.hostColor) {
      commitMove(next);
    } else if (seat.current && turn === oppositeStone(current.hostColor)) {
      link.current?.send({ type: 'move', id: current.id, index, revision: current.history.length });
    }
  }

  function flick(shot: Flick) {
    const current = match.current;
    if (!ready.current || !current.physics || !matchInProgress(current, Date.now()) || current.timeoutPending) return;
    const own = seat.current?.role;
    const color = own && matchColor(current, own);
    if (!color || matchTurn(current) !== color) return;
    if (own === 'host') acceptFlick(shot, color, current.physics.revision);
    else {
      link.current?.send({ type: 'flick', id: current.id, revision: current.physics.revision, shot });
    }
  }

  function sendReaction(emoji: Emoji, lobby: boolean) {
    const current = match.current;
    const own = seat.current?.role;
    if (!own || !isEmoji(emoji) || (!ready.current && (!lobby || own !== 'host'))) return;
    if (!lobby && (!current.startedAt || !inRound(current, own))) return;
    if (own === 'host') broadcastReaction(own, emoji, lobby);
    else link.current?.send({ type: 'reaction-request', scope: lobby ? 'lobby' : undefined, matchId: lobby ? undefined : current.id, emoji });
  }

  function startRound(rematch: boolean) {
    const current = match.current;
    const seats = roundSeats(current.game, link.current?.connectedPeers() ?? [], roster.current);
    if (seat.current?.role !== 'host' || !seats || gameChange.current || (rematch ? !current.finishedAt : current.startedAt)) return false;
    const previous = rematch ? current : previousMatch.current;
    const winner = previous && matchWinner(previous);
    const endColor = previous?.surrendered ?? previous?.timedOut ?? previous?.physics?.eliminated?.[0];
    let hostColor = current.hostColor;
    let physicsSeats: Role[] | undefined;
    if (current.physics) {
      const previousSeats: Role[] = previous?.physicsSeats ?? (previous?.hostColor === 2 ? ['guest', 'host'] : ['host', 'guest']);
      physicsSeats = previous ? [...previousSeats.filter(player => seats.includes(player)), ...seats.filter(player => !previousSeats.includes(player))] : seats;
      const first = previous && winner !== 'draw' && endColor ? previousSeats[endColor - 1] : undefined;
      const index = first ? physicsSeats.indexOf(first) : -1;
      if (index > 0) physicsSeats = [...physicsSeats.slice(index), ...physicsSeats.slice(0, index)];
      hostColor = physicsSeats.length === 2 && physicsSeats[0] !== 'host' ? 2 : 1;
    } else if (previous && isTurnBasedGame(current.game)) {
      hostColor = rematchPlayerColor(previous.hostColor, winner === 3 || winner === 4 ? undefined : winner, previous.surrendered ?? previous.timedOut);
    }
    const now = Date.now();
    preparedSeats.current.clear();
    drawingDeck.current = current.sketchConfig ? sketchDeck(current.sketchConfig.language) : [];
    matchRoster.current = { seats, reactionSlots: assignReactionSlots(seats),
      names: new Map(participants.flatMap(person => person.profile ? [[person.role, person.profile.name]] : [])) };
    previousMatch.current = undefined;
    update({ ...current, id: rematch ? crypto.randomUUID() : current.id, hostColor, startedAt: now, finishedAt: 0,
      history: [], surrendered: undefined, timedOut: undefined, timeoutPending: undefined, deadline: 0, beginsAt: current.puzzleConfig ? undefined : 0,
      puzzle: current.puzzleConfig ? makePuzzleRound(current.puzzleConfig, Math.random, seats) : undefined,
      sketch: current.sketchConfig ? makeSketchRound(seats, drawingDeck.current[0]) : undefined,
      liar: current.liarConfig ? makeLiarRound(seats, current.liarConfig.language, Math.random, previous?.liar?.result?.word) : undefined,
      physicsSeats, physics: physicsSeats ? createFlickRound(current.flickSettings ?? defaultFlickSettings, physicsSeats.length) : undefined });
    snapshot();
    return true;
  }

  return {
    code, role, state, game, hostColor, playerColor, history, roomHistory, started, matchId, startedAt, finishedAt, surrendered, timedOut, timeoutPending, turnLimit,
    active: Boolean(code) && state !== 'closed' && state !== 'missing' && state !== 'full',
    needsReconnect: state === 'failed' || state === 'disconnected',
    inMatch: Boolean(role && inRound(round, role)),
    canStart: Boolean(roundSeats(game, connectedPeers, participants)),
    settings: { allowDoubleThree, overline, power: round.power ?? 1, turnLimit, flick: round.flickSettings ?? defaultFlickSettings,
      puzzle: round.puzzleConfig ?? defaultSichuanRoomSettings, sketch: round.sketchConfig ?? defaultSketchSettings,
      liar: round.liarConfig ?? defaultLiarSettings } satisfies MatchSettings,
    physicsSeats: round.physicsSeats,
    colorFor: (player: Role) => matchColor(round, player),
    guestRoom, changeGame, changingGame, rematchNotice: rematchNotice?.id === matchId ? rematchNotice.kind : undefined,
    displayDeadline: deadline ? deadline + (round.clockOffset ?? 0) : 0,
    playStartedAt: matchBeginsAt(round),
    displayStart: matchBeginsAt(round) ? matchBeginsAt(round) + (round.clockOffset ?? 0) : 0,
    roundOutcome: role ? matchOutcome(round, role) : undefined,
    liar: round.liar && isLiarRound(round.liar) ? visibleLiar(round.liar, role ?? 'host') : round.liar,
    liarDisplayDeadline: round.liar?.deadline ? round.liar.deadline + (round.clockOffset ?? 0) : 0,
    liarAction(action: LiarAction) {
      const current = match.current, own = seat.current?.role;
      if (!own || !ready.current || !current.liar || current.finishedAt) return false;
      if (own === 'host') return commitLiar(own, action);
      return Boolean(link.current?.send({ type: 'liar-action', id: current.id, phase: current.liar.phase, action }));
    },
    puzzle: round.puzzle, puzzleConfig: round.puzzleConfig,
    sketch: round.sketch, sketchConfig: round.sketchConfig,
    sketchWrongGuess: sketchFeedback?.id === matchId && sketchFeedback.turn === round.sketch?.turn && sketchFeedback.wrong,
    sketchDisplayDeadline: round.sketch?.deadline ? round.sketch.deadline + (round.clockOffset ?? 0) : 0,
    sketchAction(action: SketchAction) {
      const current = match.current, own = seat.current?.role;
      if (!own || !ready.current || !current.sketch || current.finishedAt) return false;
      if (own === 'host') return commitSketch(own, action);
      return Boolean(link.current?.send({ type: 'sketch-action', id: current.id, turn: current.sketch.turn, action }));
    },
    puzzleDisplayStart: round.puzzle?.beginsAt ? round.puzzle.beginsAt + (round.clockOffset ?? 0) : 0,
    configureMatch(settings: MatchSettings) {
      const current = match.current;
      if (seat.current?.role !== 'host' || gameChange.current || (current.startedAt && !current.finishedAt)) return false;
      if (current.finishedAt) previousMatch.current = current;
      update(lobbyMatch(current.game, settings));
      snapshot();
      return true;
    },
    roundReady() {
      const current = match.current, own = seat.current?.role;
      if (!own || !current.startedAt || matchBeginsAt(current) || !ready.current || current.finishedAt) return;
      if (own === 'host') markRoundReady('host');
      else link.current?.send({ type: 'round-ready', id: current.id });
    },
    puzzleAction(action: PuzzleAction) {
      const current = match.current, own = seat.current?.role;
      if (!own || !ready.current || !current.puzzle || current.finishedAt) return;
      if (own === 'host') commitPuzzle(own, action);
      else link.current?.send({ type: 'puzzle-action', id: current.id, action });
    },
    allowDoubleThree, overline, participants, create, join, leave, move, physics: round.physics, power: round.power ?? 1, flick, settleFlick,
    winner: matchWinner(round), turn: matchTurn(round),
    reactions: {
      events: reactions,
      enabled: state === 'connected' && Boolean(started && role && inRound(round, role)),
      send: (emoji: Emoji) => sendReaction(emoji, false),
    },
    lobbyReactions: {
      events: lobbyReactions,
      enabled: role === 'host' || state === 'connected',
      send: (emoji: Emoji) => sendReaction(emoji, true),
    },
    remoteTouch: remoteTouch?.matchId === matchId && performance.now() - remoteTouch.receivedAt < 500 ? remoteTouch : undefined,
    sendTouch(point: TouchPoint) {
      const now = performance.now();
      if (!match.current.startedAt || match.current.finishedAt || !ready.current || now - lastOutgoingTouch.current < 90) return;
      lastOutgoingTouch.current = now;
      link.current?.send({ type: 'touch', id: match.current.id, point });
    },
    async invite(friend: string) {
      const current = seat.current;
      if (current?.role !== 'host') return false;
      try {
        const response = await apiFetch('/api/rooms/' + current.code + '/invites', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: current.token, friend }),
        });
        return response.ok;
      } catch { return false; }
    },
    canMove: state === 'connected' && started && !finishedAt && !timeoutPending && playerColor !== undefined
      && matchTurn(round) === playerColor,
    reconnect() {
      if (!code) return;
      if (seat.current?.role === 'host' && link.current?.repair()) return;
      connect(code, seat.current?.token ?? readGuestSeat(code));
    },
    chooseTimeout(choice: TimeoutChoice) {
      const current = match.current;
      const pending = current.timeoutPending;
      if (!pending || !playerColor || playerColor === pending.color) return false;
      return role === 'host' ? decideTimeout(choice, pending.at, current.hostColor)
        : ready.current && Boolean(link.current?.send({ type: 'timeout-choice', id: current.id, at: pending.at, choice }));
    },
    start() { return startRound(false); },
    rematch() { startRound(true); },
    requestRematch() {
      const current = match.current;
      if (!seat.current || seat.current.role === 'host' || !inRound(current, seat.current.role) || !ready.current || !current.finishedAt || rematchNotice?.id === current.id) return;
      if (link.current?.send({ type: 'request-rematch', id: current.id })) setRematchNotice({ id: current.id, kind: 'sent' });
    },
    surrender() {
      if (!ready.current || !matchInProgress(match.current, Date.now())) return false;
      if (!role || !inRound(match.current, role)) return false;
      return role === 'host' ? finishBySurrender(matchColor(match.current, role)!, role)
        : Boolean(link.current?.send({ type: 'surrender', id: match.current.id }));
    },
  };
}
