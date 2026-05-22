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

type SpotifyTrackArtist = { name?: string };
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

export async function fetchSpotifyTrackById(trackId: string): Promise<SpotifyTrackMeta> {
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
  const id = trackId.trim();
  const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}?market=${encodeURIComponent(spotifyMarket())}`;
  try {
    const res = await spotifyFetchJson(url, token);
    if (!res?.ok) {
      return {
        spotifyTrackId: null,
        spotifyPopularity: null,
        spotifyName: null,
        spotifyArtists: null,
        spotifyReleaseDate: null,
      };
    }
    const track = (await res.json()) as SpotifyTrackItem;
    return mapTrackItem(track);
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
