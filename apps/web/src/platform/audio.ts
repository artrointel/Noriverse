import { arrangements, playArrangement } from './music-arrangements.ts';
import type { ArrangementTrack } from './music-arrangements.ts';

type Effect = 'click' | 'navigate' | 'place' | 'doubleThree' | 'flick' | 'impact' | 'drop' | 'win' | 'loss' | 'turn' | 'tick' | 'finish' | 'combo' | 'paper';
type Channel = 'music' | 'effects';
export type AudioLevels = Record<Channel, number>;

const defaultLevels: AudioLevels = { music: 24, effects: 68 };
const scores = {
  orbit: { chords: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]], pattern: [0, -1, 2, 1, -1, 3, 2, -1], interval: .38 },
  skylight: { chords: [[48, 55, 59, 64], [45, 52, 60, 67], [41, 48, 57, 62], [43, 50, 59, 65]], pattern: [3, 2, -1, 1, 2, -1, 3, 1], interval: .43 },
  lantern: { chords: [[50, 57, 60, 65], [55, 62, 65, 70], [53, 60, 64, 69], [57, 64, 67, 73]], pattern: [1, -1, 3, 2, -1, 1], interval: .52 },
  paperComet: { chords: [[43, 55, 59, 62], [47, 54, 57, 62], [48, 55, 59, 64], [50, 57, 60, 66]], pattern: [0, 2, 3, -1, 1, 2, -1, 3], interval: .32 },
  omok: { chords: [[48, 55, 62, 64], [45, 52, 57, 60], [41, 48, 57, 60], [43, 50, 57, 62]], pattern: [1, -1, -1, 3, 2, -1, 0, -1], interval: .45 },
  othello: { chords: [[50, 57, 60, 65], [46, 53, 60, 62], [48, 55, 62, 67], [45, 52, 55, 61]], pattern: [2, -1, 3, -1, 1, 2, -1, 0], interval: .36 },
  chess: { chords: [[45, 52, 60, 64], [47, 54, 59, 62], [43, 55, 59, 62], [44, 52, 59, 64]], pattern: [0, 2, -1, 1, 3, -1, 2, -1], interval: .4 },
  sichuan: { chords: [[50, 57, 62, 66], [48, 55, 60, 64], [47, 54, 59, 62], [45, 52, 57, 64]], pattern: [2, -1, 1, 3, -1, 2, 1, -1], interval: .49 },
  physics: { chords: [[43, 50, 58, 62], [46, 53, 60, 65], [41, 48, 57, 60], [45, 52, 55, 64]], pattern: [0, 2, -1, 1, 3, -1, 2, 1], interval: .265 },
} as const;
const lobbyTracks = ['orbit', 'skylight', 'lantern', 'paperComet', ...Object.keys(arrangements) as ArrangementTrack[]] as const;
type LobbyTrack = typeof lobbyTracks[number];
export type MusicTrack = keyof typeof scores | ArrangementTrack;
type MusicScene = 'lobby' | Exclude<MusicTrack, LobbyTrack>;

