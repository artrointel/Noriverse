import assert from 'node:assert/strict';
import test from 'node:test';
import { freeReactionCorner, reactionCorners, reactionDuration, readRoomReaction, recentEmojis, showReaction } from '../packages/protocol/reactions.ts';
import type { Reaction, TimedReaction } from '../packages/protocol/reactions.ts';

const reaction = { id: '12345678-1234-1234-1234-123456789001', emoji: 'smile', role: 'guest', corner: 'top-left', sender: { name: 'Jun', avatar: 'mint' } } satisfies Reaction;

test('reactions occupy separate corners until the three-second window expires', () => {
  let visible: TimedReaction[] = [];
  for (const corner of reactionCorners) {
    assert.equal(freeReactionCorner(visible, 10, () => 0), corner);
    visible = showReaction(visible, { ...reaction, corner }, 10);
  }
  assert.equal(freeReactionCorner(visible, 10 + reactionDuration - 1), undefined);
  assert.equal(freeReactionCorner(visible, 10 + reactionDuration, () => .99), 'bottom-right');
  assert.equal(showReaction(visible, reaction, 10 + reactionDuration).length, 1);
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
