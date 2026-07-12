/**
 * Gemini アーティストプロフィール JSON → 管理画面ドラフト
 */

import { extractEnglishArtistNameFromDescription } from '@/lib/artist-english-name';

export type AdminArtistProfileDraft = {
  name: string;
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

export function extractJsonObjectFromGeminiText(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  const body = fence ? fence[1].trim() : t;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
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

  return {
    name: artistName.trim(),
    nameEn: extractEnglishArtistNameFromDescription(descriptionEn),
    nameJa: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.nameJa])),
    originCountry: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.origin])),
    activePeriod: normalizeDashField(asTrimmedString(fields[GEMINI_KEYS.activePeriod])),
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
  return {
    name: name.trim(),
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
