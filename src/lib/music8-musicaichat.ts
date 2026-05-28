/**
 * Music8 が配信する musicaichat 専用 JSON（v1）の取得。
 * 仕様: docs/music8-musicaichat-json-spec.md
 *
 * youtube_to_song.json は数 MB 級のため、プロセス内メモリに TTL キャッシュする。
 */

import { getMusic8ArtistJsonUrlCandidates } from '@/lib/music8-artist-display';
import {
  checkUrlExistsWithOptionalGcsAuth,
  fetchJsonWithOptionalGcsAuth,
} from '@/lib/music8-gcs-server';
import { fetchMusic8SongData } from '@/lib/music8-song-lookup';
import { MUSIC8_MUSICAICHAT_V1_BASE } from '@/lib/music8-data-urls';
import {
  extractMusic8SongFields,
  filterMusicaichatFactsBoilerplateLines,
} from '@/lib/music8-song-fields';

const DEFAULT_BASE_URL = MUSIC8_MUSICAICHAT_V1_BASE;

const DEFAULT_INDEX_TTL_MS = 60 * 60 * 1000;

export interface MusicaichatManifest {
  schema_version?: string;
  generated_at?: string;
  base_url?: string;
  counts?: {
    songs?: number;
    youtube_index_entries?: number;
    artists?: number;
  };
  index_files?: {
    youtube_to_song?: string;
    artist_index?: string;
  };
}

export interface MusicaichatYoutubeIndexEntry {
  artist_slug: string;
  song_slug: string;
  role?: string;
  recording_kind?: string;
}

export interface MusicaichatStableKey {
  artist_slug: string;
  song_slug: string;
}

export interface MusicaichatFactsForAi {
  locale?: string;
  opening_lines?: string[];
  bullets?: string[];
  constraints_for_model?: string | string[];
  video_specific_line_template?: string;
}

/** 1 曲分 JSON（取得・プロンプト用に必要なフィールドのみ型付け） */
export interface MusicaichatSongJson {
  schema_version?: string;
  stable_key: MusicaichatStableKey;
  display?: {
    song_title?: string;
    primary_artist_name?: string;
    credit_line?: string;
    primary_artist_name_ja?: string;
  };
  recording?: unknown;
  releases?: unknown;
  classification?: unknown;
  youtube?: { ids?: string[]; primary_id?: string };
  identifiers?: unknown;
  facts_for_ai?: MusicaichatFactsForAi;
  relations?: unknown;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

/**
 * 未設定時は本番デフォルト URL。
 * 無効化: `MUSIC8_MUSICAICHAT_BASE_URL=0` または `off` / `false`（大小無視）
 */
export function getMusic8MusicaichatBaseUrl(): string | null {
  const raw = process.env.MUSIC8_MUSICAICHAT_BASE_URL?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower === '0' || lower === 'off' || lower === 'false' || lower === 'disabled') {
      return null;
    }
    return normalizeBaseUrl(raw);
  }
  return normalizeBaseUrl(DEFAULT_BASE_URL);
}

