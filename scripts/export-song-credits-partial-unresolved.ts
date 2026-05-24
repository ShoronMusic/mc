/**
 * 全 songs を走査し、クレジットは一部あるが unresolved が残る曲（partial_unresolved）を JSONL に出力。
 * バックフィル本番と同じ planSongCreditDbRows 判定（DB の song_credits 行は書き換えない）。
 *
 * Usage:
 *   npx tsx scripts/export-song-credits-partial-unresolved.ts
 *   npx tsx scripts/export-song-credits-partial-unresolved.ts --limit=500
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractCreditNamesFromSong, type SongCreditInput } from '@/lib/song-credits-resolve';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  planSongCreditDbRows,
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
  const limitRaw = argv.find((t) => t.startsWith('--limit='))?.slice('--limit='.length);
  const limit =
    limitRaw != null && limitRaw !== '' ? Math.max(1, Math.min(50000, Number(limitRaw) || 1)) : null;
  return { limit };
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { limit } = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  clearArtistLookupIndexCache();
  const index = await loadArtistLookupIndex(admin);
  console.log('artist index loaded');

  const PAGE = 100;
  let scanOffset = 0;
  let processed = 0;
  let partialCount = 0;
  const lines: string[] = [];

  for (;;) {
    if (limit !== null && processed >= limit) break;

    const rangeEnd = limit !== null ? Math.min(scanOffset + PAGE - 1, limit - 1) : scanOffset + PAGE - 1;
    const { data: batch, error } = await admin
      .from('songs')
      .select('id, display_title, spotify_artists, main_artist, music8_song_data')
      .order('id')
      .range(scanOffset, rangeEnd);
    if (error) throw error;
    if (!batch?.length) break;

    for (const row of batch) {
      if (limit !== null && processed >= limit) break;
      processed++;

      const songId = (row as { id: string }).id;
      const input: SongCreditInput = {
        spotify_artists: (row as { spotify_artists?: string | null }).spotify_artists ?? null,
        main_artist: (row as { main_artist?: string | null }).main_artist ?? null,
        music8_song_data:
          (row as { music8_song_data?: Record<string, unknown> | null }).music8_song_data ?? null,
      };

      const planned = planSongCreditDbRows(songId, input, index);
      if (planned.creditCount <= 0 || planned.unresolved.length === 0) continue;

      partialCount++;
      const extracted = extractCreditNamesFromSong(input);
      lines.push(
        JSON.stringify({
          song_id: songId,
          display_title: (row as { display_title?: string | null }).display_title ?? null,
          source: planned.source,
          credit_count: planned.creditCount,
          unresolved: planned.unresolved,
          credit_names: extracted?.names ?? [],
        }),
      );
    }

    if (processed % 2000 === 0 && processed > 0) {
      console.log(`scan: processed=${processed} partial=${partialCount}`);
    }

    scanOffset += batch.length;
    if (batch.length < PAGE) break;
  }

  const outDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `song-credits-partial-unresolved-${stamp}.jsonl`);
  fs.writeFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');

  console.log(
    JSON.stringify(
      {
        processed,
        partial_unresolved: partialCount,
        output: outPath,
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
