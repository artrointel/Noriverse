import effectsUrl from '../../assets/startrail/audio/outpost-effects.mp3';
import cueTimes from '../../assets/startrail/audio/outpost-cues.json';
import beneathIce from '../../assets/startrail/audio/beneath-the-ice.mp3';
import unansweredBeacons from '../../assets/startrail/audio/unanswered-beacons.mp3';
import frozenWindow from '../../assets/startrail/audio/the-frozen-window.mp3';
import underTheFloor from '../../assets/startrail/audio/something-under-the-floor.mp3';
import { loadAudioLevels } from '../../platform/audio.ts';
import type { Point } from './outpost.ts';
import { supportSpecs } from './support.ts';
import type { Device } from './support.ts';

type Cue = keyof typeof cueTimes;
export const deviceVolume = .7;
const playlist = [beneathIce, unansweredBeacons, frozenWindow, underTheFloor];
const volume: Partial<Record<Cue, number>> = {
  eagle: .68, scout: .54, pulse: .63, ak: .50, shotgun: .70, casing: .40, hit: .57, warning: .50, bolt: .58,
};
const reloadCues = ['reload0', 'reload1', 'reload2'] as const;

function preferenceMuted() {
  try { return localStorage.getItem('noriverse.muted') === 'on'; } catch { return false; }
}

function synthesizeDeviceCue(audio: AudioContext, kind: Device, powered: boolean) {
  const rise = powered ? supportSpecs[kind].boot : .35;
  const duration = rise + (powered ? .16 : .035);
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const wave = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < wave.length; i++) {
    const t = i / audio.sampleRate;
    if (t < rise) {
      const progress = t / rise, spin = powered ? progress : 1 - progress;
      const frequency = (kind === 'turret' ? 79 : 118) + spin * (kind === 'turret' ? 90 : 188);
      phase += Math.PI * 2 * frequency / audio.sampleRate;
      const envelope = Math.sin(Math.PI * progress) ** .8;
      const shimmer = kind === 'drone' ? Math.sin(phase * 2.91) * .13 : Math.sin(phase * 3) * .17;
      wave[i] = (Math.sin(phase) * .40 + Math.sin(phase * 2) * .16 + shimmer) * envelope;
    } else if (powered) {
      const ready = t - rise, pitch = kind === 'turret' ? 675 : 770;
      const envelope = Math.min(1, ready / .013) * Math.max(0, 1 - ready / .16) ** 2;
      wave[i] = (Math.sin(ready * pitch * Math.PI * 2) * .40 + Math.sin(ready * pitch * Math.PI * 3) * .18) * envelope;
    }
  }
  return buffer;
}

