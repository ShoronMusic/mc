import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { joinMyListArtistsForStorage, suggestMyListArtistTitleFromYoutubeStyle } from '@/lib/my-list-youtube-title-suggest';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { buildSongDbRegistrationInput } from '@/lib/song-db-registration-gate';
import { getVideoSnippet } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

type RequestBody = {
  playlistUrl?: unknown;
  playlistId?: unknown;
  maxItems?: unknown;
  dryRun?: unknown;
};

type PlaylistSnippetRow = {
  videoId: string;
  rawTitle: string;
  channelTitle: string;
  videoOwnerChannelTitle: string;
};

type SpotifyTrackArtist = {
  name?: string;
};

type SpotifyTrackAlbum = {
  name?: string;
  release_date?: string;
};

type SpotifyTrackItem = {
  id?: string;
  name?: string;
  popularity?: number;
  artists?: SpotifyTrackArtist[];
  album?: SpotifyTrackAlbum;
  external_urls?: { spotify?: string };
};

type SpotifySearchJson = {
  tracks?: {
    items?: SpotifyTrackItem[];
  };
};

export type AdminYoutubePlaylistImportItem = {
  index: number;
  status: 'imported' | 'skipped_existing' | 'dry_run' | 'failed';
  artist: string;
  title: string;
  videoId: string;
  url: string;
  rawTitle: string;
  channelTitle: string;
  style: string | null;
  variant: 'official' | 'live' | 'lyric' | 'topic' | 'other';
  originalReleaseDate: string | null;
  youtubePublishedAt: string | null;
  dateSource: 'musicbrainz' | 'youtube' | 'none';
  genres: string[];
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  spotifyTrackId: string | null;
  spotifyPopularity: number | null;
  spotifyName: string | null;
  spotifyArtists: string | null;
  spotifyAlbum: string | null;
  spotifyReleaseDate: string | null;
  spotifyUrl: string | null;
  music8ArtistSlug: string | null;
  songId: string | null;
  error: string | null;
};

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parsePositiveIntOrNull(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parsePlaylistId(playlistUrl: string, playlistIdRaw: string): string | null {
  if (playlistIdRaw) return playlistIdRaw;
  if (!playlistUrl) return null;
  try {
    const parsed = new URL(playlistUrl);
    return parsed.searchParams.get('list')?.trim() ?? null;
  } catch {
    return null;
  }
}

function normalizeForCompare(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * title 先頭の「Artist - 」重複を除去する。
 * 例: "The Beatles - Here Comes The Sun" -> "Here Comes The Sun"
 * 例: "The Beatles - The Beatles - Hey Jude" -> "Hey Jude"
 */
function stripLeadingArtistPrefixFromTitle(artist: string, title: string): string {
  const artistNorm = normalizeForCompare(artist);
  let out = title.trim();
  if (!artistNorm || !out) return out;

  for (let i = 0; i < 3; i += 1) {
    const m = out.match(/^(.+?)\s*-\s*(.+)$/);
    if (!m) break;
    const left = (m[1] ?? '').trim();
    const right = (m[2] ?? '').trim();
    if (!left || !right) break;
    if (normalizeForCompare(left) !== artistNorm) break;
    out = right;
  }
  return out.trim();
}

function normalizeArtistLabel(artistRaw: string): string {
  const t = artistRaw.trim();
  if (!t) return t;
  return t
    .replace(/\s*[-\u2013\u2014]\s*topic\s*$/i, '')
    .replace(/\s*\(\s*topic\s*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectVariant(rawTitle: string, channelTitle: string): 'official' | 'live' | 'lyric' | 'topic' | 'other' {
  const t = `${rawTitle} ${channelTitle}`.toLowerCase();
  if (/\b(lyric|lyrics)\b/.test(t)) return 'lyric';
  if (/\b(live|concert|acoustic session|mtv unplugged)\b/.test(t)) return 'live';
  if (/\b(topic)\b/.test(channelTitle.toLowerCase())) return 'topic';
  if (/\b(official(\s+music)?\s+video|official video|mv|pv)\b/.test(t)) return 'official';
  if (/\b(official audio|audio)\b/.test(t)) return 'topic';
  return 'other';
}

function normalizeLookupTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*(?:mix|remaster(?:ed)?|version|edit|live|mono|stereo)[^)]*\)\s*$/gi, ' ')
    .replace(/\s*\[[^\]]*(?:mix|remaster(?:ed)?|version|edit|live|mono|stereo)[^\]]*\]\s*$/gi, ' ')
    .replace(/\s*-\s*(?:\d{4}\s*)?(?:mix|remaster(?:ed)?|version|edit|live)\s*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type MbRecording = {
  'first-release-date'?: string;
  releases?: Array<{ date?: string }>;
  tags?: Array<{ name?: string; count?: number }>;
  genres?: Array<{ name?: string; count?: number }>;
};

type MbResponse = {
  recordings?: MbRecording[];
};

let spotifyAccessTokenCache: { token: string; expiresAtMs: number } | null = null;

function pickEarliestReleaseDateIso(dates: string[]): string | null {
  const valid = dates
    .map((d) => d.trim())
    .filter((d) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d))
    .sort();
  if (valid.length === 0) return null;
  const first = valid[0];
  if (/^\d{4}$/.test(first)) return `${first}-01-01`;
  if (/^\d{4}-\d{2}$/.test(first)) return `${first}-01`;
  return first;
}

