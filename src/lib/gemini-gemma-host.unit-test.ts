import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseImmediateDuplicateBody,
  polishGemmaModelVisibleText,
  sanitizeGemmaVisibleOutputText,
  stripGemmaCoTLeakage,
  stripTrailingSelfReportedCharCount,
} from '@/lib/gemini-gemma-host';

test('sanitizeGemmaVisibleOutputText: keeps short text unchanged', () => {
  const s = 'Blurの『Song 2』は短い解説です。';
  assert.equal(sanitizeGemmaVisibleOutputText(s), s);
});

test('stripTrailingSelfReportedCharCount: Japanese (N文字)', () => {
  const s =
    "Noel Gallagher's High Flying Birdsの『AKA... What a Life!』は、2011年発表のデビューアルバム収録曲です。(136文字)";
  const out = stripTrailingSelfReportedCharCount(s);
  assert.ok(out.endsWith('収録曲です。'));
  assert.ok(!out.includes('文字'));
});

test('stripTrailingSelfReportedCharCount: fullwidth parens and 約', () => {
  const s = 'サウンドの躍動感が魅力です。（約134字）';
  const out = stripTrailingSelfReportedCharCount(s);
  assert.equal(out, 'サウンドの躍動感が魅力です。');
});

test('stripTrailingSelfReportedCharCount: English chars suffix', () => {
  const s = 'A short note about the song. (112 characters)';
  const out = stripTrailingSelfReportedCharCount(s);
  assert.equal(out, 'A short note about the song.');
});

