/**
 * 本当に複数人（パース後ラテン名が2以上）で、song_credits が1人以下の曲を数える。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  extractCreditNamesFromSong,
  filterNonJapaneseCreditNames,
} from '@/lib/song-credits-resolve';

function loadDotEnvLocal() {
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

async function main() {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) process.exit(1);

  const creditCount = new Map<string, number>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('song_credits')
      .select('song_id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const id = (r as { song_id: string }).song_id;
      creditCount.set(id, (creditCount.get(id) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
  }

  let commaRows = 0;
  let compoundOneName = 0;
  let japaneseOnly = 0;
  let trueMulti = 0;
  let trueMultiComplemented = 0;
  let uncomplemented = 0;
  let partial = 0;
  const uncomplementedRows: {
    song_id: string;
    title: string | null;
    latin: string[];
    credits: number;
    spotify: string | null;
  }[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title, spotify_artists, main_artist, music8_song_data')
      .not('spotify_artists', 'is', null)
      .like('spotify_artists', '%,%')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    commaRows += data.length;

    for (const row of data) {
      const extracted = extractCreditNamesFromSong({
        spotify_artists: (row as { spotify_artists?: string | null }).spotify_artists ?? null,
        main_artist: (row as { main_artist?: string | null }).main_artist ?? null,
        music8_song_data:
          (row as { music8_song_data?: Record<string, unknown> | null }).music8_song_data ?? null,
        display_title: (row as { display_title?: string | null }).display_title ?? null,
      });
      const names = extracted?.names ?? [];
      const latin = filterNonJapaneseCreditNames(names);
      if (names.length > 0 && latin.length === 0) {
        japaneseOnly += 1;
        continue;
      }
      if (latin.length < 2) {
        compoundOneName += 1;
        continue;
      }

      trueMulti += 1;
      const credits = creditCount.get((row as { id: string }).id) ?? 0;
      if (credits >= 2 && credits >= latin.length) {
        trueMultiComplemented += 1;
      } else if (credits < 2) {
        uncomplemented += 1;
        uncomplementedRows.push({
          song_id: (row as { id: string }).id,
          title: (row as { display_title?: string | null }).display_title ?? null,
          latin,
          credits,
          spotify: (row as { spotify_artists?: string | null }).spotify_artists ?? null,
        });
      } else {
        partial += 1;
      }
    }

    if (data.length < PAGE) break;
  }

  console.log(
    JSON.stringify(
      {
        spotify_artists_comma_rows: commaRows,
        parsed_as_one_name: compoundOneName,
        japanese_only_skipped: japaneseOnly,
        true_multi_latin_ge_2: trueMulti,
        true_multi_fully_credited: trueMultiComplemented,
        uncomplemented_credits_lt_2: uncomplemented,
        partial_credits_lt_names: partial,
      },
      null,
      2,
    ),
  );

  const outDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'uncomplemented-multi-artists.json');
  fs.writeFileSync(jsonPath, JSON.stringify(uncomplementedRows, null, 2), 'utf8');
  console.log(`list written: ${jsonPath} (${uncomplementedRows.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
