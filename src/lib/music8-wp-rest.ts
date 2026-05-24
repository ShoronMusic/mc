/**
 * Music8 WordPress REST API から曲投稿を取得し、静的曲 JSON と同型のオブジェクトに変換する。
 * JSON ファイル未エクスポートでも WP 登録済みなら DB 補完に使える。
 */

import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { getMainArtist } from '@/lib/format-song-display';
import { resolveArtistNameForMusic8Lookup } from '@/lib/music8-main-artist-lookup';
import {
  normalizeSongTitleForLookup,
  songTitleToMusic8Slug,
} from '@/lib/music8-song-lookup';

const MAX_ARTIST_POSTS_SCAN_FOR_VIDEO_ID = 120;

const DEFAULT_WP_REST_BASE = 'https://xs867261.xsrv.jp/md/wp-json';
const FETCH_TIMEOUT_MS = 15_000;

export type WpRestTaxonomyTerm = {
  name?: string;
  slug?: string;
  term_id?: number;
};

export type WpRestArtistCategory = {
  id?: number;
  name?: string;
  slug?: string;
  acf?: Record<string, unknown>;
};

export type WpRestSongPost = {
  id: number;
  slug?: string;
  date?: string;
  modified?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  categories?: number[];
  genre?: number[];
  vocal?: number[];
  style?: number[];
  acf?: Record<string, unknown>;
  custom_fields?: {
    categories?: WpRestArtistCategory[];
  };
  genre_data?: WpRestTaxonomyTerm[];
  vocal_data?: WpRestTaxonomyTerm[];
};

export function getMusic8WpRestBaseUrl(): string | null {
  const raw = (process.env.MUSIC8_WP_REST_BASE_URL ?? DEFAULT_WP_REST_BASE).trim();
  if (!raw || raw === '0' || /^off$/i.test(raw) || /^false$/i.test(raw)) return null;
  return raw.replace(/\/+$/, '');
}

export function isMusic8WpRestEnabled(): boolean {
  return getMusic8WpRestBaseUrl() != null;
}

