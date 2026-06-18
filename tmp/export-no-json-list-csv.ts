/**
 * no_json 対象曲を DB から CSV 出力
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { collectSlugPairsForRow } from '@/lib/music8-wp-song-json-resolve';

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

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');

  const sourceCsv = 'tmp/backfill-multi-artist-no-json.csv';
  const outCsv = 'tmp/backfill-multi-artist-no-json-list.csv';
  const ids = readIdsFromCsv(sourceCsv);
  if (ids.length === 0) throw new Error('no ids in source csv');

  const header = [
    'id',
    'display_title',
    'main_artist',
    'song_title',
    'music8_artist_slug',
    'music8_song_slug',
    'spotify_artists',
    'slug_candidates',
  ];
  const lines: string[] = [header.join(',')];

  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from('songs')
      .select(
        'id, display_title, main_artist, song_title, music8_artist_slug, music8_song_slug, spotify_artists, music8_song_data',
      )
      .in('id', chunk);
    if (error) throw error;

    const byId = new Map((data ?? []).map((r) => [(r as { id: string }).id, r]));
    for (const id of chunk) {
      const row = byId.get(id) as {
        id: string;
        display_title: string | null;
        main_artist: string | null;
        song_title: string | null;
        music8_artist_slug: string | null;
        music8_song_slug: string | null;
        spotify_artists: string | null;
        music8_song_data?: unknown;
      } | undefined;
      if (!row) continue;
      const pairs = collectSlugPairsForRow(row);
      const slugCandidates = pairs.map((p) => `${p.artistSlug}/${p.songSlug}`).join('; ');
      lines.push(
        [
          csvCell(row.id),
          csvCell(row.display_title),
          csvCell(row.main_artist),
          csvCell(row.song_title),
          csvCell(row.music8_artist_slug),
          csvCell(row.music8_song_slug),
          csvCell(row.spotify_artists),
          csvCell(slugCandidates),
        ].join(','),
      );
    }
  }

  fs.writeFileSync(path.resolve(outCsv), `${lines.join('\n')}\n`, 'utf8');
  console.log(`[export] wrote ${lines.length - 1} rows -> ${path.resolve(outCsv)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
