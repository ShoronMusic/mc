/**
 * Music8 公開の曲紹介本文（WP 投稿「Send to Gemini」相当）。
 * 部屋チャットの曲解説（ですます・80〜150字）とは別。
 */

import {
  getGeminiModel,
  logGeminiUsage,
  type GeminiUsageLogMeta,
} from '@/lib/gemini';
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { shouldMentionVocalGenderInProse } from '@/lib/commentary-youtube-facts';

export const MUSIC8_SONG_INTRO_USAGE = 'music8_song_intro';

/** WP `rectus_default_gemini_song_summary_rules_text` と同じルール（%s = 対象曲） */
export function music8SongIntroRulesTemplate(): string {
  return `以下の対象曲について、「楽曲解説の要約（新着）」を1段落で書く。

対象曲: %s

【必ず含める3要素（この順で自然につなぐ）】
1. アーティスト紹介（コラボの場合は関係者それぞれを簡潔に）とリリース情報（アルバム名・先行/第n弾シングル等・リリース年月、レーベルは分かれば）
2. 歌詞のメッセージ、社会的背景・反響、メディア評価、サンプル/カバー・影響など（確認できた範囲）
3. ジャンルと音楽的特徴（ジャンル名、楽器・ボーカル・リズム・制作陣など要点のみ）

【分量】
- 全体で180～220字を目安（最大240字）。冗長な重複は削る。
- 必ず最後の句点まで書き切る。途中で止めない。180字未満は不合格。
- ジャンルを文末だけにまとめて繰り返す構成は禁止（同じジャンル列挙を2回以上書かない）。

【文体・禁止事項】
- 言い切り調。体言止め・短文のつなぎ・「である」調可。「です」「ます」「だ」「だぜ」禁止。
- ビギナーにも分かりやすい語彙。複雑な比喩は避ける。
- 「2026年現在も」など、時制を限定する表現は使わない。
- チャート順位、未確認のアルバム名、制作秘話は創作しない。
- リリース年月がメタに無いときは、年や月を創作しない（書かない）。
- メタの「スタイル: Pop」等はサイト分類の粗いラベルであり、制作ジャンルの断定ではない。ハードロック／メタル／スタジアムロックとして広く知られるアーティストなら、その事実を優先し、Pop に合わせてシンセやダンスビートを足さない。
- アーティストの国籍・バンド/ソロ・広く知られたボーカリスト名・典型的な音楽性は、訓練知識として確認できる範囲で書いてよい。
- どの曲にも使える「親しみやすいメロディ／洗練されたシンセ／タイトでダンサブル／耳に残るフック／サウンドスケープ」の連打は禁止。この曲・このバンドに固有の楽器や声を1点具体化する。
- 名前が分からないときは「男性ボーカル」「女性ボーカル」と書かず「ボーカル」にする。例外は Electronica / Dance で、メイン以外のフィーチャー名がクレジットに無いときだけ性別を書いてよい。
- スローな情感曲・パワーバラードなど、バラードと分かる場合はハードロック／ポップ等に限らず、本文に「バラード」と一言入れる。分からないときは書かない。

【文末の締め（重要）】
- 段落の最後は、説明的な「〜が特徴」「〜を特徴とする」「〜といえる」「〜が印象的」で終えない。
- 最後の一文（または短い句）は、曲の雰囲気に合うかっこいい動詞の言い切り、または刺激的・印象的な名詞で締める（例: 「神経を焼き尽くす。」「暗黒を突き抜ける。」「終わりなき悪夢。」）。
- ジャンル名の羅列や楽器の説明リストの直後に「が特徴」で終わる構成は禁止。音楽的描写のあと、別の短い締めの句を置く。

【出力形式】
- 1段落のみ。空行・見出し・「第1部」等のラベル・箇条書き・出典URLは付けない。
- 出力は完成した日本語の1段落だけ。思考過程・英語・文字数カウントは出さない。`;
}

export function formatMusic8SongIntroArtistTitle(artist: string, title: string): string {
  const a = artist.trim();
  const t = title.trim();
  if (a && t) return `${a} - ${t}`;
  return a || t;
}

export function buildMusic8SongIntroPrompt(opts: {
  artistTitle: string;
  knownFacts?: string | null;
}): string {
  const artistTitle = opts.artistTitle.trim() || '（不明）';
  const rules = music8SongIntroRulesTemplate().replace('%s', artistTitle);
  const facts = (opts.knownFacts ?? '').trim();
  if (!facts) return rules;
  return `${rules}

【確認済みメタ（この範囲の事実は使ってよい。無い項目は推測で埋めない）】
${facts}`;
}

