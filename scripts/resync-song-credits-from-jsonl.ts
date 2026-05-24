/**
 * JSONL の song_id 一覧で song_credits のみ再同期（メタデータは変更しない）。
 *
 * Usage:
 *   npx tsx scripts/resync-song-credits-from-jsonl.ts --input=tmp/song-credits-needs-action-....jsonl
 *   npx tsx scripts/resync-song-credits-from-jsonl.ts --input=... --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
  songCreditsTableAvailable,
} from '@/lib/song-credits-sync';

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
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const inputArg = process.argv.find((t) => t.startsWith('--input='))?.slice('--input='.length);
  if (!inputArg) {
    console.error('Usage: --input=tmp/song-credits-needs-action-....jsonl [--apply]');
    process.exit(1);
  }
  const inputPath = path.resolve(process.cwd(), inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`not found: ${inputPath}`);
    process.exit(1);
  }

  const songIds = [
    ...new Set(
      fs
        .readFileSync(inputPath, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (JSON.parse(l) as { song_id?: string }).song_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const admin = createAdminClient();
  if (!admin || !(await songCreditsTableAvailable(admin))) {
    console.error('admin or song_credits unavailable');
    process.exit(1);
  }

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', songs: songIds.length, input: inputPath }, null, 2));
    console.log('Run with --apply to resync.');
    return;
  }

  clearArtistLookupIndexCache();
  const index = await loadArtistLookupIndex(admin);

  let fixed = 0;
  let partial = 0;
  let zero = 0;

  for (const songId of songIds) {
    const result = await syncSongCreditsFromSongId(admin, songId, true, index);
    if (!result || result.creditCount === 0) zero++;
    else if (result.unresolved.length === 0) fixed++;
    else partial++;
  }

  console.log(JSON.stringify({ songs: songIds.length, fixed, partial, still_zero: zero }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