function pickMusicBrainzGenres(recordings: MbRecording[]): string[] {
  const scores = new Map<string, number>();
  const bump = (nameRaw: string | undefined, countRaw: number | undefined) => {
    const name = typeof nameRaw === 'string' ? nameRaw.trim().toLowerCase() : '';
    if (!name) return;
    const score = typeof countRaw === 'number' && Number.isFinite(countRaw) ? countRaw : 1;
    scores.set(name, (scores.get(name) ?? 0) + score);
  };
  for (const rec of recordings) {
    for (const g of rec.genres ?? []) bump(g.name, g.count);
    for (const t of rec.tags ?? []) bump(t.name, t.count);
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([name]) => name);
}

async function fetchMusicBrainzMetadata(
  artist: string,
  title: string,
): Promise<{ originalReleaseDate: string | null; genres: string[] }> {
  if (process.env.MUSICBRAINZ_LOOKUP === '0') return { originalReleaseDate: null, genres: [] };
  const ua = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  if (!ua) return { originalReleaseDate: null, genres: [] };

  const escapedArtist = artist.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedTitle = title.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (!escapedArtist || !escapedTitle) return { originalReleaseDate: null, genres: [] };

  const url = new URL('https://musicbrainz.org/ws/2/recording');
  url.searchParams.set('query', `artist:"${escapedArtist}" AND recording:"${escapedTitle}"`);
  url.searchParams.set('fmt', 'json');
  url.searchParams.set('limit', '6');

  try {
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'User-Agent': ua,
      },
    });
    if (!res.ok) return { originalReleaseDate: null, genres: [] };
    const data = (await res.json()) as MbResponse;
    const recordings = Array.isArray(data.recordings) ? data.recordings : [];
    const dates: string[] = [];
    for (const rec of recordings) {
      if (typeof rec['first-release-date'] === 'string' && rec['first-release-date'].trim()) {
        dates.push(rec['first-release-date']);
      }
      for (const rel of rec.releases ?? []) {
        if (typeof rel.date === 'string' && rel.date.trim()) dates.push(rel.date);
      }
    }
    return {
      originalReleaseDate: pickEarliestReleaseDateIso(dates),
      genres: pickMusicBrainzGenres(recordings),
    };
  } catch {
    return { originalReleaseDate: null, genres: [] };
  }
}

