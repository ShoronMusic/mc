import assert from 'node:assert/strict';
import {
  attachObjectionsToAtPairs,
  buildAtChatPairsFromLogRows,
  isAtUserMessageBody,
  normalizeChatBodyForMatch,
} from './room-chat-at-qa-from-log';

const iso = (s: string) => `2026-04-18T${s}Z`;

assert.equal(isAtUserMessageBody('@foo'), true);
assert.equal(isAtUserMessageBody('＠foo'), true);
assert.equal(isAtUserMessageBody('hello'), false);

const rows = [
  { created_at: iso('10:00:00'), message_type: 'user', display_name: 'A', body: '@Q1' },
  { created_at: iso('10:00:01'), message_type: 'system', display_name: 'システム', body: '…' },
  { created_at: iso('10:00:02'), message_type: 'ai', display_name: 'AI', body: 'A1' },
  { created_at: iso('10:01:00'), message_type: 'user', display_name: 'B', body: '@Q2' },
  { created_at: iso('10:01:05'), message_type: 'ai', display_name: 'AI', body: 'A2' },
];

const pairs = buildAtChatPairsFromLogRows(rows);
assert.equal(pairs.length, 2);
assert.equal(pairs[0]!.userBody, '@Q1');
assert.equal(pairs[0]!.aiBody, 'A1');
assert.equal(pairs[1]!.userBody, '@Q2');
assert.equal(pairs[1]!.aiBody, 'A2');

const obj = {
  id: 'obj-1',
  created_at: iso('10:02:00'),
  reason_keys: ['not_music'],
  free_comment: 'test',
  conversation_snapshot: [
    { messageType: 'user', body: '＠Q1', createdAt: iso('10:00:00') },
    { messageType: 'system', body: 'warn', createdAt: iso('10:00:01') },
  ],
};
attachObjectionsToAtPairs(pairs, [obj]);
assert.deepEqual(pairs[0]!.objectionIds, ['obj-1']);
assert.deepEqual(pairs[1]!.objectionIds, []);

assert.equal(normalizeChatBodyForMatch(' ＠Q1 '), normalizeChatBodyForMatch('@Q1'));

console.log('room-chat-at-qa-from-log unit tests: OK');
