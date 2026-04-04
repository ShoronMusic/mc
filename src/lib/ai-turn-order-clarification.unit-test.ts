import assert from 'node:assert/strict';
import {
  buildTurnOrderClarificationReply,
  isAiTurnOrderClarificationText,
} from './ai-turn-order-clarification';

assert.equal(isAiTurnOrderClarificationText('次は 小龍さん の番ですよ'), true);
assert.equal(isAiTurnOrderClarificationText('@ 次は 小龍さん の番ですよ'), true, '先頭 @ は許容');
assert.equal(isAiTurnOrderClarificationText('順番がおかしいです'), true);
assert.equal(isAiTurnOrderClarificationText('選曲の順が違います'), true);
assert.equal(isAiTurnOrderClarificationText('今日の天気は？'), false);

const reply = buildTurnOrderClarificationReply(
  [
    { clientId: 'a', displayName: '小龍' },
    { clientId: 'b', displayName: 'ろん' },
    { clientId: 'c', displayName: 'マエ' },
  ],
  'a',
);
assert.ok(reply.includes('[1] 小龍さん'));
assert.ok(reply.includes('小龍さんです'));

console.log('ai-turn-order-clarification unit tests: OK');