async function resolveDatesByExternalSources(params: {
  artist: string;
  title: string;
  videoId: string;
}): Promise<{
  originalReleaseDate: string | null;
  youtubePublishedAt: string | null;
  dateSource: 'musicbrainz' | 'youtube' | 'none';
  genres: string[];
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}> {
  const mb = await fetchMusicBrainzMetadata(params.artist, normalizeLookupTitle(params.title));
  const ytSnippet = await getVideoSnippet(params.videoId, { source: 'admin-youtube-playlist-import' });
  const ytDate = typeof ytSnippet?.publishedAt === 'string' ? ytSnippet.publishedAt : null;
  const viewCount = typeof ytSnippet?.viewCount === 'number' ? ytSnippet.viewCount : null;
  const likeCount = typeof ytSnippet?.likeCount === 'number' ? ytSnippet.likeCount : null;
  const commentCount = typeof ytSnippet?.commentCount === 'number' ? ytSnippet.commentCount : null;
  if (mb.originalReleaseDate) {
    return {
      originalReleaseDate: mb.originalReleaseDate,
      youtubePublishedAt: ytDate,
      dateSource: 'musicbrainz',
      genres: mb.genres,
      viewCount,
      likeCount,
      commentCount,
    };
  }
  if (ytDate) {
    return {
      originalReleaseDate: ytDate.slice(0, 10),
      youtubePublishedAt: ytDate,
      dateSource: 'youtube',
      genres: mb.genres,
      viewCount,
      likeCount,
      commentCount,
    };
  }
  return {
    originalReleaseDate: null,
    youtubePublishedAt: null,
    dateSource: 'none',
    genres: mb.genres,
    viewCount,
    likeCount,
    commentCount,
  };
}

async function getSpotifyAccessToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  if (spotifyAccessTokenCache && Date.now() < spotifyAccessTokenCache.expiresAtMs - 10_000) {
    return spotifyAccessTokenCache.token;
  }

  try {
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
    const token = asTrimmedString(data.access_token);
    const expiresInSec =
      typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
    if (!token) return null;
    spotifyAccessTokenCache = {
      token,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    };
    return token;
  } catch {
    return null;
  }
}

async function fetchSpotifyTrackByArtistTitle(
  artist: string,
  title: string,
): Promise<{
  spotifyTrackId: string | null;
  spotifyPopularity: number | null;
  spotifyName: string | null;
  spotifyArtists: string | null;
  spotifyAlbum: string | null;
  spotifyReleaseDate: string | null;
  spotifyUrl: string | null;
}> {
  const token = await getSpotifyAccessToken();
  if (!token) {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyAlbum: null,
      spotifyReleaseDate: null,
      spotifyUrl: null,
    };
  }

  const market = asTrimmedString(process.env.SPOTIFY_MARKET) || 'US';
  const q = `artist:${artist} track:${title}`;
  const url = new URL('https://api.spotify.com/v1/search');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'track');
  url.searchParams.set('limit', '1');
  url.searchParams.set('market', market);

  try {
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      return {
        spotifyTrackId: null,
        spotifyPopularity: null,
        spotifyName: null,
        spotifyArtists: null,
        spotifyAlbum: null,
        spotifyReleaseDate: null,
        spotifyUrl: null,
      };
    }
    const data = (await res.json()) as SpotifySearchJson;
    const track = data?.tracks?.items?.[0];
    if (!track) {
      return {
        spotifyTrackId: null,
        spotifyPopularity: null,
        spotifyName: null,
        spotifyArtists: null,
        spotifyAlbum: null,
        spotifyReleaseDate: null,
        spotifyUrl: null,
      };
    }
    const artists = Array.isArray(track.artists)
      ? track.artists
          .map((a) => asTrimmedString(a?.name))
          .filter(Boolean)
          .join(', ')
      : '';
    const popularity =
      typeof track.popularity === 'number' && Number.isFinite(track.popularity) ? track.popularity : null;
    return {
      spotifyTrackId: asTrimmedString(track.id) || null,
      spotifyPopularity: popularity,
      spotifyName: asTrimmedString(track.name) || null,
      spotifyArtists: artists || null,
      spotifyAlbum: asTrimmedString(track.album?.name) || null,
      spotifyReleaseDate: asTrimmedString(track.album?.release_date) || null,
      spotifyUrl: asTrimmedString(track.external_urls?.spotify) || null,
    };
  } catch {
    return {
      spotifyTrackId: null,
      spotifyPopularity: null,
      spotifyName: null,
      spotifyArtists: null,
      spotifyAlbum: null,
      spotifyReleaseDate: null,
      spotifyUrl: null,
    };
  }
}

