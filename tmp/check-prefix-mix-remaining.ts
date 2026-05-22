import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';
import {
  artistNameMatchKey,
  isPrefixOnlyArtistNameVariant,
  shouldNormalizePrefixOnlyArtistName,
} from '../src/lib/music8-canonical-artist-name';

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
  const admin = createAdminClient();
  if (!admin) process.exit(1);

  const PAGE = 1000;
  let off = 0;
  const bySlug = new Map<string, Set<string>>();
  let totalSongs = 0;

  for (;;) {
    const { data, error } = await admin
      .from('songs')
      .select('main_artist, music8_artist_slug')
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    if (!batch.length) break;
    for (const r of batch) {
      totalSongs += 1;
      const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
      const ma = (r.main_artist ?? '').trim();
      if (!slug || !ma) continue;
      const s = bySlug.get(slug) ?? new Set();
      s.add(ma);
      bySlug.set(slug, s);
    }
    off += PAGE;
    if (batch.length < PAGE) break;
  }

  const prefixMixGroups: Array<{ slug: string; names: string[] }> = [];
  let songsInMixGroups = 0;

  for (const [slug, names] of bySlug) {
    const list = [...names];
    if (list.length <= 1) continue;
    if (!isPrefixOnlyArtistNameVariant(list)) continue;
    prefixMixGroups.push({ slug, names: list.sort() });
    songsInMixGroups += list.length; // rough
  }

  // count songs actually needing The-prefix fix
  let pendingFix = 0;
  const pendingExamples: string[] = [];
  for (const [slug, songs] of bySlug) {
    const names = [...(bySlug.get(slug) ?? [])];
    if (!isPrefixOnlyArtistNameVariant(names) || names.length <= 1) continue;
    const withThe = names.find((n) => /^(the|a|an)\s+/i.test(n));
    const withoutThe = names.find((n) => !/^(the|a|an)\s+/i.test(n));
    if (!withThe || !withoutThe) continue;
    for (const n of names) {
      if (shouldNormalizePrefixOnlyArtistName(n, withThe)) pendingFix += 1;
    }
    if (pendingExamples.length < 15) {
      pendingExamples.push(`${slug}: ${names.join(' | ')}`);
    }
  }

  // recount pending per song
  pendingFix = 0;
  off = 0;
  for (;;) {
    const { data } = await admin
      .from('songs')
      .select('main_artist, music8_artist_slug')
      .range(off, off + PAGE - 1);
    const batch = data ?? [];
    if (!batch.length) break;
    for (const r of batch) {
      const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
      const cur = (r.main_artist ?? '').trim();
      if (!slug || !cur) continue;
      const names = [...(bySlug.get(slug) ?? [])];
      if (!isPrefixOnlyArtistNameVariant(names) || names.length <= 1) continue;
      const canonical = names.find((n) => /^(the|a|an)\s+/i.test(n)) ?? names[0];
      if (shouldNormalizePrefixOnlyArtistName(cur, canonical)) pendingFix += 1;
    }
    off += PAGE;
    if (batch.length < PAGE) break;
  }

  console.log(
    JSON.stringify(
      {
        totalSongs,
        slugGroups: bySlug.size,
        prefixOnlyMultiNameGroups: prefixMixGroups.length,
        songsStillNeedingThePrefixFix: pendingFix,
      },
      null,
      2,
    ),
  );
  if (pendingExamples.length > 0 && pendingFix > 0) {
    console.log('\n例:');
    for (const e of pendingExamples) console.log(' ', e);
  } else if (prefixMixGroups.length > 0 && pendingFix === 0) {
    console.log('\nプレフィックス混在グループはあるが、The付与が必要な曲は0（表記は既に統一済みの可能性）');
    for (const g of prefixMixGroups.slice(0, 10)) {
      console.log(' ', g.slug, ':', g.names.join(' | '));
    }
  }
}

main();
