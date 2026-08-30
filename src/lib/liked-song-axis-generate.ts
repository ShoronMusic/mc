/**
 * 気に入り軸ラボ: Gemini が効いていそうな軸と候補曲を JSON で返す。
 */

import type { GenerationConfig } from '@google/generative-ai';
import { extractJsonObjectFromGeminiText } from '@/lib/admin-artist-profile-parse';
import { getAdminGeminiModel } from '@/lib/gemini-admin';
import { extractTextFromGenerateContentResponse } from '@/lib/gemini-gemma-host';
import { logGeminiUsage, type GeminiUsageLogMeta } from '@/lib/gemini';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import {
  LIKED_SONG_AXIS_IDS,
  LIKED_SONG_POLARITIES,
  type LikedSongAxisId,
  type LikedSongPolarity,
  type LikedSongSalientAxis,
  type SongAxisFacts,
} from '@/lib/liked-song-axis-types';

export const LIKED_SONG_AXIS_USAGE_CTX = 'liked_song_axis_explore';

const MAX_PICKS = 10;
const MAX_SALIENT = 6;

export type LikedSongAxisAiPick = {
  artist: string;
  title: string;
  axis: LikedSongAxisId;
  polarity: LikedSongPolarity;
  reasonLabel: string;
  reason: string;
  youtubeSearchQuery: string;
  scores: Partial<Record<LikedSongAxisId, number | null>>;
};

export type LikedSongAxisGenerateResult = {
  salientAxes: LikedSongSalientAxis[];
  picks: LikedSongAxisAiPick[];
  model: string;
};

function asAxisId(raw: unknown): LikedSongAxisId | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return (LIKED_SONG_AXIS_IDS as readonly string[]).includes(s) ? (s as LikedSongAxisId) : null;
}

function asPolarity(raw: unknown): LikedSongPolarity {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return (LIKED_SONG_POLARITIES as readonly string[]).includes(s) ? (s as LikedSongPolarity) : 'other';
}

function asScoreMap(raw: unknown): Partial<Record<LikedSongAxisId, number | null>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<LikedSongAxisId, number | null>> = {};
  for (const id of LIKED_SONG_AXIS_IDS) {
    const v = o[id];
    if (v == null) {
      out[id] = null;
      continue;
    }
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    out[id] = Number.isFinite(n) ? n : null;
  }
  return out;
}

export function parseLikedSongAxisGenerateJson(raw: string): {
  salientAxes: LikedSongSalientAxis[];
  picks: LikedSongAxisAiPick[];
} | null {
  const obj = extractJsonObjectFromGeminiText(raw);
  if (!obj) return null;

  const salientAxes: LikedSongSalientAxis[] = [];
  const salientRaw = obj.salientAxes ?? obj.salient_axes;
  if (Array.isArray(salientRaw)) {
    for (const row of salientRaw) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = asAxisId(r.id ?? r.axis);
      if (!id) continue;
      const label = typeof r.label === 'string' ? r.label.trim().slice(0, 40) : '';
      const why = typeof r.why === 'string' ? r.why.trim().slice(0, 160) : '';
      salientAxes.push({
        id,
        label: label || id,
        why,
      });
      if (salientAxes.length >= MAX_SALIENT) break;
    }
  }

  const picks: LikedSongAxisAiPick[] = [];
  const picksRaw = obj.picks;
  if (!Array.isArray(picksRaw)) return salientAxes.length > 0 ? { salientAxes, picks: [] } : null;
  for (const row of picksRaw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const artist = typeof r.artist === 'string' ? r.artist.trim() : '';
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!artist || !title) continue;
    const axis = asAxisId(r.axis) ?? 'genre';
    const polarity = asPolarity(r.polarity);
    const reasonLabel =
      typeof r.reasonLabel === 'string'
        ? r.reasonLabel.trim()
        : typeof r.reason_label === 'string'
          ? r.reason_label.trim()
          : '';
    const reason = typeof r.reason === 'string' ? r.reason.trim() : '';
    const youtubeSearchQuery =
      typeof r.youtubeSearchQuery === 'string'
        ? r.youtubeSearchQuery.trim()
        : typeof r.youtube_search_query === 'string'
          ? r.youtube_search_query.trim()
          : '';
    picks.push({
      artist: artist.slice(0, 120),
      title: title.slice(0, 200),
      axis,
      polarity,
      reasonLabel: (reasonLabel || polarity).slice(0, 80),
      reason: reason.slice(0, 280),
      youtubeSearchQuery: youtubeSearchQuery.slice(0, 200) || `${artist} ${title} official`,
      scores: asScoreMap(r.scores ?? r.axisScores ?? r.axis_scores),
    });
    if (picks.length >= MAX_PICKS) break;
  }

  if (picks.length === 0 && salientAxes.length === 0) return null;
  return { salientAxes, picks };
}

