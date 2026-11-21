import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';
import { readReactionText } from '../../../../../packages/protocol/reactions.ts';
import { editInk, inkBatch, inkLimit, integer, readInk, unpackInk } from './ink.ts';
import type { BoardEdit, Ink } from './ink.ts';

export const sketchTimes = [60, 120, 180] as const;
export const sketchCycles = [1, 2, 3] as const;
export const sketchMaps = ['laptop', 'notebook', 'chalkboard', 'easel', 'postcard'] as const;
export type SketchMap = typeof sketchMaps[number];
export const wordIntroDuration = 2000;
export const maxHintInterval = 180;
export type SketchSettings = {
  language: 'ko' | 'en'; seconds: typeof sketchTimes[number]; cycles: typeof sketchCycles[number];
  map: SketchMap | 'random'; hintSeconds: number;
};
export const defaultSketchSettings: SketchSettings = { language: 'ko', seconds: 120, cycles: 2, map: 'random', hintSeconds: 30 };
const topics = ['animal', 'object', 'food', 'nature', 'place', 'fantasy'] as const;
const colors = ['yellow', 'green', 'red', 'white', 'orange', 'blue'] as const;
export type Prompt = { word: string; category: typeof topics[number]; color?: typeof colors[number] };
export type SketchHint = { kind: 'length'; value: number } | { kind: 'category'; value: Prompt['category'] }
  | { kind: 'color'; value: NonNullable<Prompt['color']> };

export type SketchRound = {
  players: Role[]; scores: number[]; responseMs: number[]; draws: number[]; tieOrder: Role[];
  artist: Role; retired: Role[]; solvedBy?: Role; points?: number; turn: number; revision: number;
  phase: 'draw' | 'reveal' | 'done'; opensAt: number; deadline: number; board: Ink[]; redoCount: number;
  map: SketchMap; hints: SketchHint[]; answer?: string;
  prompt?: Prompt; redo?: Ink[][];
};
export type SketchAction = { kind: 'ink'; lines: Ink[] } | { kind: BoardEdit | 'resign' } | { kind: 'guess'; text: string };

const words: readonly (readonly [string, string, Prompt['category'], Prompt['color']?])[] = [
  ['우산', 'umbrella', 'object'], ['문어', 'octopus', 'animal'], ['신호등', 'traffic light', 'object'], ['고래', 'whale', 'animal'],
  ['나비', 'butterfly', 'animal'], ['도넛', 'donut', 'food'], ['유령', 'ghost', 'fantasy', 'white'], ['로봇', 'robot', 'object'],
  ['잠수함', 'submarine', 'object'], ['고양이', 'cat', 'animal'], ['악어', 'crocodile', 'animal', 'green'],
  ['해바라기', 'sunflower', 'nature', 'yellow'], ['전구', 'light bulb', 'object'], ['기타', 'guitar', 'object'],
  ['열기구', 'hot air balloon', 'object'], ['성', 'castle', 'place'], ['드럼', 'drum', 'object'], ['소방차', 'fire truck', 'object', 'red'],
  ['별똥별', 'shooting star', 'nature'], ['양말', 'sock', 'object'], ['강아지', 'dog', 'animal'], ['모래시계', 'hourglass', 'object'],
  ['연', 'kite', 'object'], ['헬리콥터', 'helicopter', 'object'], ['무지개', 'rainbow', 'nature'], ['눈사람', 'snowman', 'fantasy', 'white'],
  ['팽귄', 'penguin', 'animal'], ['바이올린', 'violin', 'object'], ['등대', 'lighthouse', 'place'], ['선인장', 'cactus', 'nature', 'green'],
  ['피자', 'pizza', 'food'], ['거북이', 'turtle', 'animal'], ['망원경', 'telescope', 'object'], ['바나나', 'banana', 'food', 'yellow'],
  ['닻', 'anchor', 'object'], ['화산', 'volcano', 'nature'], ['주사위', 'dice', 'object', 'white'], ['거미줄', 'spider web', 'nature'],
  ['수박', 'watermelon', 'food', 'green'], ['요트', 'sailboat', 'object'], ['당근', 'carrot', 'food', 'orange'], ['바다', 'sea', 'nature', 'blue'],
];

