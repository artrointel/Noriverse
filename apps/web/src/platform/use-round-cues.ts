import { useEffect, useEffectEvent, useState } from 'react';
import { countdownDuration, resultDelay } from '../games/round-cues.ts';
import type { OutcomeCue } from '../games/round-cues.ts';

export function useRoundStart(id: string, online: { state?: string; roundReady: () => void } | undefined,
  sharedStart: number, onLocalStart: (at: number) => void) {
  const [readyId, setReadyId] = useState('');
  const [local, setLocal] = useState<{ id: string; at: number }>();
  const [opened, setOpened] = useState<{ id: string; at: number }>();
  const requestReady = useEffectEvent(() => online?.roundReady());
  const beginsAt = online || sharedStart ? sharedStart : local?.id === id ? local.at : 0;
  const connected = online?.state === 'connected';

  useEffect(() => {
    if (readyId !== id || !connected || beginsAt) return;
    requestReady();
    const retry = window.setInterval(requestReady, 750);
    return () => window.clearInterval(retry);
  }, [id, readyId, connected, beginsAt]);

  useEffect(() => {
    if (!beginsAt) return;
    const timer = window.setTimeout(() => setOpened({ id, at: beginsAt }), Math.max(0, beginsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [id, beginsAt]);

  return {
    beginsAt,
    started: opened?.id === id && opened.at === beginsAt,
    ready() {
      setReadyId(id);
      if (online || beginsAt) return;
      const at = Date.now() + countdownDuration;
      setLocal({ id, at });
      onLocalStart(at);
    },
  };
}

export function useRoundEnd(id: string, cue: OutcomeCue | undefined, leadIn = 0) {
  const [end, setEnd] = useState<{ id: string; at: number }>();
  const [released, setReleased] = useState('');
  useEffect(() => {
    if (!cue) return;
    setEnd({ id, at: Date.now() + leadIn });
    const timer = window.setTimeout(() => setReleased(id), leadIn + resultDelay);
    return () => window.clearTimeout(timer);
  }, [id, cue, leadIn]);
  return { pending: Boolean(cue && released !== id), ending: cue && end?.id === id ? { cue, at: end.at } : undefined };
}
