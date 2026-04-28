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
import { filterMusicaichatFactsBoilerplateLines } from '@/lib/music8-song-fields';

const DEFAULT_BASE_URL = 'https://storage.googleapis.com/music8-json-prod/data/musicaichat/v1';

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

/**
 * Gemini 等に渡す「Music8 由来の事実ブロック」テキスト（日本語想定）。
 * 次ステップで comment-pack のメタブロックに挿入する。
 */
export function buildMusicaichatFactsForAiPromptBlock(song: MusicaichatSongJson): string {
  const facts = song.facts_for_ai;
  if (!facts) return '';

  const parts: string[] = ['【Music8 参照事実（外部マスタ。本文はこれと矛盾させない。推測で補わない）】'];

  const lines = filterMusicaichatFactsBoilerplateLines(
    (facts.opening_lines ?? [])
      .map((l) => (typeof l === 'string' ? l.trim() : ''))
      .filter(Boolean),
  );
  for (const l of lines) {
    parts.push(`・${l}`);
  }

  const bullets = filterMusicaichatFactsBoilerplateLines(
    (facts.bullets ?? [])
      .map((l) => (typeof l === 'string' ? l.trim() : ''))
      .filter(Boolean),
  );
  for (const b of bullets) {
    parts.push(`・${b}`);
  }

  for (const c of constraintsToLines(facts.constraints_for_model)) {
    parts.push(`・（制約）${c}`);
  }

  const vt =
    typeof facts.video_specific_line_template === 'string'
      ? facts.video_specific_line_template.trim()
      : '';
  if (vt) {
    parts.push(`・（動画固有テンプレ・必要時のみ1文）${vt}`);
  }

  const sk = song.stable_key;
  parts.push(
    `・stable_key: ${sk.artist_slug}_${sk.song_slug}`,
  );

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