test('polishGemmaModelVisibleText: strips trailing Japanese char count', () => {
  const s =
    'Post Maloneの『Better Now』は、2018年のアルバムに収録された楽曲です。(136文字)';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('Post Malone'));
  assert.ok(!/\(\d+文字\)/.test(out));
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

test('polishGemmaModelVisibleText: strips Ready. glued before artist の『』', () => {
  const s =
    "Ready.Maroon 5の『Moves Like Jagger』は、自信たっぷりに相手を惹きつける大胆な歌詞が特徴です。アダム・リヴァインの軽妙で遊び心のある歌い口に対し、クリスティーナ・アギレラが力強くエネルギッシュなパートを担うことで、男女のヴォーカルが火花を散らすようなダイナミックな対比が表現されています。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("Maroon 5の『Moves Like Jagger』"));
  assert.ok(!/^Ready\b/i.test(out.trim()));
  assert.ok(out.includes('クリスティーナ・アギレラ'));
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

test('polishGemmaModelVisibleText: strips -> N characters. Perfect. glued prefix', () => {
  const s =
    "-> 146 characters. Perfect.Maroon 5の『This Summer's Gonna Hurt Like A Motherf****r (Explicit)』は、2012年リリースのアルバム『Overexposed』に収録された楽曲です。ダンスポップ的なアプローチを取り入れた軽快なサウンドが特徴で、夏の情熱とそれに伴う心の痛みをエネルギッシュに歌い上げています。2010年代前半に世界的にヒットした一曲です。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("Maroon 5の『This Summer's Gonna Hurt"));
  assert.ok(out.includes('Overexposed'));
  assert.ok(!/->\s*\d+\s*characters/i.test(out));
  assert.ok(!/^Perfect\b/i.test(out.trim()));
});

test('polishGemmaModelVisibleText: strips Length? ~N characters. (Perfect). glued prefix', () => {
  const s =
    "Length? ~130 characters. (Perfect).Maroon 5の『Wait』は、2017年リリースのアルバム『Red Pill Blues』に収録され、2018年に公開されたポップおよびR&Bナンバーです。別れを惜しみ、相手に待ってほしいと願う切ない心情をエモーショナルなメロディに乗せて歌い上げています。2010年代後半に世界的に広く親しまれた楽曲です。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("Maroon 5の『Wait』"));
  assert.ok(out.includes('Red Pill Blues'));
  assert.ok(!/Length\?/i.test(out));
  assert.ok(!/\(Perfect\)/i.test(out));
});

test('polishGemmaModelVisibleText: Length is around N / Fits the 80-150 range glued prefix', () => {
  const s =
    "Length is around 120 characters. Fits the 80-150 range.The Weekndの『Until I Bleed Out』は、2020年リリースのアルバム『After Hours』に収録された楽曲です。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('The Weeknd'));
  assert.ok(!/Length is around/i.test(out));
  assert.ok(!/Fits the 80-150/i.test(out));
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

test('polishGemmaModelVisibleText: inline Release year bullets then last JP honors slot', () => {
  const s = `* Release year: 2025.
 * Since it's a 2025 release, it's very recent.
 * Known as a part of the *Hurry Up Tomorrow* era.
 * The Weeknd is a global superstar, so the song is expected to hit charts globally.
 * I need to mention its success qualitatively. * 2025年のリリース後、世界的に大きな注目を集め、米ビルボードや全英シングルチャートなどの主要チャートで高く評価されました。世界各国で広くストリーミングされ、現代的なシンセポップのヒット作として話題になっています。(Too generic? But fits constraints). * 2025年に公開されるやいなや、世界各国のチャートで存在感を示し、大きなヒットを記録しました。特に北米や欧州の主要マーケットで広く再生され、音楽シーンにおける高い影響力を改めて証明した楽曲となっています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('2025年に公開されるやいなや'));
  assert.ok(out.includes('証明した楽曲となっています'));
  assert.ok(!out.includes('Release year'));
  assert.ok(!out.includes('Too generic'));
  assert.ok(!out.includes('I need to mention'));
});

test('polishGemmaModelVisibleText: inline Draft/Refining checklist then last JP lyrics slot', () => {
  const s = `* Draft 1: 歌詞では、心を開くことへの葛藤や切なさが、感情的なボーカルワークを通して表現されています。繰り返されるフレーズが耳に残り、楽曲後半に向けて高まっていく感情の起伏が、聴き手の心に強く訴えかけます。* Refining: Ensure it doesn't repeat glamorous and sad.
 * Check constraints: No guest artists listed, so skip the guest role part. No charts.
 * Japanese? Yes.
 * Desu/masu? Yes.
歌詞では、心を開くことへの不安や渇望といった複雑な感情が、叙情的な言葉選びで描かれています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('叙情的な言葉選び'));
  assert.ok(!out.includes('Draft'));
  assert.ok(!out.includes('Refining'));
  assert.ok(!out.includes('Check constraints'));
  assert.ok(!out.includes('Desu/masu'));
});

test('polishGemmaModelVisibleText: Character count glue before artist slot JP', () => {
  const s =
    '(Character count: approx 105 characters). Matches all criteria.Weekndはカナダ出身のソロアーティストであり、現代のポップシーンを牽引する世界的スターです。本作のリリース時は、自身の音楽的物語の完結へと向かう重要なフェーズにあり、円熟した表現力で新たな境地を切り拓いています。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('Weekndはカナダ出身'));
  assert.ok(out.includes('切り拓いています'));
  assert.ok(!out.includes('Character count'));
  assert.ok(!out.includes('Matches all criteria'));
});

test('polishGemmaModelVisibleText: Polite tone glued before の『』 base comment', () => {
  const s =
    "* Polite tone.The Weekndの『Dancing In The Flames』は、2025年にリリースされたアルバム『Hurry Up Tomorrow』に収録された楽曲です。現代的なポップスの感性を備えた楽曲のアコースティック・バージョンであり、装飾を削ぎ落とした構成によって、切なさと情熱が同居する親密でエモーショナルな雰囲気が描き出されています。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("The Weekndの『Dancing In The Flames』"));
  assert.ok(!out.toLowerCase().includes('polite'));
  assert.ok(!out.includes('tone.'));
});

test('polishGemmaModelVisibleText: Perfect glued to year honors slot', () => {
  const s =
    'Perfect.2024年にシングルとして公開されるやいなや、米ビルボードや全英シングルチャートなどで高く評価されました。世界各国のストリーミングサービスで広く再生され、現代のポップシーンにおける重要なヒット作として大きな話題を呼んでいます。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('2024年にシングルとして'));
  assert.ok(!out.includes('Perfect'));
});

test('polishGemmaModelVisibleText: leftover characters. Perfect. before lyrics slot', () => {
  const s =
    'characters. Perfect.歌詞では、破滅的な状況の中で踊り続けるという矛盾した情景が、比喩的な表現で描かれています。静かに語りかけるような導入から、サビで感情を高めていく構成が、内面的な葛藤とそこからの解放感を鮮明に映し出しています。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('歌詞では、破滅的な状況'));
  assert.ok(!out.toLowerCase().includes('perfect'));
  assert.ok(!out.toLowerCase().includes('characters'));
});

test('polishGemmaModelVisibleText: Numbers/Forbidden/Length/Tone checklist before honors JP', () => {
  const s = `* Numbers: None.
 * Forbidden content: No personal stories, no recording details.
 * Length: 2 sentences. Approx 90 characters.
 * Tone: Desu/Masu.2024年のリリース後、米ビルボードや全英シングルチャートなどの主要チャートで大きな成功を収めました。北米や欧州をはじめとする世界各国で広くストリーミングされ、現代のポップシーンを象徴するヒット作として大きな話題となりました。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('2024年のリリース後'));
  assert.ok(out.includes('大きな話題となりました'));
  assert.ok(!out.includes('Numbers'));
  assert.ok(!out.includes('Forbidden'));
  assert.ok(!out.includes('Desu/Masu'));
  assert.ok(!out.includes('Approx'));
});

test('polishGemmaModelVisibleText: Final characters tilde count Perfect glued to の『』', () => {
  const s =
    "Final characters: ~135. Perfect.MetroBoominの『Creepin' (Remix)』は、2023年にリリースされたアルバム『HEROES & VILLAINS』に収録された楽曲です。現代的なR&Bとヒップホップを融合させた作品で、歌唱を担当するThe Weekndとラップを加えた21 Savageが共演しています。裏切りや切なさをテーマにしたメロウな世界観が特徴的な、世界的なヒット曲です。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("MetroBoominの『Creepin' (Remix)』"));
  assert.ok(!out.toLowerCase().includes('final characters'));
  assert.ok(!out.includes('Perfect'));
});

test('polishGemmaModelVisibleText: Final confirmation on names then JP remix slot', () => {
  const s = `Final confirmation on names:
 Artist: Metroboomin
 Song: Creepin'
 (All correct)原曲のメロウな世界観をベースに、リズム隊を強調してダンスミュージックとしての側面を強めたリミックス版です。Metroboominによる緻密なエディットにより、歌唱パートとラップパートのコントラストがより鮮明になり、原曲よりも空間的な広がりと心地よいグルーヴ感が際立つ仕上がりとなっています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('原曲のメロウな世界観'));
  assert.ok(out.includes('グルーヴ感が際立つ'));
  assert.ok(!out.toLowerCase().includes('confirmation'));
  assert.ok(!out.includes('All correct'));
  assert.ok(!/^Artist:/m.test(out));
});

test('polishGemmaModelVisibleText: Wait is Weeknd name check then Total chars Perfect JP', () => {
  const s = `Wait, is "Weeknd" the correct artist name? Metadata says \`【アーティスト（歌手・バンド）】= 「Weeknd」\`. Yes.

 Total chars: 108. Perfect.全編を通して脈打つようなシンセベースのリズムが、楽曲に心地よい緊張感を与えています。そこにWeekndの透明感のある歌声が重なることで、レトロな質感と現代的な洗練さが同居するサウンドに仕上がっています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('全編を通して脈打つようなシンセベース'));
  assert.ok(out.includes('同居するサウンド'));
  assert.ok(!out.includes('Wait,'));
  assert.ok(!out.includes('Metadata says'));
  assert.ok(!out.includes('Total chars'));
  assert.ok(!out.includes('Perfect'));
});

test('polishGemmaModelVisibleText: No One detail / Just the Japanese text glued to の『』', () => {
  const s =
    '- No "One detail:", no English, no meta-notes. Just the Japanese text.The Weekndの『Out of Time』は、滑らかにうねるベースラインと煌びやかなシンセサイザーの層が重なるアレンジが特徴的です。そこに重ねられる彼の軽やかなファルセットが、都会的で洗練された夜の空気感を演出しています。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("The Weekndの『Out of Time』"));
  assert.ok(out.includes('夜の空気感を演出'));
  assert.ok(!out.includes('One detail'));
  assert.ok(!out.includes('meta-notes'));
  assert.ok(!out.includes('Just the Japanese text'));
  assert.ok(!out.includes('no English'));
});

test('polishGemmaModelVisibleText: 豆知識 quote Check glued before artist JP', () => {
  const s =
    '豆知識"? Check.The Weekndが葛藤や後悔を孕んだ心情をエモーショナルに歌い上げる一方で、Swedish House Mafiaが構築した攻撃的なダンスビートがそれを激しく突き動かします。内面的な苦悩と外向的な熱狂という対比が、楽曲に強い緊張感を与えています。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('The Weekndが葛藤や後悔'));
  assert.ok(out.includes('強い緊張感を与えています'));
  assert.ok(!out.includes('豆知識'));
  assert.ok(!out.includes('Check'));
});

test('polishGemmaModelVisibleText: Constraint lines then lyrics slot JP', () => {
  const s = `Constraint: No album name, no year.
 * Constraint: Focus on expression (metaphor "gasoline", narrative style "monologue", emotional contrast).歌詞では、自分自身の危うさを「ガソリン」に例えて表現しています。絶望感に満ちた独白のような語り口と、エモーショナルな高まりを見せるサビの対比が、逃れられない苦しみや焦燥感を鮮明に描き出しています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('歌詞では、自分自身の危うさ'));
  assert.ok(out.includes('鮮明に描き出しています'));
  assert.ok(!out.includes('Constraint'));
  assert.ok(!out.includes('album name'));
  assert.ok(!out.includes('monologue'));
});

test('polishGemmaModelVisibleText: Draft 1 then Draft 2 lyrics slot keeps last JP', () => {
  const s =
    'Draft 1: 歌詞では、後悔や罪悪感といった葛藤が描かれています。ダンスビートに乗せて、自分自身の過ちや犠牲について独白するように歌うスタイルが、曲に切なさと緊張感を与えています。* Draft 2: 歌詞では、内面的な葛藤や後悔といった感情がストレートに表現されています。快楽と罪悪感の間で揺れ動く心情が、執拗に繰り返されるフレーズによって強調されており、聴き手に強い緊張感を伝えます。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('歌詞では、内面的な葛藤'));
  assert.ok(out.includes('強い緊張感を伝えます'));
  assert.ok(!out.includes('Draft'));
  assert.ok(!out.includes('独白するように歌う'));
});

test('polishGemmaModelVisibleText: Too simple / Better eval then Draft 3 refining JP', () => {
  const s = `Weekndの『Sacrifice』は、ベースラインがとてもかっこいいです。ファンクの影響を受けたリズムが心地よく、踊りたくなる構成になっています。(Too simple, slightly abstract). * 『Sacrifice』のサウンドで注目したいのは、楽曲全体を牽引するタイトなベースラインです。Electro-funkらしいうねりのあるリズムが、楽曲に攻撃的なエッジと躍動感を与えています。(Better, specific to rhythm/arrangement).
 * *Draft 3 (Refining):* 楽曲を駆動させるタイトなベースラインが印象的です。Electro-funkのエッセンスを取り入れたうねりのあるリズムが、都会的なクールさと攻撃的な躍動感を両立させています。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('楽曲を駆動させるタイトなベースライン'));
  assert.ok(out.includes('攻撃的な躍動感を両立'));
  assert.ok(!out.includes('Too simple'));
  assert.ok(!out.includes('Draft'));
  assert.ok(!out.includes('かっこいいです'));
});

test('polishGemmaModelVisibleText: keeps の『』 opening before generic hit blurb', () => {
  const s =
    "The Weekndの『Blinding Lights』は、2020年リリースのアルバム『After Hours』に収録された楽曲です。夜の疾走感と切なさが交錯する世界観を描いており、2020年代を象徴する世界的な大ヒット曲として広く知られています。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('The Weekndの『Blinding Lights』'));
  assert.ok(out.includes('After Hours'));
  assert.ok(out.includes('夜の疾走感'));
});

test('polishGemmaModelVisibleText: Draft then thin hit blurb keeps titled base', () => {
  const s =
    "The Weekndの『Blinding Lights』は、2020年リリースのアルバム『After Hours』に収録された楽曲です。* Draft 2: 夜の疾走感と切なさが交錯する世界観を描いており、2020年代を象徴する世界的な大ヒット曲として広く知られています。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes('The Weekndの『Blinding Lights』'));
  assert.ok(out.includes('After Hours'));
  assert.ok(!out.includes('Draft'));
});

test('polishGemmaModelVisibleText: strips * " prefix, Does it / Is it chars QA, and repeated first sentence', () => {
  const s = `* "サウンド面では、トラップ特有の重厚なベースラインと刻みの速いハイハットが印象的です。このタイトなリズムに、Weekndの伸びやかな高音が重なることで、都会的な緊張感と浮遊感が共存する独特のグルーヴが生まれています。* Does it put the artist in 『』? No.
* Is it 60-140 chars? Yes.

 サウンド面では、トラップ特有の重厚なベースラインと刻みの速いハイハットが印象的です。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('サウンド面では、トラップ特有'));
  assert.ok(out.includes('独特のグルーヴが生まれています。'));
  assert.equal((out.match(/サウンド面では、/g) ?? []).length, 1);
  assert.ok(!out.includes('Does it'));
  assert.ok(!out.includes('Is it 60-140'));
  assert.ok(!out.includes('Yes.'));
  assert.ok(!out.startsWith('*'));
});

test('polishGemmaModelVisibleText: strips terminology for album (EP)? Yes. prefix', () => {
  const s =
    "terminology for album (EP)? Yes.The Weekndの『Call Out My Name』は、2018年にリリースされたEP『My Dear Melancholy,』に収録された楽曲です。ダークなR&Bの方向性を決定づけた代表的な一曲として知られており、絶望的な孤独感や失った愛への切ない執着が描かれた重厚なバラードです。2010年代後半に世界的なヒットとなりました。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("The Weekndの『Call Out My Name』"));
  assert.ok(out.includes('My Dear Melancholy'));
  assert.ok(!out.toLowerCase().includes('terminology'));
  assert.ok(!out.includes('Yes.'));
});

test('polishGemmaModelVisibleText: strips No detailed sound analysis: Yes. prefix', () => {
  const s =
    "No detailed sound analysis: Yes.The Weekndの『In The Night』は、2016年にリリースされたアルバム『Starboy』に収録された楽曲です。80年代風のシンセポップを取り入れたダンスミュージックとして構成されており、過去の過ちへの後悔や罪悪感をテーマにしたダークな世界観が特徴です。2010年代半ばに世界的なヒットとなりました。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("The Weekndの『In The Night』"));
  assert.ok(out.includes('Starboy'));
  assert.ok(!out.toLowerCase().includes('sound analysis'));
  assert.ok(!out.includes('Yes.'));
});

test('polishGemmaModelVisibleText: strips Current year, inline stars, duplicate body, trailing None checklist', () => {
  const s = `Current year: 2026. * Maroon 5の『Payphone』は、 * 2011年にリリースされ、2012年のアルバム『Overexposed』に収録された楽曲です。ダンスポップの要素を取り入れたキャッチーなサウンドが特徴です。Maroon 5による歌唱に、Wiz Khalifaがラップで参加しています。裏切られた感情や後悔を歌った切ない雰囲気の一曲です。* 2010年代前半に世界的なヒットとなりました。Maroon 5の『Payphone』は、2011年にリリースされ、アルバム『Overexposed』に収録されたダンスポップ色の強い楽曲です。メインの歌唱にWiz Khalifaによるラップが加わった構成で、失恋や裏切りへのやり場のない感情を歌っています。2010年代前半に世界的なヒットとなった一曲です。No chart rankings? None.
 * No detailed lyric analysis? None.
 * No instrument details? None.
 * Length: ~130 characters. (Within 80-150 range).
 * Correct labels: Artist = Maroon 5, Song = Payphone. Correct.。`;
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("Maroon 5の『Payphone』"));
  assert.equal((out.match(/の『Payphone』/g) ?? []).length, 1);
  assert.ok(out.includes('ダンスポップ色の強い楽曲'));
  assert.ok(!/Current year/i.test(out));
  assert.ok(!/chart rankings/i.test(out));
  assert.ok(!/Correct labels/i.test(out));
  assert.ok(!/Length:/i.test(out));
  assert.ok(!out.includes('*'));
});

