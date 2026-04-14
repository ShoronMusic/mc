import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseImmediateDuplicateBody,
  polishGemmaModelVisibleText,
  sanitizeGemmaVisibleOutputText,
  stripGemmaCoTLeakage,
} from '@/lib/gemini-gemma-host';

test('sanitizeGemmaVisibleOutputText: keeps short text unchanged', () => {
  const s = 'Blurの『Song 2』は短い解説です。';
  assert.equal(sanitizeGemmaVisibleOutputText(s), s);
});

test('sanitizeGemmaVisibleOutputText: strips leading English meta before JP commentary', () => {
  const junk = `*   Artist: Post Malone, Ty Dolla $ign.
*   Song Title: Psycho.
*Wait* correction...

Post Malone, Ty Dolla $ignの『Psycho』。Alternative R&BやTrapの要素を纏った楽曲です。`;
  const out = sanitizeGemmaVisibleOutputText(junk);
  assert.ok(out.startsWith('Post Malone'));
  assert.ok(out.includes('の『Psycho』'));
  assert.ok(!out.includes('*Wait*'));
});

test('collapseImmediateDuplicateBody: glued identical halves -> one', () => {
  const once =
    'Post Maloneの『Psycho』は2018年の曲です。トラップの要素があります。';
  const out = collapseImmediateDuplicateBody(once + once);
  assert.equal(out, once);
});

test('collapseImmediateDuplicateBody: triple glued -> one', () => {
  /** 半分が偶然一致しない 30 文字（均一パターンだと二連折りが続いて潰れる） */
  const once = '012345678901234567890123456789';
  assert.equal(once.length, 30);
  assert.equal(collapseImmediateDuplicateBody(once + once + once), once);
});

test('collapseImmediateDuplicateBody: duplicate paragraphs', () => {
  const p = 'Blurの『Song 2』は短い解説です。';
  const out = collapseImmediateDuplicateBody(`${p}\n\n${p}\n\n次の行。`);
  assert.equal(out, `${p}\n\n次の行。`);
});

test('collapseImmediateDuplicateBody: leaves distinct text', () => {
  const s = '一行目です。\n二行目は違います。';
  assert.equal(collapseImmediateDuplicateBody(s), s);
});

test('stripGemmaCoTLeakage: removes * Role / Task block before Japanese', () => {
  const raw = `* Role: Assistant moderator for a Western music chat. * Task: Write transition.
* Constraints: Max 120 char

先ほどの流れを踏まえ、この曲にも軽く触れてみましょう。`;
  const out = stripGemmaCoTLeakage(raw);
  assert.ok(out.includes('先ほど'));
  assert.ok(!out.includes('Assistant moderator'));
  assert.ok(!out.includes('* Role'));
});

test('stripGemmaCoTLeakage + collapse: Final Draft and glued duplicate JP', () => {
  const once =
    '2018年には米ビルボードで大きくヒットし、世界的な話題となりました。共演は多くの国で支持を集めました。';
  const raw = `I should avoid repeating.

Final Draft:
${once}${once}`;
  const peeled = stripGemmaCoTLeakage(raw);
  const out = collapseImmediateDuplicateBody(sanitizeGemmaVisibleOutputText(peeled));
  assert.equal(out, once);
});

test('polishGemmaModelVisibleText: strips Perfect. before Japanese on same line', () => {
  const s =
    'Perfect. Post Malone, Ty Dolla $ignの『Psycho』は2018年のアルバムに収録された楽曲です。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('Post Malone'));
  assert.ok(!/^Perfect\b/i.test(out.trim()));
});

test('polishGemmaModelVisibleText: strips Final Text Construction heading', () => {
  const s =
    '*Final Text Construction:*\n2018年には米ビルボードをはじめ主要チャートで大きな成功を収めました。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('2018年'));
  assert.ok(!out.includes('Final Text Construction'));
});

test('polishGemmaModelVisibleText: inline Final Text Construction before JP', () => {
  const s =
    '*Final Text Construction:* 2018年には米ビルボードで大きな成功を収め、世界的なヒットを記録しました。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('2018年'));
});

