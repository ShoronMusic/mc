/**
 * `npx tsx src/lib/youtube-published-at-date.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { dateOnlyFromYoutubePublishedAt } from '@/lib/youtube-published-at-date';

assert.equal(dateOnlyFromYoutubePublishedAt('2016-03-11T07:00:00Z'), '2016-03-11');
assert.equal(dateOnlyFromYoutubePublishedAt('2016-03-11'), '2016-03-11');
assert.equal(dateOnlyFromYoutubePublishedAt(''), null);
assert.equal(dateOnlyFromYoutubePublishedAt(null), null);
assert.equal(dateOnlyFromYoutubePublishedAt('not-a-date'), null);

console.log('youtube-published-at-date.unit-test: ok');
