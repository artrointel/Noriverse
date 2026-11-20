import { useEffect, useRef, useState } from 'react';
import { readTouch, roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { Participant, Role, TouchPoint } from '../../../../packages/protocol/rooms.ts';
import { isProfileGame } from '../../../../packages/protocol/profile.ts';
import type { ProfileGame, ProfileSummary } from '../../../../packages/protocol/profile.ts';
import { boardRules, isBoardGame, rematchFirstColor } from '../games/board-rules.ts';
import { defaultOmokOverline, isOmokOverline } from '../games/omok/rules.ts';
import type { OmokOverline } from '../games/omok/rules.ts';
import { initialFlickRound, readFlick, readFlickRound, readLayout, settledStatus } from '../games/alkkagi/rules.ts';
import type { Flick, FlickPower, FlickRound, StonePosition } from '../games/alkkagi/rules.ts';
import { connectToRoom } from './room-connection.ts';
import type { ConnectionState } from './room-connection.ts';
import { forgetGuestSeat, readGuestSeat, saveGuestSeat } from './guest-seat.ts';
import { apiFetch } from './api.ts';
import type { Stone } from '../games/table.ts';
import { oppositeStone } from '../games/table.ts';
import { isTurnLimit, nextDeadline, readPendingTimeout, resolveTurnTimeout } from '../games/turn-clock.ts';
import type { PendingTimeout, TimeoutChoice, TurnLimit } from '../games/turn-clock.ts';

type Match = { id: string; game: ProfileGame; hostColor: Stone; startedAt: number; finishedAt: number; allowDoubleThree: boolean; overline: OmokOverline;
  history: number[]; physics?: FlickRound; power?: FlickPower; surrendered?: Stone; timedOut?: Stone; timeoutPending?: PendingTimeout;
  turnLimit: TurnLimit; deadline: number; clockOffset?: number };
const blankMatch: Match = { id: '', game: 'omok', hostColor: 1, startedAt: 0, finishedAt: 0, allowDoubleThree: true,
  overline: defaultOmokOverline, history: [], turnLimit: 0, deadline: 0 };
type Seat = { code: string; role: Role; token: string };

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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [assignedSeat, setAssignedSeat] = useState<Seat>();
  const [remoteTouch, setRemoteTouch] = useState<TouchPoint & { matchId: string; receivedAt: number }>();
  const lastIncomingTouch = useRef(-Infinity);
  const lastOutgoingTouch = useRef(-Infinity);
  const { id: matchId, game, hostColor, startedAt, finishedAt, allowDoubleThree, overline, history, surrendered, timedOut, timeoutPending, turnLimit, deadline } = round;
  const playerColor = role === 'host' ? hostColor : role === 'guest' ? oppositeStone(hostColor) : undefined;
  const started = startedAt > 0;
  const seat = useRef<Seat | undefined>(undefined);
  const link = useRef<ReturnType<typeof connectToRoom> | undefined>(undefined);
  const match = useRef<Match>(blankMatch);
  const operation = useRef(0);
  const ready = useRef(false);

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

  function update(next: Match) {
    match.current = next;
    setRound(next);
  }

  function snapshot() {
    link.current?.send({ type: 'snapshot', ...match.current, sentAt: Date.now() });
  }

  function commitMove(history: number[]) {
    const current = match.current;
    const now = Date.now();
    if (current.timeoutPending || expireTurn(now)) return;
    const finishedAt = matchWinner({ ...current, history }) ? now : 0;
    update({ ...current, history, finishedAt, deadline: finishedAt ? 0 : nextDeadline(current.turnLimit, now) });
    snapshot();
  }

  function acceptFlick(raw: unknown, color: Stone, revision: unknown) {
    const current = match.current;
    if (!current.physics || current.timeoutPending || current.physics.revision !== revision || matchTurn(current) !== color || expireTurn(Date.now())) return;
    const shot = readFlick(raw, current.physics, current.power ?? 1);
    if (!shot) return;
    update({ ...current, physics: { ...current.physics, shot }, deadline: 0 });
    link.current?.send({ type: 'launch', id: current.id, revision, shot });
  }

  function settleFlick(layout: StonePosition[], revision: number) {
    const current = match.current;
    if (seat.current?.role !== 'host' || current.finishedAt || !current.physics?.shot || current.physics.revision !== revision) return;
    const safe = readLayout(layout);
    if (!safe || safe.some((point, index) => point && !current.physics?.layout[index])) return;
    const physics = { layout: safe, revision: revision + 1 };
    const now = Date.now();
    const finishedAt = settledStatus(physics).winner ? now : 0;
    update({ ...current, physics, finishedAt, deadline: finishedAt ? 0 : nextDeadline(current.turnLimit, now) });
    snapshot();
  }

  function expireTurn(now: number) {
    const current = match.current;
    if (!current.deadline || now < current.deadline || current.finishedAt) return false;
    const loser = matchTurn(current);
    if (loser === undefined) return false;
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

  useEffect(() => {
    if (role !== 'host' || !deadline) return;
    const timer = window.setTimeout(() => {
      if (match.current.id === matchId && match.current.deadline === deadline) expireTurn(Date.now());
    }, Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [role, matchId, deadline]);

  function finishBySurrender(color: Stone) {
    const current = match.current;
    const now = Date.now();
    if (!current.startedAt || current.finishedAt || expireTurn(now)) return false;
    update({ ...current, surrendered: color, finishedAt: now, deadline: 0, timeoutPending: undefined });
    snapshot();
    return true;
  }

  function connect(target: string, token?: string) {
    link.current?.close();
    ready.current = false;
    setCode(target);
    setState('joining');
    link.current = connectToRoom(target, token, {
      state(next) {
        if (next === 'closed' || next === 'missing') forgetGuestSeat(target);
        ready.current = next === 'connected';
        setState(next);
      },
      seat(assignedRole, assignedToken) {
        if (assignedRole === 'guest') saveGuestSeat(target, assignedToken);
        seat.current = { code: target, role: assignedRole, token: assignedToken };
        setAssignedSeat(seat.current);
        setRole(assignedRole);
      },
      roster: setParticipants,
      open() {
        if (seat.current?.role === 'host' && !expireTurn(Date.now())) snapshot();
      },
      receive(raw) {
        if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
        const current = match.current;
        if (raw.type === 'touch') {
          const now = performance.now();
          if (!current.startedAt || current.finishedAt || !('id' in raw) || raw.id !== current.id || !('point' in raw)
            || now - lastIncomingTouch.current < 60) return;
          const point = readTouch(raw.point);
          if (point) {
            lastIncomingTouch.current = now;
            setRemoteTouch({ ...point, matchId: current.id, receivedAt: now });
          }
          return;
        }
        if (seat.current?.role === 'host') {
          if (!('id' in raw) || raw.id !== current.id || !current.startedAt || current.finishedAt) return;
          const guestColor = oppositeStone(current.hostColor);
          if (raw.type === 'surrender') {
            finishBySurrender(guestColor);
            return;
          }
          if (raw.type === 'timeout-choice' && 'choice' in raw && (raw.choice === 'claim' || raw.choice === 'extend') && 'at' in raw) {
            decideTimeout(raw.choice, raw.at, guestColor);
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
          if (!isProfileGame(game)) return;
          const power = 'power' in raw ? raw.power : 1;
          if (power !== 1 && power !== 1.35) return;
          const physics = game === 'physics' && 'physics' in raw ? readFlickRound(raw.physics, power) : undefined;
          if (game === 'physics' && !physics) return;
          const nextHostColor = 'hostColor' in raw ? raw.hostColor : 1;
          if (nextHostColor !== 1 && (nextHostColor !== 2 || game !== 'omok')) return;
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
          const previousRevision = current.physics?.revision ?? current.history.length;
          const nextRevision = physics?.revision ?? next?.length ?? 0;
          if (next && (raw.id !== current.id || (nextRevision >= previousRevision
            && current.hostColor === nextHostColor && current.game === game
            && current.allowDoubleThree === raw.allowDoubleThree && current.overline === nextOverline && current.turnLimit === nextLimit
            && raw.finishedAt >= current.finishedAt
            && (nextRevision > previousRevision || !current.physics?.shot || physics?.shot || raw.finishedAt)))) {
            const clockOffset = 'sentAt' in raw && typeof raw.sentAt === 'number' && Number.isSafeInteger(raw.sentAt)
              ? Date.now() - raw.sentAt : 0;
            update({ id: raw.id, game, hostColor: nextHostColor, startedAt: raw.startedAt, finishedAt: raw.finishedAt, allowDoubleThree: raw.allowDoubleThree,
              overline: nextOverline, history: next, physics, power, surrendered: endedBySurrender, timedOut: timeoutColor, timeoutPending: pending,
              turnLimit: nextLimit, deadline: nextDeadlineAt, clockOffset });
          }
        }
      },
    });
  }

  async function create(game: ProfileGame, allowRule = true, limit: TurnLimit = 0, power: FlickPower = 1, overline: OmokOverline = defaultOmokOverline) {
    const attempt = ++operation.current;
    link.current?.close();
    link.current = undefined;
    seat.current = undefined;
    ready.current = false;
    setAssignedSeat(undefined);
    setParticipants([]);
    setCode(undefined);
    setRole(undefined);
    update(blankMatch);
    setState('joining');
    try {
      const response = await apiFetch('/api/rooms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }),
      });
      if (!response.ok) throw new Error();
      const room = await response.json() as { code: string; token: string };
      if (attempt !== operation.current) return;
      seat.current = { ...room, role: 'host' };
      setRole('host');
      update({ ...blankMatch, id: crypto.randomUUID(), game, allowDoubleThree: allowRule, overline, turnLimit: limit,
        physics: game === 'physics' ? initialFlickRound : undefined, power });
      connect(room.code, room.token);
    } catch {
      if (attempt === operation.current) setState('failed');
    }
  }

  function join(target: string) {
    if (!roomCodePattern.test(target)) return;
    operation.current++;
    setRole(undefined);
    seat.current = undefined;
    setAssignedSeat(undefined);
    setParticipants([]);
    update(blankMatch);
    connect(target, readGuestSeat(target));
  }

  function leave() {
    operation.current++;
    link.current?.close();
    link.current = undefined;
    seat.current = undefined;
    setAssignedSeat(undefined);
    setParticipants([]);
    ready.current = false;
    update(blankMatch);
    setCode(undefined);
    setRole(undefined);
    setState(undefined);
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
    } else if (seat.current?.role === 'guest' && turn === oppositeStone(current.hostColor)) {
      link.current?.send({ type: 'move', id: current.id, index, revision: current.history.length });
    }
  }

  function flick(shot: Flick) {
    const current = match.current;
    if (!ready.current || !current.physics || !current.startedAt || current.finishedAt || current.timeoutPending) return;
    if (seat.current?.role === 'host') acceptFlick(shot, current.hostColor, current.physics.revision);
    else if (seat.current?.role === 'guest' && matchTurn(current) === oppositeStone(current.hostColor)) {
      link.current?.send({ type: 'flick', id: current.id, revision: current.physics.revision, shot });
    }
  }

  return {
    code, role, state, game, hostColor, playerColor, history, started, matchId, startedAt, finishedAt, surrendered, timedOut, timeoutPending, turnLimit,
    displayDeadline: deadline ? deadline + (round.clockOffset ?? 0) : 0,
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
    start() {
      if (role !== 'host' || !ready.current || match.current.startedAt) return;
      const now = Date.now();
      update({ ...match.current, startedAt: now, deadline: nextDeadline(match.current.turnLimit, now) });
      snapshot();
    },
    rematch() {
      const current = match.current;
      if (role !== 'host' || !ready.current || !current.finishedAt) return;
      const nextHostColor = isBoardGame(current.game)
        ? rematchFirstColor(current.game, current.hostColor, current.history, current.surrendered ?? current.timedOut, current.overline) : current.hostColor;
      const now = Date.now();
      update({ ...blankMatch, id: crypto.randomUUID(), game: current.game, hostColor: nextHostColor, startedAt: now,
        allowDoubleThree: current.allowDoubleThree, overline: current.overline, turnLimit: current.turnLimit, deadline: nextDeadline(current.turnLimit, now),
        physics: current.physics ? initialFlickRound : undefined, power: current.power });
      snapshot();
    },
    surrender() {
      if (!ready.current || !match.current.startedAt || match.current.finishedAt) return false;
      return role === 'host' ? finishBySurrender(match.current.hostColor)
        : role === 'guest' && Boolean(link.current?.send({ type: 'surrender', id: match.current.id }));
    },
  };
}
