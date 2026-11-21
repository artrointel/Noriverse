import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';

export const inkColors = [0x263044, 0x4967e9, 0xee5770, 0xf2a538, 0x32a581, 0x8b5ad0, 0x8c5b40, 0xfffcf3];
export const inkWidths = [4, 8, 16] as const;
export const inkLimit = 1600;
export const inkBatch = 20;
export type Ink = [x: number, y: number, endX: number, endY: number, color: number, width: number];
export const sketchTimes = [45, 60, 90] as const;
export const sketchCycles = [1, 2, 3] as const;
export type SketchSettings = { language: 'ko' | 'en'; seconds: typeof sketchTimes[number]; cycles: typeof sketchCycles[number] };
export const defaultSketchSettings: SketchSettings = { language: 'ko', seconds: 60, cycles: 2 };
export type SketchRound = {
  players: Role[]; scores: number[]; retired: Role[]; correct: Role[]; turn: number; revision: number;
  phase: 'draw' | 'reveal' | 'done'; deadline: number; board: Ink[]; answer?: string;
};
export type SketchAction = { kind: 'ink'; lines: Ink[] } | { kind: 'clear' | 'resign' } | { kind: 'guess'; text: string };

const words = [
  ['우산', 'umbrella'], ['문어', 'octopus'], ['신호등', 'traffic light'], ['고래', 'whale'], ['나비', 'butterfly'],
  ['도넛', 'donut'], ['유령', 'ghost'], ['로봇', 'robot'], ['잠수함', 'submarine'], ['고양이', 'cat'],
  ['악어', 'crocodile'], ['해바라기', 'sunflower'], ['전구', 'light bulb'], ['기타', 'guitar'], ['열기구', 'hot air balloon'],
  ['성', 'castle'], ['드럼', 'drum'], ['소방차', 'fire truck'], ['별똥별', 'shooting star'], ['양말', 'sock'],
  ['강아지', 'dog'], ['모래시계', 'hourglass'], ['연', 'kite'], ['헬리콥터', 'helicopter'], ['무지개', 'rainbow'],
  ['눈사람', 'snowman'], ['팽귄', 'penguin'], ['바이올린', 'violin'], ['등대', 'lighthouse'], ['선인장', 'cactus'],
  ['피자', 'pizza'], ['거북이', 'turtle'], ['망원경', 'telescope'], ['바나나', 'banana'], ['닻', 'anchor'],
  ['화산', 'volcano'], ['주사위', 'dice'], ['거미줄', 'spider web'], ['수박', 'watermelon'], ['요트', 'sailboat'],
] as const;

