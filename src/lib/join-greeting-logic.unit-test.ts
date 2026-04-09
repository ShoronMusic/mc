import assert from 'node:assert/strict';
import {
  computeJoinGreetingVariant,
  JOIN_GREETING_ABSENT_MIN_DAYS,
  JOIN_GREETING_FREQUENT_MIN_JOINS,
  JOIN_GREETING_FREQUENT_WINDOW_MS,
  lineFromJoinGreetingApi,
  type JoinGreetingRow,
} from './join-greeting-logic';

const day = 24 * 60 * 60 * 1000;

assert.equal(computeJoinGreetingVariant([]).kind, 'none');

assert.equal(computeJoinGreetingVariant([{ joined_at: new Date().toISOString(), left_at: null, room_id: 'a' }]).kind, 'first_time');

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const frequentRows = Array.from({ length: JOIN_GREETING_FREQUENT_MIN_JOINS }, (_, i) => ({
  joined_at: iso(now - i * day),
  left_at: iso(now - i * day + 3600_000),
  room_id: 'r',
}));
assert.equal(computeJoinGreetingVariant(frequentRows).kind, 'frequent');

const absentRows = [
  {
    joined_at: iso(now - 20 * day),
    left_at: iso(now - 20 * day + 3600_000),
    room_id: 'r',
  },
  {
    joined_at: iso(now - 1 * day),
    left_at: null,
    room_id: 'r',
  },
];
const absent = computeJoinGreetingVariant(absentRows);
assert.equal(absent.kind, 'absent');
if (absent.kind === 'absent') {
  assert.ok(absent.days >= JOIN_GREETING_ABSENT_MIN_DAYS);
}

const staleForFrequent: JoinGreetingRow[] = Array.from({ length: JOIN_GREETING_FREQUENT_MIN_JOINS - 1 }, (_, i) => ({
  joined_at: iso(now - JOIN_GREETING_FREQUENT_WINDOW_MS - i * day),
  left_at: iso(now - JOIN_GREETING_FREQUENT_WINDOW_MS - i * day + 1000),
  room_id: 'r',
}));
staleForFrequent.push({
  joined_at: iso(now - 1 * day),
  left_at: null,
  room_id: 'r',
});
assert.notEqual(computeJoinGreetingVariant(staleForFrequent).kind, 'frequent');

assert.equal(lineFromJoinGreetingApi('太郎', 'こんにちは', null), null);
assert.equal(lineFromJoinGreetingApi('太郎', 'こんにちは', { variant: 'none' }), null);
assert.ok(
  lineFromJoinGreetingApi('太郎', 'こんにちは', { variant: 'first_time' })?.includes('はじめまして'),
);
assert.ok(
  lineFromJoinGreetingApi('太郎', 'こんにちは', { variant: 'frequent' })?.includes('いつもご参加'),
);
assert.equal(
  lineFromJoinGreetingApi('太郎', 'こんにちは', {
    variant: 'absent',
    daysSinceLastVisit: 3,
  }),
  '太郎さん、3日ぶりですね！今日もよろしくお願いします。',
);
assert.equal(
  lineFromJoinGreetingApi('太郎', 'こんにちは', {
    variant: 'absent',
    daysSinceLastVisit: 1,
  }),
  null,
);

console.log('join-greeting-logic unit tests: OK');
