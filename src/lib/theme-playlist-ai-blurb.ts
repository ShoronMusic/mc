/**
 * テーマプレイリスト用: お題観点の短い AI コメント（講評ではなく寄り添い）
 */

import { isRejectedChatOrTidbitOutput } from '@/lib/ai-output-policy';
import {
  getGeminiModel,
  logGeminiUsage,
  type GeminiUsageLogMeta,
} from '@/lib/gemini';
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import type { ThemePlaylistDefinition } from '@/lib/theme-playlist-definitions';

const CONTEXT = 'theme_playlist_comment';
const OUTPUT_MAX = 220;
const OUTPUT_MIN = 70;

function readGeneratedText(
  response: { text: () => string },
): string {
  return extractTextFromGenerateContentResponse(response, resolveGenerationModelId(CONTEXT));
}

const FALLBACK =
  'この曲の雰囲気を、お題の気分に寄せて楽しめそうです。詳しいコメントは次回お試しください。';

function buildDeterministicThemeReview(
  theme: ThemePlaylistDefinition,
  artistT: string,
  titleT: string,
): string {
  const text = `${artistT}の「${titleT}」は、リズムとサウンドの前向きさから「${theme.labelJa}」に寄せやすい一曲です。テンポや楽器の厚みが持つ推進力が、お題のムードを後押しするタイプの楽曲として楽しめます。`;
  return text.length > OUTPUT_MAX ? `${text.slice(0, OUTPUT_MAX - 1)}…` : text;
}

/** 曲解説抜粋の挨拶・MC調をそのまま返してしまったときに弾く */
const SUBSTANTIVE_HINT_RE =
  /リズム|旋律|テンポ|サウンド|ボーカル|ギター|ドラム|ベース|コード|ビート|イントロ|サビ|聴き|ムード|雰囲気|音色|シャウト|アップテンポ|メロディ|ノリ|この曲|一曲|楽曲|199\d|20\d{2}/;

function isShallowGreetingOrMcCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const greetingish =
    /皆さん|おはようございます|おはよう|本日は|本日の|今日は|どうも|こんにちは|こんばんは/.test(t);
  if (!greetingish) return false;
  if (SUBSTANTIVE_HINT_RE.test(t)) return false;
  if (t.length >= 140) return false;
  return true;
}

function isInsufficientThemeReview(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.length < OUTPUT_MIN) return true;
  const sentenceCount = t.split(/[。！？]/).map((s) => s.trim()).filter(Boolean).length;
  return sentenceCount < 2;
}

/** 曲解説連結テキストの先頭に付きがちな挨拶行を落とし、お題講評プロンプトへの写り込みを減らす */
export function sanitizeCommentaryExcerptForThemePrompt(excerpt: string): string {
  const lines = excerpt.trim().split(/\n/);
  let start = 0;
  for (; start < Math.min(8, lines.length); start += 1) {
    const L = (lines[start] ?? '').trim();
    if (!L) continue;
    const looksLikeOpeningGreeting =
      L.length < 130 &&
      /皆さん|おはようございます|おはよう|本日は|本日の|今日は|今日の|どうも[!！]?$|こんにちは|こんばんは/.test(L) &&
      !SUBSTANTIVE_HINT_RE.test(L);
    if (looksLikeOpeningGreeting) continue;
    break;
  }
  return lines.slice(start).join('\n').trim();
}

