import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsPerPage, pageNumbers } from '../apps/web/src/platform/library-pagination.ts';

test('library pages use complete rows and retain a row on short screens', () => {
  assert.equal(cardsPerPage(5, 180, 14, 900), 15);
  assert.equal(cardsPerPage(2, 120, 12, 440), 2);
  assert.equal(cardsPerPage(1, 220, 14, 320), 1);
});

test('small page counts are fully shown and long lists keep the current page reachable', () => {
  assert.deepEqual(pageNumbers(2, 3), [1, 2, 3]);
  assert.deepEqual(pageNumbers(1, 12), [1, 2, 3, 4, 5, 'gap', 12]);
  assert.deepEqual(pageNumbers(6, 12), [1, 'gap', 5, 6, 7, 'gap', 12]);
  assert.deepEqual(pageNumbers(12, 12), [1, 'gap', 8, 9, 10, 11, 12]);
});
