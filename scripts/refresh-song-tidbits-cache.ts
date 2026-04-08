import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
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
  const videoId = (process.argv[2] ?? '').trim();
  if (!videoId) {
    console.error('usage: npx tsx scripts/refresh-song-tidbits-cache.ts <videoId>');
    process.exit(1);
  }

  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('admin client unavailable (.env.local の SUPABASE 設定を確認)');
    process.exit(2);
  }

  const { data: rows, error: readErr } = await admin
    .from('song_tidbits')
    .select('id, source, is_active')
    .eq('video_id', videoId)
    .eq('is_active', true)
    .in('source', ['ai_commentary', 'ai_chat_1', 'ai_chat_2', 'ai_chat_3']);
  if (readErr) {
    console.error('read failed', readErr.code, readErr.message);
    process.exit(1);
  }
  const ids = (rows ?? []).map((r) => r.id).filter((v): v is string => typeof v === 'string');
  if (ids.length === 0) {
    console.log(`no active cache rows for ${videoId}`);
    return;
  }

  const { error: upErr } = await admin
    .from('song_tidbits')
    .update({ is_active: false })
    .in('id', ids);
  if (upErr) {
    console.error('update failed', upErr.code, upErr.message);
    process.exit(1);
  }

  console.log(`deactivated ${ids.length} rows for ${videoId}`);
}

main();
