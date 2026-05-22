import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';

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

function stripThe(name: string): string {
  return name.replace(/^\s*(?:The|A|An)\s+/i, '').trim().toLowerCase();
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('no admin');
    process.exit(1);
  }

  const PAGE = 1000;
  let off = 0;
  const bySlug = new Map<string, Set<string>>();
  let total = 0;
  let withSlug = 0;

  for (;;) {
    const { data, error } = await admin
      .from('songs')
      .select('main_artist, music8_artist_slug')
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    if (!batch.length) break;
    for (const r of batch) {
      total += 1;
      const slug = (r.music8_artist_slug ?? '').trim().toLowerCase();
      const ma = (r.main_artist ?? '').trim();
      if (slug) {
        withSlug += 1;
        const s = bySlug.get(slug) ?? new Set<string>();
        s.add(ma);
        bySlug.set(slug, s);
      }
    }
    off += PAGE;
    if (batch.length < PAGE) break;
  }

  let multiSlugGroups = 0;
  let songsInMultiGroups = 0;
  const examples: Array<{ slug: string; names: string[] }> = [];

  for (const [slug, names] of bySlug) {
    if (names.size > 1) {
      multiSlugGroups += 1;
      songsInMultiGroups += names.size;
      examples.push({ slug, names: [...names].sort() });
    }
  }
  examples.sort((a, b) => b.names.length - a.names.length);

  console.log('songs 総数:', total);
  console.log('music8_artist_slug あり:', withSlug, `(${((withSlug / total) * 100).toFixed(1)}%)`);
  console.log('ユニーク slug 数:', bySlug.size);
  console.log('同一 slug で main_artist が複数のグループ:', multiSlugGroups);
  console.log('');
  console.log('複数表記の例 (上位20):');
  for (const ex of examples.slice(0, 20)) {
    const theSplit = ex.names.some((n) => stripThe(n) === stripThe(ex.names[0]));
    console.log(`  ${ex.slug}: ${ex.names.join(' | ')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