test('polishGemmaModelVisibleText: Total N characters and Perfect.Post glued prefix', () => {
  const s =
    'Total: 112 characters. Perfect.Post Maloneの『Better Now』は、2018年のアルバム『Beerbongs & Bentleys』に収録された楽曲です。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('Post Malone'));
  assert.ok(!out.includes('Total:'));
  assert.ok(!out.includes('Perfect'));
});

test('polishGemmaModelVisibleText: strips star-prefixed Final Text / Final Version / Attempt / Character Count', () => {
  const s = `*   *Final Text:*
        2018年頃には米ビルボードで大きなヒットを記録しました。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('2018年頃'));
  assert.ok(!out.includes('Final Text'));
  assert.ok(!out.includes('*'));
});

test('polishGemmaModelVisibleText: Final Version colon prefix', () => {
  const s =
    'Final Version:\n    タイトルである「Better Now」というフレーズを繰り返すことで、感情の起伏を際立たせています。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('Better Now'));
  assert.ok(!/Final\s+Version/i.test(out));
});

test('polishGemmaModelVisibleText: Attempt and Character Count Check inline', () => {
  const s =
    '*   *Attempt 1:* クラウド・ラップの影響を感じさせるシンセサイザーが特徴です。*   *Character Count Check:* 「クラウド・ラップの影響を感じさせる、浮遊感のあるシンセサイザーの音色が特徴です。」。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('クラウド'));
  assert.ok(!out.includes('Attempt'));
  assert.ok(!out.includes('Character Count'));
});

test('polishGemmaModelVisibleText: drops English CoT and keeps trailing JP free-slot style', () => {
  const raw = `Actually, the prompt says "do not repeat basic info".
Basic info: "2018年のアルバム".

If I mention 2018, I am repeating. But I *must* include a year.

Let's try:
トラップを基調としたリズムの上で、メロディックなボーカルが空間を埋めるように響くアレンジが特徴です。

One final check on overlap.
Ready.`;
  const out = polishGemmaModelVisibleText(raw);
  assert.ok(out.includes('トラップ'));
  assert.ok(out.includes('メロディック'));
  assert.ok(!out.includes('Actually'));
  assert.ok(!out.includes('Basic info'));
});

test('polishGemmaModelVisibleText: * *Refined * and chart sentence then JP', () => {
  const s =
    '* *Refined *\n 2018年には米ビルボードや全英シングルチャートなどの主要な音楽チャートで大きな成功を収めました。国境を越えて広く再生され、当時のポップ・ラップ・シーンにおける彼の躍進を象徴する楽曲として広く親しまれています。*\n 「2018年には米ビルボードや全英シングルチャートなどの主要な音楽チャートで大きな成功を収めました。」。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(!out.includes('Refined'));
  assert.ok(out.includes('2018年には米ビルボード'));
});

test('polishGemmaModelVisibleText: Final check bullet list and Actually line before JP', () => {
  const s = `Final check:
 - No repetition of 2018, Beerbongs & Bentleys, breakup.
 - Focused on expression: refrain, rhythm, singing, emotional fluctuations.
 - No unfounded claims.
 - No English headers.リフレインされるフレーズが、拭いきれない執着や心の揺らぎを際立たせています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('リフレイン'));
  assert.ok(!out.includes('Final check'));
  assert.ok(!out.includes('No repetition'));
});

test('polishGemmaModelVisibleText: Actually I will go with before Japanese body', () => {
  const s =
    "Actually, I'll go with the Rhythm one. It's the most \"non-vague\" and clearly satisfies \"pick one point\". Post Maloneの『Better Now』は、トラップ特有のタイトなドラムパターンが楽曲の骨組みを支えています。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('トラップ'));
  assert.ok(!out.includes("I'll go with"));
});

test('polishGemmaModelVisibleText: Actually prefix stripped for non-Post-Malone artist', () => {
  const s =
    "Actually, I'll go with the melody angle. Taylor Swiftの『Anti-Hero』は、内省的なメロディが印象的です。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('Taylor Swift'));
  assert.ok(out.includes('メロディ'));
  assert.ok(!out.includes("I'll go with"));
});

