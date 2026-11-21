import { isRoomRole } from '../../../../../packages/protocol/rooms.ts';
import type { Role } from '../../../../../packages/protocol/rooms.ts';

export const liarHintTimes = [25, 40, 60] as const;
export const liarSceneHeight = 254;
export const liarHintLimit = 90;
export const liarVoteSeconds = 30;
export const liarGuessSeconds = 25;
export type LiarSettings = { language: 'ko' | 'en'; seconds: typeof liarHintTimes[number] };
export const defaultLiarSettings: LiarSettings = { language: 'ko', seconds: 40 };
export type LiarAction = { kind: 'hint' | 'guess'; text: string } | { kind: 'vote'; target: Role } | { kind: 'resign' };
type Topic = 'food' | 'animals' | 'places' | 'objects';
type Side = 'citizens' | 'liar';
type Phase = 'hint' | 'vote' | 'guess' | 'done';
type Card = { side: 'liar' } | { side: 'citizens'; word: string };
type Hint = { player: Role; text?: string };
type Tally = { player: Role; votes: number };
type Result = { winner: Side; liar: Role; word: string; guess?: string };
export type LiarView = {
  players: Role[]; retired: Role[]; topic: Topic; hints: Hint[]; voted: Role[];
  phase: Phase; revision: number; deadline: number; card?: Card; selected?: Role;
  accused?: Role; tally?: Tally[]; result?: Result;
};
export type LiarRound = LiarView & { secret: { liar: Role; word: string; votes: Partial<Record<Role, Role>> } };

const topics: Record<Topic, readonly (readonly [string, string])[]> = {
  food: [['떡볶이', 'spicy rice cakes'], ['케이크', 'cake'], ['만두', 'dumplings'], ['팝콘', 'popcorn'],
    ['우동', 'udon'], ['초콜릿', 'chocolate'], ['감자튀김', 'french fries'], ['피자', 'pizza']],
  animals: [['수달', 'otter'], ['코끼리', 'elephant'], ['돌고래', 'dolphin'], ['고슴도치', 'hedgehog'],
    ['오리', 'duck'], ['문어', 'octopus'], ['올빼미', 'owl'], ['낙타', 'camel']],
  places: [['도서관', 'library'], ['온천', 'hot spring'], ['공항', 'airport'], ['등대', 'lighthouse'],
    ['수족관', 'aquarium'], ['박물관', 'museum'], ['우체국', 'post office'], ['영화관', 'cinema']],
  objects: [['손전등', 'flashlight'], ['빗', 'comb'], ['자석', 'magnet'], ['가위', 'scissors'],
    ['거울', 'mirror'], ['우산', 'umbrella'], ['주사위', 'dice'], ['칫솔', 'toothbrush']],
};

export function readLiarSettings(raw: unknown): LiarSettings | undefined {
  if (!raw || typeof raw !== 'object' || !('language' in raw) || !('seconds' in raw)) return;
  const seconds = liarHintTimes.find(time => time === raw.seconds);
  if (seconds && (raw.language === 'ko' || raw.language === 'en')) return { language: raw.language, seconds };
}

export function makeLiarRound(roles: Role[], language: LiarSettings['language'], random = Math.random, previousWord?: string): LiarRound {
  const categories = Object.keys(topics) as Topic[];
  const topic = categories[Math.floor(random() * categories.length)];
  const words = topics[topic].map(pair => pair[language === 'ko' ? 0 : 1]).filter(word => word !== previousWord);
  const word = words[Math.floor(random() * words.length)];
  const liar = roles[Math.floor(random() * roles.length)];
  const start = Math.floor(random() * roles.length);
  return {
    players: [...roles.slice(start), ...roles.slice(0, start)], topic, retired: [], hints: [], voted: [],
    phase: 'hint', revision: 0, deadline: 0, secret: { liar, word, votes: {} },
  };
}

export function isLiarRound(round: LiarView): round is LiarRound { return 'secret' in round; }
export function liarSpeaker(round: LiarView) {
  return round.players.find(player => !round.retired.includes(player) && !round.hints.some(hint => hint.player === player));
}

export function visibleLiar({ secret, ...round }: LiarRound, viewer: Role): LiarView {
  const card = !round.players.includes(viewer) ? undefined : viewer === secret.liar
    ? { side: 'liar' } as const : { side: 'citizens', word: secret.word } as const;
  return { ...round, card, selected: secret.votes[viewer] };
}

const participants = (round: LiarView) => round.players.filter(player => !round.retired.includes(player));
const clock = (now: number, seconds: number) => now + seconds * 1000;
const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '');

function finish(round: LiarRound, winner: Side, guess?: string): LiarRound {
  const { liar, word } = round.secret;
  return { ...round, phase: 'done', deadline: 0, result: { winner, liar, word, guess } };
}

function afterHint(round: LiarRound, settings: LiarSettings, now: number): LiarRound {
  return liarSpeaker(round) ? { ...round, deadline: clock(now, settings.seconds) }
    : { ...round, phase: 'vote', deadline: clock(now, liarVoteSeconds) };
}

function afterVote(round: LiarRound, now: number): LiarRound {
  const active = participants(round);
  const votes = active.flatMap(player => {
    const target = round.secret.votes[player];
    return target && active.includes(target) ? [target] : [];
  });
  const tally = active.map(player => ({ player, votes: votes.filter(target => target === player).length }));
  const highest = Math.max(...tally.map(item => item.votes));
  const tied = tally.filter(item => item.votes === highest);
  const accused = highest && tied.length === 1 ? tied[0].player : undefined;
  const next = { ...round, tally, accused };
  return accused === round.secret.liar ? { ...next, phase: 'guess', deadline: clock(now, liarGuessSeconds) } : finish(next, 'liar');
}

