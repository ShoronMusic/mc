import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';

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

function parseSpotifyArtists(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function normKey(s: string): string {
  return s.trim().toLowerCase();
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) throw new Error('no admin');

  const PAGE = 1000;

  const byName = new Map<string, string[]>();
  const bySlug = new Map<string, string>();
  let artistTotal = 0;
  for (let aOff = 0; ; aOff += PAGE) {
    const { data: artists, error: aErr } = await admin
      .from('artists')
      .select('id, name, music8_artist_slug, spotify_artist_id')
      .range(aOff, aOff + PAGE - 1);
    if (aErr) throw aErr;
    if (!artists?.length) break;
    artistTotal += artists.length;
    for (const a of artists) {
    const id = (a as { id: string }).id;
    const name = ((a as { name?: string }).name ?? '').trim();
    const slug = ((a as { music8_artist_slug?: string }).music8_artist_slug ?? '').trim().toLowerCase();
    if (name) {
      const k = normKey(name);
      const arr = byName.get(k) ?? [];
      arr.push(id);
      byName.set(k, arr);
    }
    if (slug) bySlug.set(slug, id);
    }
    if (artists.length < PAGE) break;
  }

  let offset = 0;
  let total = 0;
  let withSa = 0;
  let multiSa = 0;
  let allPartsMatched = 0;
  let partialMatch = 0;
  let noMatch = 0;
  let singleArtist = 0;
  const noMatchSamples: string[] = [];
  let mainArtistAgreesFirst = 0;
  let mainArtistDisagree = 0;

  for (;;) {
    const { data: batch, error } = await admin
      .from('songs')
      .select('id, main_artist, display_title, spotify_artists, music8_artist_slug')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!batch?.length) break;

    for (const row of batch) {
      total++;
      const sa = (row as { spotify_artists?: string }).spotify_artists ?? null;
      const parts = parseSpotifyArtists(sa);
      if (parts.length === 0) continue;
      withSa++;

      if (parts.length === 1) singleArtist++;
      else multiSa++;

      const matchedIds: string[] = [];
      for (const p of parts) {
        const hits = byName.get(normKey(p));
        if (hits?.length === 1) matchedIds.push(hits[0]);
        else if (hits && hits.length > 1) matchedIds.push(hits[0]);
      }

      if (matchedIds.length === parts.length) allPartsMatched++;
      else if (matchedIds.length > 0) partialMatch++;
      else {
        noMatch++;
        if (noMatchSamples.length < 15) {
          const dt = (row as { display_title?: string }).display_title ?? row.id;
          noMatchSamples.push(`${dt}: [${parts.join(' | ')}]`);
        }
      }

      const main = ((row as { main_artist?: string }).main_artist ?? '').trim();
      const mainParts = parseCollabArtistNamesFromMainArtist(main);
      if (parts.length > 0 && mainParts.length > 0) {
        if (normKey(parts[0]) === normKey(mainParts[0]) || normKey(parts[0]) === normKey(mainParts[mainParts.length - 1])) {
          mainArtistAgreesFirst++;
        } else if (mainParts.some((m) => parts.some((p) => normKey(p) === normKey(m)))) {
          mainArtistAgreesFirst++;
        } else {
          mainArtistDisagree++;
        }
      }
    }

    offset += batch.length;
    if (batch.length < PAGE) break;
  }

  console.log(
    JSON.stringify(
      {
        total_songs: total,
        with_spotify_artists: withSa,
        multi_artist_spotify_artists: multiSa,
        single_artist_spotify_artists: singleArtist,
        all_names_match_one_artist_row: allPartsMatched,
        partial_name_match: partialMatch,
        no_artist_row_match: noMatch,
        pct_all_matched_of_with_sa: withSa ? `${((100 * allPartsMatched) / withSa).toFixed(1)}%` : '0%',
        main_artist_order_overlap_ok: mainArtistAgreesFirst,
        main_artist_order_unclear: mainArtistDisagree,
        artists_table_rows: artistTotal,
        no_match_samples: noMatchSamples,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
