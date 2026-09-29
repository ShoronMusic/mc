import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGemmaCommentaryStillDirty,
  parseCopyeditBodiesJson,
  resolveCopyeditSlotBody,
} from '@/lib/gemma-commentary-copyedit';
import {
  looksIncompleteSongCommentary,
  trimCommentaryToLastCompleteSentence,
} from '@/lib/song-commentary-completeness';
import {
  resolveGenerationModelId,
  resolveSanitizeModelId,
} from '@/lib/gemini-model-routing';

test('isGemmaCommentaryStillDirty: clean Japanese with English artist is clean', () => {
  const s =
    "The Weekndの『Blinding Lights』は、シンセと四つ打ちが印象的なアップテンポの一曲です。";
  assert.equal(isGemmaCommentaryStillDirty(s), false);
  assert.equal(
    isGemmaCommentaryStillDirty(
      "Maroon 5の『Wait』は、2017年リリースのアルバム『Red Pill Blues』に収録された楽曲です。",
    ),
    false,
  );
});

test('isGemmaCommentaryStillDirty: unknown English ack glued before の『』 is dirty', () => {
  assert.equal(
    isGemmaCommentaryStillDirty(
      "Noted.Maroon 5の『Wait』は、別れを惜しむ切ない一曲です。",
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      "Ready.Maroon 5の『Moves Like Jagger』は、大胆な歌詞が特徴です。",
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      "-> 146 characters. Perfect.Maroon 5の『This Summer's Gonna Hurt』は2012年の曲です。",
    ),
    true,
  );
});

test('isGemmaCommentaryStillDirty: Draft / Check leftovers are dirty', () => {
  assert.equal(isGemmaCommentaryStillDirty('Draft 2 (Refining): 歌詞は夜のドライブです。'), true);
  assert.equal(isGemmaCommentaryStillDirty('Only Japanese: Check.The Weekndはカナダ出身です。'), true);
  assert.equal(isGemmaCommentaryStillDirty('Constraint: No album name.歌詞では孤独を描きます。'), true);
  assert.equal(isGemmaCommentaryStillDirty('(Too simple) サウンドが速いです。'), true);
  assert.equal(
    isGemmaCommentaryStillDirty(
      'Length is around 120 characters. Fits the 80-150 range.The Weekndの『Until I Bleed Out』は暗い一曲です。',
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      "Length? ~130 characters. (Perfect).Maroon 5の『Wait』は切ない一曲です。",
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      "サウンド面では、トラップが印象的です。* Does it put the artist in 『』? No.\n* Is it 60-140 chars? Yes.",
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      "terminology for album (EP)? Yes.The Weekndの『Call Out My Name』は2018年の曲です。",
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      'Current year: 2026. * Maroon 5の『Payphone』は2011年の曲です。No chart rankings? None.',
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      'Stingの『Fragile』は繊細なアレンジです。Total characters: ~125 chars.。',
    ),
    true,
  );
  assert.equal(
    isGemmaCommentaryStillDirty(
      'Stingの『Fragile』は祈りの歌です。Release year/Album? 1987 / Yes.',
    ),
    true,
  );
});

test('resolveCopyeditSlotBody: empty Flash extract keeps a clean draft', () => {
  const draft =
    'Mr. Bigの『Take Cover』は、1991年のアルバム『Lean Into It』に収録された楽曲です。';
  assert.equal(resolveCopyeditSlotBody('', draft), draft);
});

test('resolveCopyeditSlotBody: dirty draft is not kept when extract is empty', () => {
  assert.equal(
    resolveCopyeditSlotBody('', 'Draft 2 (Refining): 歌詞は夜のドライブです。'),
    '',
  );
});

test('looksIncompleteSongCommentary: mid-name cutoff is incomplete', () => {
  assert.equal(
    looksIncompleteSongCommentary('Deep Forestはフランスのユニットで、エリック・ムゲとミシェル・'),
    true,
  );
  assert.equal(
    looksIncompleteSongCommentary('Deep Forestはフランスを拠点とするユニットです。'),
    false,
  );
});

test('trimCommentaryToLastCompleteSentence: drops the unfinished tail', () => {
  assert.equal(
    trimCommentaryToLastCompleteSentence('ユニットです。エリック・ムゲとミシェル・'),
    'ユニットです。',
  );
  assert.equal(trimCommentaryToLastCompleteSentence('ミシェル・'), '');
});

test('resolveCopyeditSlotBody: incomplete extract keeps a complete draft', () => {
  const draft = 'Deep Forestはフランスを拠点とするユニットです。';
  assert.equal(resolveCopyeditSlotBody('エリック・ムゲとミシェル・', draft), draft);
});

test('resolveCopyeditSlotBody: clean extract wins over the draft', () => {
  const extracted = 'Mr. Bigの『Take Cover』は、警告を込めたロックです。';
  const draft = '別の下書きです。アルバム名は書きません。';
  assert.equal(resolveCopyeditSlotBody(extracted, draft), extracted);
});

test('parseCopyeditBodiesJson: extracts bodies array', () => {
  const raw = '{"bodies":["基本の解説です。",""]}';
  assert.deepEqual(parseCopyeditBodiesJson(raw, 2), ['基本の解説です。', '']);
});

test('parseCopyeditBodiesJson: pads a short bodies array', () => {
  assert.deepEqual(parseCopyeditBodiesJson('{"bodies":["a"]}', 2), ['a', '']);
});

test('parseCopyeditBodiesJson: salvages a truncated bodies array', () => {
  const raw = '{"bodies":["解説です。","二本目です。","三本目';
  assert.deepEqual(parseCopyeditBodiesJson(raw, 4), ['解説です。', '二本目です。', '', '']);
});

test('resolveGenerationModelId: commentary_copyedit uses sanitize not Gemma primary', () => {
  const prevGen = process.env.GEMINI_GENERATION_MODEL;
  const prevSan = process.env.GEMINI_SANITIZE_MODEL;
  const prevSec = process.env.GEMINI_MODEL_SECONDARY;
  const prevUse = process.env.GEMINI_USE_SECONDARY_FOR;
  process.env.GEMINI_GENERATION_MODEL = 'gemma-4-31b-it';
  delete process.env.GEMINI_SANITIZE_MODEL;
  delete process.env.GEMINI_MODEL_SECONDARY;
  delete process.env.GEMINI_USE_SECONDARY_FOR;
  try {
    assert.equal(resolveSanitizeModelId(), 'gemini-3.5-flash-lite');
    assert.equal(resolveGenerationModelId('commentary_copyedit'), 'gemini-3.5-flash-lite');
    assert.equal(resolveGenerationModelId('comment_pack_base'), 'gemma-4-31b-it');
  } finally {
    if (prevGen === undefined) delete process.env.GEMINI_GENERATION_MODEL;
    else process.env.GEMINI_GENERATION_MODEL = prevGen;
    if (prevSan === undefined) delete process.env.GEMINI_SANITIZE_MODEL;
    else process.env.GEMINI_SANITIZE_MODEL = prevSan;
    if (prevSec === undefined) delete process.env.GEMINI_MODEL_SECONDARY;
    else process.env.GEMINI_MODEL_SECONDARY = prevSec;
    if (prevUse === undefined) delete process.env.GEMINI_USE_SECONDARY_FOR;
    else process.env.GEMINI_USE_SECONDARY_FOR = prevUse;
  }
});
