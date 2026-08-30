import assert from 'node:assert';
import {
  DEFAULT_STALE_LIVE_GATHERING_MAX_AGE_MS,
  isStartedAtOlderThanMaxAge,
} from './stale-live-gathering';

const now = Date.parse('2026-07-05T00:00:00Z');
assert.strictEqual(
  isStartedAtOlderThanMaxAge('2026-04-02T00:00:00Z', DEFAULT_STALE_LIVE_GATHERING_MAX_AGE_MS, now),
  true,
);
assert.strictEqual(
  isStartedAtOlderThanMaxAge('2026-07-04T12:00:00Z', DEFAULT_STALE_LIVE_GATHERING_MAX_AGE_MS, now),
  false,
);
assert.strictEqual(isStartedAtOlderThanMaxAge(null, DEFAULT_STALE_LIVE_GATHERING_MAX_AGE_MS, now), false);

/** 在室0・watch 無しでも 30分超なら空会として終了してよい */
const empty30m = 30 * 60 * 1000;
assert.strictEqual(isStartedAtOlderThanMaxAge('2026-07-04T23:20:00Z', empty30m, now), true);
assert.strictEqual(isStartedAtOlderThanMaxAge('2026-07-04T23:40:00Z', empty30m, now), false);

console.log('stale-live-gathering.unit-test.ts: ok');