export function createOutpostAudio() {
  let context: AudioContext | undefined, effectsGain: GainNode | undefined, masterGain: GainNode | undefined;
  let music: HTMLAudioElement | undefined, musicGain: GainNode | undefined, musicSource: MediaElementAudioSourceNode | undefined;
  let samples: AudioBuffer | undefined, loading: Promise<AudioBuffer | undefined> | undefined;
  let lastTrack: string | undefined, active = false, muted = preferenceMuted();
  let round = 0;
  const voices = new Set<AudioBufferSourceNode>();
  const devices = new Map<Device, { voice: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }>();
  const deviceCues = new Map<string, AudioBuffer>();
  const levels = loadAudioLevels();
  let master = 1;

  function updateVolume() {
    if (masterGain) masterGain.gain.value = muted ? 0 : master;
  }

  function stopTrack() {
    music?.pause();
    if (music) { music.removeAttribute('src'); music.load(); }
    musicSource?.disconnect(); musicGain?.disconnect();
    music = undefined; musicGain = undefined; musicSource = undefined;
  }

  function startTrack() {
    if (!context || !masterGain || !active || muted || !lastTrack) return;
    if (!music) {
      music = new Audio(lastTrack);
      music.loop = true;
      musicGain = context.createGain();
      musicGain.gain.value = Math.min(1, levels.music / 65);
      musicSource = context.createMediaElementSource(music);
      musicSource.connect(musicGain).connect(masterGain);
    }
    if (music.paused) void music.play().catch(() => {});
  }

  function unlock() {
    if (!context) {
      context = new AudioContext();
      masterGain = context.createGain();
      masterGain.connect(context.destination);
      effectsGain = context.createGain();
      effectsGain.gain.value = levels.effects / 100;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 4;
      effectsGain.connect(limiter).connect(masterGain);
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
    for (const kind of devices.keys()) stopDevice(kind);
  }

  function stopDevice(kind: Device) {
    const device = devices.get(kind);
    if (!device) return;
    device.voice.stop(); device.voice.disconnect(); device.gain.disconnect(); device.pan.disconnect();
    devices.delete(kind);
  }

  function syncDevice(kind: Device, source: Point | undefined, listener: Point) {
    const audio = context, bus = effectsGain;
    if (!source || !active || muted || !audio || !bus || !samples || audio.state !== 'running') { stopDevice(kind); return; }
    const dx = source.x - listener.x, dy = source.y - listener.y;
    const amplitude = deviceVolume * (kind === 'turret' ? .24 : .16) * Math.max(0, 1 - Math.hypot(dx, dy) / 195) ** 1.6;
    if (amplitude < .002) { stopDevice(kind); return; }
    let device = devices.get(kind);
    if (!device) {
      const [start, duration] = cueTimes[kind === 'turret' ? 'turretMotor' : 'droneMotor'];
      const voice = audio.createBufferSource(), gain = audio.createGain(), pan = audio.createStereoPanner();
      voice.buffer = samples; voice.loop = true; voice.loopStart = start; voice.loopEnd = start + duration;
      gain.gain.value = 0;
      voice.connect(gain).connect(pan).connect(bus);
      device = { voice, gain, pan };
      devices.set(kind, device);
      voice.start(0, start);
    }
    device.gain.gain.setTargetAtTime(amplitude, audio.currentTime, .045);
    device.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / 145)), audio.currentTime, .035);
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
    setVolume(percent: number) {
      if (!Number.isFinite(percent)) return;
      master = Math.max(0, Math.min(100, percent)) / 100;
      updateVolume();
    },
    devicePower(kind: Device, powered: boolean, position: Point, listener: Point) {
      const audio = context, bus = effectsGain;
      if (!audio || !bus || muted || audio.state !== 'running') return;
      const key = `${kind}/${powered}`;
      const buffer = deviceCues.get(key) ?? synthesizeDeviceCue(audio, kind, powered);
      deviceCues.set(key, buffer);
      const voice = audio.createBufferSource(), gain = audio.createGain(), pan = audio.createStereoPanner();
      const dx = position.x - listener.x, dy = position.y - listener.y;
      voice.buffer = buffer;
      gain.gain.value = deviceVolume * (kind === 'turret' ? .48 : .39) * Math.max(0, 1 - Math.hypot(dx, dy) / 250);
      pan.pan.value = Math.max(-1, Math.min(1, dx / 145));
      voice.connect(gain).connect(pan).connect(bus);
      voices.add(voice);
      voice.onended = () => { voices.delete(voice); voice.disconnect(); gain.disconnect(); pan.disconnect(); };
      voice.start();
    },
    syncDevices(turret: Point | undefined, drone: Point | undefined, listener: Point) {
      syncDevice('turret', turret, listener); syncDevice('drone', drone, listener);
    },
    isMuted: () => muted,
    setMuted(value: boolean) {
      muted = value;
      updateVolume();
      if (muted) { stopTrack(); for (const kind of devices.keys()) stopDevice(kind); }
      else unlock();
    },
    reload(stage: number, heavy: boolean) {
      play(reloadCues[stage], undefined, undefined, .76, heavy ? .88 : 1);
    },
    dispose() { end(); void context?.close().catch(() => {}); },
  };
}
