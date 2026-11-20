import { useEffect, useRef, useState } from 'react';
import { roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import { boardRules, isBoardGame } from '../games/board-rules.ts';
import type { BoardGame } from '../games/board-rules.ts';
import { connectToRoom } from './room-connection.ts';
import type { ConnectionState } from './room-connection.ts';
import { apiFetch } from './api.ts';
import type { Stone } from '../games/table.ts';

type Match = { id: string; game: BoardGame; startedAt: number; finishedAt: number; allowDoubleThree: boolean; history: number[]; surrendered?: Stone };
const blankMatch: Match = { id: '', game: 'omok', startedAt: 0, finishedAt: 0, allowDoubleThree: true, history: [] };
type Seat = { code: string; role: Role; token: string };

export function useRoomBoard() {
  const [code, setCode] = useState<string>();
  const [role, setRole] = useState<Role>();
  const [state, setState] = useState<ConnectionState>();
  const [round, setRound] = useState(blankMatch);
  const { id: matchId, game, startedAt, finishedAt, allowDoubleThree, history, surrendered } = round;
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

  function update(next: Match) {
    match.current = next;
    setRound(next);
  }

  function snapshot() {
    link.current?.send({ type: 'snapshot', ...match.current });
  }

  function commitMove(history: number[]) {
    update({ ...match.current, history, finishedAt: boardRules[match.current.game].result(history) ? Date.now() : 0 });
    snapshot();
  }

  function finishBySurrender(color: Stone) {
    const current = match.current;
    if (!current.startedAt || current.finishedAt) return false;
    update({ ...current, surrendered: color, finishedAt: Date.now() });
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
        ready.current = next === 'connected';
        setState(next);
      },
      seat(assignedRole, assignedToken) {
        seat.current = { code: target, role: assignedRole, token: assignedToken };
        setRole(assignedRole);
      },
      open() {
        if (seat.current?.role === 'host') snapshot();
      },
      receive(raw) {
        if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
        if (seat.current?.role === 'host') {
          if (!('id' in raw) || raw.id !== match.current.id || !match.current.startedAt || match.current.finishedAt) return;
          if (raw.type === 'surrender') {
            finishBySurrender(2);
            return;
          }
          if (raw.type !== 'move' || !('index' in raw) || !('revision' in raw)
            || raw.revision !== match.current.history.length
            || boardRules[match.current.game].turn(match.current.history) !== 2) return;
          const next = boardRules[match.current.game].place(match.current.history, raw.index, match.current.allowDoubleThree);
          if (next) commitMove(next);
        } else if (raw.type === 'snapshot' && 'id' in raw && typeof raw.id === 'string' && raw.id.length <= 64
          && 'history' in raw && 'startedAt' in raw && typeof raw.startedAt === 'number'
          && Number.isSafeInteger(raw.startedAt) && raw.startedAt >= 0
          && 'finishedAt' in raw && typeof raw.finishedAt === 'number'
          && Number.isSafeInteger(raw.finishedAt) && (raw.finishedAt === 0 || raw.finishedAt >= raw.startedAt)
          && 'allowDoubleThree' in raw && typeof raw.allowDoubleThree === 'boolean') {
          const game = 'game' in raw ? raw.game : 'omok';
          if (!isBoardGame(game)) return;
          const endedBySurrender = 'surrendered' in raw ? raw.surrendered : undefined;
          if (endedBySurrender !== undefined && (endedBySurrender !== 1 && endedBySurrender !== 2 || raw.finishedAt === 0)) return;
          const next = boardRules[game].readHistory(raw.history, raw.allowDoubleThree);
          if (next && (raw.id !== match.current.id || (next.length >= match.current.history.length
            && match.current.game === game && match.current.allowDoubleThree === raw.allowDoubleThree && raw.finishedAt >= match.current.finishedAt))) {
            update({ id: raw.id, game, startedAt: raw.startedAt, finishedAt: raw.finishedAt, allowDoubleThree: raw.allowDoubleThree,
              history: next, surrendered: endedBySurrender });
          }
        }
      },
    });
  }

  async function create(game: BoardGame, allowRule = true) {
    const attempt = ++operation.current;
    setState('joining');
    try {
      const response = await apiFetch('/api/rooms', { method: 'POST' });
      if (!response.ok) throw new Error();
      const room = await response.json() as { code: string; token: string };
      if (attempt !== operation.current) return;
      seat.current = { ...room, role: 'host' };
      setRole('host');
      update({ ...blankMatch, id: crypto.randomUUID(), game, allowDoubleThree: allowRule });
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
    update(blankMatch);
    connect(target);
  }

  function leave() {
    operation.current++;
    link.current?.close();
    link.current = undefined;
    seat.current = undefined;
    ready.current = false;
    update(blankMatch);
    setCode(undefined);
    setRole(undefined);
    setState(undefined);
  }

  function move(index: number) {
    const current = match.current;
    if (!ready.current || !current.id || !current.startedAt || current.finishedAt) return;
    const rules = boardRules[current.game];
    const turn = rules.turn(current.history);
    const next = rules.place(current.history, index, current.allowDoubleThree);
    if (!next) return;
    if (seat.current?.role === 'host' && turn === 1) {
      commitMove(next);
    } else if (seat.current?.role === 'guest' && turn === 2) {
      link.current?.send({ type: 'move', id: current.id, index, revision: current.history.length });
    }
  }

  return {
    code, role, state, game, history, started, matchId, startedAt, finishedAt, surrendered, allowDoubleThree, create, join, leave, move,
    canMove: state === 'connected' && started && !finishedAt
      && boardRules[game].turn(history) === (role === 'host' ? 1 : 2),
    reconnect() { if (code) connect(code, seat.current?.token); },
    start() {
      if (role !== 'host' || !ready.current || match.current.startedAt) return;
      update({ ...match.current, startedAt: Date.now() });
      snapshot();
    },
    rematch() {
      if (role !== 'host' || !ready.current || !match.current.finishedAt) return;
      update({ ...blankMatch, id: crypto.randomUUID(), game: match.current.game, startedAt: Date.now(), allowDoubleThree: match.current.allowDoubleThree });
      snapshot();
    },
    surrender() {
      if (!ready.current || !match.current.startedAt || match.current.finishedAt) return false;
      return role === 'host' ? finishBySurrender(1)
        : role === 'guest' && Boolean(link.current?.send({ type: 'surrender', id: match.current.id }));
    },
  };
}
