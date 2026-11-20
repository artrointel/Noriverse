import { useEffect, useRef, useState } from 'react';
import { isRoomGame, isRoomRole, readTouch, roomCapacity, roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { Participant, Role, RoomGame, TouchPoint } from '../../../../packages/protocol/rooms.ts';
import { elapsedPlaySeconds, profileIdPattern } from '../../../../packages/protocol/profile.ts';
import type { ProfileSummary } from '../../../../packages/protocol/profile.ts';
import { boardRules, isBoardGame, isTurnBasedGame } from '../games/board-rules.ts';
import { defaultOmokOverline, isOmokOverline } from '../games/omok/rules.ts';
import type { OmokOverline } from '../games/omok/rules.ts';
import { advanceFlickRound, createFlickRound, defaultFlickSettings, flickPlayers, pieceOwner, readFlick, readFlickRound, readFlickSettings, readLayout, settledStatus } from '../games/alkkagi/rules.ts';
import type { Flick, FlickPlayer, FlickPower, FlickRound, FlickSettings, StonePosition } from '../games/alkkagi/rules.ts';
import { connectToRoom } from './room-connection.ts';
import type { ConnectionState } from './room-connection.ts';
import { forgetGuestSeat, readGuestRoom, readGuestSeat, rememberRecentRoom, saveGuestSeat, writeGuestRoom } from './guest-seat.ts';
import { apiFetch } from './api.ts';
import type { Stone } from '../games/table.ts';
import { oppositeStone, rematchPlayerColor } from '../games/table.ts';
import { isTurnLimit, nextDeadline, readPendingTimeout, resolveTurnTimeout } from '../games/turn-clock.ts';
import type { PendingTimeout, TimeoutChoice, TurnLimit } from '../games/turn-clock.ts';
import { defaultSichuanRoomSettings, readSichuanRoomSettings } from '../games/sichuan/options.ts';
import type { SichuanRoomSettings } from '../games/sichuan/options.ts';
import { applyPuzzleAction, makePuzzleRound, puzzleEnd, puzzleOutcome, readPuzzleRound, readyPuzzle } from '../games/sichuan/multiplayer.ts';
import type { PuzzleAction, PuzzleRound } from '../games/sichuan/multiplayer.ts';
import { defaultMatchSettings } from '../games/match-settings.ts';
import type { MatchSettings } from '../games/match-settings.ts';
import { mergeRoomHistory, readRoomResult, roomHistoryBatchSize } from './room-history.ts';
import type { RoomResult } from './room-history.ts';

type Match = { id: string; game: RoomGame; hostColor: Stone; startedAt: number; finishedAt: number; allowDoubleThree: boolean; overline: OmokOverline;
  history: number[]; physics?: FlickRound; physicsSeats?: Role[]; flickSettings?: FlickSettings; power?: FlickPower;
  surrendered?: Stone; timedOut?: Stone; timeoutPending?: PendingTimeout;
  puzzleConfig?: SichuanRoomSettings; puzzle?: PuzzleRound;
  turnLimit: TurnLimit; deadline: number; clockOffset?: number };
const blankMatch: Match = { id: '', game: 'omok', hostColor: 1, startedAt: 0, finishedAt: 0, allowDoubleThree: true,
  overline: defaultOmokOverline, history: [], turnLimit: 0, deadline: 0 };
type Seat = { code: string; role: Role; token: string };

function lobbyMatch(game: RoomGame, settings: MatchSettings): Match {
  const { allowDoubleThree, overline, power, turnLimit, flick, puzzle } = settings;
  return { ...blankMatch, id: crypto.randomUUID(), game, allowDoubleThree, overline, power, turnLimit: game === 'sichuan' ? 0 : turnLimit,
    puzzleConfig: game === 'sichuan' ? puzzle : undefined, flickSettings: game === 'physics' ? flick : undefined,
    physics: game === 'physics' ? createFlickRound(flick) : undefined };
}

function matchColor(match: Match, role: Role): FlickPlayer | undefined {
  if (match.physicsSeats) return flickPlayers[match.physicsSeats.indexOf(role)];
  return role === 'host' ? match.hostColor : oppositeStone(match.hostColor);
}

function inRound(match: Match, role: Role) {
  return (!match.puzzle || match.puzzle.players.includes(role)) && (!match.physicsSeats || match.physicsSeats.includes(role));
}

function matchTurn(match: Match) {
  if (match.physics) {
    const status = settledStatus(match.physics);
    return status.phase === 'aim' ? status.turn : undefined;
  }
  return isBoardGame(match.game) ? boardRules[match.game].turn(match.history) : undefined;
}

function matchWinner(match: Match) {
  return match.physics ? settledStatus(match.physics).winner : isBoardGame(match.game) ? boardRules[match.game].result(match.history, match.overline) : undefined;
}

export function useRoomBoard(profile?: ProfileSummary) {
  const [code, setCode] = useState<string>();
  const [role, setRole] = useState<Role>();
  const [state, setState] = useState<ConnectionState>();
  const [round, setRound] = useState(blankMatch);
  const [roomHistory, setRoomHistory] = useState<RoomResult[]>([]);
  const results = useRef<RoomResult[]>([]);
  const matchRoster = useRef<{ seats: Role[]; names: Map<Role, string> }>(undefined);
  const previousMatch = useRef<Match>(undefined);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<Role[]>([]);
  const [assignedSeat, setAssignedSeat] = useState<Seat>();
  const [guestRoom, setGuestRoom] = useState(readGuestRoom);
  const [changingGame, setChangingGame] = useState(false);
  const [rematchNotice, setRematchNotice] = useState<{ id: string; kind: 'incoming' | 'sent' }>();
  const [remoteTouch, setRemoteTouch] = useState<TouchPoint & { matchId: string; receivedAt: number }>();
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
  const profileName = useRef(profile?.name);
  useEffect(() => { profileName.current = profile?.name; }, [profile?.name]);

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
  }, [assignedSeat, profile?.id, profile?.name, profile?.avatar, profile?.level]);

  function rememberGuestRoom(code: string, game?: RoomGame) {
    writeGuestRoom(code, game);
    setGuestRoom(previous => game
      ? previous?.code === code && previous.game === game ? previous : { code, game }
      : previous?.code === code ? undefined : previous);
  }

  function update(next: Match) {
    const currentSeat = seat.current;
    const previous = match.current;
    if (currentSeat && next.startedAt && (previous.id !== next.id || !previous.startedAt)) rememberRecentRoom(currentSeat.code, next.game);
    if (currentSeat && currentSeat.role !== 'host' && next.id && (previous.id !== next.id || previous.startedAt !== next.startedAt || previous.finishedAt !== next.finishedAt)) {
      rememberGuestRoom(currentSeat.code, next.startedAt && !next.finishedAt && inRound(next, currentSeat.role) ? next.game : undefined);
    }
    if (currentSeat?.role === 'host' && next.finishedAt && !previous.finishedAt && matchRoster.current) {
      const loser = next.surrendered ?? next.timedOut;
      const winner = loser ? oppositeStone(loser) : matchWinner(next);
      const puzzleResult = next.puzzle?.result;
      if (winner || puzzleResult) {
        const entry: RoomResult = { id: next.id, game: next.game, endedAt: next.finishedAt,
          seconds: elapsedPlaySeconds(next.puzzle?.beginsAt || next.startedAt, next.finishedAt),
          players: matchRoster.current.seats.map(role => ({ role, name: role === 'host' ? profileName.current : matchRoster.current?.names.get(role),
            outcome: puzzleResult ? puzzleOutcome(puzzleResult, role) : winner === 'draw' ? 'draw' : winner === matchColor(next, role) ? 'win' : 'loss' })),
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
    link.current?.send({ type: 'snapshot', ...match.current, sentAt: Date.now() }, target);
  }

  function clearRoomHistory() {
    results.current = [];
    matchRoster.current = undefined;
    previousMatch.current = undefined;
    setRoomHistory([]);
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

  function commitPuzzle(actor: Role, action: unknown) {
    const current = match.current;
    const now = Date.now();
    if (!current.puzzle || !current.puzzleConfig || current.finishedAt || expireTurn(now)) return;
    const next = applyPuzzleAction(current.puzzle, current.puzzleConfig.mode, actor, action, now);
    if (next) syncPuzzle(next, next.result ? now : 0);
  }

  function commitMove(history: number[]) {
    const current = match.current;
    const now = Date.now();
    if (current.timeoutPending || expireTurn(now)) return;
    const finishedAt = matchWinner({ ...current, history }) ? now : 0;
    update({ ...current, history, finishedAt, deadline: finishedAt ? 0 : nextDeadline(current.turnLimit, now) });
    snapshot();
  }

  function acceptFlick(raw: unknown, color: FlickPlayer, revision: unknown) {
    const current = match.current;
    if (!current.physics || current.timeoutPending || current.physics.revision !== revision || matchTurn(current) !== color || expireTurn(Date.now())) return;
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

  const activeDeadline = round.puzzle ? puzzleEnd(round.puzzle) : deadline;
  useEffect(() => {
    if (role !== 'host' || !activeDeadline || finishedAt) return;
    const timer = window.setTimeout(() => {
      const current = match.current;
      if (current.id === matchId && (current.puzzle ? puzzleEnd(current.puzzle) : current.deadline) === activeDeadline) expireTurn(Date.now());
    }, Math.max(0, activeDeadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [role, matchId, activeDeadline, finishedAt]);

  function finishBySurrender(color: FlickPlayer) {
    const current = match.current;
    const now = Date.now();
    if (!current.startedAt || current.finishedAt || expireTurn(now)) return false;
    if ((current.physics?.players ?? 2) > 2) return eliminateFlick(color, now);
    if (current.puzzle && current.puzzleConfig) {
      const winner = color === current.hostColor ? 'guest' : 'host';
      syncPuzzle({ ...current.puzzle, revision: current.puzzle.revision + 1, event: undefined,
        result: current.puzzleConfig.mode === 'coop' ? 'abandoned' : winner }, now);
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
          if (raw.type === 'puzzle-ready') { markPuzzleReady(peer); return; }
          if (raw.type === 'puzzle-action' && 'action' in raw) { commitPuzzle(peer, raw.action); return; }
          const guestColor = matchColor(current, peer);
          if (!guestColor) return;
          if (raw.type === 'surrender') {
            finishBySurrender(guestColor);
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
        } else if (raw.type === 'launch') {
          if (!current.physics || current.physics.shot || current.timeoutPending || !current.startedAt || current.finishedAt || !('id' in raw) || current.id !== raw.id
            || !('revision' in raw) || current.physics.revision !== raw.revision || !('shot' in raw)) return;
          const shot = readFlick(raw.shot, current.physics, current.power ?? 1);
          if (shot) update({ ...current, physics: { ...current.physics, shot }, deadline: 0 });
        } else if (raw.type === 'snapshot' && 'id' in raw && typeof raw.id === 'string' && raw.id.length <= 64
          && 'history' in raw && 'startedAt' in raw && typeof raw.startedAt === 'number'
          && Number.isSafeInteger(raw.startedAt) && raw.startedAt >= 0
          && 'finishedAt' in raw && typeof raw.finishedAt === 'number'
          && Number.isSafeInteger(raw.finishedAt) && (raw.finishedAt === 0 || raw.finishedAt >= raw.startedAt)
          && 'allowDoubleThree' in raw && typeof raw.allowDoubleThree === 'boolean') {
          const game = 'game' in raw ? raw.game : 'omok';
          if (!isRoomGame(game)) return;
          const puzzleConfig = game === 'sichuan' && 'puzzleConfig' in raw ? readSichuanRoomSettings(raw.puzzleConfig) : undefined;
          if (game === 'sichuan' && !puzzleConfig) return;
          const puzzle = puzzleConfig && 'puzzle' in raw ? readPuzzleRound(raw.puzzle, puzzleConfig) : undefined;
          if (puzzleConfig && (Boolean(raw.startedAt) !== Boolean(puzzle) || Boolean(raw.finishedAt) !== Boolean(puzzle?.result))) return;
          const power = 'power' in raw ? raw.power : 1;
          if (power !== 1 && power !== 1.35) return;
          const physics = game === 'physics' && 'physics' in raw ? readFlickRound(raw.physics, power) : undefined;
          if (game === 'physics' && !physics) return;
          const flickSettings = game === 'physics' && 'flickSettings' in raw ? readFlickSettings(raw.flickSettings) : physics?.settings;
          if (game === 'physics' && !flickSettings) return;
          const physicsSeats = 'physicsSeats' in raw ? raw.physicsSeats : undefined;
          if (physicsSeats !== undefined && (!physics || !Array.isArray(physicsSeats) || physicsSeats.length !== (physics.players ?? 2)
            || !physicsSeats.every(isRoomRole) || !physicsSeats.includes('host') || new Set(physicsSeats).size !== physicsSeats.length)) return;
          if (physics && (physics.players ?? 2) > 2 && !physicsSeats) return;
          const nextHostColor = 'hostColor' in raw ? raw.hostColor : 1;
          if (nextHostColor !== 1 && (nextHostColor !== 2 || !isTurnBasedGame(game))) return;
          const endedBySurrender = 'surrendered' in raw ? raw.surrendered : undefined;
          if (endedBySurrender !== undefined && (endedBySurrender !== 1 && endedBySurrender !== 2 || raw.finishedAt === 0)) return;
          const timeoutColor = 'timedOut' in raw ? raw.timedOut : undefined;
          if (timeoutColor !== undefined && (timeoutColor !== 1 && timeoutColor !== 2 || !raw.finishedAt || endedBySurrender)) return;
          const pending = 'timeoutPending' in raw ? readPendingTimeout(raw.timeoutPending, raw.startedAt) : undefined;
          if ('timeoutPending' in raw && raw.timeoutPending !== undefined && (!pending || raw.finishedAt || physics?.shot)) return;
          const nextLimit = 'turnLimit' in raw ? raw.turnLimit : 0;
          const nextDeadlineAt = 'deadline' in raw ? raw.deadline : 0;
          if (!isTurnLimit(nextLimit) || typeof nextDeadlineAt !== 'number' || !Number.isSafeInteger(nextDeadlineAt)
            || (nextLimit && raw.startedAt && !raw.finishedAt && !physics?.shot && !pending ? nextDeadlineAt < raw.startedAt + nextLimit * 1000 : nextDeadlineAt !== 0)) return;
          const nextOverline = 'overline' in raw ? raw.overline : 'freestyle';
          if (!isOmokOverline(nextOverline)) return;
          const next = isBoardGame(game) ? boardRules[game].readHistory(raw.history, raw.allowDoubleThree, nextOverline) : [];
          if (next && pending && (!nextLimit || pending.color !== matchTurn({ ...current, game, history: next, physics }))) return;
          const previousRevision = current.puzzle?.revision ?? current.physics?.revision ?? current.history.length;
          const nextRevision = puzzle?.revision ?? physics?.revision ?? next?.length ?? 0;
          if (next && (raw.id !== current.id || (nextRevision >= previousRevision
            && current.hostColor === nextHostColor && current.game === game
            && current.allowDoubleThree === raw.allowDoubleThree && current.overline === nextOverline && current.turnLimit === nextLimit
            && raw.finishedAt >= current.finishedAt
            && (nextRevision > previousRevision || !current.physics?.shot || physics?.shot || raw.finishedAt)))) {
            const measuredOffset = 'sentAt' in raw && typeof raw.sentAt === 'number' && Number.isSafeInteger(raw.sentAt)
              ? Date.now() - raw.sentAt : 0;
            const clockOffset = puzzle?.beginsAt && raw.id === current.id && puzzle.beginsAt === current.puzzle?.beginsAt
              ? current.clockOffset ?? measuredOffset : measuredOffset;
            update({ id: raw.id, game, hostColor: nextHostColor, startedAt: raw.startedAt, finishedAt: raw.finishedAt, allowDoubleThree: raw.allowDoubleThree,
              overline: nextOverline, history: next, physics, power, surrendered: endedBySurrender, timedOut: timeoutColor, timeoutPending: pending,
              turnLimit: nextLimit, deadline: nextDeadlineAt, clockOffset, puzzleConfig, puzzle, flickSettings, physicsSeats });
          }
        }
      },
    });
  }

  async function create(game: RoomGame, settings = defaultMatchSettings) {
    const attempt = ++operation.current;
    link.current?.close();
    link.current = undefined;
    seat.current = undefined;
    ready.current = false;
    setChangingGame(false);
    setAssignedSeat(undefined);
    setParticipants([]);
    setCode(undefined);
    setRole(undefined);
    clearRoomHistory();
    update(blankMatch);
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
    setChangingGame(false);
    setRole(undefined);
    seat.current = undefined;
    setAssignedSeat(undefined);
    setParticipants([]);
    clearRoomHistory();
    update(blankMatch);
    connect(target, readGuestSeat(target));
  }

  function leave() {
    operation.current++;
    if (code && seat.current?.role !== 'host') rememberGuestRoom(code);
    const releaseSeat = !match.current.startedAt;
    if (releaseSeat && code) forgetGuestSeat(code);
    setChangingGame(false);
    link.current?.close(releaseSeat);
    link.current = undefined;
    seat.current = undefined;
    setAssignedSeat(undefined);
    setParticipants([]);
    ready.current = false;
    clearRoomHistory();
    update(blankMatch);
    setCode(undefined);
    setRole(undefined);
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
    if (!ready.current || !current.id || !current.startedAt || current.finishedAt || current.timeoutPending || !isBoardGame(current.game)) return;
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
    if (!ready.current || !current.physics || !current.startedAt || current.finishedAt || current.timeoutPending) return;
    const own = seat.current?.role;
    const color = own && matchColor(current, own);
    if (!color || matchTurn(current) !== color) return;
    if (own === 'host') acceptFlick(shot, color, current.physics.revision);
    else {
      link.current?.send({ type: 'flick', id: current.id, revision: current.physics.revision, shot });
    }
  }

  function roundSeats(): Role[] | undefined {
    const peers = link.current?.connectedPeers() ?? [];
    if (!peers.length || peers.length + 1 > roomCapacity[match.current.game]
      || participants.some(person => person.role !== 'host' && !peers.includes(person.role))) return;
    return ['host', ...peers];
  }

  function startRound(rematch: boolean) {
    const current = match.current;
    const seats = roundSeats();
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
    matchRoster.current = { seats, names: new Map(participants.flatMap(person => person.profile ? [[person.role, person.profile.name]] : [])) };
    previousMatch.current = undefined;
    update({ ...current, id: rematch ? crypto.randomUUID() : current.id, hostColor, startedAt: now, finishedAt: 0,
      history: [], surrendered: undefined, timedOut: undefined, timeoutPending: undefined, deadline: nextDeadline(current.turnLimit, now),
      puzzle: current.puzzleConfig ? makePuzzleRound(current.puzzleConfig, Math.random, seats) : undefined,
      physicsSeats, physics: physicsSeats ? createFlickRound(current.flickSettings ?? defaultFlickSettings, physicsSeats.length) : undefined });
    snapshot();
    return true;
  }

  return {
    code, role, state, game, hostColor, playerColor, history, roomHistory, started, matchId, startedAt, finishedAt, surrendered, timedOut, timeoutPending, turnLimit,
    inMatch: Boolean(role && inRound(round, role)),
    canStart: Boolean(connectedPeers.length && participants.every(person => person.role === 'host' || connectedPeers.includes(person.role))),
    settings: { allowDoubleThree, overline, power: round.power ?? 1, turnLimit, flick: round.flickSettings ?? defaultFlickSettings,
      puzzle: round.puzzleConfig ?? defaultSichuanRoomSettings } satisfies MatchSettings,
    physicsSeats: round.physicsSeats,
    colorFor: (player: Role) => matchColor(round, player),
    guestRoom, changeGame, changingGame, rematchNotice: rematchNotice?.id === matchId ? rematchNotice.kind : undefined,
    displayDeadline: deadline ? deadline + (round.clockOffset ?? 0) : 0,
    puzzle: round.puzzle, puzzleConfig: round.puzzleConfig,
    puzzleDisplayStart: round.puzzle?.beginsAt ? round.puzzle.beginsAt + (round.clockOffset ?? 0) : 0,
    configureMatch(settings: MatchSettings) {
      const current = match.current;
      if (seat.current?.role !== 'host' || gameChange.current || (current.startedAt && !current.finishedAt)) return false;
      if (current.finishedAt) previousMatch.current = current;
      update(lobbyMatch(current.game, settings));
      snapshot();
      return true;
    },
    puzzleReady() {
      const current = match.current, own = seat.current?.role;
      if (!own || !current.puzzle || current.puzzle.ready[own] || !ready.current || current.finishedAt) return;
      if (own === 'host') markPuzzleReady('host');
      else link.current?.send({ type: 'puzzle-ready', id: current.id });
    },
    puzzleAction(action: PuzzleAction) {
      const current = match.current, own = seat.current?.role;
      if (!own || !ready.current || !current.puzzle || current.finishedAt) return;
      if (own === 'host') commitPuzzle(own, action);
      else link.current?.send({ type: 'puzzle-action', id: current.id, action });
    },
    allowDoubleThree, overline, participants, create, join, leave, move, physics: round.physics, power: round.power ?? 1, flick, settleFlick,
    winner: matchWinner(round), turn: matchTurn(round),
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
      if (seat.current?.role === 'host') link.current?.repair();
      else connect(code, seat.current?.token ?? readGuestSeat(code));
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
      if (!ready.current || !match.current.startedAt || match.current.finishedAt) return false;
      if (!role || !inRound(match.current, role)) return false;
      return role === 'host' ? finishBySurrender(matchColor(match.current, role)!)
        : Boolean(link.current?.send({ type: 'surrender', id: match.current.id }));
    },
  };
}