export function sketchDeck(language: SketchSettings['language'], random = Math.random) {
  const deck: string[] = words.map(pair => pair[language === 'ko' ? 0 : 1]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export function readSketchSettings(value: unknown): SketchSettings | undefined {
  if (!value || typeof value !== 'object') return;
  const data = value as Partial<SketchSettings>;
  const seconds = sketchTimes.find(time => time === data.seconds);
  const cycles = sketchCycles.find(count => count === data.cycles);
  if (seconds && cycles && (data.language === 'ko' || data.language === 'en')) return { language: data.language, seconds, cycles };
}

export function readInk(value: unknown, max: number): Ink[] | undefined {
  if (!Array.isArray(value) || value.length > max) return;
  if (value.every(line => Array.isArray(line) && line.length === 6
    && line.slice(0, 4).every(value => integer(value, 0, 1000))
    && integer(line[4], 0, inkColors.length - 1) && integer(line[5], 0, inkWidths.length - 1))) return value as Ink[];
}

export const drawer = (round: SketchRound) => round.players[round.turn % round.players.length];

export function makeSketchRound(players: Role[], answer: string): SketchRound {
  return { players, answer, scores: players.map(() => 0), turn: 0, revision: 0, correct: [], retired: [], phase: 'draw', deadline: 0, board: [] };
}

export function visibleSketch(round: SketchRound, viewer: Role): SketchRound {
  return round.phase === 'draw' && viewer !== drawer(round) ? { ...round, answer: undefined } : round;
}

export function sketchOutcome(round: SketchRound, player: Role) {
  if (round.retired.includes(player)) return 'loss';
  const active = round.scores.filter((_, i) => !round.retired.includes(round.players[i]));
  const high = Math.max(...active);
  return round.scores[round.players.indexOf(player)] !== high ? 'loss' : active.filter(score => score === high).length > 1 ? 'draw' : 'win';
}

const normalizeGuess = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '');
const reveal = (round: SketchRound, now: number): SketchRound => ({ ...round, phase: 'reveal', deadline: now + 3500 });

export function applySketchAction(round: SketchRound, actor: Role, raw: unknown, now: number): SketchRound | undefined {
  if (!raw || typeof raw !== 'object' || !('kind' in raw) || !round.players.includes(actor)
    || round.retired.includes(actor) || !round.deadline || round.phase === 'done') return;
  const next = { ...round, revision: round.revision + 1 };
  if (raw.kind === 'resign') {
    next.retired = [...next.retired, actor];
    if (next.retired.length >= next.players.length - 1) return { ...next, phase: 'done', deadline: 0 };
    return next.phase === 'draw' && (actor === drawer(next) || next.players.every(player =>
      player === drawer(next) || next.correct.includes(player) || next.retired.includes(player))) ? reveal(next, now) : next;
  }
  if (now >= round.deadline || round.phase !== 'draw') return;
  const drawing = actor === drawer(round);
  if (drawing && raw.kind === 'clear') return { ...next, board: [] };
  if (drawing && raw.kind === 'ink' && 'lines' in raw) {
    const lines = readInk(raw.lines, inkBatch);
    if (lines?.length && next.board.length + lines.length <= inkLimit) return { ...next, board: [...next.board, ...lines] };
  }
  if (!drawing && raw.kind === 'guess' && 'text' in raw && typeof raw.text === 'string' && raw.text.length <= 64
    && !round.correct.includes(actor) && round.answer && normalizeGuess(raw.text) === normalizeGuess(round.answer)) {
    next.correct = [...next.correct, actor];
    next.scores = round.scores.map((points, i) => points + (round.players[i] === actor ? 100 : round.players[i] === drawer(round) ? 50 : 0));
    return next.players.every(player => player === drawer(next) || next.correct.includes(player) || next.retired.includes(player)) ? reveal(next, now) : next;
  }
}

export function advanceSketch(round: SketchRound, settings: SketchSettings, deck: string[], now: number): SketchRound | undefined {
  if (!round.deadline || round.deadline > now || round.phase === 'done') return;
  const next = { ...round, revision: round.revision + 1 };
  if (round.phase === 'draw') return reveal(next, now);
  const total = round.players.length * settings.cycles;
  let turn = round.turn + 1;
  while (turn < total && round.retired.includes(round.players[turn % round.players.length])) turn++;
  if (turn >= total) return { ...next, phase: 'done', deadline: 0 };
  return { ...next, turn, phase: 'draw', deadline: now + settings.seconds * 1000, answer: deck[turn], board: [], correct: [] };
}

export function readSketchRound(raw: unknown, settings: SketchSettings): SketchRound | undefined {
  if (!raw || typeof raw !== 'object') return;
  const next = raw as Partial<SketchRound>;
  const { players, scores, correct, retired, phase, deadline, turn, revision, answer } = next;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4 || players[0] !== 'host'
    || !players.every(isRoomRole) || new Set(players).size !== players.length) return;
  const subset = (list: unknown): list is Role[] => Array.isArray(list) && list.length <= players.length && list.every(role => players.includes(role))
    && new Set(list).size === list.length;
  if (!Array.isArray(scores) || scores.length !== players.length || !scores.every(score => integer(score, 0, 5000))
    || !subset(correct) || !subset(retired) || (phase !== 'draw' && phase !== 'reveal' && phase !== 'done')
    || !integer(turn, 0, players.length * settings.cycles - 1) || !integer(revision, 0, Number.MAX_SAFE_INTEGER)
    || !integer(deadline, 0, Number.MAX_SAFE_INTEGER) || (phase === 'done' && deadline !== 0)
    || (answer !== undefined && (typeof answer !== 'string' || answer.length > 64)) || (phase === 'reveal' && !answer)) return;
  const board = readInk(next.board, inkLimit);
  if (board) return { players, scores, correct, retired, turn, revision, phase, deadline, answer, board };
}
