/**
 * Spotify Client Credentials — トラック検索・取得（管理 import と backfill スクリプト共用）
 */

import { extractEnglishArtistNameFromDescription } from '@/lib/artist-english-name';

type TokenCache = { token: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;

export type SpotifyTrackMeta = {
  spotifyTrackId: string | null;
  spotifyPopularity: number | null;
  spotifyName: string | null;
  spotifyArtists: string | null;
  spotifyReleaseDate: string | null;
  spotifyImages: string | null;
};

type SpotifyTrackArtist = { id?: string; name?: string };
type SpotifyTrackAlbum = {
  name?: string;
  release_date?: string;
  images?: Array<{ url?: string }>;
};
type SpotifyTrackItem = {
  id?: string;
  name?: string;
  popularity?: number;
  artists?: SpotifyTrackArtist[];
  album?: SpotifyTrackAlbum;
  external_urls?: { spotify?: string };
};
type SpotifySearchJson = { tracks?: { items?: SpotifyTrackItem[] } };

export type SpotifyTrackArtistRef = { id: string; name: string };

export type SpotifyTrackWithArtists = SpotifyTrackMeta & {
  artists: SpotifyTrackArtistRef[];
};

export type SpotifyArtistMeta = {
  id: string;
  name: string;
  popularity: number | null;
  images: string | null;
};

export type SpotifyArtistSearchResult =
  | { ok: true; selected: SpotifyArtistMeta & { url: string | null }; query: string }
  | { ok: false; error: string };

type SpotifyArtistSearchItem = {
  id?: string;
  name?: string;
  popularity?: number;
  images?: Array<{ url?: string; height?: number | null; width?: number | null }>;
  external_urls?: { spotify?: string };
};

type SpotifyImageLike = { url?: string; height?: number | null; width?: number | null };

/** Spotify CDN の最小サムネ（64px 級・Music8 互換） */
const SPOTIFY_ARTIST_IMAGE_SMALL_HASH = '00005174';

/** Spotify アーティスト画像から表示用の小さめ URL を選ぶ（64〜160px 級） */
export function pickSpotifyArtistImageUrl(
  images: SpotifyImageLike[] | null | undefined,
  opts?: { maxHeight?: number },
): string | null {
  const maxHeight = opts?.maxHeight ?? 160;
  if (!Array.isArray(images) || images.length === 0) return null;
  const valid = images
    .map((img) => ({
      url: trim(img?.url),
      height: typeof img?.height === 'number' && img.height > 0 ? img.height : null,
    }))
    .filter((x) => x.url);
  if (valid.length === 0) return null;

  const tiny = valid.find((x) => x.url.includes(SPOTIFY_ARTIST_IMAGE_SMALL_HASH));
  if (tiny) return tiny.url;

  const withHeight = valid.filter((x) => x.height != null);
  if (withHeight.length > 0) {
    const within = withHeight
      .filter((x) => x.height! <= maxHeight)
      .sort((a, b) => a.height! - b.height!);
    if (within.length > 0) return within[0]!.url;
    return withHeight.sort((a, b) => a.height! - b.height!)[0]!.url;
  }
  return valid[valid.length - 1]!.url;
}

function mapSpotifyArtistItem(item: SpotifyArtistSearchItem | undefined): SpotifyArtistMeta | null {
  const id = trim(item?.id);
  const name = trim(item?.name);
  if (!id || !name) return null;
  const pop =
    typeof item?.popularity === 'number' && Number.isFinite(item.popularity)
      ? Math.round(item.popularity)
      : null;
  const images = pickSpotifyArtistImageUrl(item?.images);
  return { id, name, popularity: pop, images };
}

type SpotifyArtistSearchJson = { artists?: { items?: SpotifyArtistSearchItem[] } };

function normalizeArtistCompareKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreSpotifyArtistCandidate(
  artist: SpotifyArtistMeta,
  artistName: string,
  nameJa: string | null,
  englishName: string | null,
): number {
  const nameKey = normalizeArtistCompareKey(artist.name);
  const qKey = normalizeArtistCompareKey(artistName);
  const jaKey = nameJa ? normalizeArtistCompareKey(nameJa) : '';
  const enKey = englishName ? normalizeArtistCompareKey(englishName) : '';
  let score = artist.popularity ?? 0;
  if (qKey && nameKey === qKey) score += 120;
  if (jaKey && nameKey === jaKey) score += 120;
  if (enKey && nameKey === enKey) score += 100;
  if (qKey && nameKey.includes(qKey)) score += 40;
  if (jaKey && nameKey.includes(jaKey)) score += 40;
  if (enKey && nameKey.includes(enKey)) score += 30;
  return score;
}

function buildSpotifyArtistSearchQueries(params: {
  artistName: string;
  nameJa?: string | null;
  descriptionEn?: string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  push(params.artistName);
  if (params.nameJa?.trim()) push(params.nameJa.trim());
  const en = extractEnglishArtistNameFromDescription(params.descriptionEn);
  if (en) push(en);
  return out;
}

/** アーティスト名から Spotify アーティスト ID を検索（管理画面・Music8 WP 同目的） */
export async function searchSpotifyArtistByName(params: {
  artistName: string;
  nameJa?: string | null;
  descriptionEn?: string | null;
}): Promise<SpotifyArtistSearchResult> {
  const artistName = params.artistName.trim();
  if (!artistName) {
    return { ok: false, error: 'アーティスト名が空です。' };
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    return {
      ok: false,
      error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が未設定です。',
    };
  }

  const englishName = extractEnglishArtistNameFromDescription(params.descriptionEn);
  const queries = buildSpotifyArtistSearchQueries(params);
  const collected = new Map<string, SpotifyArtistMeta>();

  for (const q of queries) {
    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', q);
    url.searchParams.set('type', 'artist');
    url.searchParams.set('limit', '10');
    url.searchParams.set('market', spotifyMarket());

    try {
      const res = await spotifyFetchJson(url.toString(), token);
      if (!res?.ok) continue;
      const data = (await res.json()) as SpotifyArtistSearchJson;
      for (const item of data.artists?.items ?? []) {
        const mapped = mapSpotifyArtistItem(item);
        if (!mapped) continue;
        const prev = collected.get(mapped.id);
        if (!prev || (mapped.popularity ?? 0) > (prev.popularity ?? 0)) {
          collected.set(mapped.id, mapped);
        }
      }
    } catch {
      continue;
    }
  }

  const candidates = [...collected.values()];
  if (candidates.length === 0) {
    return { ok: false, error: 'Spotify アーティストが見つかりませんでした。' };
  }

  const selected = [...candidates].sort(
    (a, b) =>
      scoreSpotifyArtistCandidate(b, artistName, params.nameJa ?? null, englishName) -
      scoreSpotifyArtistCandidate(a, artistName, params.nameJa ?? null, englishName),
  )[0]!;

  const details = await fetchSpotifyArtistsByIds([selected.id]);
  const detail = details[0];
  const images = detail?.images ?? selected.images;
  const popularity = detail?.popularity ?? selected.popularity;

  return {
    ok: true,
    query: queries[0] ?? artistName,
    selected: {
      ...selected,
      popularity,
      images,
      url: `https://open.spotify.com/artist/${selected.id}`,
    },
  };
}

type SpotifyArtistsBatchJson = { artists?: Array<{
  id?: string;
  name?: string;
  popularity?: number;
  images?: Array<{ url?: string; height?: number | null; width?: number | null }>;
}> };

function trim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function albumImageUrl(track: SpotifyTrackItem | undefined): string | null {
  const images = track?.album?.images;
  if (!Array.isArray(images) || images.length === 0) return null;
  return trim(images[0]?.url) || null;
}

function mapTrackItem(track: SpotifyTrackItem | undefined): SpotifyTrackMeta {
  if (!track) {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
      spotifyImages: null,
    };
  }
  const artists = Array.isArray(track.artists)
    ? track.artists.map((a) => trim(a?.name)).filter(Boolean).join(', ')
    : '';
  const popularity =
    typeof track.popularity === 'number' && Number.isFinite(track.popularity) ? track.popularity : null;
  return {
    spotifyTrackId: trim(track.id) || null,
    spotifyPopularity: popularity,
    spotifyName: trim(track.name) || null,
    spotifyArtists: artists || null,
    spotifyReleaseDate: trim(track.album?.release_date) || null,
    spotifyImages: albumImageUrl(track),
  };
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAtMs - 10_000) {
    return tokenCache.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  const token = trim(data.access_token);
  const expiresInSec =
    typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
  if (!token) return null;
  tokenCache = { token, expiresAtMs: Date.now() + expiresInSec * 1000 };
  return token;
}

function spotifyMarket(): string {
  return trim(process.env.SPOTIFY_MARKET) || 'US';
}

async function spotifyFetchJson(url: string, token: string, retries = 3): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429 && attempt < retries) {
      const retryAfter = Number(res.headers.get('Retry-After') || '2');
      await new Promise((r) => setTimeout(r, Math.max(1, retryAfter) * 1000));
      continue;
    }
    return res;
  }
  return null;
}

