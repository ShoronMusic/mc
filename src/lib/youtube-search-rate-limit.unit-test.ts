/**
 * `npx tsx src/lib/youtube-search-rate-limit.unit-test.ts`
 */
import assert from 'node:assert/strict';
import { checkYouTubeSearchRateLimit } from './youtube-search-rate-limit';

const orig = process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE;
const origGuest = process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE_GUEST;
process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE = '3';
process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE_GUEST = '2';

const g = globalThis as unknown as { __ytSearchRateTimestamps?: Map<string, number[]> };
g.__ytSearchRateTimestamps = new Map();

assert.equal(checkYouTubeSearchRateLimit('9.9.9.1').ok, true);
assert.equal(checkYouTubeSearchRateLimit('9.9.9.1').ok, true);
assert.equal(checkYouTubeSearchRateLimit('9.9.9.1').ok, true);
const fourth = checkYouTubeSearchRateLimit('9.9.9.1');
assert.equal(fourth.ok, false);
if (fourth.ok) throw new Error('expected rate limit');
assert.equal(checkYouTubeSearchRateLimit('9.9.9.2', true).ok, true);
assert.equal(checkYouTubeSearchRateLimit('9.9.9.2', true).ok, true);
assert.equal(checkYouTubeSearchRateLimit('9.9.9.2', true).ok, false);

process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE = orig;
process.env.YOUTUBE_SEARCH_RATE_LIMIT_PER_MINUTE_GUEST = origGuest;
console.log('youtube-search-rate-limit unit tests: OK');
