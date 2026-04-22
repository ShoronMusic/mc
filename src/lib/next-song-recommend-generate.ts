/**
 * 「次に聴くなら」: Gemini が 1〜3 曲を JSON で返す（試験用）。
 */

import {
  getGeminiModel,
  logGeminiUsage,
  type GeminiUsageLogMeta,
} from '@/lib/gemini';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';

const USAGE_CTX = 'next_song_recommend';

export type NextSongPick = {
  recommendationId?: string;
  source?: 'new' | 'db';
  artist: string;
  title: string;
  reason: string;
  youtubeSearchQuery: string;
  /** モデル自己申告の根拠タグ（例: era_80s, clean_guitar, new_wave） */
  whyTags?: string[];
  /** 年代一致の自己評価（前後5年内を優先） */
  eraFit?: 'within_5y' | 'outside_5y' | 'unknown';
  /** ヒット度一致の自己評価（入力曲がニッチ想定なら緩和可） */
  popularityFit?: 'similar_scale' | 'niche_match' | 'unknown';
  /** 短い補足（任意） */
  selectionNote?: string;
};

function readGeneratedText(response: { text: () => string }): string {
  return extractTextFromGenerateContentResponse(response, resolveGenerationModelId(USAGE_CTX));
}

function parsePicksFromModelText(raw: string): NextSongPick[] | null {
  const t = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  const jsonStr = fenced ? fenced[1]!.trim() : t;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: NextSongPick[] = [];
  for (const row of parsed) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const artist = typeof r.artist === 'string' ? r.artist.trim() : '';
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
    const youtubeSearchQuery =
      typeof r.youtubeSearchQuery === 'string'
        ? r.youtubeSearchQuery.trim()
        : typeof r.youtube_search_query === 'string'
          ? r.youtube_search_query.trim()
          : '';
    const whyTags = Array.isArray(r.whyTags)
      ? r.whyTags.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 6)
      : Array.isArray(r.why_tags)
        ? r.why_tags.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 6)
        : [];
    const eraFitRaw =
      typeof r.eraFit === 'string'
        ? r.eraFit
        : typeof r.era_fit === 'string'
          ? r.era_fit
          : '';
    const popularityFitRaw =
      typeof r.popularityFit === 'string'
        ? r.popularityFit
        : typeof r.popularity_fit === 'string'
          ? r.popularity_fit
          : '';
    const selectionNote =
      typeof r.selectionNote === 'string'
        ? r.selectionNote.trim().slice(0, 120)
        : typeof r.selection_note === 'string'
          ? r.selection_note.trim().slice(0, 120)
          : '';
    const eraFit: NextSongPick['eraFit'] =
      eraFitRaw === 'within_5y' || eraFitRaw === 'outside_5y' ? eraFitRaw : 'unknown';
    const popularityFit: NextSongPick['popularityFit'] =
      popularityFitRaw === 'similar_scale' || popularityFitRaw === 'niche_match'
        ? popularityFitRaw
        : 'unknown';
    if (!artist || !title) continue;
    out.push({
      artist: artist.slice(0, 120),
      title: title.slice(0, 200),
      reason: reason.slice(0, 280),
      youtubeSearchQuery: youtubeSearchQuery.slice(0, 200) || `${artist} ${title} official`,
      ...(whyTags.length > 0 ? { whyTags } : {}),
      ...(eraFit ? { eraFit } : {}),
      ...(popularityFit ? { popularityFit } : {}),
      ...(selectionNote ? { selectionNote } : {}),
    });
    if (out.length >= 3) break;
  }
  return out.length > 0 ? out : null;
}

/**
 * @param currentSongLabel 例: "Oasis — Wonderwall"（表示用の1行）
 * @param userTasteBlock 手動＋自動趣向の合成テキスト（無ければ null）
 */
export async function generateNextSongRecommendPicks(
  currentSongLabel: string,
  options?: {
    userTasteBlock?: string | null;
    commentarySnippet?: string | null;
    seedPublishedAtIso?: string | null;
    excludeSongLabels?: string[] | null;
    usageMeta?: GeminiUsageLogMeta;
  },
): Promise<NextSongPick[] | null> {
  const model = getGeminiModel(USAGE_CTX);
  if (!model) return null;

  const taste = (options?.userTasteBlock ?? '').trim();
  const commentary = (options?.commentarySnippet ?? '').trim().slice(0, 2000);
  const seedPublishedAtIso = (options?.seedPublishedAtIso ?? '').trim().slice(0, 60);
  const excludeSongLabels = Array.isArray(options?.excludeSongLabels)
    ? options!.excludeSongLabels!.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).slice(0, 48)
    : [];
  const label = currentSongLabel.trim().slice(0, 400);

  const prompt = `あなたは洋楽チャットの選曲アシスタントです。次の【いま聴いている曲】のあとに続けて聴くとよさそうな曲を、**1〜3曲**提案してください。

【いま聴いている曲】
${label}
${seedPublishedAtIso ? `\n【参考: 種曲の動画公開日時（ISO）】\n${seedPublishedAtIso}\n` : ''}${taste ? `\n【このユーザーの趣向メモ（参考。押しつけない）】\n${taste.slice(0, 3500)}\n` : ''}${commentary ? `\n【直近の曲解説の抜粋（参考）】\n${commentary}\n` : ''}
${excludeSongLabels.length > 0 ? `\n【今回の提案で除外する既出候補（重複禁止。直近フローで「種曲」だった曲も含む）】\n${excludeSongLabels.map((s) => `- ${s}`).join('\n')}\n` : ''}
【厳守】
・実在する楽曲・実在するアーティスト名のみ。自信がない曲は入れない。
・**ヒット度（世間的スケール）をできるだけ近づける**。入力曲が広く知られたヒット曲なら、候補も同程度に一般認知が高い曲を優先する。
・入力曲がマニアック／ニッチな場合は、上の「ヒット度の近さ」制約を弱めてよい（知名度よりテイスト一致を優先）。
・**時代の近さを優先**する。まず入力曲の前後5年を優先し、そこから外すのは近い候補が不足する場合に限る。
・入力曲が**1年以内の新曲**と判断できる場合、または入力曲が**マニアック／ニッチ**と判断した場合は、提案数は **0〜1曲** に制限してよい（無理に3曲出さない）。
・**YouTube の動画 URL は書かない**（架空 URL 防止）。代わりに **youtubeSearchQuery** に、YouTube 検索で公式音源が出やすい短いクエリ（英語中心で可）を入れる。
・各国チャートの具体順位・受賞・売上の断定は書かない。
・reason は 1〜2 文・ですます調。ジャンルや雰囲気のつながりを簡潔に。
・出力は **JSON 配列のみ**（前後に説明文や Markdown 禁止）。各要素は次のキーを持つオブジェクト:
  artist (string), title (string), reason (string), youtubeSearchQuery (string)
・根拠可視化のため、可能なら次の補助キーも付ける:
  whyTags (string[]), eraFit ("within_5y" | "outside_5y"), popularityFit ("similar_scale" | "niche_match"), selectionNote (string)
・通常は最大 3 個。上記の新曲/ニッチ条件では最大 1 個（0 件可）。`;

  try {
    const result = await model.generateContent(prompt);
    logGeminiUsage(USAGE_CTX, result.response);
    await persistGeminiUsageLog(USAGE_CTX, result.response.usageMetadata, options?.usageMeta);
    const text = readGeneratedText(result.response);
    if (!text) return null;
    return parsePicksFromModelText(text);
  } catch (e) {
    console.error('[next-song-recommend-generate]', e);
    return null;
  }
}
