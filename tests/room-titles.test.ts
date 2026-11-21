import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readRoomTitle, roomTitleMaxLength, roomTitleOptions } from '../packages/protocol/room-titles.ts';

test('five distinct room title templates use the profile name in each language', () => {
  const name = '오웬';
  for (const lang of ['ko-KR', 'en-US']) {
    const titles = roomTitleOptions(name, lang);
    assert.equal(new Set(titles).size, 5);
    assert(titles.every(title => title.includes(name) && readRoomTitle(title) === title));
    assert(roomTitleOptions('x'.repeat(24), lang).every(title => readRoomTitle(title)));
  }
  assert(roomTitleOptions(undefined, 'ko')[0].includes('게스트'));
});

test('room titles normalize a single line and reject blank or overlong values', () => {
  assert.equal(readRoomTitle('  카페 👩‍🚀  '), '카페 👩‍🚀');
  assert.equal(readRoomTitle('  CAFE\u0301  '), 'CAFÉ');
  for (const invalid of [' ', 'title\nline', 'title\u202e', 'x'.repeat(roomTitleMaxLength + 1), null]) {
    assert.equal(readRoomTitle(invalid), undefined);
  }
});