test('polishGemmaModelVisibleText: strips First sentence / Genre / Theme / Closing outline labels', () => {
  const s =
    "* *First sentence:* The Weekndの『Can't Feel My Face』は、2015年にリリースされたアルバム『Beauty Behind the Madness』に収録された楽曲です。* *Genre/Position:* ファンキーなリズムを取り入れたポップ・R&Bとして構成されており、彼が世界的なポップアイコンへと飛躍した代表曲のひとつです。* *Theme/Mood:* 危険な誘惑や中毒的な関係性をテーマにした、軽快ながらもダークな雰囲気が漂う一曲です。* *Closing (Global hit):* 2010年代半ばに世界的なヒットとなりました。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("The Weekndの『Can't Feel My Face』"));
  assert.ok(out.includes('ファンキーなリズム'));
  assert.ok(out.includes('世界的なヒットとなりました。'));
  assert.ok(!out.toLowerCase().includes('first sentence'));
  assert.ok(!out.toLowerCase().includes('genre'));
  assert.ok(!out.toLowerCase().includes('theme/mood'));
  assert.ok(!out.toLowerCase().includes('closing'));
  assert.ok(!out.includes('*'));
});

test('polishGemmaModelVisibleText: 豆知識ですが Check and Only Japanese Check', () => {
  const s =
    '豆知識ですが": Check.\n - Only Japanese: Check.Weekndはカナダ出身のソロアーティストであり、現代のポップシーンを象徴する世界的アイコンです。この楽曲の発表当時は、80年代リバイバルの流れを汲む独自のスタイルを確立し、音楽的な転換を経て人気が絶頂に達していた時期でした。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith('Weekndはカナダ出身'));
  assert.ok(out.includes('人気が絶頂に達していた'));
  assert.ok(!out.includes('豆知識'));
  assert.ok(!out.includes('Only Japanese'));
  assert.ok(!out.includes('Check'));
});

