import { useEffect, useRef, useState } from 'react';
import { roomCodePattern } from '../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../packages/protocol/rooms.ts';
import { nextStone, place, readHistory, result } from '../games/omok/rules.ts';
import { connectToRoom } from './room-connection.ts';
import type { ConnectionState } from './room-connection.ts';

type Match = { id: string; startedAt: number; finishedAt: number; allowDoubleThree: boolean; history: number[] };
const blankMatch: Match = { id: '', startedAt: 0, finishedAt: 0, allowDoubleThree: true, history: [] };
type Seat = { code: string; role: Role; token: string };

export function useRoomBoard() {
  const [code, setCode] = useState<string>();
  const [role, setRole] = useState<Role>();
  const [state, setState] = useState<ConnectionState>();
  const [round, setRound] = useState(blankMatch);
  const { id: matchId, startedAt, finishedAt, allowDoubleThree, history } = round;
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
    update({ ...match.current, history, finishedAt: result(history) ? Date.now() : 0 });
    snapshot();
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
          if (raw.type !== 'move' || !('id' in raw) || !('index' in raw) || !('revision' in raw)
            || !match.current.startedAt || raw.id !== match.current.id || raw.revision !== match.current.history.length
            || nextStone(match.current.history) !== 2) return;
          const next = place(match.current.history, raw.index, match.current.allowDoubleThree);
          if (next) commitMove(next);
        } else if (raw.type === 'snapshot' && 'id' in raw && typeof raw.id === 'string' && raw.id.length <= 64
          && 'history' in raw && 'startedAt' in raw && typeof raw.startedAt === 'number'
          && Number.isSafeInteger(raw.startedAt) && raw.startedAt >= 0
          && 'finishedAt' in raw && typeof raw.finishedAt === 'number'
          && Number.isSafeInteger(raw.finishedAt) && (raw.finishedAt === 0 || raw.finishedAt >= raw.startedAt)
          && 'allowDoubleThree' in raw && typeof raw.allowDoubleThree === 'boolean') {
          const next = readHistory(raw.history, raw.allowDoubleThree);
          if (next && (raw.id !== match.current.id || (next.length >= match.current.history.length
            && match.current.allowDoubleThree === raw.allowDoubleThree))) {
            update({ id: raw.id, startedAt: raw.startedAt, finishedAt: raw.finishedAt, allowDoubleThree: raw.allowDoubleThree, history: next });
          }
        }
      },
    });
  }

  async function create(allowRule = true) {
    const attempt = ++operation.current;
    setState('joining');
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      if (!response.ok) throw new Error();
      const room = await response.json() as { code: string; token: string };
      if (attempt !== operation.current) return;
      seat.current = { ...room, role: 'host' };
      setRole('host');
      update({ ...blankMatch, id: crypto.randomUUID(), allowDoubleThree: allowRule });
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
    if (!ready.current || !current.id || !current.startedAt) return;
    const next = place(current.history, index, current.allowDoubleThree);
    if (!next) return;
    if (seat.current?.role === 'host' && nextStone(current.history) === 1) {
      commitMove(next);
    } else if (seat.current?.role === 'guest' && nextStone(current.history) === 2) {
      link.current?.send({ type: 'move', id: current.id, index, revision: current.history.length });
    }
  }

  return {
    code, role, state, history, started, matchId, startedAt, finishedAt, allowDoubleThree, create, join, leave, move,
    canMove: state === 'connected' && started && !result(history)
      && nextStone(history) === (role === 'host' ? 1 : 2),
    reconnect() { if (code) connect(code, seat.current?.token); },
    start() {
      if (role !== 'host' || !ready.current || match.current.startedAt) return;
      update({ ...match.current, startedAt: Date.now() });
      snapshot();
    },
    rematch() {
      if (role !== 'host' || !ready.current || !match.current.startedAt) return;
      update({ ...match.current, id: crypto.randomUUID(), startedAt: Date.now(), finishedAt: 0, history: [] });
      snapshot();
    },
  };
}
