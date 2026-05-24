/**
 * needs-action JSONL の unresolved 名を artists に追加し、該当曲を再同期。
 *
 * Usage:
 *   npx tsx scripts/backfill-needs-action-unresolved-artists.ts --input=tmp/song-credits-needs-action-....jsonl
 *   npx tsx scripts/backfill-needs-action-unresolved-artists.ts --input=... --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { expandCompoundArtistTokens, resolveArtistIdFromIndex } from '@/lib/song-credits-resolve';
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

type NeedsRow = { song_id: string; unresolved?: string[] };

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const inputArg = process.argv.find((t) => t.startsWith('--input='))?.slice('--input='.length);
  if (!inputArg) {
    console.error('--input=tmp/song-credits-needs-action-....jsonl required');
    process.exit(1);
  }
  const inputPath = path.resolve(process.cwd(), inputArg);
  const rows: NeedsRow[] = fs
    .readFileSync(inputPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as NeedsRow);

  const admin = createAdminClient();
  if (!admin || !(await songCreditsTableAvailable(admin))) {
    console.error('admin / song_credits unavailable');
    process.exit(1);
  }

  const namesToEnsure = new Map<string, string>();
  for (const row of rows) {
    for (const raw of row.unresolved ?? []) {
      for (const n of expandCompoundArtistTokens([raw.trim()])) {
        if (n.length >= 2) namesToEnsure.set(normName(n), n);
      }
    }
  }

  let index = await loadArtistLookupIndex(admin);
  let inserted = 0;
  for (const name of namesToEnsure.values()) {
    if (resolveArtistIdFromIndex(index, name, null)) continue;
    if (!apply) continue;
    const { error } = await admin.from('artists').insert({ name });
    if (error?.code === '23505') continue;
    if (error) throw error;
    inserted++;
  }

  if (apply && inserted > 0) {
    clearArtistLookupIndexCache();
    index = await loadArtistLookupIndex(admin);
  }

  let fixed = 0;
  let partial = 0;
  if (apply) {
    for (const row of rows) {
      const result = await syncSongCreditsFromSongId(admin, row.song_id, true, index);
      if (result && result.creditCount > 0 && result.unresolved.length === 0) fixed++;
      else partial++;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        input: inputPath,
        songs: rows.length,
        unique_unresolved_names: namesToEnsure.size,
        artists_inserted: inserted,
        credits_fixed: fixed,
        credits_partial: partial,
        name_preview: [...namesToEnsure.values()].slice(0, 20),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
