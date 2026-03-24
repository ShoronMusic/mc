/**
 * `npx tsx src/lib/ai-output-policy.unit-test.ts`
 * または `npm run test` / `npm run validate` から実行。
 */
import assert from 'node:assert/strict';
import {
  containsUnreliableCommentPackClaim,
  containsUnreliableCommentaryDiscographyClaim,
  hasFabricatedStyleChartRankNumber,
  hasSuspiciousUkUsIdenticalChartPeak,
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
  isRejectedChatOrTidbitOutput('UKシングルチャートで最高10位を記録しました。'),
  true,
);
assert.equal(
  isRejectedChatOrTidbitOutput('アイルランドでも同年に8位を記録するなど、ヨーロッパでヒットしました。'),
  true,
);

assert.equal(
  isRejectedChatOrTidbitOutput('出典は公式サイトで、ビルボード1位だったとあります。'),
  false,
);
assert.equal(
  isRejectedChatOrTidbitOutput('Wikipedia によればチャート上位に入ったとされています。'),
  false,
);

// --- 曲解説（ディスコグラフィー断定の再生成用）---
assert.equal(containsUnreliableCommentaryDiscographyClaim(''), false);
assert.equal(
  containsUnreliableCommentaryDiscographyClaim('ニューウェーブらしいシンセの音色が印象的です。'),
  false,
);
assert.equal(
  containsUnreliableCommentaryDiscographyClaim(
    'デビューアルバム『White Feathers』に収録されています。',
  ),
  true,
);
assert.equal(
  containsUnreliableCommentaryDiscographyClaim(
    'イギリスのシングルチャートでは最高位8位を記録し、アイルランドのチャートでもトップ10入りを果たす',
  ),
  true,
);
assert.equal(
  containsUnreliableCommentaryDiscographyClaim(
    '1983年にUKシングルチャートで10位を記録しました。',
  ),
  true,
);
assert.equal(
  containsUnreliableCommentaryDiscographyClaim(
    '公式サイトに、当時ビルボードで12位だったとあります。',
  ),
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

// 栄誉枠: 全英と全米で同一順位（中位以上）は取り違え疑いで再生成
assert.equal(
  hasSuspiciousUkUsIdenticalChartPeak(
    '1983年に全英シングルチャートで33位を記録し、翌1984年には全米Billboard Hot 100でも33位にランクインしました。',
  ),
  true,
);
assert.equal(
  hasSuspiciousUkUsIdenticalChartPeak('1990年の全米で1位、全英シングルチャートでも1位を獲得しました。'),
  false,
);
assert.equal(
  hasSuspiciousUkUsIdenticalChartPeak('全米で8位、イギリスでも同年8位を記録しました。'),
  false,
);
assert.equal(
  containsUnreliableCommentPackClaim(
    '1983年に全英シングルチャートで33位を記録し、翌1984年には全米Billboard Hot 100でも33位にランクインしました。',
    true,
  ),
  true,
);
assert.equal(
  containsUnreliableCommentPackClaim(
    '1983年に全英シングルチャートで2位となり、1984年のBillboard Hot 100では33位まで上昇しました。',
    true,
  ),
  true,
);

assert.equal(hasFabricatedStyleChartRankNumber('全英シングルチャートで最高9位を記録'), true);
assert.equal(hasFabricatedStyleChartRankNumber('1984年頃に全英で大ヒットし米ビルボードでもチャート入り'), false);
assert.equal(
  containsUnreliableCommentPackClaim(
    '1984年頃に全英シングルで大ヒットし、米国でもビルボードにチャート入りした代表曲です。',
    true,
  ),
  false,
);

assert.equal(
  containsUnreliableCommentPackClaim('Wikipediaによれば全英で2位だったとあります。', true),
  false,
);

console.log('ai-output-policy unit tests: OK');
