/**
 * 洋楽アーティストの曲を邦楽タブから外す（`songs.catalog_scope = western` のみ。削除しない）。
 *
 * Usage:
 *   npx tsx scripts/pin-western-catalog-scope-artists-once.ts
 *   npx tsx scripts/pin-western-catalog-scope-artists-once.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllSongRowsForArtistAggregation } from '@/lib/library-artist-count-rows';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import {
  normalizeSongCatalogScope,
  songRowMatchesLibraryCatalogFilter,
} from '@/lib/song-catalog-scope';

const TARGET_MAIN_ARTISTS = ['Fatboy Slim', 'Sam Smith', 'Eric Martin'] as const;

/** Sam Smith クレジットのみで邦楽索引に出ていた行 */
const TARGET_SONG_IDS_EXTRA = ['5274823b-b9a2-484d-a148-7fdf406fcecc'] as const;

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

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が必要です。');
    process.exit(1);
  }

  const rows = await fetchAllSongRowsForArtistAggregation(admin);
  const artistSet = new Set(TARGET_MAIN_ARTISTS.map((n) => n.toLowerCase()));
  const extraIds = new Set(TARGET_SONG_IDS_EXTRA);

  const targets = rows.filter((row) => {
    const artist = (row.main_artist ?? '').trim();
    if (extraIds.has(row.id)) return true;
    if (!artist || !artistSet.has(artist.toLowerCase())) return false;
    return true;
  });

  console.log(`対象曲: ${targets.length} 件（dry-run${apply ? ' → apply' : ''}）\n`);

  let wouldUpdate = 0;
  let alreadyWestern = 0;
  let skippedDomestic = 0;

  for (const row of targets) {
    const scope = normalizeSongCatalogScope(row.catalog_scope);
    const inDomestic = songRowMatchesLibraryCatalogFilter(row, 'domestic');
    const title = (row.display_title ?? row.song_title ?? '').trim() || '(無題)';

    if (scope === 'western') {
      alreadyWestern += 1;
      console.log(`[skip already western] ${row.main_artist} / ${title}`);
      continue;
    }
    if (scope === 'domestic') {
      skippedDomestic += 1;
      console.warn(`[skip catalog_scope=domestic] ${row.main_artist} / ${title} (${row.id})`);
      continue;
    }

    wouldUpdate += 1;
    console.log(`[update → western] ${row.main_artist} / ${title}`);
    console.log(`  id: ${row.id}  scope: ${row.catalog_scope ?? 'null'}  domestic-tab: ${inDomestic}`);

    if (apply) {
      const { error } = await admin.from('songs').update({ catalog_scope: 'western' }).eq('id', row.id);
      if (error) {
        console.error(`  failed: ${error.message}`);
      } else {
        console.log('  ok');
      }
    }
  }

  if (apply) {
    clearLibraryArtistIndexCache();
  }

  console.log(
    `\nsummary: update=${wouldUpdate} already_western=${alreadyWestern} skipped_domestic=${skippedDomestic}`,
  );
  if (!apply) {
    console.log('\n実行: npx tsx scripts/pin-western-catalog-scope-artists-once.ts --apply');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
