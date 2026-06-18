/**
 * backfill-multi-artist-r2 の no_json 対象を列挙（ログには ID が出ないため再照合）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { artistNameToMusic8Slug } from '@/lib/music8-artist-display';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { music8SongJsonUrl } from '@/lib/music8-data-urls';
import { parseSpotifyArtistsString } from '@/lib/song-credits-resolve';
import { extractYoutubeVideoIdFromWpSongJson } from '@/lib/music8-wp-songs-video-index';

const HTTP_TIMEOUT_MS = 25_000;
const PAGE = 200;

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readSongIdsFromCsv(csvPath: string): Set<string> {
  const abs = path.resolve(csvPath);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter(Boolean);
  const ids = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.toLowerCase().startsWith('id,')) continue;
    const id = line.split(',')[0]?.trim();
    if (id && id !== 'id') ids.add(id);
  }
  return ids;
}

type SongRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  music8_artist_slug: string | null;
  music8_song_slug: string | null;
  music8_video_id: string | null;
  spotify_artists: string | null;
  music8_song_data?: unknown;
};

function spotifyArtistsFromRow(row: SongRow): string | null {
  const top = (row.spotify_artists ?? '').trim();
  if (top) return top;
  const data = row.music8_song_data;
  if (data != null && typeof data === 'object' && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const fromSnap = typeof o.spotify_artists === 'string' ? o.spotify_artists.trim() : '';
    if (fromSnap) return fromSnap;
  }
  return null;
}

function collectSlugPairs(row: SongRow): { artistSlug: string; songSlug: string }[] {
  const songSlug = (row.music8_song_slug ?? '').trim().toLowerCase();
  const out: { artistSlug: string; songSlug: string }[] = [];
  const add = (artistSlug: string) => {
    const a = artistSlug.trim().toLowerCase();
    if (!a || !songSlug) return;
    if (!out.some((p) => p.artistSlug === a)) out.push({ artistSlug: a, songSlug });
  };
  if (row.music8_artist_slug) add(row.music8_artist_slug);
  let names = parseSpotifyArtistsString(spotifyArtistsFromRow(row));
  if (names.length === 0 && row.main_artist) {
    names = parseCollabArtistNamesFromMainArtist(row.main_artist);
  }
  for (const name of names) {
    const slug = artistNameToMusic8Slug(name);
    if (slug) add(slug);
  }
  return out;
}

async function fetchHttpJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchM8JsonForRow(
  row: SongRow,
  videoId: string | null,
): Promise<boolean> {
  const pairs = collectSlugPairs(row);
  const vid = (videoId ?? row.music8_video_id ?? '').trim();
  for (const pair of pairs) {
    const json = await fetchHttpJson<Record<string, unknown>>(music8SongJsonUrl(pair.artistSlug, pair.songSlug));
    if (!json || typeof json !== 'object') continue;
    if (vid) {
      const found = extractYoutubeVideoIdFromWpSongJson(json);
      if (found && found !== vid) continue;
    }
    return true;
  }
  return false;
}

function rankVariant(variant: string | null | undefined): number {
  const v = (variant ?? '').trim().toLowerCase();
  if (v === 'official') return 0;
  if (v === 'topic') return 1;
  if (v === 'lyric') return 2;
  if (v === 'live') return 3;
  if (v) return 4;
  return 5;
}

async function fetchVideoId(admin: NonNullable<ReturnType<typeof createAdminClient>>, songId: string): Promise<string | null> {
  const { data } = await admin
    .from('song_videos')
    .select('video_id, variant, created_at')
    .eq('song_id', songId);
  let best: { videoId: string; rank: number; createdAt: string } | null = null;
  for (const row of data ?? []) {
    const cast = row as { video_id?: string; variant?: string | null; created_at?: string };
    const videoId = (cast.video_id ?? '').trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    const rank = rankVariant(cast.variant);
    const createdAt = (cast.created_at ?? '').trim();
    if (!best || rank < best.rank || (rank === best.rank && createdAt > best.createdAt)) {
      best = { videoId, rank, createdAt };
    }
  }
  return best?.videoId ?? null;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');

  const idsFilter = readSongIdsFromCsv('tmp/music8-songs-json-not-found.csv');
  const noJson: { id: string; display_title: string; main_artist: string; slugs: string }[] = [];
  let scanned = 0;
  let offset = 0;

  for (;;) {
    const { data: batch, error } = await admin
      .from('songs')
      .select(
        'id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug, music8_video_id, spotify_artists, music8_song_data',
      )
      .not('spotify_artists', 'is', null)
      .like('spotify_artists', '%,%')
      .order('display_title', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!batch?.length) break;
    offset += PAGE;

    for (const raw of batch as SongRow[]) {
      if (!idsFilter.has(raw.id)) continue;
      scanned++;
      const videoId = await fetchVideoId(admin, raw.id);
      const ok = await fetchM8JsonForRow(raw, videoId);
      if (!ok) {
        const pairs = collectSlugPairs(raw);
        noJson.push({
          id: raw.id,
          display_title: (raw.display_title ?? '').trim() || raw.id,
          main_artist: (raw.main_artist ?? '').trim(),
          slugs: pairs.map((p) => `${p.artistSlug}/${p.songSlug}`).join('; ') || '—',
        });
      }
      await new Promise((r) => setTimeout(r, 15));
      if (scanned % 50 === 0) console.error(`[scan] ${scanned} no_json=${noJson.length}`);
    }
  }

  console.log(`# no_json count=${noJson.length} scanned=${scanned}`);
  console.log('id,display_title,main_artist,slug_candidates');
  for (const row of noJson) {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    console.log(`${row.id},${esc(row.display_title)},${esc(row.main_artist)},${esc(row.slugs)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