function normalizeTitleForMatch(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWpJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'musicaichat-admin/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Music8 曲 slug 生成（`B.I.G.` → `b-i-g`）と WP カテゴリ slug（`big`）の差を吸収 */
export function wpArtistSlugAliasesFromMusic8Slug(slug: string): string[] {
  const s = slug.trim();
  if (!s) return [];
  const collapsed = s.includes('-b-i-g') ? s.replace(/-b-i-g/g, '-big') : null;
  if (collapsed && collapsed !== s) return [collapsed];
  return [];
}

export function artistSlugCandidates(artistNameOrSlug: string): string[] {
  const resolved = resolveArtistNameForMusic8Lookup(artistNameOrSlug);
  const primary = artistNameToMusic8Slug(resolved) || resolved.trim().toLowerCase().replace(/\s+/g, '-');
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(primary);
  if (primary.startsWith('the-')) add(primary.slice(4));
  for (const alias of wpArtistSlugAliasesFromMusic8Slug(primary)) {
    add(alias);
  }
  return out;
}

async function resolveArtistCategoryIdByNameSearch(
  base: string,
  artistNameOrSlug: string,
): Promise<number | null> {
  const label = getMainArtist(resolveArtistNameForMusic8Lookup(artistNameOrSlug)).trim();
  if (!label) return null;
  const rows = await fetchWpJson<Array<{ id?: number; name?: string }>>(
    `${base}/wp/v2/categories?search=${encodeURIComponent(label)}&per_page=15`,
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const want = normalizeTitleForMatch(label);
  for (const row of rows) {
    const got = normalizeTitleForMatch(row.name ?? '');
    if (!got) continue;
    if (got === want || got.includes(want) || want.includes(got)) {
      const id = row.id;
      if (typeof id === 'number' && id > 0) return id;
    }
  }
  const fallback = rows[0]?.id;
  return typeof fallback === 'number' && fallback > 0 ? fallback : null;
}

async function resolveArtistCategoryId(base: string, artistNameOrSlug: string): Promise<number | null> {
  for (const slug of artistSlugCandidates(artistNameOrSlug)) {
    const rows = await fetchWpJson<Array<{ id?: number }>>(
      `${base}/wp/v2/categories?slug=${encodeURIComponent(slug)}&per_page=1`,
    );
    const id = rows?.[0]?.id;
    if (typeof id === 'number' && id > 0) return id;
  }
  return resolveArtistCategoryIdByNameSearch(base, artistNameOrSlug);
}

export function isLikelyYoutubeVideoId(videoId: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test((videoId ?? '').trim());
}

function postVideoId(post: WpRestSongPost): string {
  const acf = post.acf ?? {};
  const vid = acf.ytvideoid;
  return typeof vid === 'string' ? vid.trim() : '';
}

function dedupePosts(posts: WpRestSongPost[]): WpRestSongPost[] {
  const seen = new Set<number>();
  const out: WpRestSongPost[] = [];
  for (const p of posts) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

async function fetchPostsBySlugGlobal(base: string, titleSlug: string): Promise<WpRestSongPost[]> {
  const rows = await fetchWpJson<WpRestSongPost[]>(
    `${base}/wp/v2/posts?slug=${encodeURIComponent(titleSlug)}&status=publish&per_page=5`,
  );
  return Array.isArray(rows) ? rows.filter((p) => p?.id) : [];
}

/** 曲 slug と `-2`…`-5` を category 付き／なしで取得 */
async function fetchPostsBySongSlugVariants(
  base: string,
  songSlug: string,
  categoryId?: number | null,
): Promise<WpRestSongPost[]> {
  const slug = (songSlug ?? '').trim();
  if (!slug) return [];
  const slugs = [slug, `${slug}-2`, `${slug}-3`, `${slug}-4`, `${slug}-5`];
  const batches = await Promise.all(
    slugs.map((s) =>
      categoryId && categoryId > 0
        ? fetchPostsBySlugAndCategory(base, s, categoryId)
        : fetchPostsBySlugGlobal(base, s),
    ),
  );
  return dedupePosts(batches.flat());
}

async function fetchPostByVideoIdInArtistCatalog(
  base: string,
  artistNameOrSlug: string,
  videoId: string,
): Promise<WpRestSongPost | null> {
  const vid = videoId.trim();
  if (!vid) return null;

  for (const artistSlug of artistSlugCandidates(artistNameOrSlug)) {
    const list = await fetchWpJson<Array<{ id?: number }>>(
      `${base}/mytheme/v1/artist-posts/${encodeURIComponent(artistSlug)}`,
    );
    if (!Array.isArray(list) || list.length === 0) continue;

    for (const row of list.slice(0, MAX_ARTIST_POSTS_SCAN_FOR_VIDEO_ID)) {
      const id = row.id;
      if (typeof id !== 'number' || id <= 0) continue;
      const post = await fetchPostById(base, id);
      if (post && postVideoId(post) === vid) return post;
    }
  }
  return null;
}

/**
 * YouTube videoId で WP 曲投稿を特定（WP の meta 検索は未対応のため索引＋ slug 照合）。
 * 1) musicaichat `youtube_to_song.json` → artist/song slug → WP slug 取得（ytvideoid 一致確認）
 * 2) 失敗時 `mytheme/v1/artist-posts` を走査（artistLookup がある場合）
 */
export async function fetchWpPostByVideoId(
  base: string,
  videoId: string,
  artistLookup?: string,
): Promise<WpRestSongPost | null> {
  const vid = (videoId ?? '').trim();
  if (!vid || !isLikelyYoutubeVideoId(vid)) return null;

  const { resolveMusicaichatSongKeyForVideoId } = await import('@/lib/music8-musicaichat');
  const entry = await resolveMusicaichatSongKeyForVideoId(vid);
  if (entry?.artist_slug && entry.song_slug) {
    const categoryId = await resolveArtistCategoryId(base, entry.artist_slug);
    let posts = await fetchPostsBySongSlugVariants(base, entry.song_slug, categoryId);
    let match = posts.find((p) => postVideoId(p) === vid);
    if (!match && categoryId) {
      posts = await fetchPostsBySongSlugVariants(base, entry.song_slug, null);
      match = posts.find((p) => postVideoId(p) === vid);
    }
    if (match) return match;
  }

  const artist = (artistLookup ?? '').trim();
  if (artist) {
    return fetchPostByVideoIdInArtistCatalog(base, artist, vid);
  }
  return null;
}

function titleMatches(post: WpRestSongPost, songTitle: string): boolean {
  const want = normalizeTitleForMatch(songTitle);
  const got = normalizeTitleForMatch(post.title?.rendered ?? '');
  if (!want || !got) return false;
  return got === want || got.includes(want) || want.includes(got);
}

/**
 * WP REST の曲投稿を、静的 `songs/*.json` と同系の形に変換（`buildPersistableMusic8SongSnapshot` 入力用）。
 */
export function wpRestPostToMusic8SongJson(post: WpRestSongPost): Record<string, unknown> {
  const acf = post.acf ?? {};
  const categories = post.custom_fields?.categories ?? [];
  const artists = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    acf: c.acf ?? {},
  }));

  const ytreleasedate = typeof acf.ytreleasedate === 'string' ? acf.ytreleasedate.trim() : '';
  const spotifyRelease = typeof acf.spotify_release_date === 'string' ? acf.spotify_release_date.trim() : '';
  const releaseDate = ytreleasedate || spotifyRelease || post.date || '';

  return {
    id: post.id,
    slug: post.slug ?? '',
    title: typeof post.title?.rendered === 'string' ? post.title.rendered : '',
    content: typeof post.content?.rendered === 'string' ? post.content.rendered : '',
    date: post.date ?? '',
    releaseDate,
    videoId: postVideoId(post),
    genres: (post.genre_data ?? []).map((g) => ({ name: g.name, slug: g.slug })),
    genre_data: post.genre_data ?? [],
    vocal_data: post.vocal_data ?? [],
    style: post.style ?? [],
    styles: post.style ?? [],
    artists,
    acf,
    modified: post.modified ?? '',
  };
}

