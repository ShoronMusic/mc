/**
 * `songs.catalog_scope` を既存メタから推定してバックフィル。
 *
 * 事前: docs/supabase-songs-and-performances-tables.md の catalog_scope SQL を Supabase SQL Editor で実行。
 *
 * Usage:
 *   npx tsx scripts/backfill-song-catalog-scope.ts
 *   npx tsx scripts/backfill-song-catalog-scope.ts --apply
 *   npx tsx scripts/backfill-song-catalog-scope.ts --apply --limit=500 --offset=0
 *   npx tsx scripts/backfill-song-catalog-scope.ts --apply --force   # unknown 以外も上書き
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  inferSongCatalogScopeFromSongRow,
  normalizeSongCatalogScope,
  type SongCatalogScope,
} from '@/lib/song-catalog-scope';

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

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq), token.slice(eq + 1));
    else args.set(token.slice(2), '1');
  }
  const limitRaw = args.get('limit');
  const limit =
    limitRaw != null && limitRaw !== ''
      ? Math.max(1, Math.min(5000, Number(limitRaw) || 1))
      : null;
  return {
    apply: argv.includes('--apply'),
    force: argv.includes('--force'),
    limit,
    offset: Math.max(0, Number(args.get('offset') || '0') || 0),
  };
}

type SongRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  catalog_scope: string | null;
  artist_id: string | null;
};

async function main() {
  loadDotEnvLocal();
  const { apply, force, limit, offset } = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 等が未設定です。');
    process.exit(1);
  }

  const originByArtistId = new Map<string, string | null>();
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from('artists')
        .select('id, origin_country')
        .range(from, from + PAGE - 1);
      if (error) {
        if (error.code === '42703' || error.code === '42P01') break;
        throw error;
      }
      const batch = (data ?? []) as { id: string; origin_country: string | null }[];
      for (const a of batch) originByArtistId.set(a.id, a.origin_country);
      if (batch.length < PAGE) break;
    }
  }

  const PAGE = 500;
  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let skipped = 0;
  const counts: Record<SongCatalogScope, number> = { western: 0, domestic: 0, unknown: 0 };

  for (let from = offset; ; from += PAGE) {
    if (limit != null && scanned >= limit) break;
    const rangeEnd = limit != null ? Math.min(from + PAGE - 1, offset + limit - 1) : from + PAGE - 1;
    const { data, error } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, catalog_scope, artist_id')
      .order('id', { ascending: true })
      .range(from, rangeEnd);
    if (error) {
      if (error.code === '42703') {
        console.error('catalog_scope 列がありません。docs/supabase-songs-and-performances-tables.md の SQL を先に実行してください。');
        process.exit(1);
      }
      throw error;
    }
    const batch = (data ?? []) as SongRow[];
    if (batch.length === 0) break;

    for (const row of batch) {
      scanned += 1;
      const cur = normalizeSongCatalogScope(row.catalog_scope);
      if (!force && cur !== 'unknown') {
        skipped += 1;
        counts[cur] += 1;
        continue;
      }

      const next = inferSongCatalogScopeFromSongRow({
        main_artist: row.main_artist,
        song_title: row.song_title,
        display_title: row.display_title,
        artist_origin_country: row.artist_id ? (originByArtistId.get(row.artist_id) ?? null) : null,
      });
      counts[next] += 1;

      if (next === cur) {
        skipped += 1;
        continue;
      }

      wouldUpdate += 1;
      if (apply) {
        const { error: uErr } = await admin.from('songs').update({ catalog_scope: next }).eq('id', row.id);
        if (uErr) throw uErr;
        updated += 1;
      }
    }

    if (batch.length < PAGE) break;
    if (limit != null && scanned >= limit) break;
  }

  console.log(
    JSON.stringify(
      {
        apply,
        force,
        offset,
        limit,
        scanned,
        wouldUpdate,
        updated,
        skipped,
        projectedCounts: counts,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
