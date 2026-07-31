/**
 * ライブラリ・アーティスト索引スナップショットを再構築する。
 *
 * 前提: docs/supabase-songs-and-performances-tables.md の
 * `library_artist_index_snapshots` を SQL Editor で作成済み。
 *
 * 使い方:
 *   npx tsx scripts/rebuild-library-artist-index.ts
 *   npx tsx scripts/rebuild-library-artist-index.ts --catalog=western
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { rebuildLibraryArtistIndexSnapshots } from '@/lib/build-library-artist-index';
import {
  LIBRARY_CATALOG_FILTERS,
  type LibraryCatalogFilter,
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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseCatalogArg(): LibraryCatalogFilter[] {
  const raw = process.argv.find((a) => a.startsWith('--catalog='))?.slice('--catalog='.length);
  if (!raw) return [...LIBRARY_CATALOG_FILTERS];
  const v = raw.trim().toLowerCase();
  if (v === 'western' || v === 'domestic' || v === 'all') return [v];
  throw new Error(`--catalog は western|domestic|all のいずれか（got: ${raw})`);
}

async function main() {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が未設定です。');
    process.exit(1);
  }
  const catalogs = parseCatalogArg();
  console.log('[rebuild-library-artist-index] catalogs=', catalogs.join(','));
  const started = Date.now();
  const rows = await rebuildLibraryArtistIndexSnapshots(admin, catalogs);
  for (const row of rows) {
    console.log(`  ${row.catalog}: ${row.itemCount} artists`);
  }
  console.log(`[rebuild-library-artist-index] done in ${Date.now() - started}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
