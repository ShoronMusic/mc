/**
 * 既存 songs（music8_song_id）に WP 曲 JSON の style/genre/vocal/tag を載せる。
 *
 * 前提: docs/sql/music8-catalog-extension.sql を SQL Editor で実行済み。
 * 曲本体は既存 import-music8-songs-bulk / 週次同期で入っている想定。
 *
 * Usage:
 *   npx tsx scripts/import-music8-wp-catalog.ts --songs-dir=E:/m8/public/data/songs
 *   npx tsx scripts/import-music8-wp-catalog.ts --songs-dir=... --apply
 *   npx tsx scripts/import-music8-wp-catalog.ts --songs-dir=... --apply --limit=50
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  patchArtistWpTermFromSongJson,
  syncMusic8CatalogTaxonomyFromSongJson,
} from '@/lib/music8-catalog-sync';

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

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
    else args.set(token.slice(2).trim(), '1');
  }
  return {
    songsDir: args.get('songs-dir')?.trim() || '',
    apply: argv.includes('--apply'),
    limit: args.get('limit') ? Number(args.get('limit')) : null,
    offset: args.get('offset') ? Number(args.get('offset')) : 0,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function listSongFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

function wpSongIdFromJson(raw: unknown): number | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = (raw as { id?: unknown }).id;
  const n = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const LOOKUP_CHUNK = 200;

async function loadSongIdMap(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  wpIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = [...new Set(wpIds)];
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await admin
      .from('songs')
      .select('id, music8_song_id')
      .in('music8_song_id', chunk);
    if (error) {
      console.error('[songs lookup]', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      const wpId = Number((row as { music8_song_id?: number }).music8_song_id);
      const id = (row as { id?: string }).id;
      if (Number.isFinite(wpId) && id && !map.has(wpId)) map.set(wpId, id);
    }
    console.log(`[lookup] ${Math.min(i + chunk.length, unique.length)}/${unique.length}`);
  }
  return map;
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.songsDir) {
    console.log(`Usage:
  npx tsx scripts/import-music8-wp-catalog.ts --songs-dir=<dir> [--apply] [--limit=N] [--offset=N]

ローカル Music8 曲 JSON（WP 1曲1ファイル）を music8_song_id で結合し、
catalog_styles / song_genres 等を埋める。既定は dry-run。`);
    process.exit(opts.help ? 0 : 1);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が未設定です。');
    process.exit(1);
  }

  const files = listSongFiles(path.resolve(opts.songsDir));
  const slice = files.slice(opts.offset, opts.limit != null ? opts.offset + opts.limit : undefined);
  console.log(
    `[import-music8-wp-catalog] files=${files.length} offset=${opts.offset} take=${slice.length} apply=${opts.apply}`,
  );

  type Item = { wpId: number; json: unknown };
  const items: Item[] = [];
  let parseSkipped = 0;
  for (let i = 0; i < slice.length; i++) {
    const file = slice[i];
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.warn('[skip parse]', path.basename(file), e);
      parseSkipped += 1;
      continue;
    }
    const wpId = wpSongIdFromJson(json);
    if (wpId == null) {
      parseSkipped += 1;
      continue;
    }
    items.push({ wpId, json });
    if ((i + 1) % 2000 === 0 || i + 1 === slice.length) {
      console.log(`[parse] ${i + 1}/${slice.length}`);
    }
  }

  const songByWpId = await loadSongIdMap(
    admin,
    items.map((it) => it.wpId),
  );

  let matched = 0;
  let missing = 0;
  let applied = 0;
  let artistsPatched = 0;

  for (const item of items) {
    const songId = songByWpId.get(item.wpId);
    if (!songId) {
      missing += 1;
      continue;
    }
    matched += 1;
    if (!opts.apply) continue;
    await syncMusic8CatalogTaxonomyFromSongJson(admin, songId, item.json);
    artistsPatched += await patchArtistWpTermFromSongJson(admin, item.json);
    applied += 1;
    if (applied % 100 === 0) {
      console.log(`[progress] applied=${applied} matched=${matched} missing_song=${missing}`);
    }
  }

  console.log(
    `[done] matched=${matched} missing_song=${missing + parseSkipped} applied=${applied} artists_patched=${artistsPatched} dryRun=${!opts.apply}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