function shuffled<T>(items: readonly T[], random: () => number) {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function sketchDeck(language: SketchSettings['language'], random = Math.random) {
  return shuffled(words.map(([ko, en, category, color]) => ({ word: language === 'ko' ? ko : en, category, color })), random);
}

export function chooseSketchMap(map: SketchSettings['map'], random = Math.random): SketchMap {
  return map === 'random' ? sketchMaps[Math.floor(random() * sketchMaps.length)] : map;
}

export function readSketchSettings(value: unknown): SketchSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Partial<Omit<SketchSettings, 'seconds'>> & { seconds?: number };
  const seconds = sketchTimes.find(time => time === data.seconds) ?? (data.seconds === 45 || data.seconds === 90 ? 60 : undefined);
  const cycles = sketchCycles.find(count => count === data.cycles);
  const map = data.map ?? defaultSketchSettings.map;
  const hintSeconds = data.hintSeconds ?? defaultSketchSettings.hintSeconds;
  if (seconds && cycles && (map === 'random' || sketchMaps.includes(map)) && integer(hintSeconds, 1, maxHintInterval)
    && (data.language === 'ko' || data.language === 'en')) return { language: data.language, seconds, cycles, map, hintSeconds };
}

export const drawer = (round: SketchRound) => round.artist;
export function sketchRanking(round: SketchRound) {
  return [...round.players].sort((a, b) => {
    const left = round.players.indexOf(a), right = round.players.indexOf(b);
    return Number(round.retired.includes(a)) - Number(round.retired.includes(b))
      || round.scores[right] - round.scores[left] || round.responseMs[left] - round.responseMs[right]
      || round.tieOrder.indexOf(a) - round.tieOrder.indexOf(b);
  });
}

export function makeSketchRound(players: Role[], prompt: Prompt, map: SketchMap, random = Math.random): SketchRound {
  return { players, prompt, answer: prompt.word, scores: players.map(() => 0), responseMs: players.map(() => 0), draws: players.map((_, i) => i === 0 ? 1 : 0),
    tieOrder: shuffled(players, random), artist: players[0], turn: 0, revision: 0, retired: [], phase: 'draw', opensAt: 0, deadline: 0,
    board: [], redoCount: 0, map, hints: [] };
}

export function startSketchTurn(round: SketchRound, settings: SketchSettings, at: number): SketchRound {
  const opensAt = at + wordIntroDuration;
  return { ...round, opensAt, deadline: opensAt + settings.seconds * 1000 };
}

export function visibleSketch({ prompt, redo, ...round }: SketchRound, viewer: Role): SketchRound {
  return round.phase === 'draw' && viewer !== round.artist ? { ...round, answer: undefined } : round;
}

export function sketchOutcome(round: SketchRound, player: Role) {
  return sketchRanking(round)[0] === player ? 'win' : 'loss';
}

const normalizeGuess = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '');
const reveal = (round: SketchRound, now: number): SketchRound => ({ ...round, phase: 'reveal', deadline: now + 2000 });
const clues = (prompt: Prompt): SketchHint[] => [
  { kind: 'length', value: Array.from(normalizeGuess(prompt.word)).length }, { kind: 'category', value: prompt.category },
  ...(prompt.color ? [{ kind: 'color', value: prompt.color } as const] : []),
];

export function nextSketchEvent(round: SketchRound, settings: SketchSettings) {
  return round.phase === 'draw' && round.opensAt && round.prompt && round.hints.length < clues(round.prompt).length
    ? Math.min(round.deadline, round.opensAt + (round.hints.length + 1) * settings.hintSeconds * 1000) : round.deadline;
}

export function readSketchGuess(round: SketchRound, actor: Role, raw: unknown, now: number) {
  if (round.phase !== 'draw' || !round.opensAt || now < round.opensAt || now >= round.deadline
    || actor === round.artist || !round.players.includes(actor) || round.retired.includes(actor)
    || !raw || typeof raw !== 'object' || !('kind' in raw) || raw.kind !== 'guess' || !('text' in raw)) return;
  return readReactionText(raw.text);
}

export function applySketchAction(round: SketchRound, actor: Role, raw: unknown, now: number): SketchRound | undefined {
  if (!raw || typeof raw !== 'object' || !('kind' in raw) || !round.players.includes(actor)
    || round.retired.includes(actor) || !round.opensAt || round.phase === 'done' || now < round.opensAt) return;
  const next = { ...round, revision: round.revision + 1 };
  if (raw.kind === 'resign') {
    next.retired = [...next.retired, actor];
    if (next.retired.length >= next.players.length - 1) return { ...next, phase: 'done', deadline: 0 };
    return next.phase === 'draw' && actor === next.artist ? reveal(next, now) : next;
  }
  if (now >= round.deadline || round.phase !== 'draw') return;
  if (actor === round.artist) {
    const edit = raw.kind === 'ink' && 'lines' in raw ? readInk(raw.lines, inkBatch) : raw.kind;
    if (Array.isArray(edit) || edit === 'clear' || edit === 'undo' || edit === 'redo') {
      const history = editInk({ board: round.board, redo: round.redo ?? [] }, edit);
      if (history) return { ...next, ...history, redoCount: history.redo.length };
    }
    return;
  }
  const guess = readSketchGuess(round, actor, raw, now);
  if (guess && round.answer && normalizeGuess(guess) === normalizeGuess(round.answer)) {
    const elapsed = now - round.opensAt;
    const points = 100 + Math.round(200 * (round.deadline - now) / (round.deadline - round.opensAt));
    const i = round.players.indexOf(actor);
    next.solvedBy = actor;
    next.points = points;
    next.scores = round.scores.map((score, index) => index === i ? score + points : score);
    next.responseMs = round.responseMs.map((time, index) => index === i ? time + elapsed : time);
    return reveal(next, now);
  }
}

