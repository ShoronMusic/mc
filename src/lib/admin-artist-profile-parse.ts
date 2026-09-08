/**
 * Gemini アーティストプロフィール JSON → 管理画面ドラフト
 */

import { extractEnglishArtistNameFromDescription } from '@/lib/artist-english-name';
import { formatArtistDisplayName } from '@/lib/music8-artist-display';
import { splitArtistNameForM8Storage } from '@/lib/song-registration-normalize';

/** Music8 / WP `thePrefix` 相当（Include "The" Prefix は `The`） */
export type AdminArtistThePrefix = 'The' | 'A' | 'An';

export type AdminArtistProfileDraft = {
  /** 表示名（the_prefix + name_base の合成。API 検索・DB `name` 用） */
  name: string;
  /** 冠詞なし本体（DB `name_base`） */
  nameBase: string;
  /** DB `the_prefix`。なしは null */
  thePrefix: AdminArtistThePrefix | null;
  nameEn: string | null;
  nameJa: string | null;
  originCountry: string | null;
  activePeriod: string | null;
  birthDate: string | null;
  deathDate: string | null;
  occupations: string[];
  descriptionEn: string | null;
  profileText: string | null;
  catalogScope: 'domestic' | 'western' | 'unknown';
  spotifyArtistId: string | null;
  spotifyArtistImages: string | null;
  spotifyArtistPopularity: number | null;
  youtubeChannelId: string | null;
  youtubeChannelTitle: string | null;
  wikipediaPage: string | null;
};

export function normalizeAdminArtistThePrefix(
  raw: string | null | undefined,
): AdminArtistThePrefix | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (t === '1') return 'The';
  const lower = t.toLowerCase();
  if (lower === 'the') return 'The';
  if (lower === 'a') return 'A';
  if (lower === 'an') return 'An';
  return null;
}

export function composeAdminArtistDisplayName(
  nameBase: string,
  thePrefix: AdminArtistThePrefix | null | undefined,
): string {
  const base = nameBase.trim();
  if (!base) return '';
  return formatArtistDisplayName(base, thePrefix ?? null) || base;
}

/** 入力文字列 → name_base / the_prefix / 表示名 */
export function splitAdminArtistNameParts(raw: string): {
  nameBase: string;
  thePrefix: AdminArtistThePrefix | null;
  name: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { nameBase: '', thePrefix: null, name: '' };
  const split = splitArtistNameForM8Storage(trimmed);
  if (!split) {
    return { nameBase: trimmed, thePrefix: null, name: trimmed };
  }
  const thePrefix = normalizeAdminArtistThePrefix(split.thePrefix);
  const nameBase = split.nameBase.trim() || trimmed;
  return {
    nameBase,
    thePrefix,
    name: composeAdminArtistDisplayName(nameBase, thePrefix),
  };
}

export function withSyncedAdminArtistDisplayName(
  draft: AdminArtistProfileDraft,
): AdminArtistProfileDraft {
  const nameBase = draft.nameBase.trim() || draft.name.trim();
  const thePrefix = normalizeAdminArtistThePrefix(draft.thePrefix);
  return {
    ...draft,
    nameBase,
    thePrefix,
    name: composeAdminArtistDisplayName(nameBase, thePrefix) || draft.name.trim(),
  };
}

const GEMINI_KEYS = {
  body: '本文',
  origin: 'Origin',
  activePeriod: '活動開始年',
  birth: '生年月日（個人の場合）',
  nameJa: '日本語読み',
  death: '永眠（個人の場合）',
  occupation: 'Occupation',
} as const;

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeDashField(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === '-' || t === '—' || t === '－') return null;
  return t;
}

/**
 * 活動期間。活動中は Music8 同様 `1989 - `（「現在」「present」等は付けない）。
 */
export function normalizeAdminArtistActivePeriod(raw: string | null | undefined): string | null {
  const base = normalizeDashField(typeof raw === 'string' ? raw : null);
  if (!base) return null;
  const stripped = base
    .replace(/\s*[-–—ー−]\s*(?:現在|いま|今|present|now|current|ongoing|actuel)\s*$/i, ' - ')
    .replace(/\s+/g, ' ')
    .trimEnd();
  return normalizeDashField(stripped) ?? stripped;
}

