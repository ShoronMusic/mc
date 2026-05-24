/**
 * 失敗 JSONL の曲について、未登録 artists を追加して song_credits を再同期（Type B）。
 *
 * 追加対象: 現状の解決で unresolved の名前のうち、
 * main_artist / display_title / Music8 main_artists のいずれかに含まれるもの
 * （Spotify 誤マッチ由来だけの名前は除外）。
 *
 * Usage:
 *   npx tsx scripts/fix-song-credits-type-b-missing-artists.ts
 *   npx tsx scripts/fix-song-credits-type-b-missing-artists.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';
import { parseArtistTitleFromDisplayTitle } from '@/lib/spotify-search-track';
import {
  resolveArtistIdFromIndex,
  resolveSongCreditsFromInput,
  type ArtistLookupIndex,
  type SongCreditInput,
} from '@/lib/song-credits-resolve';
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

type FailureRow = { song_id: string };

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function allowedArtistNames(input: SongCreditInput & { display_title?: string }): Set<string> {
  const allowed = new Set<string>();
  const add = (n: string) => {
    const t = n.trim();
    if (t) allowed.add(normName(t));
  };

  const parsed = parseArtistTitleFromDisplayTitle((input.display_title ?? '').trim());
  if (parsed) {
    for (const n of parseCollabArtistNamesFromMainArtist(parsed.artist)) add(n);
  }
  for (const n of parseCollabArtistNamesFromMainArtist(input.main_artist ?? '')) add(n);

  const m8 = input.music8_song_data;
  if (m8 && typeof m8 === 'object' && !Array.isArray(m8)) {
    const raw = (m8 as Record<string, unknown>).main_artists;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const o = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
        if (o && typeof o.name === 'string') add(o.name);
      }
    }
  }

  return allowed;
}

function preferredDisplayName(name: string, input: SongCreditInput & { display_title?: string }): string {
  const want = normName(name);
  const parsed = parseArtistTitleFromDisplayTitle((input.display_title ?? '').trim());
  const lists = [
    parsed ? parseCollabArtistNamesFromMainArtist(parsed.artist) : [],
    parseCollabArtistNamesFromMainArtist(input.main_artist ?? ''),
  ];
  for (const list of lists) {
    for (const n of list) {
      if (normName(n) === want) return n.trim();
    }
  }
  return name.trim();
}

function parseArgs(argv: string[]) {
  let failures = 'tmp/song-credits-backfill-failures-2026-05-24T06-13-12-008Z.jsonl';
  for (const token of argv) {
    if (token.startsWith('--failures=')) failures = token.slice('--failures='.length);
  }
  return { apply: argv.includes('--apply'), failures };
}

async function ensureArtistsByNames(
  admin: ReturnType<typeof createAdminClient>,
  index: ArtistLookupIndex,
  names: Map<string, string>,
  apply: boolean,
): Promise<{ to_insert: string[]; inserted: number; skipped_exists: number }> {
  const toInsert: string[] = [];
  let skippedExists = 0;
  let inserted = 0;

  for (const displayName of names.values()) {
    if (resolveArtistIdFromIndex(index, displayName, null)) {
      skippedExists++;
      continue;
    }
    toInsert.push(displayName);
    if (!apply) continue;

    const { error } = await admin!.from('artists').insert({ name: displayName });
    if (error?.code === '23505') {
      skippedExists++;
      continue;
    }
    if (error) {
      console.error(`insert artists "${displayName}": ${error.message}`);
      continue;
    }
    inserted++;
  }

  if (apply && inserted > 0) clearArtistLookupIndexCache();

  return { to_insert: toInsert, inserted, skipped_exists: skippedExists };
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

  const songIds = [...new Set(rows.map((r) => r.song_id).filter(Boolean))];
  const namesToEnsure = new Map<string, string>();
  const songInputs = new Map<string, SongCreditInput & { display_title: string }>();

  const CHUNK = 80;
  for (let i = 0; i < songIds.length; i += CHUNK) {
    const slice = songIds.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title, main_artist, spotify_artists, music8_song_data')
      .in('id', slice);
    if (error) throw error;

    for (const s of data ?? []) {
      const id = (s as { id: string }).id;
      songInputs.set(id, {
        display_title: (s as { display_title?: string }).display_title ?? '',
        spotify_artists: (s as { spotify_artists?: string | null }).spotify_artists ?? null,
        main_artist: (s as { main_artist?: string | null }).main_artist ?? null,
        music8_song_data:
          (s as { music8_song_data?: Record<string, unknown> | null }).music8_song_data ?? null,
      });
    }
  }

  clearArtistLookupIndexCache();
  let index = await loadArtistLookupIndex(admin);

  for (const [songId, input] of songInputs) {
    const allowed = allowedArtistNames(input);
    const { unresolved } = resolveSongCreditsFromInput(input, index);
    for (const name of unresolved) {
      if (!allowed.has(normName(name))) continue;
      const display = preferredDisplayName(name, input);
      namesToEnsure.set(normName(display), display);
    }
  }

  const ensureResult = await ensureArtistsByNames(admin, index, namesToEnsure, apply);

  if (apply) {
    index = await loadArtistLookupIndex(admin);
  }

  let fixed = 0;
  let partial = 0;
  let stillZero = 0;
  const remainFailed: { song_id: string; display_title: string; unresolved: string[] }[] = [];

  for (const songId of songIds) {
    if (!apply) continue;
    const result = await syncSongCreditsFromSongId(admin, songId, true, index);
    const input = songInputs.get(songId);
    if (!result) continue;
    if (result.creditCount > 0 && result.unresolved.length === 0) {
      fixed++;
    } else if (result.creditCount > 0) {
      partial++;
    } else {
      stillZero++;
      remainFailed.push({
        song_id: songId,
        display_title: input?.display_title ?? '',
        unresolved: result.unresolved,
      });
    }
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    failures_file: failuresPath,
    songs: songIds.length,
    unique_artists_to_add: namesToEnsure.size,
    artist_names_preview: [...namesToEnsure.values()].slice(0, 25),
    ...ensureResult,
    ...(apply
      ? { credits_fixed: fixed, credits_partial: partial, credits_still_zero: stillZero }
      : {}),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (apply && remainFailed.length > 0) {
    const outDir = path.resolve(process.cwd(), 'tmp');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(outDir, `song-credits-type-b-remain-${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(remainFailed, null, 2), 'utf8');
    console.log(`remain_failed: ${reportPath}`);
  }

  if (!apply) {
    console.log('\nRun with --apply to insert artists and re-sync song_credits.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
