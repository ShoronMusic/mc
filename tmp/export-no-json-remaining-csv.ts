/**
 * 元 no_json リストを再照合し、現時点でも M8 JSON 解決できない曲を CSV 出力
 *
 *   npx tsx tmp/export-no-json-remaining-csv.ts
 *   npx tsx tmp/export-no-json-remaining-csv.ts --artists-local-dir=E:\m8\public\data\artists --songs-local-dir=E:\m8\public\data\songs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  collectArtistSlugsForRow,
  collectSlugPairsForRow,
  loadMusic8WpSongsVideoIndexForScripts,
  resolveMusic8WpSongJsonForRow,
} from '@/lib/music8-wp-song-json-resolve';

const SOURCE_CSV = 'tmp/backfill-multi-artist-no-json-list.csv';
const OUT_CSV = 'tmp/backfill-multi-artist-no-json-remaining.csv';
const DEFAULT_VIDEO_INDEX_IN = 'tmp/backfill-video-index.json';

function parseArgs(argv: string[]): {
  artistsLocalDir: string | null;
  songsLocalDir: string | null;
  videoIndexIn: string | null;
} {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--') && a.includes('=')) {
      const [k, ...rest] = a.slice(2).split('=');
      args.set(k!, rest.join('='));
    }
  }
  return {
    artistsLocalDir: args.get('artists-local-dir')?.trim() || null,
    songsLocalDir: args.get('songs-local-dir')?.trim() || null,
    videoIndexIn: args.get('video-index-in')?.trim() || DEFAULT_VIDEO_INDEX_IN,
  };
}

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

function csvCell(v: string | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function readIdsFromCsv(csvPath: string): string[] {
  const lines = fs.readFileSync(path.resolve(csvPath), 'utf8').split(/\r?\n/).filter(Boolean);
  const ids: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.toLowerCase().startsWith('id,')) continue;
    const id = line.split(',')[0]?.trim().replace(/^"/, '').replace(/"$/, '');
    if (id && id !== 'id') ids.push(id);
  }
  return ids;
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

async function fetchVideoId(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  songId: string,
): Promise<string | null> {
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
  const opts = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');

  const ids = readIdsFromCsv(SOURCE_CSV);
  if (ids.length === 0) throw new Error('no ids in source csv');

  console.log('[export-remaining] building video index …');
  const videoIndex = await loadMusic8WpSongsVideoIndexForScripts({
    videoIndexIn: fs.existsSync(path.resolve(opts.videoIndexIn)) ? opts.videoIndexIn : null,
    songsLocalDir: opts.songsLocalDir,
  });

  const header = [
    'id',
    'display_title',
    'main_artist',
    'song_title',
    'music8_artist_slug',
    'music8_song_slug',
    'video_id',
    'spotify_artists',
    'slug_candidates',
    'artist_slug_candidates',
  ];
  const lines: string[] = [header.join(',')];

  const chunkSize = 50;
  let stillNoJson = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('songs')
      .select(
        'id, display_title, main_artist, song_title, music8_artist_slug, music8_song_slug, music8_video_id, spotify_artists, music8_song_data',
      )
      .in('id', chunk);
    if (error) throw error;

    const byId = new Map((data ?? []).map((r) => [(r as { id: string }).id, r]));
    for (const id of chunk) {
      const row = byId.get(id);
      if (!row) continue;

      const videoId = (await fetchVideoId(admin, id)) ?? null;
      const resolved = await resolveMusic8WpSongJsonForRow(row, {
        videoId,
        videoIdFallback: true,
        songsLocalDir: opts.songsLocalDir,
        artistsLocalDir: opts.artistsLocalDir,
        videoIndex,
      });
      if (resolved) continue;

      stillNoJson++;
      const pairs = collectSlugPairsForRow(row);
      const artistSlugs = collectArtistSlugsForRow(row);
      lines.push(
        [
          csvCell(row.id),
          csvCell(row.display_title),
          csvCell(row.main_artist),
          csvCell(row.song_title),
          csvCell(row.music8_artist_slug),
          csvCell(row.music8_song_slug),
          csvCell(videoId),
          csvCell(row.spotify_artists),
          csvCell(pairs.map((p) => `${p.artistSlug}/${p.songSlug}`).join('; ')),
          csvCell(artistSlugs.join('; ')),
        ].join(','),
      );
    }
    console.log(`[export-remaining] checked ${Math.min(i + chunkSize, ids.length)}/${ids.length} remaining=${stillNoJson}`);
  }

  fs.writeFileSync(path.resolve(OUT_CSV), `${lines.join('\n')}\n`, 'utf8');
  console.log(`[export-remaining] wrote ${stillNoJson} rows -> ${path.resolve(OUT_CSV)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
