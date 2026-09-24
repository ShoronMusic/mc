/**
 * 外部 Gemini（Chrome 拡張「アーティスト保存」→ クリップボード JSON）を
 * アーティスト編集ドラフトへ取り込む。WP `gemini-to-wp-category.js` 相当。
 */
import { extractEnglishArtistNameFromDescription } from '@/lib/artist-english-name';
import { canonicalizeArtistOccupations } from '@/lib/artist-occupation-options';
import { normalizeYoutubeChannelRef } from '@/lib/music8-artist-display';
import {
  type AdminArtistProfileDraft,
  normalizeAdminArtistActivePeriod,
  parseGeminiArtistProfileFields,
  withSyncedAdminArtistDisplayName,
} from '@/lib/admin-artist-profile-parse';

const ORIGIN_TO_IOC: Record<string, string> = {
  germany: 'GER',
  german: 'GER',
  deutschland: 'GER',
  france: 'FRA',
  french: 'FRA',
  japan: 'JPN',
  japanese: 'JPN',
  australia: 'AUS',
  australian: 'AUS',
  sweden: 'SWE',
  swedish: 'SWE',
  norway: 'NOR',
  norwegian: 'NOR',
  netherlands: 'NED',
  dutch: 'NED',
  holland: 'NED',
  italy: 'ITA',
  italian: 'ITA',
  spain: 'ESP',
  spanish: 'ESP',
  canada: 'CAN',
  canadian: 'CAN',
  russia: 'RUS',
  russian: 'RUS',
  china: 'CHN',
  chinese: 'CHN',
  korea: 'KOR',
  korean: 'KOR',
  brazil: 'BRA',
  brazilian: 'BRA',
  ireland: 'IRL',
  irish: 'IRL',
  belgium: 'BEL',
  belgian: 'BEL',
  switzerland: 'SUI',
  swiss: 'SUI',
  austria: 'AUT',
  austrian: 'AUT',
  poland: 'POL',
  polish: 'POL',
  finland: 'FIN',
  finnish: 'FIN',
  denmark: 'DEN',
  danish: 'DEN',
  india: 'IND',
  indian: 'IND',
  'south korea': 'KOR',
  'new zealand': 'NZL',
  'hong kong': 'HKG',
  taiwan: 'TPE',
  jamaica: 'JAM',
  jamaican: 'JAM',
};

const ISO_TO_IOC: Record<string, string> = {
  DEU: 'GER',
  GBR: 'UK',
  CHE: 'SUI',
  NLD: 'NED',
  GRC: 'GRE',
  DNK: 'DEN',
  ZAF: 'RSA',
  IDN: 'INA',
  MYS: 'MAS',
  PHL: 'PHI',
  VNM: 'VIE',
  IRN: 'IRI',
  CHL: 'CHI',
  NGA: 'NGR',
  USA: 'US',
};

function normalizeOriginPart(p: string): string {
  const raw = p.trim();
  if (!raw) return raw;
  const o = raw.toUpperCase();
  if (o === 'USA' || o === 'UNITED STATES' || o === 'UNITED STATES OF AMERICA') return 'US';
  if (/^UK\(ENG\)$/.test(o)) return 'UK';
  if (/^UK\([A-Z]{3}\)$/.test(o)) return o;
  if (
    o === 'UK' ||
    o === 'UNITED KINGDOM' ||
    o === 'GREAT BRITAIN' ||
    o === 'BRITAIN' ||
    o === 'ENGLAND' ||
    o === 'SCOTLAND' ||
    o === 'WALES' ||
    o === 'NORTHERN IRELAND'
  ) {
    return 'UK';
  }
  const ioc = ORIGIN_TO_IOC[raw.toLowerCase()];
  if (ioc) return ioc;
  if (ISO_TO_IOC[o]) return ISO_TO_IOC[o];
  if (/^[A-Z]{2,3}$/.test(o)) return o;
  return raw;
}

