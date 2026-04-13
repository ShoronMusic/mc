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