async function backfillSongMetadataIfMissing(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  params: {
    songId: string;
    videoId: string;
    originalReleaseDate: string | null;
    youtubePublishedAt: string | null;
    spotifyTrackId: string | null;
    spotifyPopularity: number | null;
    spotifyName: string | null;
    spotifyArtists: string | null;
    spotifyReleaseDate: string | null;
  },
): Promise<{ ok: true } | { ok: false; code?: string; message: string }> {
  const songId = params.songId;
  const { data: current, error: selectError } = await admin
    .from('songs')
    .select(
      'id, original_release_date, spotify_track_id, spotify_name, spotify_artists, spotify_release_date, spotify_popularity',
    )
    .eq('id', songId)
    .maybeSingle();
  if (selectError) return { ok: false, code: selectError.code, message: selectError.message };
  if (!current) return { ok: true };

  const payload: Record<string, unknown> = {};
  const existingReleaseDate = asTrimmedString((current as { original_release_date?: unknown }).original_release_date);
  if (!existingReleaseDate && params.originalReleaseDate) {
    payload.original_release_date = params.originalReleaseDate;
  }
  const existingTrackId = asTrimmedString((current as { spotify_track_id?: unknown }).spotify_track_id);
  if (!existingTrackId && params.spotifyTrackId) payload.spotify_track_id = params.spotifyTrackId;
  const existingSpotifyName = asTrimmedString((current as { spotify_name?: unknown }).spotify_name);
  if (!existingSpotifyName && params.spotifyName) payload.spotify_name = params.spotifyName;
  const existingSpotifyArtists = asTrimmedString((current as { spotify_artists?: unknown }).spotify_artists);
  if (!existingSpotifyArtists && params.spotifyArtists) payload.spotify_artists = params.spotifyArtists;
  const existingSpotifyReleaseDate = asTrimmedString(
    (current as { spotify_release_date?: unknown }).spotify_release_date,
  );
  if (!existingSpotifyReleaseDate && params.spotifyReleaseDate) {
    payload.spotify_release_date = params.spotifyReleaseDate;
  }
  const existingSpotifyPopularity = (current as { spotify_popularity?: unknown }).spotify_popularity;
  if (
    (existingSpotifyPopularity == null || existingSpotifyPopularity === '') &&
    typeof params.spotifyPopularity === 'number' &&
    Number.isFinite(params.spotifyPopularity)
  ) {
    payload.spotify_popularity = Math.max(0, Math.min(100, Math.round(params.spotifyPopularity)));
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await admin.from('songs').update(payload).eq('id', songId);
    if (error) return { ok: false, code: error.code, message: error.message };
  }

  if (params.youtubePublishedAt) {
    const { error: videoError } = await admin
      .from('song_videos')
      .update({ youtube_published_at: params.youtubePublishedAt })
      .eq('video_id', params.videoId)
      .is('youtube_published_at', null);
    if (videoError && videoError.code !== '42703') {
      return { ok: false, code: videoError.code, message: videoError.message };
    }
  }

  return { ok: true };
}

