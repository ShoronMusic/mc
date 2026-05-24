/**
 * Spotify Client Credentials — トラック検索・取得（管理 import と backfill スクリプト共用）
 */

type TokenCache = { token: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;

export type SpotifyTrackMeta = {
  spotifyTrackId: string | null;
  spotifyPopularity: number | null;
  spotifyName: string | null;
  spotifyArtists: string | null;
  spotifyReleaseDate: string | null;
};

type SpotifyTrackArtist = { id?: string; name?: string };
type SpotifyTrackAlbum = { name?: string; release_date?: string };
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

type SpotifyArtistsBatchJson = { artists?: Array<{
  id?: string;
  name?: string;
  popularity?: number;
  images?: Array<{ url?: string }>;
}> };

function trim(s: unknown): string {
  return typeof s === 'string' ? s.trim() : '';
}

function mapTrackItem(track: SpotifyTrackItem | undefined): SpotifyTrackMeta {
  if (!track) {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
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
        const images = Array.isArray(a.images) ? trim(a.images[0]?.url) || null : null;
        out.push({ id, name, popularity: pop, images });
      }
    } catch {
      /* skip chunk */
    }
  }
  return out;
}

/** `artist:… track:…` フィールド検索（管理 YouTube プレイリスト import と同系） */
export async function fetchSpotifyTrackByArtistTitle(
  artist: string,
  title: string,
): Promise<SpotifyTrackMeta> {
  const token = await getSpotifyAccessToken();
  if (!token) {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
    };
  }

  const q = `artist:${artist} track:${title}`;
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');
  url.searchParams.set('market', spotifyMarket());

  try {
    const res = await spotifyFetchJson(url.toString(), token);
    if (!res?.ok) {
      return {
        spotifyTrackId: null,
        spotifyPopularity: null,
        spotifyName: null,
        spotifyArtists: null,
        spotifyReleaseDate: null,
      };
    }
    const data = (await res.json()) as SpotifySearchJson;
    return mapTrackItem(data?.tracks?.items?.[0]);
  } catch {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
    };
  }
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
      return {
        spotifyTrackId: null,
        spotifyPopularity: null,
        spotifyName: null,
        spotifyArtists: null,
        spotifyReleaseDate: null,
      };
    }
    const data = (await res.json()) as SpotifySearchJson;
    return mapTrackItem(data?.tracks?.items?.[0]);
  } catch {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyReleaseDate: null,
    };
  }
}