export async function generateThemePlaylistAiBlurb(
  theme: ThemePlaylistDefinition,
  artist: string,
  title: string,
  usageMeta?: GeminiUsageLogMeta,
  options?: { commentaryExcerpt?: string | null },
): Promise<string> {
  const model = getGeminiModel(CONTEXT);
  const artistT = artist.trim().slice(0, 200) || '（不明）';
  const titleT = title.trim().slice(0, 200) || '（不明）';

  if (!model) {
    return '（AIコメントはサーバーに GEMINI_API_KEY が設定されているときに表示されます。）';
  }

  const excerpt =
    typeof options?.commentaryExcerpt === 'string' && options.commentaryExcerpt.trim()
      ? options.commentaryExcerpt.trim().slice(0, 4500)
      : '';
  const excerptBlock = excerpt
    ? `\n【参考: この部屋で直前に出たAI曲解説の抜粋（事実の追加はしない。挨拶や定型のMC文は参考にせず、音楽面だけを手がかりにする）】\n${excerpt}\n`
    : '';

  const prompt = `あなたは洋楽リスナー向け音楽サロンの短いナビゲーターです。
【お題】${theme.labelJa}
【お題の観点】${theme.aiGuidanceJa}
【選ばれた曲】アーティスト: ${artistT} / 曲名: ${titleT}
${excerptBlock}
【出力ルール】
- 日本語で、${OUTPUT_MIN}〜${OUTPUT_MAX}文字、2〜3文の1段落。
- この曲を「お題の観点からどう楽しめそうか」を、寄り添うトーンで**率直に講評**する。
- **挨拶禁止**（おはようございます、皆さん、本日は、今日は、どうも 等で始めない）。**ラジオMC風の呼びかけ禁止**。1語目からサウンド・歌い方・テンポ・ムードなど**音楽の話**に入る。
- お題ラベル（「${theme.labelJa}」など）を本文で繰り返すだけの1文は禁止。曲解説抜粋に似た挨拶文があっても**コピーしない**。
- 基本はポジティブ中心でまとめる。弱点を入れるのは「お題から明確に外れる」と判断できる場合だけにし、否定ではなく「別のお題やムードならより映える」など**楽曲・サウンドの観点**で柔らかく言い換える。
- 抽象語だけで終わらせない（「場面」「雰囲気」だけで済ませない）。**楽曲のサウンド・歌い方・テンポ・楽器編成など、曲そのものの具体**で説明する。
- 曲を指すときは **音楽アーティスト名と曲名** に統一する。YouTube チャンネル名・VEVO・公式アップロード風の名義は本文に出さない（入力に含まれていても無視し、上記の「アーティスト」「曲名」を使う）。
- **音量・再生環境・いつ聴くか・生活シーンへの聴き方アドバイスは禁止**（お題と曲の関係の説明に徹する）。
- 曲そのものの評価に加えて、可能ならアーティストの作風にも短く触れる（例: 「このアーティストは洒落たポップ感の曲が多い」）。ただし不確かな事実を断定しない。
- チャート順位・受賞・売上・歌詞の長い引用は禁止。分からない事実は書かない。
- マークダウン・箇条書き・見出しは使わない。`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 256 },
    });
    logGeminiUsage(CONTEXT, result.response);
    await persistGeminiUsageLog(CONTEXT, result.response.usageMetadata, {
      roomId: usageMeta?.roomId ?? null,
      videoId: usageMeta?.videoId ?? null,
    });
    let text = readGeneratedText(result.response).trim();
    text = text.replace(/\r\n/g, '\n').replace(/\n+/g, ' ');

    const needRetry =
      !text ||
      isRejectedChatOrTidbitOutput(text) ||
      isShallowGreetingOrMcCopy(text) ||
      isInsufficientThemeReview(text);

    if (needRetry) {
      const repairPrompt = `次の短すぎる講評を、要件を満たすように書き直してください。
【お題】${theme.labelJa}
【選ばれた曲】アーティスト: ${artistT} / 曲名: ${titleT}
【下書き】${text || '（空）'}
【要件】
- 日本語で ${OUTPUT_MIN}〜${OUTPUT_MAX}文字、2〜3文。
- 1文目でサウンド面とお題との関係を述べ、2文目は曲の特徴やアーティストの傾向に触れる。YouTube チャンネル名・VEVO 等は使わない。音量・聴く場面・生活シーンへの言及は禁止。弱点はお題から明確に外れるときだけ、楽曲面から柔らかく言い換える。
- 挨拶禁止、呼びかけ禁止、箇条書き禁止。`;
      const repaired = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: repairPrompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 320 },
      });
      logGeminiUsage(CONTEXT, repaired.response);
      await persistGeminiUsageLog(CONTEXT, repaired.response.usageMetadata, {
        roomId: usageMeta?.roomId ?? null,
        videoId: usageMeta?.videoId ?? null,
      });
      text = readGeneratedText(repaired.response).trim().replace(/\r\n/g, '\n').replace(/\n+/g, ' ');
    }

    if (!text) return buildDeterministicThemeReview(theme, artistT, titleT);
    if (isRejectedChatOrTidbitOutput(text)) return buildDeterministicThemeReview(theme, artistT, titleT);
    if (isShallowGreetingOrMcCopy(text)) return buildDeterministicThemeReview(theme, artistT, titleT);
    if (isInsufficientThemeReview(text)) return buildDeterministicThemeReview(theme, artistT, titleT);
    if (text.length > OUTPUT_MAX) text = `${text.slice(0, OUTPUT_MAX - 1)}…`;
    return text;
  } catch (e) {
    console.error('[theme-playlist-ai-blurb]', e);
    return buildDeterministicThemeReview(theme, artistT, titleT) || FALLBACK;
  }
}