async function fetchPlaylistRows(playlistId: string, maxItems: number | null): Promise<PlaylistSnippetRow[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY が未設定です。');
  }

  const rows: PlaylistSnippetRow[] = [];
  let nextPageToken: string | null = null;
  while (true) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key: apiKey,
    });
    if (nextPageToken) params.set('pageToken', nextPageToken);
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`;

    const res = await fetch(url, { cache: 'no-store' });
    const data = (await res.json()) as {
      error?: { message?: string };
      nextPageToken?: string;
      items?: Array<{
        snippet?: { title?: string; channelTitle?: string; videoOwnerChannelTitle?: string };
        contentDetails?: { videoId?: string };
      }>;
    };
    if (!res.ok || data?.error) {
      throw new Error(data?.error?.message || `YouTube API エラー: HTTP ${res.status}`);
    }
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const videoId = asTrimmedString(item?.contentDetails?.videoId);
      if (!videoId) continue;
      rows.push({
        videoId,
        rawTitle: asTrimmedString(item?.snippet?.title),
        channelTitle: asTrimmedString(item?.snippet?.channelTitle),
        videoOwnerChannelTitle: asTrimmedString(item?.snippet?.videoOwnerChannelTitle),
      });
      if (maxItems && rows.length >= maxItems) return rows;
    }
    nextPageToken = asTrimmedString(data.nextPageToken) || null;
    if (!nextPageToken) break;
  }
  return rows;
}

async function loadExistingVideoSongIds(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  videoIds: string[],
): Promise<Map<string, string | null>> {
  const existing = new Map<string, string | null>();
  const uniqueVideoIds = [...new Set(videoIds)];
  const chunkSize = 150;
  for (let i = 0; i < uniqueVideoIds.length; i += chunkSize) {
    const chunk = uniqueVideoIds.slice(i, i + chunkSize);
    const { data, error } = await admin.from('song_videos').select('video_id, song_id').in('video_id', chunk);
    if (error) {
      if (error.code === '42P01') {
        throw new Error('song_videos テーブルがありません。');
      }
      throw new Error(`既存動画チェックに失敗: ${error.message}`);
    }
    for (const row of data ?? []) {
      const cast = row as { video_id?: unknown; song_id?: unknown };
      const videoId = asTrimmedString(cast.video_id);
      if (!videoId) continue;
      const songId = asTrimmedString(cast.song_id) || null;
      existing.set(videoId, songId);
    }
  }
  return existing;
}

async function loadMusic8ArtistSlugBySongId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  songIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = [...new Set(songIds.map((x) => x.trim()).filter(Boolean))];
  if (uniq.length === 0) return out;
  const chunkSize = 150;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('songs')
      .select('id, music8_artist_slug, artist_id, main_artist')
      .in('id', chunk);
    if (error) {
      if (error.code === '42703' || error.code === '42P01') {
        return out;
      }
      throw new Error(`songs.music8_artist_slug 取得に失敗: ${error.message}`);
    }
    const unresolvedSongIds: string[] = [];
    const artistIds: string[] = [];
    for (const row of data ?? []) {
      const cast = row as {
        id?: unknown;
        music8_artist_slug?: unknown;
        artist_id?: unknown;
      };
      const songId = asTrimmedString(cast.id);
      if (!songId) continue;
      const slug = asTrimmedString(cast.music8_artist_slug) || null;
      if (slug) {
        out.set(songId, slug);
        continue;
      }
      unresolvedSongIds.push(songId);
      const artistId = asTrimmedString(cast.artist_id);
      if (artistId) artistIds.push(artistId);
    }

    if (unresolvedSongIds.length > 0 && artistIds.length > 0) {
      const { data: artistRows, error: artistErr } = await admin
        .from('artists')
        .select('id, music8_artist_slug')
        .in('id', [...new Set(artistIds)]);
      if (!artistErr && Array.isArray(artistRows)) {
        const slugByArtistId = new Map<string, string>();
        for (const a of artistRows as { id?: unknown; music8_artist_slug?: unknown }[]) {
          const aid = asTrimmedString(a.id);
          const slug = asTrimmedString(a.music8_artist_slug);
          if (aid && slug) slugByArtistId.set(aid, slug);
        }
        for (const row of data ?? []) {
          const cast = row as { id?: unknown; artist_id?: unknown };
          const sid = asTrimmedString(cast.id);
          if (!sid || out.has(sid)) continue;
          const aid = asTrimmedString(cast.artist_id);
          if (!aid) continue;
          const slug = slugByArtistId.get(aid);
          if (slug) out.set(sid, slug);
        }
      }
    }

  }
  return out;
}

async function loadSongStyleBySongId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  songIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = [...new Set(songIds.map((x) => x.trim()).filter(Boolean))];
  if (uniq.length === 0) return out;
  const chunkSize = 150;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await admin.from('songs').select('id, style').in('id', chunk);
    if (error) {
      if (error.code === '42703' || error.code === '42P01') return out;
      throw new Error(`songs.style 取得に失敗: ${error.message}`);
    }
    for (const row of data ?? []) {
      const cast = row as { id?: unknown; style?: unknown };
      const sid = asTrimmedString(cast.id);
      if (!sid) continue;
      out.set(sid, asTrimmedString(cast.style) || null);
    }
  }
  return out;
}

function slugifyArtistLabel(artist: string): string {
  return artist
    .toLowerCase()
    .replace(/['".,!?/\\()[\]{}]+/g, ' ')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function upsertYoutubeImportExternalMeta(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  params: {
    playlistId: string;
    videoId: string;
    songId: string | null;
    artist: string;
    title: string;
    rawTitle: string;
    channelTitle: string;
    originalReleaseDate: string | null;
    youtubePublishedAt: string | null;
    dateSource: 'musicbrainz' | 'youtube' | 'none';
    genres: string[];
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
  },
): Promise<{ ok: true } | { ok: false; code?: string; message: string }> {
  const { error } = await admin.from('song_external_metrics').upsert(
    {
      video_id: params.videoId,
      song_id: params.songId,
      last_playlist_id: params.playlistId,
      main_artist: params.artist,
      song_title: params.title,
      raw_title: params.rawTitle || null,
      channel_title: params.channelTitle || null,
      original_release_date: params.originalReleaseDate,
      youtube_published_at: params.youtubePublishedAt,
      date_source: params.dateSource,
      genres: params.genres,
      view_count: params.viewCount,
      like_count: params.likeCount,
      comment_count: params.commentCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'video_id' },
  );
  if (error) {
    return { ok: false, code: error.code, message: error.message };
  }
  return { ok: true };
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'JSON が不正です。' }, { status: 400 });
  }

  const playlistUrl = asTrimmedString(body.playlistUrl);
  const playlistIdRaw = asTrimmedString(body.playlistId);
  const playlistId = parsePlaylistId(playlistUrl, playlistIdRaw);
  if (!playlistId) {
    return NextResponse.json({ error: 'playlist URL または playlist ID が不正です。' }, { status: 400 });
  }

  const maxItems = Math.min(1000, Math.max(1, parsePositiveIntOrNull(body.maxItems) ?? 500));
  const dryRun = Boolean(body.dryRun);

  try {
    const fetchedRows = await fetchPlaylistRows(playlistId, maxItems);
    const dedupedRows: PlaylistSnippetRow[] = [];
    const seen = new Set<string>();
    for (const row of fetchedRows) {
      if (seen.has(row.videoId)) continue;
      seen.add(row.videoId);
      dedupedRows.push(row);
    }

    const existingVideoSongIds = await loadExistingVideoSongIds(
      admin,
      dedupedRows.map((x) => x.videoId),
    );
    const existingSongIds = [...new Set([...existingVideoSongIds.values()].filter((x): x is string => Boolean(x)))];
    const music8ArtistSlugBySongId = await loadMusic8ArtistSlugBySongId(admin, existingSongIds);
    const songStyleBySongId = await loadSongStyleBySongId(admin, existingSongIds);
    const warnings = new Set<string>();

    const results: AdminYoutubePlaylistImportItem[] = [];
    let importedCount = 0;
    let skippedExistingCount = 0;
    let failedCount = 0;

    for (let i = 0; i < dedupedRows.length; i += 1) {
      const row = dedupedRows[i];
      const artistHint = row.videoOwnerChannelTitle || row.channelTitle;
      const suggested = suggestMyListArtistTitleFromYoutubeStyle(artistHint || null, row.rawTitle || null);
      const rawArtist = joinMyListArtistsForStorage(suggested.artists) || artistHint || 'Unknown Artist';
      let artist = normalizeArtistLabel(rawArtist) || rawArtist;
      const rawResolvedTitle = (suggested.title || row.rawTitle || 'Unknown Title').trim();
      let title = stripLeadingArtistPrefixFromTitle(artist, rawResolvedTitle) || rawResolvedTitle;
      const variant = detectVariant(row.rawTitle, artistHint);
      let spotifyMeta = await fetchSpotifyTrackByArtistTitle(artist, title);
      if (variant === 'topic' && spotifyMeta.spotifyArtists) {
        const topSpotifyArtist = normalizeArtistLabel(
          spotifyMeta.spotifyArtists.split(',')[0]?.trim() ?? '',
        );
        if (topSpotifyArtist) {
          artist = topSpotifyArtist;
          title = stripLeadingArtistPrefixFromTitle(artist, rawResolvedTitle) || rawResolvedTitle;
          spotifyMeta = await fetchSpotifyTrackByArtistTitle(artist, title);
        }
      }
      const resolvedDates = await resolveDatesByExternalSources({
        artist,
        title,
        videoId: row.videoId,
      });

      const base: Omit<AdminYoutubePlaylistImportItem, 'status' | 'songId' | 'error'> = {
        index: i + 1,
        artist,
        title,
        videoId: row.videoId,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(row.videoId)}`,
        rawTitle: row.rawTitle,
        channelTitle: artistHint,
        style: null,
        variant,
        originalReleaseDate: resolvedDates.originalReleaseDate,
        youtubePublishedAt: resolvedDates.youtubePublishedAt,
        dateSource: resolvedDates.dateSource,
        genres: resolvedDates.genres,
        viewCount: resolvedDates.viewCount,
        likeCount: resolvedDates.likeCount,
        commentCount: resolvedDates.commentCount,
        spotifyTrackId: spotifyMeta.spotifyTrackId,
        spotifyPopularity: spotifyMeta.spotifyPopularity,
        spotifyName: spotifyMeta.spotifyName,
        spotifyArtists: spotifyMeta.spotifyArtists,
        spotifyAlbum: spotifyMeta.spotifyAlbum,
        spotifyReleaseDate: spotifyMeta.spotifyReleaseDate,
        spotifyUrl: spotifyMeta.spotifyUrl,
        music8ArtistSlug: null,
      };

      if (existingVideoSongIds.has(row.videoId)) {
        skippedExistingCount += 1;
        const existingSongId = existingVideoSongIds.get(row.videoId) ?? null;
        let existingArtistSlug = existingSongId ? (music8ArtistSlugBySongId.get(existingSongId) ?? null) : null;
        const existingStyle = existingSongId ? (songStyleBySongId.get(existingSongId) ?? null) : null;
        if (!existingArtistSlug) {
          const fromCurrentArtist = slugifyArtistLabel(artist);
          existingArtistSlug = fromCurrentArtist || null;
        }
        if (!dryRun) {
          const metricWrite = await upsertYoutubeImportExternalMeta(admin, {
            playlistId,
            videoId: row.videoId,
            songId: existingSongId,
            artist,
            title,
            rawTitle: row.rawTitle,
            channelTitle: row.channelTitle,
            originalReleaseDate: resolvedDates.originalReleaseDate,
            youtubePublishedAt: resolvedDates.youtubePublishedAt,
            dateSource: resolvedDates.dateSource,
            genres: resolvedDates.genres,
            viewCount: resolvedDates.viewCount,
            likeCount: resolvedDates.likeCount,
            commentCount: resolvedDates.commentCount,
          });
          if (!metricWrite.ok) {
            if (metricWrite.code === '42P01') {
              warnings.add('song_external_metrics テーブルがありません。docs/supabase-setup.md の追補 SQL を実行してください。');
            } else {
              warnings.add(`song_external_metrics 保存エラー: ${metricWrite.message}`);
            }
          }
          if (existingSongId) {
            const backfill = await backfillSongMetadataIfMissing(admin, {
              songId: existingSongId,
              videoId: row.videoId,
              originalReleaseDate: resolvedDates.originalReleaseDate,
              youtubePublishedAt: resolvedDates.youtubePublishedAt,
              spotifyTrackId: spotifyMeta.spotifyTrackId,
              spotifyPopularity: spotifyMeta.spotifyPopularity,
              spotifyName: spotifyMeta.spotifyName,
              spotifyArtists: spotifyMeta.spotifyArtists,
              spotifyReleaseDate: spotifyMeta.spotifyReleaseDate,
            });
            if (!backfill.ok) {
              warnings.add(`songs 補完エラー: ${backfill.message}`);
            }
          }
        }
        results.push({
          ...base,
          status: 'skipped_existing',
          songId: existingSongId,
          music8ArtistSlug: existingArtistSlug,
          style: existingStyle,
          error: null,
        });
        continue;
      }

      if (dryRun) {
        results.push({ ...base, status: 'dry_run', songId: null, error: null });
        continue;
      }

      try {
        const songId = await upsertSongAndVideo({
          supabase: admin,
          videoId: row.videoId,
          mainArtist: artist,
          songTitle: title,
          variant,
          originalReleaseDateIso: resolvedDates.originalReleaseDate ?? undefined,
          youtubePublishedAtIso: resolvedDates.youtubePublishedAt ?? undefined,
          registrationCheck: buildSongDbRegistrationInput({ forceAllow: true }),
        });
        if (!songId) {
          failedCount += 1;
          results.push({ ...base, status: 'failed', songId: null, error: 'song_id を作成できませんでした。' });
          continue;
        }
        const metricWrite = await upsertYoutubeImportExternalMeta(admin, {
          playlistId,
          videoId: row.videoId,
          songId,
          artist,
          title,
          rawTitle: row.rawTitle,
          channelTitle: row.channelTitle,
          originalReleaseDate: resolvedDates.originalReleaseDate,
          youtubePublishedAt: resolvedDates.youtubePublishedAt,
          dateSource: resolvedDates.dateSource,
          genres: resolvedDates.genres,
          viewCount: resolvedDates.viewCount,
          likeCount: resolvedDates.likeCount,
          commentCount: resolvedDates.commentCount,
        });
        if (!metricWrite.ok) {
          if (metricWrite.code === '42P01') {
            warnings.add('song_external_metrics テーブルがありません。docs/supabase-setup.md の追補 SQL を実行してください。');
          } else {
            warnings.add(`song_external_metrics 保存エラー: ${metricWrite.message}`);
          }
        }
        const backfill = await backfillSongMetadataIfMissing(admin, {
          songId,
          videoId: row.videoId,
          originalReleaseDate: resolvedDates.originalReleaseDate,
          youtubePublishedAt: resolvedDates.youtubePublishedAt,
          spotifyTrackId: spotifyMeta.spotifyTrackId,
          spotifyPopularity: spotifyMeta.spotifyPopularity,
          spotifyName: spotifyMeta.spotifyName,
          spotifyArtists: spotifyMeta.spotifyArtists,
          spotifyReleaseDate: spotifyMeta.spotifyReleaseDate,
        });
        if (!backfill.ok) {
          warnings.add(`songs 補完エラー: ${backfill.message}`);
        }
        importedCount += 1;
        const artistSlug = music8ArtistSlugBySongId.get(songId) ?? null;
        results.push({
          ...base,
          status: 'imported',
          songId,
          music8ArtistSlug: artistSlug,
          style: songStyleBySongId.get(songId) ?? null,
          error: null,
        });
      } catch (e) {
        failedCount += 1;
        results.push({
          ...base,
          status: 'failed',
          songId: null,
          music8ArtistSlug: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const res = NextResponse.json({
      playlistId,
      dryRun,
      summary: {
        fetched: fetchedRows.length,
        uniqueVideoIds: dedupedRows.length,
        imported: importedCount,
        skippedExisting: skippedExistingCount,
        failed: failedCount,
      },
      warnings: [...warnings],
      items: results,
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '取り込みに失敗しました。' },
      { status: 500 },
    );
  }
}
