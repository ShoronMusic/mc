/**
 * spotify_popularity 未設定の songs を全件 CSV 出力（Supabase UI の Export 100 行制限回避）。
 *
 * Usage:
 *   npx tsx scripts/export-songs-no-spotify-popularity-csv.ts
 *   npx tsx scripts/export-songs-no-spotify-popularity-csv.ts --out=tmp/songs-no-spotify-popularity.csv
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE = 1000;

const COLUMNS = [
  'id',
  'main_artist',
  'song_title',
  'display_title',
  'spotify_track_id',
  'spotify_track_id_from_json',
  'spotify_name',
  'spotify_artists',
  'spotify_release_date',
  'music8_song_id',
  'music8_artist_slug',
  'music8_song_slug',
  'music8_video_id',
  'original_release_date',
  'play_count',
  'created_at',
] as const;

type SongRow = {
  id: string;
  main_artist: string;
  song_title: string;
  display_title: string;
  spotify_track_id: string | null;
  spotify_name: string | null;
  spotify_artists: string | null;
  spotify_release_date: string | null;
  music8_song_id: number | null;
  music8_artist_slug: string | null;
  music8_song_slug: string | null;
  music8_video_id: string | null;
  original_release_date: string | null;
  play_count: number;
  created_at: string;
  music8_song_data: Record<string, unknown> | null;
};

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
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

function parseArgs(argv: string[]): { out: string; help: boolean } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let out = path.resolve(process.cwd(), 'tmp', `songs-no-spotify-popularity-${stamp}.csv`);
  for (const token of argv) {
    if (token === '--help' || token === '-h') return { out, help: true };
    if (token.startsWith('--out=')) out = path.resolve(process.cwd(), token.slice('--out='.length).trim());
  }
  return { out, help: false };
}

function pickTrackIdFromJson(data: Record<string, unknown> | null): string {
  if (!data || typeof data !== 'object') return '';
  const direct = data.spotify_track_id;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const ids = data.identifiers;
  if (ids && typeof ids === 'object' && !Array.isArray(ids)) {
    const v = (ids as Record<string, unknown>).spotify_track_id;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: Record<string, string | number>[]): string {
  const header = COLUMNS.join(',');
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','));
  return [header, ...body].join('\n') + '\n';
}

async function fetchAll(): Promise<SongRow[]> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('createAdminClient failed');
  const all: SongRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from('songs')
      .select(
        'id, main_artist, song_title, display_title, spotify_track_id, spotify_name, spotify_artists, spotify_release_date, music8_song_id, music8_artist_slug, music8_song_slug, music8_video_id, original_release_date, play_count, created_at, music8_song_data',
      )
      .is('spotify_popularity', null)
      .order('display_title', { ascending: true })
      .range(from, to);

    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
    const batch = (data ?? []) as SongRow[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { out, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(`Usage:
  npx tsx scripts/export-songs-no-spotify-popularity-csv.ts [--out=tmp/songs-no-spotify-popularity.csv]`);
    return;
  }

  const rows = await fetchAll();
  const csvRows = rows.map((s) => {
    const json = s.music8_song_data;
    const fromJson = pickTrackIdFromJson(json);
    return {
      id: s.id,
      main_artist: s.main_artist,
      song_title: s.song_title,
      display_title: s.display_title,
      spotify_track_id: s.spotify_track_id ?? '',
      spotify_track_id_from_json: fromJson,
      spotify_name: s.spotify_name ?? '',
      spotify_artists: s.spotify_artists ?? '',
      spotify_release_date: s.spotify_release_date ?? '',
      music8_song_id: s.music8_song_id ?? '',
      music8_artist_slug: s.music8_artist_slug ?? '',
      music8_song_slug: s.music8_song_slug ?? '',
      music8_video_id: s.music8_video_id ?? '',
      original_release_date: s.original_release_date ?? '',
      play_count: s.play_count,
      created_at: s.created_at,
    };
  });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buildCsv(csvRows), 'utf8');
  console.log(`wrote ${csvRows.length} rows -> ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
