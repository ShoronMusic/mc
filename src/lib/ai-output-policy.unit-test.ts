/**
 * `npx tsx src/lib/ai-output-policy.unit-test.ts`
 * または `npm run test` / `npm run validate` から実行。
 */
import assert from 'node:assert/strict';
import {
  containsUnreliableCommentPackClaim,
  isRejectedChatOrTidbitOutput,
} from './ai-output-policy';

// --- チャット / tidbit ---
assert.equal(isRejectedChatOrTidbitOutput(''), false);
assert.equal(isRejectedChatOrTidbitOutput('   '), false);
assert.equal(isRejectedChatOrTidbitOutput('このメロディは印象的です。'), false);

assert.equal(isRejectedChatOrTidbitOutput('世界中でバズりました。'), true);
assert.equal(isRejectedChatOrTidbitOutput('ビルボードで大ヒットした曲です。'), true);
assert.equal(isRejectedChatOrTidbitOutput('全米で1位を獲得したとのことです。'), true);
assert.equal(isRejectedChatOrTidbitOutput('グラミーにノミネートされたこともあります。'), true);

assert.equal(
  isRejectedChatOrTidbitOutput('出典は公式サイトで、ビルボード1位だったとあります。'),
  false,
);
assert.equal(
  isRejectedChatOrTidbitOutput('Wikipedia によればチャート上位に入ったとされています。'),
  false,
);

// --- comment-pack 自由コメント ---
assert.equal(containsUnreliableCommentPackClaim('', false), false);
assert.equal(containsUnreliableCommentPackClaim('歌詞は内省的なテーマです。', false), false);

assert.equal(containsUnreliableCommentPackClaim('数日でレコーディングが終わったそうです。', false), true);
assert.equal(containsUnreliableCommentPackClaim('数日でレコーディングが終わったそうです。', true), true);

assert.equal(containsUnreliableCommentPackClaim('ビルボードで長く愛されています。', false), true);
assert.equal(containsUnreliableCommentPackClaim('ビルボードで長く愛されています。', true), false);

assert.equal(containsUnreliableCommentPackClaim('グラミー受賞歴もある名曲です。', false), true);
assert.equal(containsUnreliableCommentPackClaim('グラミー受賞歴もある名曲です。', true), false);

assert.equal(
  containsUnreliableCommentPackClaim('根拠として、ビルボードの記録に1位とあります。', false),
  false,
);

// 栄誉スロットでは「世界中」等をチャート文脈で許容（非栄誉では禁止）
assert.equal(containsUnreliableCommentPackClaim('世界中でヒットした一曲です。', false), true);
assert.equal(containsUnreliableCommentPackClaim('世界中でヒットした一曲です。', true), false);

assert.equal(containsUnreliableCommentPackClaim('象徴的な名曲として知られています。', false), true);
assert.equal(containsUnreliableCommentPackClaim('象徴的な名曲として知られています。', true), false);

// 栄誉でもバズ煽りは禁止
assert.equal(containsUnreliableCommentPackClaim('SNSでバズりました。', true), true);

console.log('ai-output-policy unit tests: OK');
