import { isAvatarId, profileIdPattern, readName } from './profile.ts';
import type { AvatarId } from './profile.ts';
import { isRoomRole } from './rooms.ts';
import type { Role } from './rooms.ts';

export const defaultEmojiChoices = {
  smile: '😄', laugh: '😂', tease: '😛', surprise: '😮', astonished: '😲', thinking: '🤔', sad: '😢', angry: '😡', anger: '😤', slap: '🫲',
  hearts: '😍', clap: '👏', thumbsUp: '👍', thumbsDown: '👎', handshake: '🤝', fire: '🔥', celebrate: '🎉',
} as const;
export const emojiChoices = {
  ...defaultEmojiChoices,
  grin: '😁', wink: '😉', sweatSmile: '😅', victory: '✌️', salute: '🫡', hug: '🤗', hot: '🥵', cold: '🥶',
  sunglasses: '😎', mindBlown: '🤯', scream: '😱', cry: '😭', worried: '😟', dizzy: '😵‍💫', sleeping: '😴',
  upsideDown: '🙃', shush: '🤫', eyes: '👀', facepalm: '🤦', skull: '💀', ghost: '👻',
  robot: '🤖', alien: '👽', cat: '😺', dog: '🐶', fox: '🦊', frog: '🐸', panda: '🐼', penguin: '🐧',
  heart: '❤️', brokenHeart: '💔', sparkle: '✨', star: '⭐', trophy: '🏆', medal: '🥇', crown: '👑',
  lightning: '⚡', rocket: '🚀', rainbow: '🌈', snowflake: '❄️', dice: '🎲', puzzle: '🧩',
  flex: '💪', raisedHands: '🙌', fistBump: '👊', pray: '🙏', ok: '👌',
  coffee: '☕', pizza: '🍕', popcorn: '🍿', musicalNote: '🎵', gift: '🎁', hourglass: '⌛',
} as const;
export type Emoji = keyof typeof emojiChoices;
export type DefaultEmoji = keyof typeof defaultEmojiChoices;
export const emojiIds = Object.keys(emojiChoices) as Emoji[];
export const defaultEmojiIds = Object.keys(defaultEmojiChoices) as DefaultEmoji[];
export const reactionCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type ReactionCorner = typeof reactionCorners[number];
export type ReactionSender = { name: string; avatar: AvatarId };
export type ReactionContent = { emoji: Emoji; text?: never } | { text: string; emoji?: never };
export type Reaction = ReactionContent & { id: string; corner: ReactionCorner; role?: Role; sender?: ReactionSender };
export type TimedReaction = Reaction & { expiresAt: number };
export const reactionDuration = 3_000;
export const recentEmojiLimit = 5;
export const reactionTextLimit = 64;

export function readReactionText(value: unknown) {
  if (typeof value !== 'string' || value.length > reactionTextLimit || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) return;
  return value.trim() || undefined;
}

export function isEmoji(value: unknown): value is Emoji {
  return typeof value === 'string' && Object.hasOwn(emojiChoices, value);
}

export function recentEmojis(values: readonly unknown[]): Emoji[] {
  return [...new Set(values.filter(isEmoji))].slice(0, recentEmojiLimit);
}

export function assignReactionSlots<Player>(players: readonly Player[]) {
  return new Map(players.map((player, index) => [player, reactionCorners[index % reactionCorners.length]]));
}

export function showReaction(previous: readonly TimedReaction[], reaction: Reaction, now: number): TimedReaction[] {
  return [...previous.filter(entry => entry.corner !== reaction.corner && entry.expiresAt > now), { ...reaction, expiresAt: now + reactionDuration }];
}

export function readRoomReaction(value: unknown): Reaction | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, emoji, text, corner, role, sender } = value as Partial<Reaction>;
  if (typeof id !== 'string' || !profileIdPattern.test(id) || !reactionCorners.includes(corner as ReactionCorner)
    || !isRoomRole(role)) return;
  const message = readReactionText(text);
  const content = text === undefined && isEmoji(emoji) ? { emoji }
    : emoji === undefined && message ? { text: message } : undefined;
  if (!content) return;
  const reaction = { ...content, id, corner: corner as ReactionCorner, role };
  if (sender === undefined) return reaction;
  if (!sender || typeof sender !== 'object' || !isAvatarId(sender.avatar)) return;
  const name = readName(sender.name);
  if (name) return { ...reaction, sender: { name, avatar: sender.avatar } };
}