export function advanceSketch(round: SketchRound, settings: SketchSettings, deck: Prompt[], now: number): SketchRound | undefined {
  if (!round.deadline || now < nextSketchEvent(round, settings) || round.phase === 'done') return;
  const next = { ...round, revision: round.revision + 1 };
  if (round.phase === 'draw') {
    if (round.deadline <= now) return reveal(next, now);
    if (!round.prompt) return;
    const count = Math.floor((now - round.opensAt) / (settings.hintSeconds * 1000));
    return { ...next, hints: clues(round.prompt).slice(0, count) };
  }
  const eligible = (player: Role) => !round.retired.includes(player) && round.draws[round.players.indexOf(player)] < settings.cycles;
  const artist = round.solvedBy && eligible(round.solvedBy) ? round.solvedBy : sketchRanking(round).find(eligible);
  if (!artist) return { ...next, phase: 'done', deadline: 0 };
  const turn = round.turn + 1;
  const prompt = deck[turn];
  if (!prompt) return { ...next, phase: 'done', deadline: 0 };
  return startSketchTurn({ ...next, artist, turn, phase: 'draw', prompt, answer: prompt.word, solvedBy: undefined, points: undefined,
    board: [], redo: undefined, redoCount: 0, hints: [], draws: round.draws.map((draws, index) => draws + Number(round.players[index] === artist)) }, settings, now);
}

export function readSketchRound(raw: unknown, settings: SketchSettings): SketchRound | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { players, scores, responseMs, draws, tieOrder, artist, retired, solvedBy, points, phase, opensAt, deadline, turn, revision,
    answer, board, redoCount, map, hints } = raw as Omit<SketchRound, 'board'> & { board?: unknown };
  if (!Array.isArray(players) || players.length < 2 || players.length > 4 || players[0] !== 'host'
    || !players.every(isRoomRole) || new Set(players).size !== players.length) return;
  const subset = (list: unknown): list is Role[] => Array.isArray(list) && list.length <= players.length && list.every(role => players.includes(role))
    && new Set(list).size === list.length;
  const counters = (list: unknown, max: number) => Array.isArray(list) && list.length === players.length && list.every(value => integer(value, 0, max));
  if (!counters(scores, 3600) || !counters(responseMs, 2_160_000) || !counters(draws, settings.cycles)
    || !subset(tieOrder) || tieOrder.length !== players.length || !subset(retired) || !players.includes(artist)
    || solvedBy !== undefined && (!players.includes(solvedBy) || solvedBy === artist || !integer(points, 100, 300)) || solvedBy === undefined && points !== undefined
    || phase !== 'draw' && phase !== 'reveal' && phase !== 'done'
    || !integer(turn, 0, players.length * settings.cycles - 1) || !integer(revision, 0, Number.MAX_SAFE_INTEGER)
    || !integer(opensAt, 0, Number.MAX_SAFE_INTEGER) || !integer(deadline, 0, Number.MAX_SAFE_INTEGER)
    || (phase === 'done' && deadline !== 0) || phase !== 'done' && (opensAt > 0) !== (deadline > opensAt)
    || answer !== undefined && (typeof answer !== 'string' || !answer.length || answer.length > 64) || phase === 'reveal' && !answer
    || !integer(redoCount, 0, inkLimit) || !sketchMaps.includes(map) || !Array.isArray(hints) || hints.length > 3) return;
  const validHints = hints.every((hint, index) => hint && (index === 0 ? hint.kind === 'length' && integer(hint.value, 1, 64)
    : index === 1 ? hint.kind === 'category' && topics.includes(hint.value) : hint.kind === 'color' && colors.includes(hint.value)));
  const visibleBoard = Array.isArray(board) ? readInk(board, inkLimit) : unpackInk(board, inkLimit);
  if (validHints && visibleBoard) return { players, scores, responseMs, draws, tieOrder, artist, retired, solvedBy, points, phase, opensAt,
    deadline, turn, revision, answer, board: visibleBoard, redoCount, map, hints };
}
