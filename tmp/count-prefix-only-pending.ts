import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';
import { isPrefixOnlyArtistNameVariant } from '../src/lib/music8-canonical-artist-name';

function pickCanonical(names: string[]): string {
  const trimmed = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const withLeading = trimmed.filter((n) => /^(the|a|an)\s+/i.test(n));
  if (withLeading.length >= 1) return withLeading.sort((a, b) => b.length - a.length)[0];
  const counts = new Map<string, number>();
  for (const n of trimmed) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best = '';
  let max = 0;
  for (const [n, c] of counts) if (c > max) { max = c; best = n; }
  return best;
}

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
  const { data: artists } = await admin.from('artists').select('name, music8_artist_slug');
  const bySlug = new Map<string, string>();
  for (const a of artists ?? []) {
    const s = (a.music8_artist_slug ?? '').trim().toLowerCase();
    if (s && !bySlug.has(s)) bySlug.set(s, (a.name ?? '').trim());
  }

  let off = 0;
  const groups = new Map<string, Set<string>>();
  for (;;) {
    const { data } = await admin
      .from('songs')
      .select('main_artist, music8_artist_slug')
      .range(off, off + 999);
    const batch = data ?? [];
    if (!batch.length) break;
    for (const r of batch) {
      const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
      const ma = (r.main_artist ?? '').trim();
      if (!slug || !ma) continue;
      const set = groups.get(slug) ?? new Set();
      set.add(ma);
      groups.set(slug, set);
    }
    off += 1000;
    if (batch.length < 1000) break;
  }

  let pendingGroups = 0;
  let pendingSongs = 0;
  const examples: string[] = [];
  for (const [slug, names] of groups) {
    const list = [...names];
    if (!isPrefixOnlyArtistNameVariant(list)) continue;
    const canonical = bySlug.get(slug) ?? pickCanonical(list);
    const need = [...groups.get(slug)!].filter((n) => n !== canonical).length;
    if (need === 0 && list.length <= 1) continue;
    let count = 0;
    // recount songs - approximate by group size
    pendingGroups += 1;
    examples.push(`${slug}: ${list.join(' | ')} => ${canonical}`);
  }
  console.log('prefix-only groups needing rename:', pendingGroups);
  console.log(examples.slice(0, 25).join('\n'));
}

main();