/** WP と同様: Origin を IOC / US / UK 表記へ */
export function normalizeAdminArtistOriginCountry(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t || t === '-' || t === '—') return null;
  const parts = t
    .split(/\s*\/\s*|\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map(normalizeOriginPart).join(' / ');
}

function tryParseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(s) as unknown;
    if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
  } catch {
    /* continue */
  }
  return null;
}

/** クリップボード文字列 → オブジェクト（BOM・```json・前後文を多少吸収） */
export function parseExternalGeminiArtistClipboardJson(
  raw: string | null | undefined,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: 'empty' | 'parse'; preview?: string } {
  if (raw == null) return { ok: false, error: 'empty' };
  const text = String(raw).replace(/^\uFEFF/, '').trim();
  if (!text) return { ok: false, error: 'empty' };

  const direct = tryParseJsonObject(text);
  if (direct) return { ok: true, data: direct };

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inner = tryParseJsonObject(fence[1].trim());
    if (inner) return { ok: true, data: inner };
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = tryParseJsonObject(text.slice(start, end + 1));
    if (slice) return { ok: true, data: slice };
  }

  return { ok: false, error: 'parse', preview: text.slice(0, 80) };
}

function findFieldValue(
  data: Record<string, unknown>,
  matchers: readonly string[],
): string | null {
  for (const [key, val] of Object.entries(data)) {
    const n = key.replace(/[：:]\s*$/, '').trim();
    for (const m of matchers) {
      if (n === m || n.includes(m)) {
        if (typeof val === 'string') return val;
        if (val == null) return null;
        return String(val);
      }
    }
  }
  return null;
}

function normalizeDash(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t === '-' || t === '—' || t === '－') return null;
  return t;
}

/** 拡張が保存するキーゆれを、内部 parse 用の正規キーへ */
export function coerceExternalGeminiArtistFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const body = findFieldValue(data, ['本文']);
  const origin = findFieldValue(data, ['Origin']);
  const active = findFieldValue(data, ['活動開始年']);
  const birth = findFieldValue(data, ['生年月日（個人の場合）', '生年月日']);
  const nameJa = findFieldValue(data, ['日本語読み']);
  const death = findFieldValue(data, ['永眠（個人の場合）', '永眠']);
  const occupation = findFieldValue(data, ['Occupation']);
  const wikipedia = findFieldValue(data, ['Wikipedia Page', 'Wikipedia', 'wikipedia_page']);
  const youtube = findFieldValue(data, ['YouTube Channel', 'YouTube', 'youtube_channel']);

  const out: Record<string, unknown> = {};
  if (body != null) {
    // 英語文末 . の直後に日本語が続くとき改行を補う（WP 同様）
    out['本文'] = body.replace(/\.\s+([\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff])/u, '.\n$1');
  }
  if (origin != null) out['Origin'] = origin;
  if (active != null) out['活動開始年'] = active;
  if (birth != null) out['生年月日（個人の場合）'] = birth;
  if (nameJa != null) out['日本語読み'] = nameJa;
  if (death != null) out['永眠（個人の場合）'] = death;
  if (occupation != null) out['Occupation'] = occupation;
  if (wikipedia != null) out['Wikipedia Page'] = wikipedia;
  if (youtube != null) out['YouTube Channel'] = youtube;
  return out;
}

function looksLikeArtistClipboardFields(fields: Record<string, unknown>): boolean {
  return (
    typeof fields['本文'] === 'string' ||
    typeof fields['Origin'] === 'string' ||
    typeof fields['Occupation'] === 'string' ||
    typeof fields['日本語読み'] === 'string' ||
    typeof fields['活動開始年'] === 'string'
  );
}

/**
 * クリップボード JSON を既存ドラフトへマージ（name_base / the_prefix / 外部 ID は原則保持）。
 */