function tryParseJsonObject(slice: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(slice) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** JSON 文字列リテラル内の未エスケープ改行・タブを \\n / \\t に直す */
export function repairUnescapedControlsInJsonStrings(json: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (inString) {
      if (escape) {
        out += c;
        escape = false;
        continue;
      }
      if (c === '\\') {
        out += c;
        escape = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        out += c;
        continue;
      }
      if (c === '\n') {
        out += '\\n';
        continue;
      }
      if (c === '\r') {
        out += '\\r';
        continue;
      }
      if (c === '\t') {
        out += '\\t';
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') inString = true;
    out += c;
  }
  return out;
}

export function extractJsonObjectFromGeminiText(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = (fence ? fence[1] : t).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const slice = body.slice(start, end + 1);

  const direct = tryParseJsonObject(slice);
  if (direct) return direct;

  const noTrailingComma = slice.replace(/,\s*([}\]])/g, '$1');
  const afterComma = tryParseJsonObject(noTrailingComma);
  if (afterComma) return afterComma;

  const repaired = repairUnescapedControlsInJsonStrings(noTrailingComma);
  return tryParseJsonObject(repaired);
}

function splitBodyText(body: string): { descriptionEn: string | null; profileText: string | null } {
  const t = body.replace(/\r\n/g, '\n').trim();
  if (!t) return { descriptionEn: null, profileText: null };
  const nl = t.indexOf('\n');
  if (nl < 0) {
    return { descriptionEn: t, profileText: null };
  }
  const en = t.slice(0, nl).trim();
  const ja = t.slice(nl + 1).trim();
  return {
    descriptionEn: en || null,
    profileText: ja || null,
  };
}

function parseOccupations(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,、/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseGeminiArtistProfileFields(
  fields: Record<string, unknown>,
  artistName: string,
  catalogScope: AdminArtistProfileDraft['catalogScope'] = 'domestic',
): AdminArtistProfileDraft {
  const bodyRaw = asTrimmedString(fields[GEMINI_KEYS.body]);
  const { descriptionEn, profileText } = splitBodyText(bodyRaw);

  const occupations = parseOccupations(normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.occupation])));

  const parts = splitAdminArtistNameParts(artistName);
  return {
    name: parts.name,
    nameBase: parts.nameBase,
    thePrefix: parts.thePrefix,
    nameEn: extractEnglishArtistNameFromDescription(descriptionEn),
    nameJa: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.nameJa])),
    originCountry: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.origin])),
    activePeriod: normalizeAdminArtistActivePeriod(asTrimmedString(fields[GEMINI_KEYS.activePeriod])),
    birthDate: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.birth])),
    deathDate: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.death])),
    occupations,
    descriptionEn,
    profileText,
    catalogScope,
    spotifyArtistId: null,
    spotifyArtistImages: null,
    spotifyArtistPopularity: null,
    youtubeChannelId: null,
    youtubeChannelTitle: null,
    wikipediaPage: null,
  };
}

export function emptyAdminArtistProfileDraft(
  name: string,
  catalogScope: AdminArtistProfileDraft['catalogScope'] = 'domestic',
): AdminArtistProfileDraft {
  const parts = splitAdminArtistNameParts(name);
  return {
    name: parts.name,
    nameBase: parts.nameBase,
    thePrefix: parts.thePrefix,
    nameEn: null,
    nameJa: null,
    originCountry: catalogScope === 'domestic' ? 'JPN' : null,
    activePeriod: null,
    birthDate: null,
    deathDate: null,
    occupations: [],
    descriptionEn: null,
    profileText: null,
    catalogScope,
    spotifyArtistId: null,
    spotifyArtistImages: null,
    spotifyArtistPopularity: null,
    youtubeChannelId: null,
    youtubeChannelTitle: null,
    wikipediaPage: null,
  };
}
