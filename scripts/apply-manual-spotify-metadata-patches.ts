/**
 * バックフィル no_match 残りの手動補修（2026-05-22）
 *
 * Usage:
 *   npx tsx scripts/apply-manual-spotify-metadata-patches.ts
 *   npx tsx scripts/apply-manual-spotify-metadata-patches.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteSongMasterCascade } from '@/lib/admin-delete-song-master';
import { fetchSpotifyTrackById, getSpotifyAccessToken } from '@/lib/spotify-search-track';

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

type Patch = {
  display_title: string;
  spotify_track_id: string;
  spotify_popularity: number;
};

/** ユーザー指定の Spotify track ID + popularity */
const PATCHES: Patch[] = [
  { display_title: 'd4vd - Crashing', spotify_track_id: '44MnSCzK2nFWQvv0kjUvkW', spotify_popularity: 2 },
  {
    display_title: 'Linkin Park - Numb (Official Music Video) [4k Upgrade] – Linkin Park',
    spotify_track_id: '2nLtzopw4rPReszdYBJU6h',
    spotify_popularity: 90,
  },
  {
    display_title: 'Msg (Mcauley Schenker Group) - Gimme Your Love From The Album Perfect Timing',
    spotify_track_id: '7qnkwHL4nIRT9eRWuhLWGb',
    spotify_popularity: 39,
  },
  {
    display_title: 'Nikos791 - Parov Stelar - Diamonds',
    spotify_track_id: '1M9piyRemGf82O8JeuCKzO',
    spotify_popularity: 14,
  },
  { display_title: 'Otopia - Psychology', spotify_track_id: '6yVl4xl7KIEviXsdGI1eM8', spotify_popularity: 51 },
];

/** track ID のみ指定 → Spotify API で popularity 等を取得して保存 */
const FETCH_BY_TRACK_ID: { display_title: string; spotify_track_id: string }[] = [
  {
    display_title: 'Ghost In The Shell: Stand Alone Complex - Opening Theme - Get 9',
    spotify_track_id: '2j5uB4m09BUw77O3Hhig38',
  },
  {
    display_title: 'Suisei Channel - もうどうなってもいいや / 星街すいせい',
    spotify_track_id: '17oTdCFRG5Vp4381jehV3U',
  },
];

const DELETE_DISPLAY_TITLES = ['Rod Stewart - Ole Ola'];

function metaToPayload(trackId: string, meta: Awaited<ReturnType<typeof fetchSpotifyTrackById>>): Record<string, unknown> {
  const payload: Record<string, unknown> = { spotify_track_id: trackId };
  if (meta.spotifyPopularity != null) {
    payload.spotify_popularity = Math.max(0, Math.min(100, Math.round(meta.spotifyPopularity)));
  }
  if (meta.spotifyName) payload.spotify_name = meta.spotifyName;
  if (meta.spotifyArtists) payload.spotify_artists = meta.spotifyArtists;
  if (meta.spotifyReleaseDate) payload.spotify_release_date = meta.spotifyReleaseDate;
  return payload;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  if (FETCH_BY_TRACK_ID.length > 0) {
    const token = await getSpotifyAccessToken();
    if (!token) {
      console.error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が未設定です。');
      process.exit(1);
    }
    for (const p of FETCH_BY_TRACK_ID) {
      const { data, error } = await admin
        .from('songs')
        .select('id, display_title')
        .eq('display_title', p.display_title)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        console.log(`[fetch] NOT FOUND: ${p.display_title}`);
        continue;
      }
      const meta = await fetchSpotifyTrackById(p.spotify_track_id);
      const payload = metaToPayload(p.spotify_track_id, meta);
      console.log(
        `[fetch] ${apply ? 'apply' : 'dry'} ${p.display_title} -> ${p.spotify_track_id} pop=${payload.spotify_popularity ?? '—'} name=${meta.spotifyName ?? '—'}`,
      );
      if (apply) {
        const { error: uErr } = await admin.from('songs').update(payload).eq('id', data.id);
        if (uErr) console.error(`  ERROR: ${uErr.message}`);
      }
    }
  }

  for (const p of PATCHES) {
    const { data, error } = await admin
      .from('songs')
      .select('id, display_title, spotify_popularity')
      .eq('display_title', p.display_title)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      console.log(`[patch] NOT FOUND: ${p.display_title}`);
      continue;
    }
    const payload = {
      spotify_track_id: p.spotify_track_id,
      spotify_popularity: Math.max(0, Math.min(100, Math.round(p.spotify_popularity))),
    };
    console.log(`[patch] ${apply ? 'apply' : 'dry'} ${p.display_title} -> ${p.spotify_track_id} pop=${payload.spotify_popularity}`);
    if (apply) {
      const { error: uErr } = await admin.from('songs').update(payload).eq('id', data.id);
      if (uErr) console.error(`  ERROR: ${uErr.message}`);
    }
  }

  for (const title of DELETE_DISPLAY_TITLES) {
    const { data, error } = await admin.from('songs').select('id, display_title').eq('display_title', title).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      console.log(`[delete] NOT FOUND: ${title}`);
      continue;
    }
    console.log(`[delete] ${apply ? 'apply' : 'dry'} ${title} id=${data.id}`);
    if (apply) {
      const res = await deleteSongMasterCascade(admin, data.id);
      if (!res.ok) console.error(`  ERROR: ${res.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