export function mergeExternalGeminiArtistClipboardIntoDraft(
  draft: AdminArtistProfileDraft,
  clipboardRaw: string,
):
  | { ok: true; draft: AdminArtistProfileDraft; fieldCount: number }
  | { ok: false; error: string; preview?: string } {
  const parsed = parseExternalGeminiArtistClipboardJson(clipboardRaw);
  if (!parsed.ok) {
    if (parsed.error === 'empty') {
      return {
        ok: false,
        error:
          'クリップボードが空です。Gemini タブで「アーティスト保存」直後に、このボタンを押してください。',
      };
    }
    return {
      ok: false,
      error:
        'クリップボードがアーティスト JSON ではありません。Gemini で「アーティスト保存」直後に再実行してください。',
      preview: parsed.preview,
    };
  }

  const coerced = coerceExternalGeminiArtistFields(parsed.data);
  if (!looksLikeArtistClipboardFields(coerced)) {
    return {
      ok: false,
      error:
        'アーティスト項目（本文 / Origin / Occupation 等）が見つかりません。拡張の「アーティスト保存」を確認してください。',
    };
  }

  const artistName =
    composeDisplayHint(draft) || draft.nameBase.trim() || draft.name.trim() || 'Artist';
  const generated = parseGeminiArtistProfileFields(coerced, artistName, draft.catalogScope);

  const originNorm =
    normalizeAdminArtistOriginCountry(generated.originCountry) ?? generated.originCountry;

  const wiki = normalizeDash(
    typeof coerced['Wikipedia Page'] === 'string' ? coerced['Wikipedia Page'] : null,
  );
  const ytRaw = normalizeDash(
    typeof coerced['YouTube Channel'] === 'string' ? coerced['YouTube Channel'] : null,
  );
  // extractYoutubeChannelIdFromMusic8 は music8-artist-import（node:fs）経由なので使わない
  const ytId = extractYoutubeChannelIdClient(ytRaw);

  const occupations = canonicalizeArtistOccupations(generated.occupations);

  const next = withSyncedAdminArtistDisplayName({
    ...draft,
    // 本体名・The は既存を優先（拡張は表示名を持たない）
    nameBase: draft.nameBase,
    thePrefix: draft.thePrefix,
    nameJa: generated.nameJa ?? draft.nameJa,
    nameEn:
      generated.nameEn ??
      extractEnglishArtistNameFromDescription(generated.descriptionEn) ??
      draft.nameEn,
    originCountry: originNorm ?? draft.originCountry,
    activePeriod:
      normalizeAdminArtistActivePeriod(generated.activePeriod) ?? draft.activePeriod,
    birthDate: generated.birthDate ?? draft.birthDate,
    deathDate: generated.deathDate ?? draft.deathDate,
    occupations: occupations.length > 0 ? occupations : draft.occupations,
    descriptionEn: generated.descriptionEn ?? draft.descriptionEn,
    profileText: generated.profileText ?? draft.profileText,
    wikipediaPage: wiki ?? draft.wikipediaPage,
    wikipediaUrl: draft.wikipediaUrl,
    youtubeChannelId: ytId ?? draft.youtubeChannelId,
    // Spotify 等は消さない
    spotifyArtistId: draft.spotifyArtistId,
    spotifyArtistImages: draft.spotifyArtistImages,
    spotifyArtistPopularity: draft.spotifyArtistPopularity,
    youtubeChannelTitle: draft.youtubeChannelTitle,
    catalogScope: draft.catalogScope,
  });

  return { ok: true, draft: next, fieldCount: Object.keys(coerced).length };
}

function composeDisplayHint(draft: AdminArtistProfileDraft): string {
  return (draft.name ?? '').trim();
}

/** クライアント安全な YouTube channel ID / @ハンドル抽出（UC… / @name / URL） */
export function extractYoutubeChannelIdClient(raw: string | null | undefined): string | null {
  return normalizeYoutubeChannelRef(raw);
}