function polishIntroText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 公開曲紹介として短すぎる／途中切れか */
export function looksIncompleteMusic8SongIntro(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  if (t.length < 150) return true;
  if (/[、,：:]$/.test(t)) return true;
  if (/年\d{1,2}月$/.test(t)) return true;
  if (!/[。！？.!?]["」』）】]*$/.test(t)) return true;
  return false;
}

function candidateFinishReason(response: unknown): string {
  const r = response as { candidates?: Array<{ finishReason?: string }> };
  return String(r.candidates?.[0]?.finishReason ?? '');
}

export async function generateMusic8SongIntro(opts: {
  artist: string;
  title: string;
  knownFacts?: string | null;
  usageMeta?: GeminiUsageLogMeta;
}): Promise<{ text: string; incomplete?: boolean } | { error: string }> {
  const model = getGeminiModel(MUSIC8_SONG_INTRO_USAGE);
  if (!model) {
    return { error: 'Gemini を利用できません（API キー未設定、または停止中）。' };
  }

  const artistTitle = formatMusic8SongIntroArtistTitle(opts.artist, opts.title);
  if (!artistTitle) return { error: 'アーティストと曲名が必要です。' };

  const basePrompt = buildMusic8SongIntroPrompt({
    artistTitle,
    knownFacts: opts.knownFacts,
  });
  const modelId = resolveGenerationModelId(MUSIC8_SONG_INTRO_USAGE);

  const runOnce = async (
    prompt: string,
    maxOutputTokens: number,
  ): Promise<{ text: string; finishReason: string }> => {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens },
    });
    logGeminiUsage(MUSIC8_SONG_INTRO_USAGE, result.response);
    await persistGeminiUsageLog(MUSIC8_SONG_INTRO_USAGE, result.response.usageMetadata, {
      videoId: opts.usageMeta?.videoId ?? null,
      userId: opts.usageMeta?.userId ?? null,
    });
    const text = polishIntroText(
      extractTextFromGenerateContentResponse(result.response, modelId),
    );
    return { text, finishReason: candidateFinishReason(result.response) };
  };

  try {
    let last = await runOnce(basePrompt, 2048);
    const needRetry =
      looksIncompleteMusic8SongIntro(last.text) || /MAX_TOKENS/i.test(last.finishReason);
    if (needRetry) {
      const retry = await runOnce(
        `${basePrompt}\n\n【再出力】前回は途中で切れていた。180字以上、句点で終わる完成した1段落だけを出力。`,
        4096,
      );
      if (
        !looksIncompleteMusic8SongIntro(retry.text) ||
        retry.text.length > last.text.length
      ) {
        last = retry;
      }
    }
    if (!last.text) return { error: '生成された本文が空でした。' };
    return { text: last.text, incomplete: looksIncompleteMusic8SongIntro(last.text) };
  } catch (e) {
    console.error('[music8-song-intro-gemini]', e);
    return { error: 'Gemini の呼び出しに失敗しました。' };
  }
}

export function buildKnownFactsLines(opts: {
  originalReleaseDate?: string | null;
  style?: string | null;
  vocal?: string | null;
  genres?: string[] | null;
  youtubeFacts?: string | null;
  artistDisplay?: string | null;
  hasNamedFeaturedArtist?: boolean;
}): string {
  const lines: string[] = [];
  const date = opts.originalReleaseDate?.trim();
  if (date) lines.push(`- 原盤日: ${date}`);
  const style = opts.style?.trim();
  if (style) {
    lines.push(`- サイト分類スタイル（粗いナビ。制作ジャンルの断定には使わない）: ${style}`);
  }
  const vocal = opts.vocal?.trim();
  if (vocal) {
    const allowGender = shouldMentionVocalGenderInProse({
      style,
      artistDisplay: opts.artistDisplay,
      hasNamedFeaturedArtist: opts.hasNamedFeaturedArtist,
    });
    lines.push(
      allowGender
        ? `- ボーカル性別（フィーチャー名がクレジットに無い Electronica/Dance。本文で「女性ボーカル」「男性ボーカル」としてよい）: ${vocal}`
        : `- ボーカル記号（F/M。本文では「男性ボーカル」「女性ボーカル」にしない。名前が無ければ「ボーカル」）: ${vocal}`,
    );
  }
  const genres = (opts.genres ?? []).map((g) => g.trim()).filter(Boolean);
  if (genres.length > 0) lines.push(`- ジャンル: ${genres.join(', ')}`);
  const yt = (opts.youtubeFacts ?? '').trim();
  if (yt) lines.push(yt);
  return lines.join('\n');
}
