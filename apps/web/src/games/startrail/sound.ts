import effectsUrl from '../../assets/startrail/audio/outpost-effects.mp3';
import cueTimes from '../../assets/startrail/audio/outpost-cues.json';
import beneathIce from '../../assets/startrail/audio/beneath-the-ice.mp3';
import unansweredBeacons from '../../assets/startrail/audio/unanswered-beacons.mp3';
import frozenWindow from '../../assets/startrail/audio/the-frozen-window.mp3';
import controlRoomTape from '../../assets/startrail/audio/tape-in-the-control-room.mp3';
import underTheFloor from '../../assets/startrail/audio/something-under-the-floor.mp3';
import { loadAudioLevels } from '../../platform/audio.ts';
import type { Point } from './outpost.ts';

type Cue = keyof typeof cueTimes;
const playlist = [beneathIce, unansweredBeacons, frozenWindow, controlRoomTape, underTheFloor];
const volume: Partial<Record<Cue, number>> = { eagle: .68, scout: .54, pulse: .63, casing: .40, hit: .57, warning: .50, bolt: .58 };
const reloadCues = ['reload0', 'reload1', 'reload2'] as const;

function preferenceMuted() {
  try { return localStorage.getItem('noriverse.muted') === 'on'; } catch { return false; }
}

export function createOutpostAudio() {
  let context: AudioContext | undefined, effectsGain: GainNode | undefined;
  let music: HTMLAudioElement | undefined, musicGain: GainNode | undefined, musicSource: MediaElementAudioSourceNode | undefined;
  let samples: AudioBuffer | undefined, loading: Promise<AudioBuffer | undefined> | undefined;
  let lastTrack: string | undefined, active = false, muted = preferenceMuted();
  let round = 0;
  const voices = new Set<AudioBufferSourceNode>();
  const levels = loadAudioLevels();

  function updateVolume() {
    if (effectsGain) effectsGain.gain.value = muted ? 0 : levels.effects / 100;
    if (musicGain) musicGain.gain.value = muted ? 0 : Math.min(1, levels.music / 65);
  }

  function stopTrack() {
    music?.pause();
    if (music) { music.removeAttribute('src'); music.load(); }
    musicSource?.disconnect(); musicGain?.disconnect();
    music = undefined; musicGain = undefined; musicSource = undefined;
  }

  function startTrack() {
    if (!context || !active || muted || !lastTrack) return;
    if (!music) {
      music = new Audio(lastTrack);
      music.loop = true;
      musicGain = context.createGain();
      musicSource = context.createMediaElementSource(music);
      musicSource.connect(musicGain).connect(context.destination);
      updateVolume();
    }
    if (music.paused) void music.play().catch(() => {});
  }

  function unlock() {
    if (!context) {
      context = new AudioContext();
      effectsGain = context.createGain();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 4;
      effectsGain.connect(limiter).connect(context.destination);
      updateVolume();
    }
    if (context.state !== 'running') void context.resume().catch(() => {});
    startTrack();
    if (!loading) {
      const audio = context;
      loading = fetch(effectsUrl).then(response => {
        if (!response.ok) throw new Error('Outpost effects unavailable');
        return response.arrayBuffer();
      }).then(data => audio.decodeAudioData(data)).then(buffer => { samples = buffer; return buffer; }).catch(() => {
        loading = undefined;
        return undefined;
      });
    }
  }

  function begin() {
    active = true; round++;
    const next = playlist.filter(url => url !== lastTrack);
    lastTrack = next[Math.floor(Math.random() * next.length)];
    startTrack();
  }

  function end() {
    active = false; round++;
    stopTrack();
    for (const voice of voices) voice.stop();
    voices.clear();
  }

  function play(cue: Cue, position?: Point, listener?: Point, strength = 1, pitch?: number) {
    const audio = context, bus = effectsGain;
    if (!audio || !bus || muted) return;
    const dx = position && listener ? position.x - listener.x : 0;
    const dy = position && listener ? position.y - listener.y : 0;
    const amplitude = (volume[cue] ?? .69) * strength * Math.max(0, 1 - Math.hypot(dx, dy) / 320);
    if (amplitude <= .01) return;
    const requestedRound = round, requestedAt = audio.currentTime;
    const start = (buffer?: AudioBuffer) => {
      if (!buffer || muted || round !== requestedRound || audio.state !== 'running' || audio.currentTime - requestedAt > .16) return;
      const voice = audio.createBufferSource();
      voice.buffer = buffer;
      voice.playbackRate.value = pitch ?? (.95 + Math.random() * .10);
      const gain = audio.createGain(), pan = audio.createStereoPanner();
      gain.gain.value = amplitude;
      pan.pan.value = Math.min(1, Math.max(-1, dx / 170));
      voice.connect(gain).connect(pan).connect(bus);
      voices.add(voice);
      voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); pan.disconnect(); };
      const [offset, duration] = cueTimes[cue];
      voice.start(0, offset, duration);
    };
    if (samples && audio.state === 'running') start(samples);
    else void loading?.then(start);
  }

  return {
    begin, end, unlock, play,
    isMuted: () => muted,
    setMuted(value: boolean) {
      muted = value;
      updateVolume();
      if (muted) stopTrack();
      else unlock();
    },
    reload(stage: number, heavy: boolean) {
      play(reloadCues[stage], undefined, undefined, .76, heavy ? .88 : 1);
    },
    dispose() { end(); void context?.close().catch(() => {}); },
  };
}