/** display_title の先頭 ` - ` でアーティスト／曲名に分割（正規化済み想定） */
export function parseArtistTitleFromDisplayTitle(displayTitle: string): { artist: string; title: string } | null {
  const s = displayTitle.trim();
  const sep = ' - ';
  const idx = s.indexOf(sep);
  if (idx <= 0) return null;
  const artist = s.slice(0, idx).trim();
  const title = s.slice(idx + sep.length).trim();
  if (!artist || !title) return null;
  return { artist, title };
}

function mapTrackArtists(track: SpotifyTrackItem | undefined): SpotifyTrackArtistRef[] {
  if (!track || !Array.isArray(track.artists)) return [];
  const out: SpotifyTrackArtistRef[] = [];
  for (const a of track.artists) {
    const id = trim(a?.id);
    const name = trim(a?.name);
    if (id && name) out.push({ id, name });
  }
  return out;
}

function emptyTrackMeta(): SpotifyTrackMeta {
  return {
    spotifyTrackId: null,
    spotifyPopularity: null,
    spotifyName: null,
    spotifyArtists: null,
    spotifyReleaseDate: null,
    spotifyImages: null,
  };
}

/** GET /v1/tracks/{id} — アーティスト ID 付き */
export async function fetchSpotifyTrackWithArtistsById(trackId: string): Promise<SpotifyTrackWithArtists> {
  const token = await getSpotifyAccessToken();
  if (!token) return { ...emptyTrackMeta(), artists: [] };

  const id = trackId.trim();
  const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}?market=${encodeURIComponent(spotifyMarket())}`;
  try {
    const res = await spotifyFetchJson(url, token);
    if (!res?.ok) return { ...emptyTrackMeta(), artists: [] };
    const track = (await res.json()) as SpotifyTrackItem;
    return { ...mapTrackItem(track), artists: mapTrackArtists(track) };
  } catch {
    return { ...emptyTrackMeta(), artists: [] };
  }
}

export async function fetchSpotifyTrackById(trackId: string): Promise<SpotifyTrackMeta> {
  const full = await fetchSpotifyTrackWithArtistsById(trackId);
  const { artists: _a, ...meta } = full;
  return meta;
}

/** GET /v1/artists?ids=…（最大 50） */
export async function fetchSpotifyArtistsByIds(ids: string[]): Promise<SpotifyArtistMeta[]> {
  const token = await getSpotifyAccessToken();
  if (!token || ids.length === 0) return [];

  const out: SpotifyArtistMeta[] = [];
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const url = new URL('https://api.spotify.com/v1/artists');
    url.searchParams.set('ids', chunk.join(','));
    try {
      const res = await spotifyFetchJson(url.toString(), token);
      if (!res?.ok) continue;
      const data = (await res.json()) as SpotifyArtistsBatchJson;
      for (const a of data.artists ?? []) {
        const id = trim(a?.id);
        const name = trim(a?.name);
        if (!id || !name) continue;
        const pop =
          typeof a.popularity === 'number' && Number.isFinite(a.popularity) ? Math.round(a.popularity) : null;
        const images = pickSpotifyArtistImageUrl(a.images);
        out.push({ id, name, popularity: pop, images });
      }
    } catch {
      /* skip chunk */
    }
  }
  return out;
}

/** `artist:… track:…` フィールド検索（管理 YouTube プレイリスト import と同系） */
/** 選曲登録：複数候補（最大 limit 件） */
export async function searchSpotifyTrackCandidatesByArtistTitle(
  artist: string,
  title: string,
  limit = 8,
): Promise<SpotifyTrackWithArtists[]> {
  const token = await getSpotifyAccessToken();
  if (!token) return [];

  const primaryArtist = artist.split(',')[0]?.trim() || artist.trim();
  const q = `artist:${primaryArtist} track:${title}`;
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', String(Math.max(1, Math.min(10, limit))));
  url.searchParams.set('market', spotifyMarket());

  try {
    const res = await spotifyFetchJson(url.toString(), token);
    if (!res?.ok) return [];
    const data = (await res.json()) as SpotifySearchJson;
    const items = data?.tracks?.items ?? [];
    return items
      .map((item) => ({
        ...mapTrackItem(item),
        artists: mapTrackArtists(item),
      }))
      .filter((t) => t.spotifyTrackId && t.artists.length > 0);
  } catch {
    return [];
  }
}

export async function fetchSpotifyTrackByArtistTitle(
  artist: string,
  title: string,
): Promise<SpotifyTrackMeta> {
  const list = await searchSpotifyTrackCandidatesByArtistTitle(artist, title, 1);
  const first = list[0];
  if (!first) {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
      spotifyImages: null,
    };
  }
  const { artists: _a, ...meta } = first;
  return meta;
}

/** display_title をそのまま q にした汎用検索（精度は落ちるがフォールバック用） */
export async function fetchSpotifyTrackByFreeTextQuery(query: string): Promise<SpotifyTrackMeta> {
  const token = await getSpotifyAccessToken();
  if (!token) {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
      spotifyImages: null,
    };
  }
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');
  url.searchParams.set('market', spotifyMarket());
  try {
    const res = await spotifyFetchJson(url.toString(), token);
    if (!res?.ok) {
      return emptyTrackMeta();
    }
    const data = (await res.json()) as SpotifySearchJson;
    return mapTrackItem(data?.tracks?.items?.[0]);
  } catch {
    return emptyTrackMeta();
  }
}
