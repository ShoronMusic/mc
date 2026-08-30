/**
 * WP で本日（または --since）更新された曲の Spotify メタを Supabase に反映。
 * 公開 JSON 全件生成はしない。曲ファイルがあれば E:\m8 の個別 JSON も直す。
 *
 * Usage:
 *   npx tsx scripts/patch-spotify-from-wp-modified.ts
 *   npx tsx scripts/patch-spotify-from-wp-modified.ts --since=2026-08-30 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  loadArtistLookupIndex,
  syncSongCreditsFromSongId,
} from '@/lib/song-credits-sync';

const WP_POSTS =
  'https://xs867261.xsrv.jp/md/wp-json/wp/v2/posts?per_page=50&orderby=modified&order=desc';
const SONGS_DIR = 'E:/m8/public/data/songs';

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

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq), token.slice(eq + 1));
    else args.set(token.slice(2), '1');
  }
  const sinceRaw = args.get('since')?.trim() || '2026-08-30';
  const sinceStart = `${sinceRaw}T00:00:00`;
  return {
    apply: argv.includes('--apply'),
    sinceStart,
    songsDir: args.get('songs-dir')?.trim() || SONGS_DIR,
  };
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function parsePopularity(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && v.trim() && v !== 'undefined') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

type WpPost = {
  id: number;
  slug?: string;
  modified?: string;
  title?: { rendered?: string };
  acf?: Record<string, unknown> | null;
};

async function fetchWpPage(page: number): Promise<WpPost[]> {
  const url = `${WP_POSTS}&page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'musicaichat-admin/1.0' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`WP REST ${res.status} page=${page}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as WpPost[]) : [];
}

async function fetchModifiedSince(sinceStart: string): Promise<WpPost[]> {
  const out: WpPost[] = [];
  for (let page = 1; page <= 40; page++) {
    const batch = await fetchWpPage(page);
    if (batch.length === 0) break;
    let pastWindow = false;
    for (const p of batch) {
      const modified = asStr(p.modified);
      if (modified && modified < sinceStart) {
        pastWindow = true;
        break;
      }
      out.push(p);
    }
    console.log(`WP page ${page}: kept ${out.length} (batch ${batch.length})`);
    if (pastWindow || batch.length < 50) break;
  }
  return out;
}

function spotifyPayloadFromAcf(acf: Record<string, unknown> | null | undefined): {
  trackId: string;
  payload: Record<string, unknown>;
} {
  const trackId = asStr(acf?.spotify_track_id);
  const payload: Record<string, unknown> = {};
  if (trackId) payload.spotify_track_id = trackId;
  const name = asStr(acf?.spotify_name);
  if (name) payload.spotify_name = name;
  const artists = asStr(acf?.spotify_artists);
  if (artists) payload.spotify_artists = artists;
  const release = asStr(acf?.spotify_release_date);
  if (release) payload.spotify_release_date = release;
  const images = asStr(acf?.spotify_images);
  if (images) payload.spotify_images = images;
  const pop = parsePopularity(acf?.spotify_popularity);
  if (pop != null) payload.spotify_popularity = pop;
  return { trackId, payload };
}

function patchLocalSongJson(
  songsDir: string,
  artistSlug: string | null,
  songSlug: string | null,
  acf: Record<string, unknown>,
  modified: string,
): boolean {
  if (!artistSlug || !songSlug) return false;
  const filePath = path.join(songsDir, `${artistSlug}_${songSlug}.json`);
  if (!fs.existsSync(filePath)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    const nextAcf = { ...((raw.acf as Record<string, unknown>) ?? {}), ...acf };
    raw.acf = nextAcf;
    raw.spotifyTrackId = asStr(acf.spotify_track_id);
    if (modified) raw.modified = modified;
    raw.lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, sinceStart, songsDir } = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  console.log(`fetch WP modified >= ${sinceStart}`);
  const posts = await fetchModifiedSince(sinceStart);
  console.log(`WP posts in window: ${posts.length}`);

  const index = await loadArtistLookupIndex(admin);

  let missingSong = 0;
  let unchanged = 0;
  let trackIdChanged = 0;
  let fieldsPatched = 0;
  let jsonPatched = 0;
  let creditsSynced = 0;
  const samples: unknown[] = [];

  for (const post of posts) {
    const wpId = post.id;
    const acf = post.acf ?? {};
    const { trackId, payload } = spotifyPayloadFromAcf(acf);
    const { data: song, error } = await admin
      .from('songs')
      .select(
        'id, display_title, spotify_track_id, music8_artist_slug, music8_song_slug, music8_song_data',
      )
      .eq('music8_song_id', wpId)
      .maybeSingle();
    if (error) throw error;
    if (!song) {
      missingSong += 1;
      continue;
    }

    const songId = (song as { id: string }).id;
    const oldId = asStr((song as { spotify_track_id?: string | null }).spotify_track_id);
    const idChanged = Boolean(trackId) && trackId !== oldId;
    const hasPayload = Object.keys(payload).length > 0;

    if (!idChanged && !hasPayload) {
      unchanged += 1;
      continue;
    }
    if (!idChanged && trackId && oldId === trackId && hasPayload) {
      // still patch name/artists/popularity if WP has newer copy
      fieldsPatched += 1;
    } else if (idChanged) {
      trackIdChanged += 1;
    } else {
      unchanged += 1;
      continue;
    }

    if (samples.length < 12) {
      samples.push({
        title: (song as { display_title?: string | null }).display_title,
        from: oldId || null,
        to: trackId || null,
        idChanged,
      });
    }

    if (!apply) continue;

    const snap = (song as { music8_song_data?: Record<string, unknown> | null }).music8_song_data;
    if (snap && typeof snap === 'object' && !Array.isArray(snap) && trackId) {
      const next = { ...snap, spotify_track_id: trackId };
      const ident = snap.identifiers;
      if (ident && typeof ident === 'object' && !Array.isArray(ident)) {
        next.identifiers = { ...(ident as Record<string, unknown>), spotify_track_id: trackId };
      }
      payload.music8_song_data = next;
    }

    const { error: uErr } = await admin.from('songs').update(payload).eq('id', songId);
    if (uErr) throw uErr;

    if (
      patchLocalSongJson(
        songsDir,
        (song as { music8_artist_slug?: string | null }).music8_artist_slug ?? null,
        (song as { music8_song_slug?: string | null }).music8_song_slug ?? null,
        acf,
        asStr(post.modified),
      )
    ) {
      jsonPatched += 1;
    }

    if (idChanged) {
      const cred = await syncSongCreditsFromSongId(admin, songId, true, index);
      if (cred?.applied) creditsSynced += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        sinceStart,
        wp_posts: posts.length,
        missing_song: missingSong,
        track_id_changed: trackIdChanged,
        fields_also_patched: fieldsPatched,
        unchanged_or_no_id: unchanged,
        local_json_patched: apply ? jsonPatched : 0,
        credits_resynced: apply ? creditsSynced : 0,
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
