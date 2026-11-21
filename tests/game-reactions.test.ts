import assert from 'node:assert/strict';
import test from 'node:test';
import { assignReactionSlots, defaultEmojiIds, reactionCorners, reactionDuration, readRoomReaction, recentEmojis, showReaction } from '../packages/protocol/reactions.ts';
import type { Reaction } from '../packages/protocol/reactions.ts';
import { emojiName, searchEmojis } from '../apps/web/src/platform/emoji-search.ts';
import { playReactionCue } from '../apps/web/src/platform/reaction-sounds.ts';

const reaction = { id: '12345678-1234-1234-1234-123456789001', emoji: 'smile', role: 'guest', corner: 'top-left', sender: { name: 'Jun', avatar: 'mint' } } satisfies Reaction;

test('fixed slots are distinct for four players and evenly shared for larger rounds', () => {
  assert.deepEqual([...assignReactionSlots(['host', 'guest', 'guest2', 'guest3']).values()], reactionCorners);
  for (const count of [5, 7, 8, 10, 21]) {
    const slots = assignReactionSlots(Array.from({ length: count }, (_, index) => index));
    assert.equal(slots.size, count);
    assert.equal(slots.get(4), slots.get(0));
    const sizes = reactionCorners.map(corner => [...slots.values()].filter(slot => slot === corner).length);
    assert(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});

test('a new reaction replaces only its own slot and begins a fresh three-second display', () => {
  const other = { ...reaction, corner: 'bottom-left' as const };
  const visible = showReaction(showReaction([], reaction, 10), other, 20);
  const replacement = { ...reaction, emoji: 'laugh' as const };
  assert.deepEqual(showReaction(visible, replacement, 100), [
    { ...other, expiresAt: 20 + reactionDuration }, { ...replacement, expiresAt: 100 + reactionDuration },
  ]);
  assert.equal(showReaction(visible, replacement, 20 + reactionDuration).length, 1);
});

test('all default emojis play uniquely composed short reaction sounds', () => {
  const signatures = defaultEmojiIds.map(emoji => {
    const events: unknown[] = [];
    playReactionCue(emoji, (...args) => events.push(args), (...args) => events.push(args));
    assert(events.length > 1, emoji);
    return JSON.stringify(events);
  });
  assert.equal(new Set(signatures).size, defaultEmojiIds.length);
});

test('the slap schedules three distinct, closely spaced impacts', () => {
  const notes: number[] = [];
  const bursts: { at: number; length: number }[] = [];
  playReactionCue('slap', at => notes.push(at), (at, length) => bursts.push({ at, length }));
  assert.equal(bursts.length, 3);
  assert.deepEqual(notes, bursts.map(({ at }) => at));
  for (let index = 1; index < bursts.length; index++) {
    const previous = bursts[index - 1];
    const gap = bursts[index].at - previous.at;
    assert(gap >= .05 && gap <= .09);
    assert(previous.length < gap);
  }
});

test('the new expressions are built in and round-trip as room reactions', () => {
  for (const emoji of ['angry', 'slap', 'thumbsDown', 'tease', 'astonished'] as const) {
    assert(defaultEmojiIds.includes(emoji));
    assert.deepEqual(readRoomReaction({ ...reaction, emoji }), { ...reaction, emoji });
  }
  assert(searchEmojis('찰싹').includes('slap'));
  assert(searchEmojis('boo').includes('thumbsDown'));
  assert(searchEmojis('메롱').includes('tease'));
});

test('recent emojis are unique validated picks ordered by the latest selection', () => {
  assert.deepEqual(recentEmojis(['fire', 'smile', 'fire', 'constructor', 'clap', 'surprise', 'sad', 'laugh']),
    ['fire', 'smile', 'clap', 'surprise', 'sad']);
});

test('room reactions require a known emoji, corner, seat and valid public profile fields', () => {
  assert.deepEqual(readRoomReaction(reaction), reaction);
  assert.equal(readRoomReaction({ ...reaction, emoji: 'unknown' }), undefined);
  assert.equal(readRoomReaction({ ...reaction, corner: 'middle' }), undefined);
  assert.equal(readRoomReaction({ ...reaction, role: 'spectator' }), undefined);
  assert.equal(readRoomReaction({ ...reaction, sender: { ...reaction.sender, avatar: '../not-an-avatar' } }), undefined);
});

test('emoji search finds additions by Korean or English keywords and the glyph itself', () => {
  assert.deepEqual(searchEmojis('  트로피  '), ['trophy']);
  assert.deepEqual(searchEmojis('GOLD MEDAL'), ['medal']);
  assert.deepEqual(searchEmojis('🐼'), ['panda']);
  assert.deepEqual(searchEmojis('unknown search phrase'), []);
  assert.equal(emojiName('thumbsUp', 'en'), 'Thumbs up');
  assert.equal(emojiName('thumbsUp', 'ko'), '엄지 척');
});
