import assert from 'node:assert/strict';
import {
  deltaLabelForCreditTx,
  deltaLabelForTrialGrant,
  labelForAiUsageLedgerKind,
  mergeAiUsageLedgerItems,
  type UserAiUsageLedgerItem,
} from '@/lib/user-ai-usage-ledger';

assert.equal(labelForAiUsageLedgerKind('trial_grant'), '初期お試し付与');
assert.equal(labelForAiUsageLedgerKind('consume_song'), 'クレジット・AI付き選曲');
assert.equal(deltaLabelForTrialGrant(20, 5), '+20曲 · +5回@');
assert.equal(deltaLabelForCreditTx('consume_song', -1), '−1クレジット');
assert.equal(deltaLabelForCreditTx('consume_at_question', -0.5), '−0.5クレジット');
assert.equal(deltaLabelForCreditTx('grant_purchase', 40), '+40クレジット');

const merged = mergeAiUsageLedgerItems(
  [
    {
      id: 'a',
      at: '2026-07-01T10:00:00.000Z',
      kind: 'trial_song',
      label: 'x',
      deltaLabel: '−1曲',
      balanceAfterLabel: null,
      roomId: null,
      videoId: null,
      note: null,
      source: 'trial',
    },
    {
      id: 'b',
      at: '2026-07-02T10:00:00.000Z',
      kind: 'consume_song',
      label: 'y',
      deltaLabel: '−1クレジット',
      balanceAfterLabel: '残高 9',
      roomId: null,
      videoId: null,
      note: null,
      source: 'credits',
    },
  ] satisfies UserAiUsageLedgerItem[],
  10,
);
assert.equal(merged[0]?.id, 'b');
assert.equal(merged[1]?.id, 'a');

console.log('user-ai-usage-ledger.unit-test.ts: ok');
