/**
 * 洋楽で `music8_artist_slug` / `music8_song_slug` が空の曲に Music8 キーを付ける。
 * 既存 slug は上書きしない。曲 slug はタイトルのハイフン化。同一アーティスト衝突時のみ `-2`。
 *
 * Usage:
 *   npx tsx scripts/backfill-music8-slugs-for-songs.ts
 *   npx tsx scripts/backfill-music8-slugs-for-songs.ts --apply
 *   npx tsx scripts/backfill-music8-slugs-for-songs.ts --apply --export
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureMusic8SlugsForSong } from '@/lib/music8-song-slug';
import { exportOneSongToDisk, rebuildStylesSummaryFromDb } from '@/lib/music8-catalog-json-write';

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
    apply: argv.includes('--apply'),
    exportJson: argv.includes('--export'),
    limit: args.get('limit') ? Number(args.get('limit')) : null,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

type SongNeedRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  music8_artist_slug: string | null;
  music8_song_slug: string | null;
};

async function loadWesternMissingSlugs(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
): Promise<SongNeedRow[]> {
  const out: SongNeedRow[] = [];
  const page = 200;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title, music8_artist_slug, music8_song_slug')
      .eq('catalog_scope', 'western')
      .order('id')
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SongNeedRow[];
    if (rows.length === 0) break;
    for (const r of rows) {
      const artist = (r.music8_artist_slug ?? '').trim();
      const song = (r.music8_song_slug ?? '').trim();
      if (!artist || !song) out.push(r);
    }
    if (rows.length < page) break;
  }
  return out;
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage:
  npx tsx scripts/backfill-music8-slugs-for-songs.ts
  npx tsx scripts/backfill-music8-slugs-for-songs.ts --apply [--export] [--limit=N]`);
    process.exit(0);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が未設定です。');
    process.exit(1);
  }

  const missing = await loadWesternMissingSlugs(admin);
  const targets = opts.limit != null ? missing.slice(0, opts.limit) : missing;
  console.log(
    `[backfill-slugs] western missing=${missing.length} process=${targets.length} apply=${opts.apply}`,
  );

  let patched = 0;
  let skipped = 0;
  const patchedIds: string[] = [];
  for (const row of targets) {
    const label = (row.display_title ?? `${row.main_artist ?? ''} - ${row.song_title ?? ''}`).trim();
    if (!opts.apply) {
      console.log(`[dry-run] ${row.id} ${label}`);
      continue;
    }
    const result = await ensureMusic8SlugsForSong(admin, row.id);
    if (!result.ok) {
      skipped += 1;
      console.warn(`[skip] ${row.id} ${label} ${result.reason}`);
      continue;
    }
    if (result.patched) {
      patched += 1;
      patchedIds.push(row.id);
      console.log(
        `[ok] ${row.id} ${result.artistSlug}_${result.songSlug} ${label}`,
      );
    }
  }

  if (!opts.apply) {
    console.log('[done] dry-run（書き込みなし）。適用は --apply');
    return;
  }

  console.log(`[done] patched=${patched} skipped=${skipped}`);

  if (opts.exportJson && patchedIds.length > 0) {
    let exported = 0;
    for (const songId of patchedIds) {
      const r = await exportOneSongToDisk(admin, songId);
      if (r.ok) exported += 1;
      else console.warn('[export skip]', songId, r.reason);
    }
    await rebuildStylesSummaryFromDb(admin);
    console.log(`[done] exported=${exported} / ${patchedIds.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