function formatSeedFacts(seed: SongAxisFacts, music8FactsBlock: string | null): string {
  const lines = [
    `アーティスト: ${seed.artist || '不明'}`,
    `曲名: ${seed.title || '不明'}`,
    `リリース年: ${seed.year ?? '不明'}`,
    `ジャンル: ${seed.genres.length > 0 ? seed.genres.join('、') : '不明'}`,
    `スタイル: ${seed.style || '不明'}`,
    `ボーカル: ${seed.vocal || '不明'}`,
    `録音種別: ${seed.recordingKind || '不明'}`,
  ];
  const facts = (music8FactsBlock ?? '').trim().slice(0, 1800);
  if (facts) lines.push('', facts);
  return lines.join('\n');
}

export async function generateLikedSongAxisPicks(
  seed: SongAxisFacts,
  options?: {
    music8FactsBlock?: string | null;
    displayLabel?: string | null;
    usageMeta?: GeminiUsageLogMeta;
  },
): Promise<LikedSongAxisGenerateResult | null> {
  const model = getAdminGeminiModel(LIKED_SONG_AXIS_USAGE_CTX);
  if (!model) return null;

  const label = (options?.displayLabel ?? `${seed.artist} — ${seed.title}`).trim().slice(0, 400);
  const facts = formatSeedFacts(seed, options?.music8FactsBlock ?? null);
  const modelId = resolveGenerationModelId(LIKED_SONG_AXIS_USAGE_CTX);

  const prompt = `あなたは洋楽の類似探索アシスタントです。【種曲】を気に入った人が「どこが刺さったか」を軸に分解し、その軸から次に聴く候補曲を選んでください。

【種曲】
${label}

【種曲の事実（カタログ。不明は推測で埋めない）】
${facts}

【やること】
1. この曲が好きなら効いていそうな軸を 3〜6 本（salientAxes）。id は次のいずれかのみ:
   artist, genre, style, era, mood, performance, trend, vocal
2. 候補曲を **8〜10 曲**（picks）。軸を偏らせず配分する:
   - 同じアーティストを 2 曲以上（可能なら年代や曲調で分岐）
   - 同じ／近いジャンルの別アーティスト
   - 曲調の極性（より激しい／より穏やか）
   - 時代（前後5年を優先。足りなければ少し外してよい）
   - シーン／トレンド（チャート順位や「バズ」は書かない）
3. 各候補に、種曲との類似 0〜100（scores）。測れない軸は null。0 は「似ていない」。

【厳守】
・実在する洋楽・実在アーティストのみ。種曲自身は入れない。
・YouTube の動画 URL は書かない。youtubeSearchQuery に公式音源が出やすい短いクエリ。
・各国チャートの具体順位・受賞・売上の断定は禁止。
・reason は 1〜2 文・ですます調。reasonLabel は分岐理由（例: 「より激しい」「同じ New wave」）。
・出力は JSON オブジェクトのみ。

{
  "salientAxes": [ { "id": "mood", "label": "疾走感", "why": "短い理由" } ],
  "picks": [
    {
      "artist": "…",
      "title": "…",
      "axis": "genre",
      "polarity": "same" | "more_intense" | "more_mellow" | "earlier" | "later" | "adjacent" | "other",
      "reasonLabel": "同じ New wave",
      "reason": "ですます調",
      "youtubeSearchQuery": "Artist Title official",
      "scores": {
        "artist": 0,
        "genre": 80,
        "style": 90,
        "era": 70,
        "mood": 85,
        "performance": null,
        "trend": 75,
        "vocal": null
      }
    }
  ]
}`;

  const generationConfig: GenerationConfig = {
    temperature: 0.55,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
  };

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    logGeminiUsage(LIKED_SONG_AXIS_USAGE_CTX, result.response);
    await persistGeminiUsageLog(LIKED_SONG_AXIS_USAGE_CTX, result.response.usageMetadata, options?.usageMeta);
    const text = extractTextFromGenerateContentResponse(result.response, modelId);
    if (!text.trim()) return null;
    const parsed = parseLikedSongAxisGenerateJson(text);
    if (!parsed || parsed.picks.length === 0) return null;
    return { ...parsed, model: modelId };
  } catch (e) {
    console.error('[liked-song-axis-generate]', e);
    return null;
  }
}