function randomLobbyTrack(previous?: string | null): LobbyTrack {
  const choices = lobbyTracks.filter(track => track !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

function initialLobbyTrack() {
  try { return randomLobbyTrack(localStorage.getItem('noriverse.lobby-track')); }
  catch { return randomLobbyTrack(); }
}
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
let levels = defaultLevels;
let graph: { context: AudioContext; music: GainNode; effects: GainNode; noise: AudioBuffer } | undefined;
let clock: number | undefined;
let nextBeat = 0;
let beat = 0;
let musicScene: MusicScene = 'lobby';
let lobbyTrack = initialLobbyTrack();
let musicTrack: MusicTrack = lobbyTrack;
const trackListeners = new Set<() => void>();
const audioReadyListeners = new Set<() => void>();

export function onAudioReady(listener: () => void) {
  audioReadyListeners.add(listener);
  document.addEventListener('visibilitychange', listener);
  return () => { audioReadyListeners.delete(listener); document.removeEventListener('visibilitychange', listener); };
}
const playingNotes = new Set<AudioScheduledSourceNode>();

function trackNote(source: AudioScheduledSourceNode, channel: Channel) {
  if (channel !== 'music') return;
  playingNotes.add(source);
  source.onended = () => { playingNotes.delete(source); };
}
let lastEffect = -1;
let resumeRequest: Promise<void> | undefined;

export function loadAudioLevels(): AudioLevels {
  try {
    const saved = JSON.parse(localStorage.getItem('noriverse.audio') ?? '{}') as Partial<AudioLevels> | null;
    return {
      music: clampLevel(saved?.music, defaultLevels.music),
      effects: clampLevel(saved?.effects, defaultLevels.effects),
    };
  } catch {
    return defaultLevels;
  }
}

function clampLevel(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fallback;
}

function applyLevels() {
  if (!graph) return;
  for (const name of ['music', 'effects'] as const) {
    const parameter = graph[name].gain;
    const target = document.hidden ? 0 : (levels[name] / 100) ** 1.35;
    parameter.setTargetAtTime(target, graph.context.currentTime, 0.045);
  }
}

export function setAudioLevels(value: AudioLevels) {
  levels = value;
  applyLevels();
  syncMusic();
}

function rememberLobbyTrack() {
  try { localStorage.setItem('noriverse.lobby-track', lobbyTrack); } catch { /* Optional storage. */ }
}

function changeMusicTrack(track: MusicTrack) {
  if (musicTrack === track) return;
  musicTrack = track;
  beat = 0;
  nextBeat = (graph?.context.currentTime ?? 0) + .055;
  if (graph) for (const note of playingNotes) note.stop(graph.context.currentTime + .025);
  for (const listener of trackListeners) listener();
}

export function getMusicTrack() { return musicTrack; }

export function subscribeMusicTrack(listener: () => void) {
  trackListeners.add(listener);
  return () => { trackListeners.delete(listener); };
}

export function shuffleMusicTrack() {
  const track = randomLobbyTrack(musicTrack);
  if (musicScene === 'lobby') { lobbyTrack = track; rememberLobbyTrack(); }
  changeMusicTrack(track);
}

export function setMusicScene(scene: MusicScene) {
  if (musicScene === scene) return;
  musicScene = scene;
  changeMusicTrack(scene === 'lobby' ? lobbyTrack : scene);
}

function createGraph() {
  const context = new AudioContext();
  const music = context.createGain();
  const effects = context.createGain();
  const limiter = context.createDynamicsCompressor();
  music.gain.value = 0;
  effects.gain.value = 0;
  music.connect(limiter);
  effects.connect(limiter);
  limiter.connect(context.destination);
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.3), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  return { context, music, effects, noise };
}

function unlockAudio() {
  if (!levels.music && !levels.effects) return;
  try {
    if (!graph) {
      graph = createGraph();
      applyLevels();
    }
    const ready = () => {
      syncMusic();
      for (const listener of audioReadyListeners) listener();
    };
    if (graph.context.state === 'running') {
      ready();
    } else if (!resumeRequest) {
      resumeRequest = graph.context.resume().then(ready).catch(() => {})
        .finally(() => { resumeRequest = undefined; });
    }
  } catch {
    // The interface remains usable when audio output is unavailable.
  }
}

function tone(when: number, hz: number, duration: number, volume: number, channel: Channel,
  wave: OscillatorType = 'sine', endHz = hz, attack = .008) {
  if (!graph) return;
  const { context } = graph;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(hz, when);
  oscillator.frequency.exponentialRampToValueAtTime(endHz, when + duration);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(volume, when + Math.min(attack, duration / 2));
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(envelope).connect(graph[channel]);
  trackNote(oscillator, channel);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.01);
}

function texture(when: number, duration: number, volume: number, center: number, channel: Channel = 'effects') {
  if (!graph) return;
  const { context, noise } = graph;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = noise;
  filter.type = 'bandpass';
  filter.frequency.value = center;
  filter.Q.value = 0.75;
  envelope.gain.setValueAtTime(volume, when);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  source.connect(filter).connect(envelope).connect(graph[channel]);
  trackNote(source, channel);
  source.start(when);
  source.stop(when + duration);
}