async function fetchPostById(base: string, postId: number): Promise<WpRestSongPost | null> {
  if (!Number.isFinite(postId) || postId <= 0) return null;
  const post = await fetchWpJson<WpRestSongPost>(`${base}/wp/v2/posts/${postId}`);
  return post?.id ? post : null;
}

async function fetchPostsBySlugAndCategory(
  base: string,
  titleSlug: string,
  categoryId: number,
): Promise<WpRestSongPost[]> {
  const rows = await fetchWpJson<WpRestSongPost[]>(
    `${base}/wp/v2/posts?slug=${encodeURIComponent(titleSlug)}&categories=${categoryId}&status=publish&per_page=5`,
  );
  return Array.isArray(rows) ? rows.filter((p) => p?.id) : [];
}

async function searchPostsInCategory(
  base: string,
  search: string,
  categoryId: number,
  perPage = 20,
): Promise<WpRestSongPost[]> {
  const q = encodeURIComponent(search.trim());
  if (!q) return [];
  const rows = await fetchWpJson<WpRestSongPost[]>(
    `${base}/wp/v2/posts?search=${q}&categories=${categoryId}&status=publish&per_page=${perPage}`,
  );
  return Array.isArray(rows) ? rows.filter((p) => p?.id) : [];
}

async function fetchPostViaArtistPostsList(
  base: string,
  artistSlug: string,
  songTitle: string,
): Promise<WpRestSongPost | null> {
  const list = await fetchWpJson<Array<{ id?: number; title?: string }>>(
    `${base}/mytheme/v1/artist-posts/${encodeURIComponent(artistSlug)}`,
  );
  if (!Array.isArray(list)) return null;

  const want = normalizeTitleForMatch(songTitle);
  const hit = list.find((row) => {
    const got = normalizeTitleForMatch(row.title ?? '');
    return got && (got === want || got.includes(want) || want.includes(got));
  });
  const id = hit?.id;
  if (typeof id !== 'number' || id <= 0) return null;
  return fetchPostById(base, id);
}

function pickBestPost(
  posts: WpRestSongPost[],
  songTitle: string,
  videoId?: string,
): WpRestSongPost | null {
  if (posts.length === 0) return null;
  const vid = (videoId ?? '').trim();
  if (vid) {
    const byVid = posts.find((p) => postVideoId(p) === vid);
    if (byVid) return byVid;
  }
  const byTitle = posts.find((p) => titleMatches(p, songTitle));
  return byTitle ?? posts[0];
}

export type FetchMusic8SongFromWpRestParams = {
  artistLookup: string;
  songLookupTitle: string;
  videoId?: string | null;
  music8SongId?: number | null;
};

/**
 * WP REST から曲投稿を探し、静的曲 JSON 互換オブジェクトを返す。
 */
export async function fetchMusic8SongFromWpRest(
  params: FetchMusic8SongFromWpRestParams,
): Promise<Record<string, unknown> | null> {
  const base = getMusic8WpRestBaseUrl();
  if (!base) return null;

  const artistLookup = (params.artistLookup ?? '').trim();
  const songLookupTitle = (params.songLookupTitle ?? '').trim();
  const videoId = (params.videoId ?? '').trim();
  if (!videoId && (!artistLookup || !songLookupTitle)) return null;

  if (videoId) {
    const byVideo = await fetchWpPostByVideoId(base, videoId, artistLookup || undefined);
    if (byVideo) return wpRestPostToMusic8SongJson(byVideo);
  }

  if (!artistLookup || !songLookupTitle) return null;

  const wpPostId = params.music8SongId;
  if (typeof wpPostId === 'number' && wpPostId > 0) {
    const byId = await fetchPostById(base, wpPostId);
    if (byId) return wpRestPostToMusic8SongJson(byId);
  }

  const normalizedTitle = normalizeSongTitleForLookup(artistLookup, songLookupTitle);
  const titleSlug = songTitleToMusic8Slug(normalizedTitle || songLookupTitle);
  const categoryId = await resolveArtistCategoryId(base, artistLookup);

  let candidates: WpRestSongPost[] = [];

  if (categoryId && titleSlug) {
    candidates.push(...(await fetchPostsBySlugAndCategory(base, titleSlug, categoryId)));
    for (const n of [2, 3, 4, 5]) {
      candidates.push(...(await fetchPostsBySlugAndCategory(base, `${titleSlug}-${n}`, categoryId)));
    }
  }

  if (candidates.length === 0 && categoryId) {
    candidates.push(...(await searchPostsInCategory(base, songLookupTitle, categoryId)));
  }

  if (candidates.length === 0) {
    for (const artistSlug of artistSlugCandidates(artistLookup)) {
      const fromList = await fetchPostViaArtistPostsList(base, artistSlug, songLookupTitle);
      if (fromList) {
        candidates = [fromList];
        break;
      }
    }
  }

  const picked = pickBestPost(candidates, songLookupTitle, videoId);
  return picked ? wpRestPostToMusic8SongJson(picked) : null;
}
