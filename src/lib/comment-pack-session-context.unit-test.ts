import assert from 'node:assert/strict';
import {
  buildCommentPackSessionContextBlock,
  normalizeCommentPackRecentMessages,
} from './comment-pack-session-context';

assert.deepEqual(normalizeCommentPackRecentMessages(null), []);
assert.deepEqual(normalizeCommentPackRecentMessages('x'), []);
assert.deepEqual(normalizeCommentPackRecentMessages([]), []);

const mixed = normalizeCommentPackRecentMessages([
  { displayName: 'A', body: 'hi', messageType: 'user' },
  { body: 'sys', messageType: 'system' },
  { displayName: 'AI', body: 'yo', messageType: 'ai' },
]);
assert.equal(mixed.length, 2);
assert.equal(mixed[0]?.body, 'hi');
assert.equal(mixed[1]?.messageType, 'ai');

const block = buildCommentPackSessionContextBlock([
  { displayName: 'ろん', body: 'Hello', messageType: 'user' },
  { body: 'Yes', messageType: 'ai' },
]);
assert.ok(block.includes('ろん:'));
assert.ok(block.includes('AI:'));

console.log('comment-pack-session-context unit tests: OK');
