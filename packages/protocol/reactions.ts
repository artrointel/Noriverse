import { avatarIds, profileIdPattern, readName } from './profile.ts';
import type { AvatarId } from './profile.ts';
import { isRoomRole } from './rooms.ts';
import type { Role } from './rooms.ts';

export const emojiChoices = {
  smile: '😄', laugh: '😂', surprise: '😮', thinking: '🤔', sad: '😢', anger: '😤',
  hearts: '😍', clap: '👏', thumbsUp: '👍', handshake: '🤝', fire: '🔥', celebrate: '🎉',
} as const;
export type Emoji = keyof typeof emojiChoices;
export const emojiIds = Object.keys(emojiChoices) as Emoji[];
export const reactionCorners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type ReactionCorner = typeof reactionCorners[number];
export type ReactionSender = { name: string; avatar: AvatarId };
export type Reaction = { id: string; emoji: Emoji; corner: ReactionCorner; role?: Role; sender?: ReactionSender };
export type TimedReaction = Reaction & { expiresAt: number };
export const reactionDuration = 3_000;
export const recentEmojiLimit = 5;

export function isEmoji(value: unknown): value is Emoji {
  return typeof value === 'string' && Object.hasOwn(emojiChoices, value);
}

export function recentEmojis(values: readonly unknown[]): Emoji[] {
  return [...new Set(values.filter(isEmoji))].slice(0, recentEmojiLimit);
}

export function freeReactionCorner(reactions: readonly TimedReaction[], now: number, random = Math.random) {
  const available = reactionCorners.filter(corner => !reactions.some(reaction => reaction.corner === corner && reaction.expiresAt > now));
  return available[Math.floor(random() * available.length)];
}

export function showReaction(previous: readonly TimedReaction[], reaction: Reaction, now: number): TimedReaction[] {
  return [...previous.filter(entry => entry.corner !== reaction.corner && entry.expiresAt > now), { ...reaction, expiresAt: now + reactionDuration }];
}

export function readRoomReaction(value: unknown): Reaction | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, emoji, corner, role, sender } = value as Partial<Reaction>;
  if (typeof id !== 'string' || !profileIdPattern.test(id) || !isEmoji(emoji) || !reactionCorners.includes(corner as ReactionCorner)
    || !isRoomRole(role)) return;
  if (sender === undefined) return { id, emoji, corner: corner as ReactionCorner, role };
  if (!sender || typeof sender !== 'object' || !avatarIds.includes(sender.avatar)) return;
  const name = readName(sender.name);
  if (name) return { id, emoji, corner: corner as ReactionCorner, role, sender: { name, avatar: sender.avatar } };
}