export function liarOutcome(round: LiarView, player: Role) {
  if (!round.result) return;
  const side = player === round.result.liar ? 'liar' : 'citizens';
  return !round.retired.includes(player) && side === round.result.winner ? 'win' : 'loss';
}

export function advanceLiar(round: LiarRound, settings: LiarSettings, now: number): LiarRound | undefined {
  if (round.phase === 'done' || !round.deadline || now < round.deadline) return;
  const next = { ...round, revision: round.revision + 1 };
  if (next.phase === 'vote') return afterVote(next, now);
  if (next.phase === 'guess') return finish(next, 'citizens');
  const player = liarSpeaker(next);
  if (player) next.hints = [...next.hints, { player }];
  return afterHint(next, settings, now);
}

function readText(raw: unknown, max: number) {
  if (typeof raw !== 'string' || raw.length > max || /[\p{Cc}\p{Cf}]/u.test(raw)) return;
  return raw.trim().normalize('NFC') || undefined;
}

export function applyLiarAction(round: LiarRound, actor: Role, raw: unknown, settings: LiarSettings, now: number): LiarRound | undefined {
  if (!raw || typeof raw !== 'object' || !('kind' in raw) || round.phase === 'done' || !round.deadline || now >= round.deadline
    || !participants(round).includes(actor)) return;
  const next = { ...round, revision: round.revision + 1 };
  if (raw.kind === 'resign') {
    next.retired = [...round.retired, actor];
    if (actor === round.secret.liar) return finish(next, 'citizens');
    if (participants(next).length === 1) return finish(next, 'liar');
    if (round.phase === 'hint' && liarSpeaker(round) === actor) return afterHint(next, settings, now);
    if (round.phase === 'vote' && participants(next).every(player => round.voted.includes(player))) return afterVote(next, now);
    return next;
  }
  if (round.phase === 'hint' && actor === liarSpeaker(round) && raw.kind === 'hint' && 'text' in raw) {
    const text = readText(raw.text, liarHintLimit);
    if (text) return afterHint({ ...next, hints: [...round.hints, { player: actor, text }] }, settings, now);
  }
  if (round.phase === 'vote' && raw.kind === 'vote' && 'target' in raw && isRoomRole(raw.target)
    && raw.target !== actor && participants(round).includes(raw.target) && !round.voted.includes(actor)) {
    next.secret = { ...round.secret, votes: { ...round.secret.votes, [actor]: raw.target } };
    next.voted = [...round.voted, actor];
    return participants(next).every(player => next.voted.includes(player)) ? afterVote(next, now) : next;
  }
  if (round.phase === 'guess' && actor === round.secret.liar && raw.kind === 'guess' && 'text' in raw) {
    const guess = readText(raw.text, 64);
    if (guess && normalize(guess)) return finish(next, normalize(guess) === normalize(round.secret.word) ? 'liar' : 'citizens', guess);
  }
}

const integer = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

export function readLiarView(raw: unknown): LiarView | undefined {
  if (!raw || typeof raw !== 'object') return;
  const { players, retired, voted, phase, topic, hints, revision, deadline, accused, tally, card, selected, result } = raw as LiarView;
  const isPlayer = (value: unknown): value is Role => isRoomRole(value) && players.includes(value);
  const unique = (list: unknown): list is Role[] => Array.isArray(list) && list.length <= players.length
    && list.every(isPlayer) && new Set(list).size === list.length;
  if (!Array.isArray(players) || players.length < 3 || players.length > 4 || !players.includes('host') || !unique(players)
    || !unique(retired) || !unique(voted) || typeof topic !== 'string' || !Object.hasOwn(topics, topic)
    || !integer(revision, Number.MAX_SAFE_INTEGER) || !integer(deadline, Number.MAX_SAFE_INTEGER)
    || (phase !== 'hint' && phase !== 'vote' && phase !== 'guess' && phase !== 'done')) return;
  if (!Array.isArray(hints) || hints.length > players.length || !hints.every(hint => hint && isPlayer(hint.player)
    && (hint.text === undefined || readText(hint.text, liarHintLimit))) || new Set(hints.map(hint => hint.player)).size !== hints.length) return;
  if (accused !== undefined && !isPlayer(accused) || selected !== undefined && !isPlayer(selected)
    || tally !== undefined && (!Array.isArray(tally) || tally.length > players.length || !tally.every(item => item && isPlayer(item.player) && integer(item.votes, 4)))
    || phase === 'guess' && (!accused || !tally)
    || card !== undefined && (card?.side !== 'liar' && (card?.side !== 'citizens' || !readText(card.word, 64)))) return;
  if (phase === 'done' ? deadline !== 0 || !result || !isPlayer(result.liar) || !readText(result.word, 64)
    || result.winner !== 'liar' && result.winner !== 'citizens' || result.guess !== undefined && !readText(result.guess, 64) : result !== undefined) return;
  return {
    players, retired, voted, phase, topic, hints: hints.map(({ player, text }) => ({ player, text })), revision, deadline, accused, selected,
    tally: tally?.map(({ player, votes }) => ({ player, votes })),
    card: card?.side === 'liar' ? { side: 'liar' } : card ? { side: 'citizens', word: card.word } : undefined,
    result: result && { winner: result.winner, liar: result.liar, word: result.word, guess: result.guess },
  };
}