export function playSound(effect: Effect, strength = 1) {
  if (!levels.effects) return true;
  if (!graph || graph.context.state !== 'running' || document.hidden) return false;
  const time = graph.context.currentTime;
  switch (effect) {
    case 'click':
      if (time - lastEffect < 0.055) return true;
      lastEffect = time;
      tone(time, 540, .07, .12, 'effects', 'sine', 360);
      break;
    case 'navigate':
      tone(time, 520, .13, .07, 'effects', 'sine', 730);
      tone(time + .035, 830, .12, .055, 'effects');
      break;
    case 'paper':
      texture(time, .065, .19, 1550);
      texture(time + .019, .095, .12, 2880);
      break;
    case 'place':
      texture(time, .045, .35, 1900);
      tone(time, 720, .1, .16, 'effects', 'sine', 390);
      break;
    case 'combo': {
      const root = 64 + Math.min(strength - 2, 7);
      tone(time, frequency(root), .14, .15, 'effects', 'triangle');
      tone(time + .055, frequency(root + 7), .19, .17, 'effects', 'triangle');
      break;
    }
    case 'doubleThree':
      texture(time, .055, .31, 1900);
      [62, 69, 76].forEach((note, index) => tone(time + index * .055, frequency(note), .22, .16, 'effects', 'triangle'));
      break;
    case 'flick':
      texture(time, .12, .19 + strength * .12, 1200);
      tone(time, 230, .16, .18, 'effects', 'triangle', 100);
      break;
    case 'impact': {
      const gain = .055 + Math.min(1, strength) * .28;
      texture(time, .065, gain, 2750);
      tone(time, 1660, .075, gain * .6, 'effects', 'sine', 1080);
      tone(time, 680, .12, gain * .35, 'effects', 'triangle', 530);
      break;
    }
    case 'drop':
      tone(time, 270, .21, .18, 'effects', 'sine', 73);
      texture(time, .14, .16, 490);
      break;
    case 'win':
      [60, 64, 67, 72].forEach((note, index) => tone(time + index * .085, frequency(note), .33, .14, 'effects', 'triangle'));
      break;
    case 'loss':
      [62, 57, 50].forEach((note, index) => tone(time + index * .12, frequency(note), .37, .13, 'effects', 'sine'));
      break;
    case 'turn':
      tone(time, 659.25, .22, .20, 'effects', 'triangle');
      tone(time + .135, 987.77, .30, .22, 'effects', 'triangle');
      tone(time + .135, 1975.53, .19, .052, 'effects');
      break;
    case 'tick':
      texture(time, .028, .16, strength % 2 ? 2450 : 1750);
      tone(time, strength % 2 ? 1150 : 890, .044, .08, 'effects', 'triangle');
      break;
    case 'finish':
      tone(time, frequency(57), .31, .12, 'effects', 'triangle');
      tone(time + .11, frequency(64), .26, .08, 'effects', 'sine');
      break;
  }
  return true;
}

function scheduleMusic() {
  if (!graph || graph.context.state !== 'running') return;
  const time = graph.context.currentTime;
  nextBeat = Math.max(nextBeat, time + 0.015);
  const track = musicTrack;
  if (Object.hasOwn(arrangements, track)) {
    while (nextBeat < time + .16) {
      const when = nextBeat;
      nextBeat += playArrangement(track as ArrangementTrack, beat++,
        (note, length, gain, wave, attack) => tone(when, frequency(note), length, gain, 'music', wave, undefined, attack),
        (length, gain, hz) => texture(when, length, gain, hz, 'music'));
    }
    return;
  }
  const { chords, pattern, interval } = scores[track as keyof typeof scores];
  while (nextBeat < time + .16) {
    const step = beat % pattern.length;
    const notes = chords[Math.floor(beat / pattern.length) % chords.length];
    if (step === 0) {
      tone(nextBeat, frequency(notes[0] - 12), 1.4, .2, 'music');
      tone(nextBeat, frequency(notes[1]), 1.1, .05, 'music');
    }
    const noteIndex = pattern[step];
    if (noteIndex !== -1) {
      const note = notes[noteIndex] + 12;
      tone(nextBeat, frequency(note), .42, .11, 'music', 'triangle');
      tone(nextBeat + .105, frequency(note), .26, .023, 'music');
    }
    if (musicTrack === 'physics' && step === 4) tone(nextBeat, frequency(notes[0] - 12), .52, .12, 'music');
    nextBeat += interval;
    beat++;
  }
}

function syncMusic() {
  const enabled = graph?.context.state === 'running' && levels.music > 0 && !document.hidden;
  if (enabled && clock === undefined) {
    scheduleMusic();
    clock = window.setInterval(scheduleMusic, 75);
  } else if (!enabled && clock !== undefined) {
    window.clearInterval(clock);
    clock = undefined;
  }
}

export function bindPageAudio() {
  rememberLobbyTrack();
  function click(event: MouseEvent) {
    if (!(event.target instanceof Element) || !event.isTrusted) return;
    unlockAudio();
    if (event.target.closest('button:enabled, a[href], summary')) playSound('click');
  }
  function change(event: Event) {
    if (event.isTrusted && event.target instanceof Element && event.target.matches('select, input[type=radio]')) playSound('click');
  }
  function visibility() {
    applyLevels();
    syncMusic();
  }
  document.addEventListener('click', click, true);
  document.addEventListener('pointerup', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);
  document.addEventListener('change', change);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    document.removeEventListener('click', click, true);
    document.removeEventListener('pointerup', unlockAudio, true);
    document.removeEventListener('keydown', unlockAudio, true);
    document.removeEventListener('change', change);
    document.removeEventListener('visibilitychange', visibility);
  };
}