test('polishGemmaModelVisibleText: strips trailing Total characters ~N chars after Japanese', () => {
  const s =
    'Stingの『Fragile』は、ナイロン弦のガットギターによる繊細なアルペジオが印象的なアレンジです。そこに寄り添うように添えられた柔らかなパーカッションの響きが、楽曲に静謐な空気感と奥行きを与えています。楽器の最小限な構成が、かえって音色の純粋さを際立たせています。Total characters: ~125 chars.。';
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("Stingの『Fragile』"));
  assert.ok(out.includes('音色の純粋さを際立たせています。'));
  assert.ok(!/total characters/i.test(out));
  assert.ok(!/~125/.test(out));
});

test('polishGemmaModelVisibleText: strips trailing Release year / Genre/Positioning checklist', () => {
  const s =
    "Stingの『Fragile』は、1987年リリースの2ndアルバム『...Nothing Like the Sun』に収録された楽曲です。アコースティック・ロックやジャズのスタイルを基調としており、繊細なガットギターの音色とともに、人間の生命の脆さと暴力の無意味さを説いた慈愛に満ちた祈りの歌として知られています。Release year/Album? 1987 / *...Nothing Like the Sun*. Yes.\n* Genre/Positioning? Acoustic rock/Jazz. Yes.\n* Theme/Atmosphere? Fragility of life/prayer. Yes.。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.startsWith("Stingの『Fragile』"));
  assert.ok(out.includes('祈りの歌として知られています。'));
  assert.ok(!/Release year/i.test(out));
  assert.ok(!/Positioning/i.test(out));
  assert.ok(!/Atmosphere/i.test(out));
});

