/**
 * 週間チャート（US Billboard / UK Official Charts）管理デスク。
 * 取込元は Spotify 公式プレイリスト上位 10。既存 songs は上書きせず照合のみ。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildExistingSongIlikePatterns,
  escapeIlikePattern,
  sameCompactArtistTitle,
} from '@/lib/admin-new-song-existing-match';
import { rankLibraryVideoVariant } from '@/lib/library-video-variant-rank';
import { youtubeVideoIdFromUnknown } from '@/lib/music8-catalog-slugs';
import { artistsOverlapForMatch, compactArtistSetKey } from '@/lib/song-alternate-pv-match';
import { compactMatchKey } from '@/lib/song-registration-normalize';
import { getSpotifyAccessToken, parseSpotifyTrackIdInput } from '@/lib/spotify-search-track';
import { titleMatchKey } from '@/lib/spotify-track-match';

const SONG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WEEKLY_CHART_TOP_N = 10;

export type WeeklyChartRegion = 'us' | 'uk';

export type WeeklyChartMatchKind = 'spotify_id' | 'artist_title' | 'none';

export type WeeklyChartCatalogSong = {
  id: string;
  mainArtist: string | null;
  songTitle: string | null;
  displayTitle: string | null;
  spotifyTrackId: string | null;
};

export type WeeklyChartCatalogVideo = {
  songId: string;
  videoId: string;
  variant: string | null;
  spotifyTrackId: string | null;
};

export type WeeklyChartSpotifyTrack = {
  position: number;
  spotifyTrackId: string;
  title: string;
  artistName: string;
  spotifyArtists: string;
  spotifyUrl: string | null;
};

export type WeeklyChartSongCandidate = {
  songId: string;
  songDisplayTitle: string;
  youtubeVideoId: string | null;
  youtubeWatchUrl: string | null;
  songAdminHref: string;
};

export type WeeklyChartEntryView = {
  id: string | null;
  position: number;
  spotifyTrackId: string;
  title: string;
  artistName: string;
  spotifyArtists: string;
  spotifyUrl: string | null;
  matchKind: WeeklyChartMatchKind;
  songId: string | null;
  songDisplayTitle: string | null;
  youtubeVideoId: string | null;
  youtubeSearchUrl: string;
  youtubeWatchUrl: string | null;
  newSongHref: string;
  songAdminHref: string | null;
  candidateSongs: WeeklyChartSongCandidate[];
};

export type WeeklyChartIssueView = {
  id: string;
  region: WeeklyChartRegion;
  chartWeek: string;
  sourcePlaylistId: string;
  playlistName: string | null;
  importedAt: string;
  existingCount: number;
  newCount: number;
  entries: WeeklyChartEntryView[];
};

export const DEFAULT_WEEKLY_CHART_PLAYLIST_US = '6UeSakyzhiEt4NB3UAd6NQ';
export const DEFAULT_WEEKLY_CHART_PLAYLIST_UK = '4OIVU71yO7SzyGrh0ils2i';

const JST = 'Asia/Tokyo';

export function isWeeklyChartRegion(v: unknown): v is WeeklyChartRegion {
  return v === 'us' || v === 'uk';
}

export function weeklyChartPublicTitle(region: WeeklyChartRegion): string {
  return region === 'us' ? 'US Billboard Hot 100' : 'UK Official Singles';
}

export function weeklyChartPublicSubtitle(): string {
  return '週間チャート Top 10';
}

export function formatWeeklyChartWeekLabel(chartWeek: string): string {
  const m = chartWeek.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return chartWeek.trim();
  return `${m[1]}.${m[2]}.${m[3]}`;
}

export function weeklyChartPlaylistId(region: WeeklyChartRegion): string {
  if (region === 'us') {
    return process.env.WEEKLY_CHART_SPOTIFY_PLAYLIST_US?.trim() || DEFAULT_WEEKLY_CHART_PLAYLIST_US;
  }
  return process.env.WEEKLY_CHART_SPOTIFY_PLAYLIST_UK?.trim() || DEFAULT_WEEKLY_CHART_PLAYLIST_UK;
}

export function weeklyChartSpotifyMarket(region: WeeklyChartRegion): string {
  return region === 'uk' ? 'GB' : 'US';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymdInTimeZone(
  date: Date,
  timeZone: string,
): { y: number; m: number; d: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    dow: dowMap[parts.weekday ?? ''] ?? 0,
  };
}

function addDaysYmd(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** US=直近火曜、UK=直近金曜（Asia/Tokyo）。当日を含む。 */
export function latestChartPublishDateJst(region: WeeklyChartRegion, now = new Date()): string {
  const targetDow = region === 'us' ? 2 : 5;
  const cur = ymdInTimeZone(now, JST);
  const back = (cur.dow - targetDow + 7) % 7;
  const p = addDaysYmd(cur.y, cur.m, cur.d, -back);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

export function weeklyChartYoutubeSearchUrl(artistName: string, title: string): string {
  const primary = artistName.split(',')[0]?.trim() || artistName.trim();
  const q = [primary, title.trim()].filter(Boolean).join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

export function weeklyChartYoutubeWatchUrl(videoId: string | null | undefined): string | null {
  const id = (videoId ?? '').trim();
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export function weeklyChartNewSongHref(artistName: string, title: string): string {
  const params = new URLSearchParams();
  const primary = artistName.split(',')[0]?.trim() || artistName.trim();
  if (primary) params.set('artist', primary);
  if (title.trim()) params.set('title', title.trim());
  const qs = params.toString();
  return qs ? `/admin/songs/new?${qs}` : '/admin/songs/new';
}

export function weeklyChartSongAdminHref(songId: string | null | undefined): string | null {
  const id = (songId ?? '').trim();
  if (!id) return null;
  return `/admin/songs/${encodeURIComponent(id)}`;
}

export type ChartTitleVersionKind = 'remix' | 'live' | 'acoustic' | 'edit' | 'plain';

export function chartTitleVersionKind(title: string): ChartTitleVersionKind {
  const t = title.toLowerCase();
  if (/\bremix\b/.test(t)) return 'remix';
  if (/\blive\b/.test(t)) return 'live';
  if (/\bacoustic\b/.test(t)) return 'acoustic';
  if (/\b(radio\s+edit|\bedit\b)/.test(t)) return 'edit';
  return 'plain';
}

export function titlesCompatibleForChartMatch(chartTitle: string, songTitle: string): boolean {
  const a = chartTitle.trim();
  const b = songTitle.trim();
  if (!a || !b) return false;
  if (chartTitleVersionKind(a) !== chartTitleVersionKind(b)) return false;
  const ka = titleMatchKey(a);
  const kb = titleMatchKey(b);
  if (ka && kb && ka === kb) return true;
  const ca = compactMatchKey(a);
  const cb = compactMatchKey(b);
  return Boolean(ca && cb && ca === cb);
}

export function artistsCompatibleForChartMatch(chartArtists: string, songArtist: string): boolean {
  const a = chartArtists.trim();
  const b = songArtist.trim();
  if (!a || !b) return false;
  if (compactArtistSetKey(a) && compactArtistSetKey(a) === compactArtistSetKey(b)) return true;
  return artistsOverlapForMatch(a, b);
}

export function pickCatalogYoutubeVideoId(
  videos: WeeklyChartCatalogVideo[],
  songId: string,
): string | null {
  const list = videos.filter((v) => v.songId === songId && v.videoId.trim());
  if (list.length === 0) return null;
  list.sort((a, b) => rankLibraryVideoVariant(a.variant) - rankLibraryVideoVariant(b.variant));
  return list[0]?.videoId.trim() || null;
}

function catalogVideoRank(videos: WeeklyChartCatalogVideo[], songId: string): number {
  const list = videos.filter((v) => v.songId === songId && v.videoId.trim());
  if (list.length === 0) return 99;
  return Math.min(...list.map((v) => rankLibraryVideoVariant(v.variant)));
}

function artistSetEquals(chartArtists: string, songArtist: string): boolean {
  const a = compactArtistSetKey(chartArtists);
  const b = compactArtistSetKey(songArtist);
  return Boolean(a && b && a === b);
}

function songHasChartSpotifyId(
  track: Pick<WeeklyChartSpotifyTrack, 'spotifyTrackId'>,
  song: WeeklyChartCatalogSong,
  videos: WeeklyChartCatalogVideo[],
): boolean {
  const trackId = parseSpotifyTrackIdInput(track.spotifyTrackId) ?? track.spotifyTrackId.trim();
  if (!trackId) return false;
  const stored = parseSpotifyTrackIdInput(song.spotifyTrackId) ?? (song.spotifyTrackId ?? '').trim();
  if (stored && stored === trackId) return true;
  return videos.some((v) => {
    if (v.songId !== song.id) return false;
    const vs = parseSpotifyTrackIdInput(v.spotifyTrackId) ?? (v.spotifyTrackId ?? '').trim();
    return Boolean(vs && vs === trackId);
  });
}

export type WeeklyChartMatchResult = {
  kind: WeeklyChartMatchKind;
  song: WeeklyChartCatalogSong | null;
  youtubeVideoId: string | null;
};

function scoredTitleMatches(
  track: Pick<WeeklyChartSpotifyTrack, 'artistName' | 'title' | 'spotifyArtists' | 'spotifyTrackId'>,
  songs: WeeklyChartCatalogSong[],
  videos: WeeklyChartCatalogVideo[],
): WeeklyChartCatalogSong[] {
  const artistLine = track.spotifyArtists.trim() || track.artistName.trim();
  const scored: Array<{
    song: WeeklyChartCatalogSong;
    exact: boolean;
    artistExact: boolean;
    videoRank: number;
    hasSpotify: boolean;
  }> = [];
  for (const song of songs) {
    const songTitle = (song.songTitle ?? '').trim();
    const songArtist = (song.mainArtist ?? '').trim();
    if (!songTitle || !songArtist) continue;
    if (!titlesCompatibleForChartMatch(track.title, songTitle)) continue;
    if (!artistsCompatibleForChartMatch(artistLine, songArtist)) continue;
    scored.push({
      song,
      exact: sameCompactArtistTitle(artistLine, track.title, songArtist, songTitle),
      artistExact: artistSetEquals(artistLine, songArtist),
      videoRank: catalogVideoRank(videos, song.id),
      hasSpotify: songHasChartSpotifyId(track, song, videos),
    });
  }
  scored.sort((a, b) => {
    if (a.exact !== b.exact) return Number(b.exact) - Number(a.exact);
    if (a.artistExact !== b.artistExact) return Number(b.artistExact) - Number(a.artistExact);
    if (a.videoRank !== b.videoRank) return a.videoRank - b.videoRank;
    return Number(b.hasSpotify) - Number(a.hasSpotify);
  });
  return scored.map((s) => s.song);
}

function candidateFromSong(
  song: WeeklyChartCatalogSong,
  videos: WeeklyChartCatalogVideo[],
): WeeklyChartSongCandidate {
  const youtubeVideoId = pickCatalogYoutubeVideoId(videos, song.id);
  return {
    songId: song.id,
    songDisplayTitle: song.displayTitle ?? song.songTitle ?? song.id,
    youtubeVideoId,
    youtubeWatchUrl: weeklyChartYoutubeWatchUrl(youtubeVideoId),
    songAdminHref: weeklyChartSongAdminHref(song.id) ?? `/admin/songs/${encodeURIComponent(song.id)}`,
  };
}

export function listChartSongCandidates(
  track: Pick<WeeklyChartSpotifyTrack, 'spotifyTrackId' | 'artistName' | 'title' | 'spotifyArtists'>,
  songs: WeeklyChartCatalogSong[],
  videos: WeeklyChartCatalogVideo[],
): WeeklyChartSongCandidate[] {
  const auto = matchChartTrackToCatalog(track, songs, videos);
  const titleHits = scoredTitleMatches(track, songs, videos);
  const ordered: WeeklyChartCatalogSong[] = [];
  const seen = new Set<string>();
  const push = (song: WeeklyChartCatalogSong | null | undefined) => {
    if (!song || seen.has(song.id)) return;
    seen.add(song.id);
    ordered.push(song);
  };
  push(auto.song);
  for (const song of titleHits) push(song);
  return ordered.map((song) => candidateFromSong(song, videos));
}

export function preferStoredChartSong(
  auto: WeeklyChartMatchResult,
  storedSongId: string | null | undefined,
  songs: WeeklyChartCatalogSong[],
  videos: WeeklyChartCatalogVideo[],
): WeeklyChartMatchResult {
  if (auto.kind === 'spotify_id') return auto;
  const storedId = (storedSongId ?? '').trim();
  if (!storedId) return auto;
  const song = songs.find((s) => s.id === storedId);
  if (!song) return auto;
  return {
    kind: 'artist_title',
    song,
    youtubeVideoId: pickCatalogYoutubeVideoId(videos, song.id),
  };
}

export function matchChartTrackToCatalog(
  track: Pick<WeeklyChartSpotifyTrack, 'spotifyTrackId' | 'artistName' | 'title' | 'spotifyArtists'>,
  songs: WeeklyChartCatalogSong[],
  videos: WeeklyChartCatalogVideo[],
): WeeklyChartMatchResult {
  const trackId = parseSpotifyTrackIdInput(track.spotifyTrackId) ?? track.spotifyTrackId.trim();
  if (trackId) {
    const bySong = songs.find((s) => {
      const stored = parseSpotifyTrackIdInput(s.spotifyTrackId) ?? (s.spotifyTrackId ?? '').trim();
      return Boolean(stored) && stored === trackId;
    });
    if (bySong) {
      return { kind: 'spotify_id', song: bySong, youtubeVideoId: pickCatalogYoutubeVideoId(videos, bySong.id) };
    }
    const byVideo = videos.find((v) => {
      const stored = parseSpotifyTrackIdInput(v.spotifyTrackId) ?? (v.spotifyTrackId ?? '').trim();
      return Boolean(stored) && stored === trackId;
    });
    if (byVideo) {
      const song = songs.find((s) => s.id === byVideo.songId) ?? {
        id: byVideo.songId,
        mainArtist: null,
        songTitle: null,
        displayTitle: null,
        spotifyTrackId: trackId,
      };
      return { kind: 'spotify_id', song, youtubeVideoId: pickCatalogYoutubeVideoId(videos, byVideo.songId) };
    }
  }

  const titleHits = scoredTitleMatches(track, songs, videos);
  if (titleHits.length === 0) {
    return { kind: 'none', song: null, youtubeVideoId: null };
  }
  const picked = titleHits[0]!;
  return { kind: 'artist_title', song: picked, youtubeVideoId: pickCatalogYoutubeVideoId(videos, picked.id) };
}

export function summarizeWeeklyChartMatches(entries: Array<{ matchKind: WeeklyChartMatchKind }>): {
  existingCount: number;
  newCount: number;
} {
  let existingCount = 0;
  let newCount = 0;
  for (const e of entries) {
    if (e.matchKind === 'none') newCount += 1;
    else existingCount += 1;
  }
  return { existingCount, newCount };
}

export function isWeeklyChartTableMissingError(message: string | undefined | null): boolean {
  const m = String(message ?? '').toLowerCase();
  return (
    (m.includes('weekly_chart_issues') || m.includes('weekly_chart_entries')) &&
    (m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find'))
  );
}

function trim(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toEntryView(
  track: WeeklyChartSpotifyTrack,
  match: WeeklyChartMatchResult,
  entryId: string | null,
  candidateSongs: WeeklyChartSongCandidate[] = [],
): WeeklyChartEntryView {
  const youtubeVideoId = match.youtubeVideoId;
  return {
    id: entryId,
    position: track.position,
    spotifyTrackId: track.spotifyTrackId,
    title: track.title,
    artistName: track.artistName,
    spotifyArtists: track.spotifyArtists,
    spotifyUrl: track.spotifyUrl,
    matchKind: match.kind,
    songId: match.song?.id ?? null,
    songDisplayTitle: match.song?.displayTitle ?? match.song?.songTitle ?? null,
    youtubeVideoId,
    youtubeSearchUrl: weeklyChartYoutubeSearchUrl(track.artistName, track.title),
    youtubeWatchUrl: weeklyChartYoutubeWatchUrl(youtubeVideoId),
    newSongHref: weeklyChartNewSongHref(track.artistName, track.title),
    songAdminHref: weeklyChartSongAdminHref(match.song?.id ?? null),
    candidateSongs,
  };
}

type SpotifyPlaylistTrackJson = {
  id?: string;
  name?: string;
  is_local?: boolean;
  artists?: Array<{ name?: string }>;
  external_urls?: { spotify?: string };
};

type SpotifyPlaylistTracksJson = {
  items?: Array<{ track?: SpotifyPlaylistTrackJson | null }>;
};

type SpotifyPlaylistMetaJson = { name?: string };

export async function fetchSpotifyWeeklyChartTracks(
  region: WeeklyChartRegion,
): Promise<
  | { ok: true; playlistId: string; playlistName: string | null; tracks: WeeklyChartSpotifyTrack[] }
  | { ok: false; error: string }
> {
  const token = await getSpotifyAccessToken();
  if (!token) {
    return { ok: false, error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が未設定です。' };
  }
  const playlistId = weeklyChartPlaylistId(region);
  const market = weeklyChartSpotifyMarket(region);
  const metaUrl = new URL(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`);
  metaUrl.searchParams.set('fields', 'name');
  const tracksUrl = new URL(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`);
  tracksUrl.searchParams.set('limit', '20');
  tracksUrl.searchParams.set('market', market);
  tracksUrl.searchParams.set('fields', 'items(track(id,name,is_local,artists(name),external_urls))');

  try {
    const [metaRes, tracksRes] = await Promise.all([
      fetch(metaUrl.toString(), { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }),
      fetch(tracksUrl.toString(), { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (metaRes.status === 401 || tracksRes.status === 401) {
      return { ok: false, error: 'Spotify 認証に失敗しました。' };
    }
    if (!tracksRes.ok) {
      return { ok: false, error: `Spotify プレイリストの取得に失敗しました（${tracksRes.status}）。` };
    }
    const tracksJson = (await tracksRes.json()) as SpotifyPlaylistTracksJson;
    const metaJson = metaRes.ok ? ((await metaRes.json()) as SpotifyPlaylistMetaJson) : null;
    const tracks: WeeklyChartSpotifyTrack[] = [];
    for (const item of tracksJson.items ?? []) {
      const track = item.track;
      if (!track || track.is_local) continue;
      const id = trim(track.id);
      const title = trim(track.name);
      if (!id || !title) continue;
      const names = Array.isArray(track.artists)
        ? track.artists.map((a) => trim(a?.name)).filter(Boolean)
        : [];
      const artistName = names[0] ?? '';
      if (!artistName) continue;
      tracks.push({
        position: tracks.length + 1,
        spotifyTrackId: id,
        title,
        artistName,
        spotifyArtists: names.join(', '),
        spotifyUrl: trim(track.external_urls?.spotify) || `https://open.spotify.com/track/${id}`,
      });
      if (tracks.length >= WEEKLY_CHART_TOP_N) break;
    }
    if (tracks.length === 0) {
      return { ok: false, error: 'プレイリストから曲が取れませんでした。' };
    }
    return {
      ok: true,
      playlistId,
      playlistName: trim(metaJson?.name) || null,
      tracks,
    };
  } catch {
    return { ok: false, error: 'Spotify プレイリストの取得に失敗しました。' };
  }
}

function mapSongRow(row: {
  id?: string;
  main_artist?: string | null;
  song_title?: string | null;
  display_title?: string | null;
  spotify_track_id?: string | null;
}): WeeklyChartCatalogSong | null {
  const id = trim(row.id);
  if (!id) return null;
  return {
    id,
    mainArtist: row.main_artist ?? null,
    songTitle: row.song_title ?? null,
    displayTitle: row.display_title ?? null,
    spotifyTrackId: row.spotify_track_id ?? null,
  };
}

async function loadSongsBySpotifyTrackIds(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<WeeklyChartCatalogSong[]> {
  const ids = [
    ...new Set(
      trackIds
        .map((t) => parseSpotifyTrackIdInput(t) ?? t.trim())
        .filter((id) => id.length > 0),
    ),
  ];
  if (ids.length === 0) return [];
  const byId = new Map<string, WeeklyChartCatalogSong>();
  const pushRows = (rows: unknown[] | null | undefined) => {
    for (const row of rows ?? []) {
      const mapped = mapSongRow(row as Parameters<typeof mapSongRow>[0]);
      if (mapped) byId.set(mapped.id, mapped);
    }
  };
  const { data, error } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, spotify_track_id')
    .in('spotify_track_id', ids);
  if (error) {
    console.warn('[weekly-charts] songs by spotify_track_id', error.message);
  } else {
    pushRows(data);
  }
  const extras = await Promise.all(
    ids.map((id) =>
      admin
        .from('songs')
        .select('id, main_artist, song_title, display_title, spotify_track_id')
        .ilike('spotify_track_id', `%${escapeIlikePattern(id)}%`)
        .limit(8),
    ),
  );
  for (const extra of extras) {
    if (extra.error) {
      console.warn('[weekly-charts] songs by spotify_track_id ilike', extra.error.message);
      continue;
    }
    pushRows(extra.data);
  }
  return [...byId.values()];
}

async function loadVideosForSongs(
  admin: SupabaseClient,
  songIds: string[],
  trackIds: string[],
): Promise<WeeklyChartCatalogVideo[]> {
  const out: WeeklyChartCatalogVideo[] = [];
  const seen = new Set<string>();
  const pushRows = (rows: unknown[], hasSpotify: boolean) => {
    for (const raw of rows) {
      const row = raw as {
        song_id?: string;
        video_id?: string;
        variant?: string | null;
        spotify_track_id?: string | null;
      };
      const songId = trim(row.song_id);
      const videoId = trim(row.video_id);
      if (!songId || !videoId) continue;
      const key = `${songId}:${videoId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        songId,
        videoId,
        variant: row.variant ?? null,
        spotifyTrackId: hasSpotify ? row.spotify_track_id ?? null : null,
      });
    }
  };

  const selectWithSp = 'song_id, video_id, variant, spotify_track_id';
  const selectPlain = 'song_id, video_id, variant';

  if (songIds.length > 0) {
    const first = await admin.from('song_videos').select(selectWithSp).in('song_id', songIds);
    if (first.error && /spotify_track_id|42703/i.test(first.error.message)) {
      const retry = await admin.from('song_videos').select(selectPlain).in('song_id', songIds);
      if (retry.error) console.warn('[weekly-charts] song_videos by song_id', retry.error.message);
      else pushRows(retry.data ?? [], false);
    } else if (first.error) {
      console.warn('[weekly-charts] song_videos by song_id', first.error.message);
    } else {
      pushRows(first.data ?? [], true);
    }
  }

  if (trackIds.length > 0) {
    const byTrack = await admin.from('song_videos').select(selectWithSp).in('spotify_track_id', trackIds);
    if (byTrack.error) {
      if (!/spotify_track_id|42703/i.test(byTrack.error.message)) {
        console.warn('[weekly-charts] song_videos by spotify_track_id', byTrack.error.message);
      }
    } else {
      pushRows(byTrack.data ?? [], true);
    }
  }

  return out;
}

async function loadTitleMatchSongs(
  admin: SupabaseClient,
  tracks: WeeklyChartSpotifyTrack[],
): Promise<WeeklyChartCatalogSong[]> {
  const byId = new Map<string, WeeklyChartCatalogSong>();
  for (const track of tracks) {
    const patterns = buildExistingSongIlikePatterns(track.artistName, track.title);
    if (!patterns.titleLike) continue;
    const { data, error } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, spotify_track_id')
      .ilike('song_title', patterns.titleLike)
      .limit(40);
    if (error) {
      console.warn('[weekly-charts] songs ilike', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const mapped = mapSongRow(row as Parameters<typeof mapSongRow>[0]);
      if (mapped) byId.set(mapped.id, mapped);
    }
  }
  return [...byId.values()];
}

async function loadSongsByIds(
  admin: SupabaseClient,
  songIds: string[],
): Promise<WeeklyChartCatalogSong[]> {
  const ids = [...new Set(songIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, spotify_track_id')
    .in('id', ids);
  if (error) {
    console.warn('[weekly-charts] songs by id', error.message);
    return [];
  }
  const out: WeeklyChartCatalogSong[] = [];
  for (const row of data ?? []) {
    const mapped = mapSongRow(row as Parameters<typeof mapSongRow>[0]);
    if (mapped) out.push(mapped);
  }
  return out;
}

async function loadCatalogForTracks(
  admin: SupabaseClient,
  tracks: WeeklyChartSpotifyTrack[],
  extraSongIds: string[] = [],
): Promise<{ songs: WeeklyChartCatalogSong[]; videos: WeeklyChartCatalogVideo[] }> {
  const trackIds = tracks.map((t) => parseSpotifyTrackIdInput(t.spotifyTrackId) ?? t.spotifyTrackId).filter(Boolean);
  const byIdSongs = await loadSongsBySpotifyTrackIds(admin, trackIds);
  const titleSongs = await loadTitleMatchSongs(admin, tracks);
  const extraSongs = await loadSongsByIds(admin, extraSongIds);
  const songsById = new Map<string, WeeklyChartCatalogSong>();
  for (const s of [...byIdSongs, ...titleSongs, ...extraSongs]) songsById.set(s.id, s);

  let videos = await loadVideosForSongs(admin, [...songsById.keys()], trackIds);
  const missingSongIds = videos.map((v) => v.songId).filter((id) => !songsById.has(id));
  if (missingSongIds.length > 0) {
    const extra = await loadSongsByIds(admin, missingSongIds);
    for (const mapped of extra) songsById.set(mapped.id, mapped);
    videos = await loadVideosForSongs(admin, [...songsById.keys()], trackIds);
  }
  return { songs: [...songsById.values()], videos };
}

function matchTracksToCatalog(
  tracks: WeeklyChartSpotifyTrack[],
  songs: WeeklyChartCatalogSong[],
  videos: WeeklyChartCatalogVideo[],
  entryIds: Array<string | null> = [],
  storedSongIds: Array<string | null> = [],
): WeeklyChartEntryView[] {
  return tracks.map((track, i) => {
    const auto = matchChartTrackToCatalog(track, songs, videos);
    const match = preferStoredChartSong(auto, storedSongIds[i] ?? null, songs, videos);
    return toEntryView(track, match, entryIds[i] ?? null, listChartSongCandidates(track, songs, videos));
  });
}

type IssueRow = {
  id: string;
  region: string;
  chart_week: string;
  source_playlist_id: string | null;
  playlist_name: string | null;
  imported_at: string;
};

type EntryRow = {
  id: string;
  position: number;
  spotify_track_id: string | null;
  title: string;
  artist_name: string;
  spotify_artists: string | null;
  song_id: string | null;
  match_kind: string | null;
};

function usableChartEntryRows(rows: EntryRow[]): EntryRow[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .filter((row) => trim(row.spotify_track_id) && trim(row.title) && trim(row.artist_name));
}

function tracksFromEntryRows(rows: EntryRow[]): WeeklyChartSpotifyTrack[] {
  return usableChartEntryRows(rows).map((row) => ({
    position: row.position,
    spotifyTrackId: trim(row.spotify_track_id),
    title: trim(row.title),
    artistName: trim(row.artist_name),
    spotifyArtists: trim(row.spotify_artists) || trim(row.artist_name),
    spotifyUrl: trim(row.spotify_track_id)
      ? `https://open.spotify.com/track/${trim(row.spotify_track_id)}`
      : null,
  }));
}

async function persistMatchedEntries(
  admin: SupabaseClient,
  rows: EntryRow[],
  views: WeeklyChartEntryView[],
): Promise<void> {
  for (const view of views) {
    const row = rows.find((r) => r.id === view.id);
    if (!row) continue;
    const nextKind = view.matchKind;
    const nextSong = view.songId;
    if (row.match_kind === nextKind && (row.song_id ?? null) === nextSong) continue;
    const { error } = await admin
      .from('weekly_chart_entries')
      .update({ match_kind: nextKind, song_id: nextSong })
      .eq('id', row.id);
    if (error) console.warn('[weekly-charts] rematch update', error.message);
  }
}

async function issueViewFromRows(
  admin: SupabaseClient,
  issue: IssueRow,
  rematch: boolean,
): Promise<{ issue: WeeklyChartIssueView | null; error: string | null; tableMissing?: boolean }> {
  const { data, error } = await admin
    .from('weekly_chart_entries')
    .select('id, position, spotify_track_id, title, artist_name, spotify_artists, song_id, match_kind')
    .eq('issue_id', issue.id)
    .order('position', { ascending: true });
  if (error) {
    if (isWeeklyChartTableMissingError(error.message)) {
      return { issue: null, error: error.message, tableMissing: true };
    }
    return { issue: null, error: error.message };
  }
  const rows = (data as EntryRow[] | null) ?? [];
  const usable = usableChartEntryRows(rows);
  const tracks = tracksFromEntryRows(rows);
  const extraSongIds = usable.map((r) => trim(r.song_id)).filter(Boolean);
  const { songs, videos } = await loadCatalogForTracks(admin, tracks, extraSongIds);
  const entries = matchTracksToCatalog(
    tracks,
    songs,
    videos,
    usable.map((r) => r.id),
    usable.map((r) => r.song_id),
  );
  if (rematch) await persistMatchedEntries(admin, rows, entries);
  const counts = summarizeWeeklyChartMatches(entries);
  const region = isWeeklyChartRegion(issue.region) ? issue.region : 'us';
  return {
    issue: {
      id: issue.id,
      region,
      chartWeek: issue.chart_week,
      sourcePlaylistId: issue.source_playlist_id ?? '',
      playlistName: issue.playlist_name,
      importedAt: issue.imported_at,
      existingCount: counts.existingCount,
      newCount: counts.newCount,
      entries,
    },
    error: null,
  };
}

export async function loadLatestWeeklyChartIssue(
  admin: SupabaseClient,
  region: WeeklyChartRegion,
  rematch = false,
): Promise<{ issue: WeeklyChartIssueView | null; error: string | null; tableMissing?: boolean }> {
  const { data, error } = await admin
    .from('weekly_chart_issues')
    .select('id, region, chart_week, source_playlist_id, playlist_name, imported_at')
    .eq('region', region)
    .order('chart_week', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isWeeklyChartTableMissingError(error.message)) {
      return { issue: null, error: error.message, tableMissing: true };
    }
    return { issue: null, error: error.message };
  }
  if (!data) return { issue: null, error: null };
  return issueViewFromRows(admin, data as IssueRow, rematch);
}

export async function loadLatestWeeklyCharts(
  admin: SupabaseClient,
): Promise<{
  us: WeeklyChartIssueView | null;
  uk: WeeklyChartIssueView | null;
  error: string | null;
  tableMissing?: boolean;
}> {
  const usLoaded = await loadLatestWeeklyChartIssue(admin, 'us', true);
  if (usLoaded.tableMissing) {
    return { us: null, uk: null, error: usLoaded.error, tableMissing: true };
  }
  if (usLoaded.error) return { us: null, uk: null, error: usLoaded.error };
  const ukLoaded = await loadLatestWeeklyChartIssue(admin, 'uk', true);
  if (ukLoaded.tableMissing) {
    return { us: null, uk: null, error: ukLoaded.error, tableMissing: true };
  }
  if (ukLoaded.error) return { us: null, uk: null, error: ukLoaded.error };
  return { us: usLoaded.issue, uk: ukLoaded.issue, error: null };
}

export async function bindWeeklyChartEntry(
  admin: SupabaseClient,
  entryId: string,
  target: string,
): Promise<{ issue: WeeklyChartIssueView | null; error: string | null; tableMissing?: boolean }> {
  const id = entryId.trim();
  const raw = target.trim();
  if (!id || !SONG_UUID_RE.test(id)) {
    return { issue: null, error: 'チャート行が無効です。' };
  }
  if (!raw) {
    return { issue: null, error: 'YouTube URL か曲 ID を入力してください。' };
  }

  const { data: entry, error: entryErr } = await admin
    .from('weekly_chart_entries')
    .select('id, issue_id, spotify_track_id, title, artist_name, spotify_artists')
    .eq('id', id)
    .maybeSingle();
  if (entryErr) {
    if (isWeeklyChartTableMissingError(entryErr.message)) {
      return { issue: null, error: entryErr.message, tableMissing: true };
    }
    return { issue: null, error: entryErr.message };
  }
  if (!entry?.issue_id) {
    return { issue: null, error: 'チャート行が見つかりません。' };
  }

  const { data: issueRow, error: issueErr } = await admin
    .from('weekly_chart_issues')
    .select('id, region, chart_week, source_playlist_id, playlist_name, imported_at')
    .eq('id', entry.issue_id)
    .maybeSingle();
  if (issueErr) {
    return { issue: null, error: issueErr.message };
  }
  if (!issueRow) {
    return { issue: null, error: 'チャート週が見つかりません。' };
  }

  let songId = '';
  if (SONG_UUID_RE.test(raw)) {
    songId = raw;
  } else {
    const videoId = youtubeVideoIdFromUnknown(raw);
    if (!videoId) {
      return { issue: null, error: 'YouTube URL / 動画ID、または曲の UUID を入力してください。' };
    }
    const { data: vid, error: vidErr } = await admin
      .from('song_videos')
      .select('song_id')
      .eq('video_id', videoId)
      .maybeSingle();
    if (vidErr) {
      return { issue: null, error: vidErr.message };
    }
    songId = trim((vid as { song_id?: string } | null)?.song_id);
    if (!songId) {
      return { issue: null, error: 'この YouTube は曲マスタに未登録です。先に曲詳細で登録してください。' };
    }
  }

  const songs = await loadSongsByIds(admin, [songId]);
  const song = songs[0];
  if (!song) {
    return { issue: null, error: '指定した曲が見つかりません。' };
  }

  const track: WeeklyChartSpotifyTrack = {
    position: 1,
    spotifyTrackId: trim(entry.spotify_track_id),
    title: trim(entry.title),
    artistName: trim(entry.artist_name),
    spotifyArtists: trim(entry.spotify_artists) || trim(entry.artist_name),
    spotifyUrl: null,
  };
  const videos = await loadVideosForSongs(admin, [song.id], [track.spotifyTrackId]);
  const matchKind: WeeklyChartMatchKind = songHasChartSpotifyId(track, song, videos)
    ? 'spotify_id'
    : 'artist_title';

  const { error: updErr } = await admin
    .from('weekly_chart_entries')
    .update({ song_id: song.id, match_kind: matchKind })
    .eq('id', id);
  if (updErr) {
    if (isWeeklyChartTableMissingError(updErr.message)) {
      return { issue: null, error: updErr.message, tableMissing: true };
    }
    return { issue: null, error: updErr.message };
  }

  return issueViewFromRows(admin, issueRow as IssueRow, false);
}

export async function importWeeklyChart(
  admin: SupabaseClient,
  region: WeeklyChartRegion,
): Promise<{ issue: WeeklyChartIssueView | null; error: string | null; tableMissing?: boolean }> {
  const fetched = await fetchSpotifyWeeklyChartTracks(region);
  if (!fetched.ok) return { issue: null, error: fetched.error };

  const chartWeek = latestChartPublishDateJst(region);
  const importedAt = new Date().toISOString();
  const { songs, videos } = await loadCatalogForTracks(admin, fetched.tracks);
  const matched = matchTracksToCatalog(fetched.tracks, songs, videos);

  const { data: existing, error: findErr } = await admin
    .from('weekly_chart_issues')
    .select('id')
    .eq('region', region)
    .eq('chart_week', chartWeek)
    .maybeSingle();
  if (findErr) {
    if (isWeeklyChartTableMissingError(findErr.message)) {
      return { issue: null, error: findErr.message, tableMissing: true };
    }
    return { issue: null, error: findErr.message };
  }

  let issueId = trim((existing as { id?: string } | null)?.id);
  if (issueId) {
    const { error: updErr } = await admin
      .from('weekly_chart_issues')
      .update({
        source: 'spotify',
        source_playlist_id: fetched.playlistId,
        playlist_name: fetched.playlistName,
        imported_at: importedAt,
      })
      .eq('id', issueId);
    if (updErr) return { issue: null, error: updErr.message };
    const { error: delErr } = await admin.from('weekly_chart_entries').delete().eq('issue_id', issueId);
    if (delErr) return { issue: null, error: delErr.message };
  } else {
    const { data: inserted, error: insErr } = await admin
      .from('weekly_chart_issues')
      .insert({
        region,
        chart_week: chartWeek,
        source: 'spotify',
        source_playlist_id: fetched.playlistId,
        playlist_name: fetched.playlistName,
        imported_at: importedAt,
      })
      .select('id')
      .single();
    if (insErr) {
      if (isWeeklyChartTableMissingError(insErr.message)) {
        return { issue: null, error: insErr.message, tableMissing: true };
      }
      return { issue: null, error: insErr.message };
    }
    issueId = trim((inserted as { id?: string } | null)?.id);
    if (!issueId) return { issue: null, error: '取込の保存に失敗しました。' };
  }

  const payload = matched.map((entry) => ({
    issue_id: issueId,
    position: entry.position,
    spotify_track_id: entry.spotifyTrackId,
    title: entry.title,
    artist_name: entry.artistName,
    spotify_artists: entry.spotifyArtists,
    song_id: entry.songId,
    match_kind: entry.matchKind,
  }));
  const { data: saved, error: saveErr } = await admin
    .from('weekly_chart_entries')
    .insert(payload)
    .select('id, position');
  if (saveErr) return { issue: null, error: saveErr.message };

  const idByPos = new Map<number, string>();
  for (const row of (saved as Array<{ id?: string; position?: number }> | null) ?? []) {
    if (typeof row.position === 'number' && row.id) idByPos.set(row.position, row.id);
  }
  const entries = matched.map((e) => ({ ...e, id: idByPos.get(e.position) ?? e.id }));
  const counts = summarizeWeeklyChartMatches(entries);
  return {
    issue: {
      id: issueId,
      region,
      chartWeek,
      sourcePlaylistId: fetched.playlistId,
      playlistName: fetched.playlistName,
      importedAt,
      existingCount: counts.existingCount,
      newCount: counts.newCount,
      entries,
    },
    error: null,
  };
}