test('polishGemmaModelVisibleText: strips * *Draft 1/2* join preamble before song commentary', () => {
  const s =
    '* *Draft 1:* ろんさん、入室ありがとうございます！(48 chars) - *Good, simple.* * *Draft 2:* ろんさん、ようこそ！(41 chars) - *Good* Post Maloneの『Better Now』は、ヒップホップやオルタナティブR&Bの要素を融合させた楽曲です。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('Post Maloneの『Better Now』'));
  assert.ok(!out.includes('Draft'));
  assert.ok(!out.includes('chars'));
});

test('polishGemmaModelVisibleText: strips trailing per-character (n) enumeration after Japanese', () => {
  const s =
    'トラップを彷彿とさせる重厚なベースとタイトなリズムパターンが、楽曲の土台を形成しています。1: ト(1)ラ(2)ッ(3)プ(4)を(5)彷(6)彿(7)と(8)さ(9)せ(10)る(11)重(12)厚(13)な(14)ベ(15)ー(16)ス(17)と(18)タ(19)イ(20)ト(21)な(22)リ(23)ズ(24)ム(25)パ(26)タ(27)ー(28)ン(29)が(30)、(31)楽(32)曲(33)の(34)土(35)台(36)を(37)形(38)成(39)し(40)て(41)い(42)ま(43)す(44)。(45)';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('トラップ'));
  assert.ok(!out.includes('(1)'));
  assert.ok(!out.includes('1:'));
});

test('polishGemmaModelVisibleText: stray closing quote before period', () => {
  const s =
    '2018年には米ビルボードなどの主要チャートで大きな成功を収め、世界的に広く聴かれる楽曲となりました。多くの国々のチャートにランクインし、ストリーミングでも高い再生数を記録するなど、社会的な反響を呼びました。"。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('呼びました。'));
  assert.ok(!out.includes('"'));
});

test('polishGemmaModelVisibleText: * *Final Polish:* before Japanese', () => {
  const s =
    '* *Final Polish:* 2018年頃、アメリカのビルボードや全英シングルチャートなどの主要チャートで大きなヒットを記録しました。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('2018年頃'));
  assert.ok(!out.toLowerCase().includes('final polish'));
});

test('polishGemmaModelVisibleText: *Final Polish:* inline', () => {
  const s =
    '*Final Polish:* 切ないメッセージを、リズミカルなフレーズの反復によって際立たせています。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('切ない'));
  assert.ok(!out.toLowerCase().includes('final polish'));
});

test('polishGemmaModelVisibleText: *Final Version Selection:* before Japanese', () => {
  const s =
    '*Final Version Selection:* 音の層が重なり合うような、空間的な広がりを感じさせるアレンジが特徴です。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('音の層'));
  assert.ok(!out.toLowerCase().includes('final version selection'));
});

test('polishGemmaModelVisibleText: leading double-quote before Japanese song line', () => {
  const s =
    '"Post Maloneの『Better Now』は、アルバム『Stoney』に収録された楽曲です。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('Post Malone'));
});

test('polishGemmaModelVisibleText: * *Sentence 1:* … 3本が同一行に付いた基本枠', () => {
  const s =
    '* *Sentence 1:* Post Maloneの『Better Now』は2018年の曲です。* *Sentence 2:* ヒップホップとポップが特徴です。* *Sentence 3:* 世界的なヒットでした。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(!out.toLowerCase().includes('sentence'));
  assert.ok(out.includes('Post Maloneの『Better Now』'));
  assert.ok(out.includes('ヒップホップ'));
});

test('polishGemmaModelVisibleText: Constraint Check block and Final text / Final selection headings', () => {
  const s = `* *Constraint Check:*
 * Includes year? Yes.
Length: ~100 characters. Perfect. *
2018年のリリース後、米ビルボードで大ヒットを記録しました。

Final text:
印象的なリフレインが特徴です。

Final selection:
オートチューンを効かせた歌声が特徴です。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(!out.toLowerCase().includes('constraint'));
  assert.ok(!out.toLowerCase().includes('final text'));
  assert.ok(!out.toLowerCase().includes('final selection'));
  assert.ok(out.includes('2018年のリリース後'));
  assert.ok(out.includes('印象的なリフレイン'));
  assert.ok(out.includes('オートチューン'));
});