test('polishGemmaModelVisibleText: strips trailing Check length / Search block after chat_reply', () => {
  const s =
    "この曲についてですね。Whitesnakeの『Is This Love』は、1987年にリリースされたセルフタイトルアルバム『Whitesnake』に収録されている、彼らを代表する究極のパワー・バラードです。デヴィッド・カヴァデールによる情熱的で艶のある歌唱と、洗練されたメロディラインが心地よく、世界的に大ヒットしました。80年代ハードロック黄金時代の華やかさと、切ない大人の恋愛感情が見事に融合した名曲だと思います。Check length*: ~160 characters. Good.\n *Check priorities*: 1) Song, 2) Album. Correct.\n *Check prohibited words*: No \"豆知識\", no chart numbers. Correct.\n *Search block*: `シングル： Whitesnake - Is This Love`。";
  const out = polishGemmaModelVisibleText(s);
  assert.ok(out.includes("Whitesnakeの『Is This Love』"));
  assert.ok(out.includes('名曲だと思います。'));
  assert.ok(!/Check length/i.test(out));
  assert.ok(!/Check priorities/i.test(out));
  assert.ok(!/prohibited words/i.test(out));
  assert.ok(!/Search block/i.test(out));
  assert.ok(!/~160 characters/i.test(out));
});

test('polishGemmaModelVisibleText: drops English Priority for talking points dump', () => {
  const s = `Priority for talking points (while song is playing):
1. The song itself (Eric Clapton - Tears In Heaven)
2. The album
3. The artist
Restrictions: No irrelevant artists, no specific chart numbers, no fake info.
Tone: Natural, friendly, 'desu/masu'.
Intro: Use rotating intros but not '豆知識ですが' for the current song.`;
  const out = polishGemmaModelVisibleText(s);
  assert.equal(out, '');
});

test('polishGemmaModelVisibleText: drops Natural conversation / Priority planning leak', () => {
  const s = `Natural conversation (2-5 sentences, 120-450 characters).
 * Priority: User's topic (Oasis) over the playing song (Mariah Carey).
 * Avoid specific chart numbers (use "big hit", "representative song").
 * Handle "Canon progression" correctly.
 * Include "Search Block" (YouTube style) for songs/albums mentioned.
 * Intro phrase rotation: "洋楽の話ですが", "ところで".
 * Tone: Friendly music buddy.`;
  const out = polishGemmaModelVisibleText(s);
  assert.equal(out, '');
});
