import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SongStyle } from '@/lib/gemini';
import { trySongStyleFromMusic8 } from '@/lib/music8-style-to-app';
import { setStyleInDb } from '@/lib/song-style';

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

type PlaybackRow = {
  video_id: string;
  artist_name: string | null;
  title: string | null;
  style: string | null;
  played_at: string;
};

function asStyleOrNull(v: string | null | undefined): SongStyle | null {
  const t = (v ?? '').trim();
  return t ? (t as SongStyle) : null;
}

async function fetchRows(admin: NonNullable<ReturnType<typeof createAdminClient>>, all: boolean): Promise<PlaybackRow[]> {
  const out: PlaybackRow[] = [];
  let from = 0;
  const size = 1000;
  while (true) {
    let q = admin
      .from('room_playback_history')
      .select('video_id, artist_name, title, style, played_at')
      .order('played_at', { ascending: false })
      .range(from, from + size - 1);
    if (!all) q = q.eq('style', 'Electronica');
    const { data, error } = await q;
    if (error) throw new Error(`[fetchRows] ${error.code} ${error.message}`);
    const rows = (data ?? []) as PlaybackRow[];
    out.push(...rows);
    if (rows.length < size) break;
    from += size;
  }
  return out;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const all = process.argv.includes('--all');
  const admin = createAdminClient();
  if (!admin) {
    console.error('admin client unavailable (.env.local の SUPABASE 設定を確認)');
    process.exit(2);
  }

  const rows = await fetchRows(admin, all);
  const byVideo = new Map<string, PlaybackRow>();
  for (const r of rows) {
    const vid = (r.video_id ?? '').trim();
    if (!vid) continue;
    if (!byVideo.has(vid)) byVideo.set(vid, r);
  }

  let checked = 0;
  let updated = 0;
  let skippedNoMeta = 0;
  let skippedNoMusic8 = 0;

  for (const row of byVideo.values()) {
    const videoId = row.video_id.trim();
    const artist = (row.artist_name ?? '').trim();
    const title = (row.title ?? '').trim();
    const current = asStyleOrNull(row.style);
    if (!artist || !title) {
      skippedNoMeta += 1;
      continue;
    }
    checked += 1;
    const resolved = await trySongStyleFromMusic8(artist, title);
    if (!resolved) {
      skippedNoMusic8 += 1;
      continue;
    }
    if (current === resolved) continue;

    const { error: histErr } = await admin
      .from('room_playback_history')
      .update({ style: resolved })
      .eq('video_id', videoId);
    if (histErr) {
      console.warn('[update room_playback_history]', videoId, histErr.code, histErr.message);
      continue;
    }
    await setStyleInDb(admin, videoId, resolved);
    updated += 1;
    console.log(`updated ${videoId}: ${current ?? '(null)'} -> ${resolved}`);
  }

  console.log(
    JSON.stringify(
      {
        mode: all ? 'all rows' : 'style=Electronica rows',
        totalRows: rows.length,
        uniqueVideos: byVideo.size,
        checked,
        updated,
        skippedNoMeta,
        skippedNoMusic8,
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

