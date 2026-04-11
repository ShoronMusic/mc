import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMusic8ModeratorIntroPrefix } from '@/lib/music8-moderator-chat-prefix';

test('formatMusic8ModeratorIntroPrefix: non-moderator', () => {
  assert.equal(
    formatMusic8ModeratorIntroPrefix(false, { artistJsonHit: true, songJsonHit: true }),
    '',
  );
});

test('formatMusic8ModeratorIntroPrefix: both hits', () => {
  const s = formatMusic8ModeratorIntroPrefix(true, {
    artistJsonHit: true,
    songJsonHit: true,
  });
  assert.match(s, /アーチストJSON_Hit/);
  assert.match(s, /ソングJSON_Hit/);
  assert.match(s, /^\[Music8 /);
});

test('formatMusic8ModeratorIntroPrefix: song only', () => {
  const s = formatMusic8ModeratorIntroPrefix(true, {
    artistJsonHit: false,
    songJsonHit: true,
  });
  assert.match(s, /ソングJSON_Hit/);
  assert.doesNotMatch(s, /アーチストJSON_Hit/);
});

test('formatMusic8ModeratorIntroPrefix: no hits', () => {
  assert.equal(
    formatMusic8ModeratorIntroPrefix(true, { artistJsonHit: false, songJsonHit: false }),
    '',
  );
});
