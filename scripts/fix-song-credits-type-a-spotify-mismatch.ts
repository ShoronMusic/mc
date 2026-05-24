/**
 * 失敗 JSONL から Type A（Spotify 誤マッチ）を判定し、
 * spotify_artists / spotify_track_id を NULL にして main_artist 等へフォールバック後、
 * song_credits のみ再同期する。
 *
 * Usage:
 *   npx tsx scripts/fix-song-credits-type-a-spotify-mismatch.ts
 *   npx tsx scripts/fix-song-credits-type-a-spotify-mismatch.ts --apply
 *   npx tsx scripts/fix-song-credits-type-a-spotify-mismatch.ts --failures=tmp/song-credits-backfill-failures-2026-05-24T06-13-12-008Z.jsonl
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { parseArtistTitleFromDisplayTitle } from '@/lib/spotify-search-track';
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

type FailureRow = {
  song_id: string;
  display_title?: string | null;
  source?: string | null;
  unresolved?: string[];
  credit_names?: string[];
};

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function expectedArtistsFromDisplayTitle(displayTitle: string): string[] {
  const parsed = parseArtistTitleFromDisplayTitle(displayTitle.trim());
  if (!parsed) return [];
  return parseCollabArtistNamesFromMainArtist(parsed.artist);
}

function hasNameOverlap(expected: string[], creditNames: string[]): boolean {
  if (expected.length === 0 || creditNames.length === 0) return false;
  const credSet = new Set(creditNames.map(normName));
  for (const e of expected) {
    if (credSet.has(normName(e))) return true;
  }
  return false;
}

/** display_title または main_artist と spotify 由来 credit_names が一致しない */
export function isTypeASpotifyMismatch(
  source: string | null | undefined,
  displayTitle: string,
  mainArtist: string,
  creditNames: string[],
): boolean {
  if (source !== 'spotify_artists') return false;
  if (!creditNames.length) return false;

  const fromTitle = expectedArtistsFromDisplayTitle(displayTitle);
  const fromMain = parseCollabArtistNamesFromMainArtist(mainArtist);
  const expected = fromTitle.length > 0 ? fromTitle : fromMain;
  if (expected.length === 0) return false;

  return !hasNameOverlap(expected, creditNames);
}

function parseArgs(argv: string[]) {
  let failures = 'tmp/song-credits-backfill-failures-2026-05-24T06-13-12-008Z.jsonl';
  for (const token of argv) {
    if (token.startsWith('--failures=')) failures = token.slice('--failures='.length);
  }
  return { apply: argv.includes('--apply'), failures };
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, failures: failuresRel } = parseArgs(process.argv.slice(2));
  const failuresPath = path.resolve(process.cwd(), failuresRel);
  if (!fs.existsSync(failuresPath)) {
    console.error(`failures file not found: ${failuresPath}`);
    process.exit(1);
  }

  const rows: FailureRow[] = fs
    .readFileSync(failuresPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as FailureRow);

  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }
  if (!(await songCreditsTableAvailable(admin))) {
    console.error('song_credits table missing');
    process.exit(1);
  }

  const ids = [...new Set(rows.map((r) => r.song_id).filter(Boolean))];
  const songById = new Map<string, { display_title: string; main_artist: string }>();

  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title, main_artist')
      .in('id', slice);
    if (error) throw error;
    for (const s of data ?? []) {
      songById.set(s.id, {
        display_title: (s as { display_title?: string }).display_title ?? '',
        main_artist: (s as { main_artist?: string }).main_artist ?? '',
      });
    }
  }

  const typeA: {
    song_id: string;
    display_title: string;
    credit_names: string[];
    expected: string[];
  }[] = [];

  for (const row of rows) {
    if (row.source !== 'spotify_artists') continue;
    const song = songById.get(row.song_id);
    const displayTitle = song?.display_title ?? row.display_title ?? '';
    const mainArtist = song?.main_artist ?? '';
    const creditNames = row.credit_names ?? [];
    if (
      !isTypeASpotifyMismatch(row.source, displayTitle, mainArtist, creditNames)
    ) {
      continue;
    }
    const fromTitle = expectedArtistsFromDisplayTitle(displayTitle);
    const fromMain = parseCollabArtistNamesFromMainArtist(mainArtist);
    typeA.push({
      song_id: row.song_id,
      display_title: displayTitle,
      credit_names: creditNames,
      expected: fromTitle.length > 0 ? fromTitle : fromMain,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        failures_file: failuresPath,
        total_failures: rows.length,
        type_a_spotify_mismatch: typeA.length,
        skipped_not_type_a: rows.length - typeA.length,
      },
      null,
      2,
    ),
  );

  for (const item of typeA.slice(0, 15)) {
    console.log(
      `  [A] ${item.display_title}\n      spotify: ${item.credit_names.join(' | ')}\n      expect:  ${item.expected.join(' | ')}`,
    );
  }
  if (typeA.length > 15) console.log(`  ... and ${typeA.length - 15} more`);

  if (!apply) {
    console.log('\nRun with --apply to clear spotify_artists and re-sync song_credits.');
    return;
  }

  clearArtistLookupIndexCache();
  const index = await loadArtistLookupIndex(admin);

  let cleared = 0;
  let synced = 0;
  let fixed = 0;
  const stillFailed: { song_id: string; display_title: string; result: unknown }[] = [];

  for (const item of typeA) {
    const { error: uErr } = await admin
      .from('songs')
      .update({ spotify_artists: null, spotify_track_id: null })
      .eq('id', item.song_id);
    if (uErr) {
      console.error(`clear failed ${item.song_id}: ${uErr.message}`);
      continue;
    }
    cleared++;

    const result = await syncSongCreditsFromSongId(admin, item.song_id, true, index);
    synced++;
    if (result && result.creditCount > 0 && result.unresolved.length === 0) {
      fixed++;
    } else {
      stillFailed.push({
        song_id: item.song_id,
        display_title: item.display_title,
        result: result ?? null,
      });
    }
  }

  const outDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outDir, `song-credits-type-a-apply-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ cleared, synced, fixed, stillFailed }, null, 2),
    'utf8',
  );

  console.log(
    JSON.stringify(
      { cleared, synced, fixed, still_failed: stillFailed.length, report: reportPath },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
