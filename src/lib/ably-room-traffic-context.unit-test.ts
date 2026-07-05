import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPauseAblyBackgroundTraffic } from './ably-room-traffic-context';

test('shouldPauseAblyBackgroundTraffic: active foreground', () => {
  assert.equal(
    shouldPauseAblyBackgroundTraffic({
      documentHidden: false,
      backgroundSuspended: false,
      reduceTrafficWhenHidden: true,
    }),
    false,
  );
});

test('shouldPauseAblyBackgroundTraffic: hidden with reduce enabled', () => {
  assert.equal(
    shouldPauseAblyBackgroundTraffic({
      documentHidden: true,
      backgroundSuspended: false,
      reduceTrafficWhenHidden: true,
    }),
    true,
  );
});

test('shouldPauseAblyBackgroundTraffic: hidden but reduce disabled', () => {
  assert.equal(
    shouldPauseAblyBackgroundTraffic({
      documentHidden: true,
      backgroundSuspended: false,
      reduceTrafficWhenHidden: false,
    }),
    false,
  );
});

test('shouldPauseAblyBackgroundTraffic: background suspended', () => {
  assert.equal(
    shouldPauseAblyBackgroundTraffic({
      documentHidden: false,
      backgroundSuspended: true,
      reduceTrafficWhenHidden: false,
    }),
    true,
  );
});
