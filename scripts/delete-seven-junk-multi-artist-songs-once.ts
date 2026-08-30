/**
 * 未補完リストからユーザー指定の7曲を曲マスタごと削除。
 *
 * Usage:
 *   npx tsx scripts/delete-seven-junk-multi-artist-songs-once.ts
 *   npx tsx scripts/delete-seven-junk-multi-artist-songs-once.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteSongMasterCascade } from '@/lib/admin-delete-song-master';

const TARGETS: { id: string; title: string }[] = [
  { id: '3bc23b9b-ac98-442f-aeee-ceb21a4bed2c', title: '2econd Cousins - Dreamer' },
  { id: '935ceab3-2b55-4bde-9897-51f6f9587049', title: "Various Artists - We Don't Talk About Bruno" },
  { id: 'bac4f931-7a99-44b2-a4bf-2f13182784af', title: 'Phoenix - Monologue' },
  { id: 'd36757cf-4161-4395-b014-7e506ea34e7c', title: 'Eminem - Payback' },
  { id: 'e1cf44f6-b431-4c3a-9f9a-0d559c375f8a', title: 'Christopher Jackson - Man Of War' },
  { id: 'e28b9cab-48ff-41d6-a3ff-6561ca8e35e9', title: 'Wynne - Big Stepper' },
  { id: 'fd023dc0-16d0-4a88-b110-43b406a5de42', title: 'Chicago - Free' },
];

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

function titleMatches(expected: string, actual: string | null): boolean {
  const a = (actual ?? '').trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  return a === b;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  const toDelete: string[] = [];

  for (const t of TARGETS) {
    const { data: song, error } = await admin
      .from('songs')
      .select('id, display_title, main_artist, spotify_artists')
      .eq('id', t.id)
      .maybeSingle();
    if (error) {
      console.error('select failed', t.id, error.message);
      process.exit(1);
    }
    if (!song) {
      console.log(`[missing] ${t.title} (${t.id})`);
      continue;
    }
    const display = (song as { display_title?: string | null }).display_title ?? '';
    if (!titleMatches(t.title, display)) {
      console.error(`[title mismatch] expected="${t.title}" actual="${display}" id=${t.id}`);
      process.exit(1);
    }
    console.log('[ok]', display, '|', (song as { spotify_artists?: string | null }).spotify_artists);
    toDelete.push(t.id);
  }

  if (!apply) {
    console.log(`\n[dry-run] ${toDelete.length} 曲。削除するには --apply`);
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const id of toDelete) {
    const result = await deleteSongMasterCascade(admin, id);
    if (result.ok) {
      ok += 1;
      console.log(`deleted ${id}`);
    } else {
      failed += 1;
      console.error(`failed ${id}:`, result.message);
    }
  }

  for (const t of TARGETS) {
    const { data } = await admin.from('songs').select('id').eq('id', t.id).maybeSingle();
    if (data) console.error(`[still exists] ${t.title} ${t.id}`);
  }

  console.log(JSON.stringify({ mode: 'apply', deleted: ok, failed }, null, 2));
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