function indexTtlMs(): number {
  const n = Number(process.env.MUSIC8_MUSICAICHAT_INDEX_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INDEX_TTL_MS;
}

let cachedYoutubeIndex: Record<string, MusicaichatYoutubeIndexEntry> | null = null;
let cachedYoutubeIndexUntil = 0;

/** テストや手動デバッグ用 */
export function clearMusicaichatYoutubeIndexCacheForTests(): void {
  cachedYoutubeIndex = null;
  cachedYoutubeIndexUntil = 0;
}

export async function fetchMusicaichatManifest(): Promise<MusicaichatManifest | null> {
  const base = getMusic8MusicaichatBaseUrl();
  if (!base) return null;
  return fetchJsonWithOptionalGcsAuth<MusicaichatManifest>(`${base}/manifest.json`);
}

async function ensureYoutubeIndexLoaded(): Promise<Record<string, MusicaichatYoutubeIndexEntry> | null> {
  const base = getMusic8MusicaichatBaseUrl();
  if (!base) return null;
  const now = Date.now();
  if (cachedYoutubeIndex && now < cachedYoutubeIndexUntil) {
    return cachedYoutubeIndex;
  }
  try {
    const json = await fetchJsonWithOptionalGcsAuth<Record<string, unknown>>(
      `${base}/index/youtube_to_song.json`,
    );
    if (!json) return null;
    const out: Record<string, MusicaichatYoutubeIndexEntry> = {};
    for (const [k, v] of Object.entries(json)) {
      if (!k.trim()) continue;
      if (!v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      const artist_slug = typeof o.artist_slug === 'string' ? o.artist_slug.trim() : '';
      const song_slug = typeof o.song_slug === 'string' ? o.song_slug.trim() : '';
      if (!artist_slug || !song_slug) continue;
      out[k.trim()] = {
        artist_slug,
        song_slug,
        ...(typeof o.role === 'string' && o.role.trim() ? { role: o.role.trim() } : {}),
        ...(typeof o.recording_kind === 'string' && o.recording_kind.trim()
          ? { recording_kind: o.recording_kind.trim() }
          : {}),
      };
    }
    cachedYoutubeIndex = out;
    cachedYoutubeIndexUntil = now + indexTtlMs();
    return out;
  } catch {
    return null;
  }
}

/** YouTube 動画 ID → インデックス行（キャッシュ付き） */
export async function resolveMusicaichatSongKeyForVideoId(
  videoId: string,
): Promise<MusicaichatYoutubeIndexEntry | null> {
  const vid = (videoId ?? '').trim();
  if (!vid) return null;
  const index = await ensureYoutubeIndexLoaded();
  if (!index) return null;
  return index[vid] ?? null;
}

export async function fetchMusicaichatSongJson(
  artistSlug: string,
  songSlug: string,
): Promise<MusicaichatSongJson | null> {
  const base = getMusic8MusicaichatBaseUrl();
  const a = (artistSlug ?? '').trim();
  const s = (songSlug ?? '').trim();
  if (!base || !a || !s) return null;
  try {
    const json = await fetchJsonWithOptionalGcsAuth<MusicaichatSongJson>(
      `${base}/songs/${encodeURIComponent(a)}_${encodeURIComponent(s)}.json`,
    );
    if (!json) return null;
    const sk = json?.stable_key;
    if (
      !sk ||
      typeof sk.artist_slug !== 'string' ||
      typeof sk.song_slug !== 'string' ||
      !sk.artist_slug.trim() ||
      !sk.song_slug.trim()
    ) {
      return null;
    }
    return json;
  } catch {
    return null;
  }
}

/** videoId からインデックス→曲 JSON まで一発（comment-pack 等から利用） */
export async function fetchMusicaichatSongJsonForVideoId(
  videoId: string,
): Promise<MusicaichatSongJson | null> {
  const entry = await resolveMusicaichatSongKeyForVideoId(videoId);
  if (!entry) return null;
  return fetchMusicaichatSongJson(entry.artist_slug, entry.song_slug);
}

function constraintsToLines(constraints: string | string[] | undefined): string[] {
  if (constraints == null) return [];
  if (Array.isArray(constraints)) {
    return constraints.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean);
  }
  const t = typeof constraints === 'string' ? constraints.trim() : '';
  return t ? [t] : [];
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x != null && typeof x === 'object' && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : null;
}

/** extractMusic8SongFields の releaseDate（例 1975.10）を AI 事実行用の日本語表記へ */
export function formatMusic8ReleaseDateForAiFacts(releaseYearMonth: string): string {
  const s = (releaseYearMonth ?? '').trim();
  if (!s) return '';
  const ym = /^(\d{4})\.(\d{2})$/.exec(s);
  if (ym) return `${ym[1]}年${Number(ym[2])}月`;
  const y = /^(\d{4})/.exec(s);
  if (y) return `${y[1]}年`;
  return s;
}

const RECORDING_KIND_LABELS: Record<string, string> = {
  original: 'オリジナル録音',
  cover: 'カバー',
  live: 'ライブ',
  remaster: 'リマスター',
  radio_edit: 'ラジオ編集',
  short: 'ショート版',
  other: 'その他',
};

/**
 * `facts_for_ai` 以外の構造化フィールド（releases / recording / classification）を
 * Gemini に渡す箇条書き。従来は JSON ヒットしても年号がプロンプトに入らず「不明」と出力されていた。
 */
export function buildMusicaichatStructuredDiscographyFactLines(song: MusicaichatSongJson): string[] {
  const lines: string[] = [];
  const extracted = extractMusic8SongFields(song);
  const releaseLabel = formatMusic8ReleaseDateForAiFacts(extracted.releaseDate);
  if (releaseLabel) {
    lines.push(`オリジナルリリース時期: ${releaseLabel}`);
  }

  const releases = asRecord(song.releases);
  if (releases) {
    const thisDate = typeof releases.this_release_date === 'string' ? releases.this_release_date.trim() : '';
    const origDate =
      typeof releases.original_release_date === 'string' ? releases.original_release_date.trim() : '';
    if (thisDate && thisDate !== origDate) {
      const thisLabel = formatMusic8ReleaseDateForAiFacts(
        extractMusic8SongFields({
          stable_key: song.stable_key,
          releases: { original_release_date: thisDate },
        }).releaseDate,
      );
      if (thisLabel) lines.push(`この録音版のリリース時期: ${thisLabel}`);
    }
  }

  const rec = asRecord(song.recording);
  if (rec) {
    const kind = typeof rec.kind === 'string' ? rec.kind.trim() : '';
    if (kind) {
      lines.push(`録音種別: ${RECORDING_KIND_LABELS[kind] ?? kind}`);
    }
    const tv = asRecord(rec.this_version);
    if (tv) {
      const ry = tv.release_year;
      if (typeof ry === 'number' && ry >= 1900 && ry <= 2100) {
        lines.push(`この版の公開年: ${Math.floor(ry)}年`);
      }
      const notes = typeof tv.notes === 'string' ? tv.notes.trim() : '';
      if (notes) lines.push(`録音版メモ: ${notes}`);
    }
    const ow = asRecord(rec.original_work);
    if (ow && typeof ow.artist_name === 'string' && ow.artist_name.trim()) {
      const oa = ow.artist_name.trim();
      const oy =
        typeof ow.release_year === 'number' && ow.release_year >= 1900 && ow.release_year <= 2100
          ? `（${Math.floor(ow.release_year)}年）`
          : '';
      lines.push(`原曲: ${oa}${oy}`);
    }
  }

  const cls = song.classification;
  if (Array.isArray(cls)) {
    const labels = cls
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    if (labels.length > 0) {
      lines.push(`分類: ${labels.join('、')}`);
    }
  } else if (extracted.genres.length > 0) {
    lines.push(`分類: ${extracted.genres.join('、')}`);
  }

  return lines;
}

/**
 * Gemini 等に渡す「Music8 由来の事実ブロック」テキスト（日本語想定）。
 * 次ステップで comment-pack のメタブロックに挿入する。
 */
export function buildMusicaichatFactsForAiPromptBlock(song: MusicaichatSongJson): string {
  const facts = song.facts_for_ai;
  const structured = buildMusicaichatStructuredDiscographyFactLines(song);

  const narrativeLines = filterMusicaichatFactsBoilerplateLines(
    [
      ...(facts?.opening_lines ?? [])
        .map((l) => (typeof l === 'string' ? l.trim() : ''))
        .filter(Boolean),
      ...(facts?.bullets ?? [])
        .map((l) => (typeof l === 'string' ? l.trim() : ''))
        .filter(Boolean),
    ],
  );

  const constraintLines = facts ? constraintsToLines(facts.constraints_for_model) : [];
  const vt =
    typeof facts?.video_specific_line_template === 'string'
      ? facts.video_specific_line_template.trim()
      : '';

  const hasNarrative = narrativeLines.length > 0 || constraintLines.length > 0 || vt.length > 0;
  if (structured.length === 0 && !hasNarrative) return '';

  const parts: string[] = ['【Music8 参照事実（外部マスタ。本文はこれと矛盾させない。推測で補わない）】'];

  for (const l of structured) {
    parts.push(`・${l}`);
  }
  for (const l of narrativeLines) {
    parts.push(`・${l}`);
  }
  for (const c of constraintLines) {
    parts.push(`・（制約）${c}`);
  }
  if (vt) {
    parts.push(`・（動画固有テンプレ・必要時のみ1文）${vt}`);
  }

  const sk = song.stable_key;
  parts.push(`・stable_key: ${sk.artist_slug}_${sk.song_slug}`);

  return parts.join('\n');
}

/** comment-pack / commentary 共通: Music8 事実のプロンプト注入をオフにする */
export function skipMusic8FactInjectEnv(): boolean {
  return ['0', 'false', 'off'].includes(
    (process.env.COMMENT_PACK_INJECT_MUSIC8_FACTS ?? '').trim().toLowerCase(),
  );
}

/**
 * musicaichat 曲 JSON があるとき、song_tidbits の [DB] キャッシュを使わず再生成する。
 * 未設定または 1/true/on → オン（Music8 導入後の [DB] 更新用）。0/false/off でオフ（API 節約）。
 */
export function shouldRegenerateLibraryWhenMusicaichatSong(
  musicaichatSong: MusicaichatSongJson | null,
  skipFactInject: boolean,
): boolean {
  if (!musicaichatSong || skipFactInject) return false;
  const v = (process.env.COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8 ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off') return false;
  return true;
}

export type Music8CommentPackContext = {
  artistJsonHit: boolean;
  songJsonHit: boolean;
  /** musicaichat 曲 JSON（取得済み。プロンプト注入にそのまま使う） */
  musicaichatSong: MusicaichatSongJson | null;
  /** videoId 索引で取れないときの artist+song フォールバック（intro-only 判定用） */
  fallbackMusic8Song: Record<string, unknown> | null;
};

/**
 * comment-pack 用: artists/{slug}.json の有無、musicaichat 曲 JSON（1 回取得して再利用）。
 */
export async function resolveMusic8ContextForCommentPack(
  videoId: string,
  artistLookupName: string,
  songLookupTitle: string,
): Promise<Music8CommentPackContext> {
  const vid = (videoId ?? '').trim();
  const name = (artistLookupName ?? '').trim();
  const songTitle = (songLookupTitle ?? '').trim();
  const artistUrlCandidates = name ? getMusic8ArtistJsonUrlCandidates(name) : [];
  const [musicaichatSong, artistJsonHit] = await Promise.all([
    getMusic8MusicaichatBaseUrl() && vid
      ? fetchMusicaichatSongJsonForVideoId(vid)
      : Promise.resolve(null),
    (async () => {
      for (const candidate of artistUrlCandidates) {
        if (await checkUrlExistsWithOptionalGcsAuth(candidate)) return true;
      }
      return false;
    })(),
  ]);
  const fallbackMusic8Song =
    musicaichatSong == null && name && songTitle
      ? await fetchMusic8SongData(name, songTitle, { fetchJson: fetchJsonWithOptionalGcsAuth })
      : null;

  /** musicaichat に `styles` が無いとき、GCS の WordPress 型曲 JSON（例: police_every-breath-you-take.json）から ID を補完 */
  let mergedMusicaichatSong: MusicaichatSongJson | null = musicaichatSong;
  if (mergedMusicaichatSong && name && songTitle) {
    const raw = mergedMusicaichatSong as unknown as Record<string, unknown>;
    const stylesArr = raw.styles;
    const hasStyles = Array.isArray(stylesArr) && stylesArr.length > 0;
    if (!hasStyles) {
      const wp = await fetchMusic8SongData(name, songTitle, { fetchJson: fetchJsonWithOptionalGcsAuth });
      if (wp) {
        const wpStyles = (wp as Record<string, unknown>).styles;
        if (Array.isArray(wpStyles) && wpStyles.length > 0) {
          mergedMusicaichatSong = { ...raw, styles: wpStyles } as unknown as MusicaichatSongJson;
        }
      }
    }
  }

  return {
    artistJsonHit,
    songJsonHit: mergedMusicaichatSong != null || fallbackMusic8Song != null,
    musicaichatSong: mergedMusicaichatSong,
    fallbackMusic8Song,
  };
}
