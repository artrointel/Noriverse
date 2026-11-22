import { useContext, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { elapsedPlaySeconds } from '../../../../packages/protocol/profile.ts';
import { secondsRemaining } from '../games/turn-clock.ts';
import { MatchRecoveryContext } from './match-recovery.tsx';

export function formatPlayTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, '0');
  return minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + tail : minutes + ':' + tail;
}

export function useElapsedPlayTime(startedAt: number, finishedAt = 0) {
  const pausedAt = useContext(MatchRecoveryContext)?.since;
  const [seconds, setSeconds] = useState(() => startedAt ? elapsedPlaySeconds(startedAt, finishedAt || Date.now()) : 0);
  useEffect(() => {
    if (!startedAt || finishedAt || pausedAt) {
      setSeconds(startedAt ? elapsedPlaySeconds(startedAt, finishedAt || pausedAt || 0) : 0);
      return;
    }
    let timeout: number;
    function update() {
      const now = Date.now();
      setSeconds(elapsedPlaySeconds(startedAt, now));
      const elapsed = Math.max(0, now - startedAt);
      timeout = window.setTimeout(update, 1000 - (elapsed % 1000));
    }
    update();
    return () => window.clearTimeout(timeout);
  }, [startedAt, finishedAt, pausedAt]);
  return seconds;
}

export function PlayTime({ startedAt }: { startedAt: number }) {
  const { t } = useTranslation();
  const seconds = useElapsedPlayTime(startedAt);
  return <p className="match-time"><span>{t('playTime')}</span><time dateTime={'PT' + seconds + 'S'}>{formatPlayTime(seconds)}</time></p>;
}

export function useCountdown(deadline: number, onSecond?: (seconds: number) => void) {
  const pausedAt = useContext(MatchRecoveryContext)?.since;
  const [seconds, setSeconds] = useState(() => secondsRemaining(deadline, Date.now()));
  const lastNotice = useRef<{ deadline: number; seconds: number }>(undefined);
  const notify = useEffectEvent((seconds: number) => onSecond?.(seconds));
  useEffect(() => {
    if (!deadline) {
      lastNotice.current = undefined;
      setSeconds(0);
      return;
    }
    if (pausedAt) {
      setSeconds(secondsRemaining(deadline, pausedAt));
      return;
    }
    let timeout: number | undefined;
    function update() {
      const now = Date.now();
      const left = secondsRemaining(deadline, now);
      setSeconds(left);
      if (lastNotice.current?.deadline !== deadline || lastNotice.current.seconds !== left) {
        lastNotice.current = { deadline, seconds: left };
        notify(left);
      }
      if (left > 0) {
        const nextBoundary = deadline - (left - 1) * 1000;
        timeout = window.setTimeout(update, nextBoundary - now);
      }
    }
    update();
    return () => window.clearTimeout(timeout);
  }, [deadline, pausedAt]);
  return seconds;
}
