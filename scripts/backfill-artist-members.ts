/**
 * artists.music8_members → artist_members（バンド→メンバー）。
 * マスタに無いメンバーは作らない。
 *
 * Usage:
 *   npx tsx scripts/backfill-artist-members.ts
 *   npx tsx scripts/backfill-artist-members.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { directedMemberPair, isBandLikeKind, isPersonLikeKind, memberHintsFromMusic8Members } from '@/lib/artist-members';

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

type ArtistLite = {
  id: string;
  name: string | null;
  kind: string | null;
  music8_artist_slug: string | null;
  music8_members: unknown;
};

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) process.exit(1);

  const PAGE = 1000;
  const all: ArtistLite[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('artists')
      .select('id, name, kind, music8_artist_slug, music8_members')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) all.push(row as ArtistLite);
    if (data.length < PAGE) break;
  }

  const bySlug = new Map<string, ArtistLite>();
  const byName = new Map<string, ArtistLite[]>();
  for (const a of all) {
    const slug = (a.music8_artist_slug ?? '').trim().toLowerCase();
    if (slug) bySlug.set(slug, a);
    const n = (a.name ?? '').trim().toLowerCase();
    if (n) {
      const list = byName.get(n) ?? [];
      list.push(a);
      byName.set(n, list);
    }
  }

  const fromBand = new Set<string>();
  const fromPerson = new Set<string>();
  const pairByKey = new Map<string, { artist_id: string; member_artist_id: string }>();
  let bandsWithMembers = 0;
  let unresolved = 0;
  const samples: unknown[] = [];

  const resolveArtist = (slug: string, name: string): ArtistLite | null => {
    if (slug && bySlug.has(slug)) return bySlug.get(slug) ?? null;
    if (name) {
      const ids = byName.get(name.toLowerCase()) ?? [];
      if (ids.length === 1) return ids[0] ?? null;
    }
    return null;
  };

  for (const source of all) {
    const hints = memberHintsFromMusic8Members(source.music8_members);
    if (hints.length === 0) continue;
    bandsWithMembers += 1;
    const unresolvedHere: string[] = [];
    for (const hint of hints) {
      const target = resolveArtist(hint.slug, hint.name);
      if (!target) {
        unresolved += 1;
        unresolvedHere.push(hint.name || hint.slug);
        continue;
      }
      const pair = directedMemberPair(
        { id: source.id, kind: source.kind },
        { id: target.id, kind: target.kind },
      );
      if (!pair) continue;
      const key = `${pair.artist_id}|${pair.member_artist_id}`;
      pairByKey.set(key, pair);
      if (isPersonLikeKind(source.kind)) fromPerson.add(key);
      if (isBandLikeKind(source.kind)) fromBand.add(key);
    }
    if (unresolvedHere.length > 0 && samples.length < 8) {
      samples.push({ band: source.name, unresolved: unresolvedHere });
    }
  }

  const pairs = [...pairByKey.entries()]
    .filter(([key]) => fromBand.has(key) && fromPerson.has(key))
    .map(([, pair]) => pair);

  if (apply) {
    const { error: wipeErr } = await admin.from('artist_members').delete().neq('artist_id', '00000000-0000-0000-0000-000000000000');
    if (wipeErr) throw wipeErr;
    for (let i = 0; i < pairs.length; i += 500) {
      const chunk = pairs.slice(i, i + 500);
      const { error } = await admin.from('artist_members').insert(chunk);
      if (error) throw error;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        artists_scanned: all.length,
        bands_with_music8_members: bandsWithMembers,
        links: pairs.length,
        unresolved_names: unresolved,
        samples,
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
