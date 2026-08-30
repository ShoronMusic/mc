/**
 * musicaichat/v1 ツリーと Music8 公開用集計 JSON をディスクへ書く。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildStyleMonthly,
  emptyStylesSummary,
  loadSongExportBundle,
  mergeYoutubeIndex,
  MUSIC8_JSON_SCHEMA_VERSION,
  type MusicaichatSongJson,
  type StylesSummaryItem,
  type YoutubeIndexEntry,
} from '@/lib/music8-catalog-json-export';
import { MUSIC8_NAV_STYLE_SLUGS } from '@/lib/music8-catalog-slugs';

export function resolveMusic8JsonExportDir(explicit?: string | null): string {
  const fromArg = (explicit ?? '').trim();
  if (fromArg) return path.resolve(fromArg);
  const fromEnv = (process.env.MUSIC8_JSON_EXPORT_DIR ?? '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const m8 = path.resolve('E:/m8/public/data');
  if (fs.existsSync(m8)) return m8;
  return path.resolve(process.cwd(), 'tmp/music8-json-from-supabase');
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export type ArtistIndexSong = {
  song_slug: string;
  title: string;
  youtube_ids?: string[];
};

export type ArtistIndex = Record<string, { songs: ArtistIndexSong[] }>;

function upsertArtistIndexSong(index: ArtistIndex, json: MusicaichatSongJson): ArtistIndex {
  const slug = json.stable_key.artist_slug;
  const entry = index[slug] ?? { songs: [] };
  const nextSong: ArtistIndexSong = {
    song_slug: json.stable_key.song_slug,
    title: json.display.song_title,
    youtube_ids: json.youtube.ids,
  };
  const others = entry.songs.filter((s) => s.song_slug !== nextSong.song_slug);
  index[slug] = { songs: [...others, nextSong] };
  return index;
}

export function writeMusicaichatSongTree(
  exportDir: string,
  json: MusicaichatSongJson,
  youtubePatch: Record<string, YoutubeIndexEntry>,
): { songPath: string; youtubeIndexPath: string } {
  const base = path.join(exportDir, 'musicaichat', 'v1');
  const songPath = path.join(base, 'songs', songRel(json));
  writeJsonAtomic(songPath, json);

  const youtubeIndexPath = path.join(base, 'index', 'youtube_to_song.json');
  const current = readJsonFile<Record<string, YoutubeIndexEntry>>(youtubeIndexPath, {});
  writeJsonAtomic(youtubeIndexPath, mergeYoutubeIndex(current, youtubePatch));

  const artistIndexPath = path.join(base, 'index', 'artist_index.json');
  const artistIndex = readJsonFile<ArtistIndex>(artistIndexPath, {});
  writeJsonAtomic(artistIndexPath, upsertArtistIndexSong(artistIndex, json));

  const manifestPath = path.join(base, 'manifest.json');
  const songCount = countFiles(path.join(base, 'songs'));
  const ytCount = Object.keys(
    readJsonFile<Record<string, YoutubeIndexEntry>>(youtubeIndexPath, {}),
  ).length;
  writeJsonAtomic(manifestPath, {
    schema_version: MUSIC8_JSON_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    base_url: '',
    counts: {
      songs: songCount,
      youtube_index_entries: ytCount,
      artists: Object.keys(readJsonFile<ArtistIndex>(artistIndexPath, {})).length,
    },
    index_files: {
      youtube_to_song: 'index/youtube_to_song.json',
      artist_index: 'index/artist_index.json',
    },
  });

  return { songPath, youtubeIndexPath };
}

function songRel(json: MusicaichatSongJson): string {
  return `${json.stable_key.artist_slug}_${json.stable_key.song_slug}.json`;
}

function countFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
}

export async function exportOneSongToDisk(
  admin: SupabaseClient,
  songId: string,
  exportDir?: string | null,
): Promise<{ ok: true; songPath: string } | { ok: false; reason: string }> {
  const bundle = await loadSongExportBundle(admin, songId);
  if (!bundle) return { ok: false, reason: 'song_not_found' };
  const dir = resolveMusic8JsonExportDir(exportDir);
  const written = writeMusicaichatSongTree(dir, bundle.json, bundle.youtubeIndex);
  return { ok: true, songPath: written.songPath };
}

export async function rebuildStylesSummaryFromDb(
  admin: SupabaseClient,
  exportDir?: string | null,
): Promise<StylesSummaryItem[]> {
  const summary = emptyStylesSummary();
  const counts = new Map<string, number>(MUSIC8_NAV_STYLE_SLUGS.map((s) => [s, 0]));
  const { data, error } = await admin.from('song_styles').select('catalog_styles(slug)');
  if (!error && data) {
    for (const r of data as { catalog_styles?: { slug?: string } | { slug?: string }[] | null }[]) {
      const nested = r.catalog_styles;
      const slug = Array.isArray(nested)
        ? nested[0]?.slug
        : nested && typeof nested === 'object'
          ? nested.slug
          : '';
      if (slug && counts.has(slug)) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  for (const item of summary) {
    item.count = counts.get(item.slug) ?? 0;
  }
  const dir = resolveMusic8JsonExportDir(exportDir);
  writeJsonAtomic(path.join(dir, 'styles_summary.json'), summary);
  return summary;
}

export async function rebuildStyleMonthlyFromDb(
  admin: SupabaseClient,
  year: number,
  exportDir?: string | null,
): Promise<ReturnType<typeof buildStyleMonthly>> {
  const rows: Array<{ styleSlug: string; year: number; month: number }> = [];
  const { data: songs, error } = await admin
    .from('songs')
    .select('id, original_release_date, created_at, catalog_published_at')
    .eq('catalog_scope', 'western')
    .limit(50000);
  if (error || !songs) {
    const empty = buildStyleMonthly([], year);
    const dir = resolveMusic8JsonExportDir(exportDir);
    writeJsonAtomic(path.join(dir, 'aggregates', 'style-monthly.json'), empty);
    return empty;
  }

  const songIds = (songs as { id: string }[]).map((s) => s.id);
  const styleBySong = new Map<string, string>();
  const chunk = 200;
  for (let i = 0; i < songIds.length; i += chunk) {
    const slice = songIds.slice(i, i + chunk);
    const { data: links } = await admin
      .from('song_styles')
      .select('song_id, catalog_styles(slug)')
      .in('song_id', slice);
    for (const r of (links ?? []) as {
      song_id?: string;
      catalog_styles?: { slug?: string } | { slug?: string }[] | null;
    }[]) {
      if (!r.song_id || styleBySong.has(r.song_id)) continue;
      const nested = r.catalog_styles;
      const slug = Array.isArray(nested) ? nested[0]?.slug : nested?.slug;
      if (slug) styleBySong.set(r.song_id, slug);
    }
  }

  for (const s of songs as {
    id: string;
    original_release_date?: string | null;
    created_at?: string | null;
    catalog_published_at?: string | null;
  }[]) {
    const slug = styleBySong.get(s.id);
    if (!slug) continue;
    const dateStr = (s.catalog_published_at || s.created_at || s.original_release_date || '').slice(0, 10);
    const m = dateStr.match(/^(\d{4})-(\d{2})/);
    if (!m) continue;
    rows.push({ styleSlug: slug, year: Number(m[1]), month: Number(m[2]) });
  }

  const monthly = buildStyleMonthly(rows, year);
  const dir = resolveMusic8JsonExportDir(exportDir);
  writeJsonAtomic(path.join(dir, 'aggregates', 'style-monthly.json'), monthly);
  return monthly;
}
