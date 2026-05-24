/**
 * 2026-05-24 手作業指示（26曲）を songs / artists / song_credits に反映。
 *
 * Usage:
 *   npx tsx scripts/apply-manual-song-credits-patches-2026-05-24.ts
 *   npx tsx scripts/apply-manual-song-credits-patches-2026-05-24.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveArtistIdFromIndex } from '@/lib/song-credits-resolve';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsForSong,
  songCreditsTableAvailable,
  type SongCreditInput,
} from '@/lib/song-credits-sync';
import {
  fetchSpotifyArtistsByIds,
  fetchSpotifyTrackWithArtistsById,
  getSpotifyAccessToken,
  parseArtistTitleFromDisplayTitle,
} from '@/lib/spotify-search-track';

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
    if (!process.env[key]) process.env[key] = value;
  }
}

type ManualPatch = {
  songId: string;
  label: string;
  displayTitle?: string;
  mainArtist?: string;
  spotifyTrackId?: string;
  /** 指定時はこの名前だけクレジット（solo より優先） */
  creditArtists?: string[];
  solo?: boolean;
};

const PATCHES: ManualPatch[] = [
  { songId: '034b0ba5-8cf3-44ae-8c55-7d483bd46b1b', label: '1 Crystal Waters', solo: true },
  {
    songId: '07a55af0-b5a7-49bb-96d3-bbf8f3126da6',
    label: '2 Dayton',
    spotifyTrackId: '4KOBgd1zk3vDYp1ibZNGe5',
  },
  { songId: '0ef40eff-ed1d-42de-92e8-49469f1a88f0', label: '3 Noel Gallagher', solo: true },
  { songId: '1738a8e0-5e22-4270-a4df-096388ad3363', label: '4 Miso Extra', solo: true },
  { songId: '3201a8b7-4655-4529-bd49-30e5cb3f4cb7', label: '5 Róisín Murphy You Knew', solo: true },
  { songId: '35029677-0d1f-4c7d-9e5f-bb80c1a16242', label: '6 Tiësto', solo: true },
  { songId: '463818a0-305e-4a25-854a-602f29a5d067', label: '7 Kenneth Bager', solo: true },
  {
    songId: '4e78c4e9-8718-425f-9b57-f7af9015c0c9',
    label: '8 Old Flame',
    displayTitle: 'Old Flame - Pray',
    solo: true,
  },
  { songId: '5fd25728-2239-4d5a-aa4f-2470c3f57b5c', label: '9 Fine Young Cannibals', solo: true },
  { songId: '675a245c-4b0f-4766-805a-2ab218089d67', label: '10 Afrika Bambaataa', solo: true },
  {
    songId: '72a721f4-4755-4f47-bc71-0c890e95471e',
    label: '11 CIZA',
    creditArtists: ['CIZA', 'Jazzworx', 'Thukuthela'],
  },
  {
    songId: '852a5469-4206-4ea0-bfce-3156ca70fc48',
    label: '12 BCNR Happy Birthday',
    creditArtists: ['Black Country, New Road'],
  },
  { songId: '86783d87-19fd-46dc-b62a-f56e71f4972c', label: '13 Gizelle Smith', solo: true },
  { songId: '8b1c07bc-5b78-42b2-8f42-ec315e1a6beb', label: '14 Lonnie Liston Smith', solo: true },
  { songId: '8d421d3a-c576-44a9-b585-3d0a3ef6e3fc', label: '15 Róisín Murphy Fader', solo: true },
  {
    songId: '8e7985c5-3e8c-4e99-b8c9-073d11f1237e',
    label: '16 Dagny',
    spotifyTrackId: '698xO1FAsZqETbRvdDHz8T',
  },
  {
    songId: '8e96dc96-a12f-4f59-b989-7b387f2e9b76',
    label: '17 Rock Master Scott Life',
    creditArtists: ['Rock Master Scott & The Dynamic Three'],
  },
  {
    songId: '989614ae-563d-4c21-99d5-577be6b4918d',
    label: '18 BCNR Besties',
    creditArtists: ['Black Country, New Road'],
  },
  { songId: 'ae67fe0a-6471-459e-8d8f-c790156a9cb1', label: '19 Veda', solo: true },
  {
    songId: 'bbab239f-ac0b-4ae7-9f86-8b1c6855be53',
    label: '20 KAS:ST',
    spotifyTrackId: '4UTDJfQJr7my95FERZXg9Q',
    creditArtists: ['KAS:ST'],
  },
  {
    songId: 'c04bc418-e68b-4c1c-892b-ac17935a620d',
    label: '21 BCNR Cold Country',
    creditArtists: ['Black Country, New Road'],
  },
  {
    songId: 'd1a92cff-f2a0-4c45-9b50-5bce079a35d9',
    label: '22 A$AP Rocky',
    spotifyTrackId: '1VUGWjzlqudhTqvhc17miB',
  },
  { songId: 'd8ea7d26-8496-4c0c-ae6e-90c0bd93af6a', label: '23 John Butler', solo: true },
  { songId: 'dbf197e5-7819-4335-91d9-bf8148a5ec2d', label: '24 CHVRCHES', solo: true },
  {
    songId: 'eecd6ea6-dd88-469e-bc44-5bb82ac37a40',
    label: '25 Aerosmith',
    spotifyTrackId: '10C1hpvpjws3qgZBxriUlE',
  },
  {
    songId: 'f71f089f-b7ea-46e8-a274-a77aca9983c1',
    label: '26 Rock Master Scott Request Line',
    creditArtists: ['Rock Master Scott & The Dynamic Three'],
  },
];

async function ensureArtist(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  index: Awaited<ReturnType<typeof loadArtistLookupIndex>>,
  name: string,
  spotifyArtistId?: string | null,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  if (spotifyArtistId) {
    const { data } = await admin.from('artists').select('id').eq('spotify_artist_id', spotifyArtistId).limit(1);
    const id = (Array.isArray(data) ? data[0] : data) as { id?: string } | undefined;
    if (id?.id) return id.id;
  }

  const hit = resolveArtistIdFromIndex(index, trimmed, null);
  if (hit) return hit;

  const payload: Record<string, unknown> = { name: trimmed };
  if (spotifyArtistId) payload.spotify_artist_id = spotifyArtistId;

  const { data, error } = await admin.from('artists').insert(payload).select('id').single();
  if (error?.code === '23505') {
    return resolveArtistIdFromIndex(index, trimmed, null);
  }
  if (error) throw error;
  return (data as { id?: string }).id ?? null;
}

function soloArtistFromPatch(patch: ManualPatch, fallbackTitle: string): string | null {
  const title = patch.displayTitle ?? fallbackTitle;
  const parsed = parseArtistTitleFromDisplayTitle(title);
  return parsed?.artist?.trim() ?? null;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();
  if (!admin || !(await songCreditsTableAvailable(admin))) {
    console.error('admin / song_credits unavailable');
    process.exit(1);
  }
  if (apply && !(await getSpotifyAccessToken())) {
    console.error('SPOTIFY credentials missing');
    process.exit(1);
  }

  const results: Record<string, unknown>[] = [];

  for (const patch of PATCHES) {
    const { data: row, error } = await admin
      .from('songs')
      .select('id, display_title, main_artist, song_title, spotify_artists, spotify_track_id')
      .eq('id', patch.songId)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      results.push({ label: patch.label, song_id: patch.songId, status: 'not_found' });
      continue;
    }

    const fallbackTitle = (row as { display_title?: string }).display_title ?? '';
    let creditArtists = patch.creditArtists;
    if (patch.solo && !creditArtists?.length) {
      const solo = soloArtistFromPatch(patch, fallbackTitle);
      if (solo) creditArtists = [solo];
    }

    const songUpdate: Record<string, unknown> = {};
    if (patch.displayTitle) {
      songUpdate.display_title = patch.displayTitle;
      const parsed = parseArtistTitleFromDisplayTitle(patch.displayTitle);
      if (parsed) {
        songUpdate.main_artist = patch.mainArtist ?? parsed.artist;
        songUpdate.song_title = parsed.title;
      }
    } else if (patch.mainArtist) {
      songUpdate.main_artist = patch.mainArtist;
    }

    let trackArtistNames: string[] | null = null;
    const trackId = patch.spotifyTrackId?.trim();
    if (trackId) {
      songUpdate.spotify_track_id = trackId;
      if (apply) {
        const track = await fetchSpotifyTrackWithArtistsById(trackId);
        if (track.spotifyArtists) songUpdate.spotify_artists = track.spotifyArtists;
        if (track.spotifyName) songUpdate.spotify_name = track.spotifyName;
        if (track.spotifyPopularity != null) songUpdate.spotify_popularity = Math.round(track.spotifyPopularity);
        if (track.spotifyReleaseDate) songUpdate.spotify_release_date = track.spotifyReleaseDate;
        if (!creditArtists?.length && track.artists.length > 0) {
          trackArtistNames = track.artists.map((a) => a.name);
        }
        if (apply && track.artists.length > 0) {
          clearArtistLookupIndexCache();
          let index = await loadArtistLookupIndex(admin);
          const details = await fetchSpotifyArtistsByIds(track.artists.map((a) => a.id));
          for (const d of details) {
            await ensureArtist(admin, index, d.name, d.id);
          }
          clearArtistLookupIndexCache();
        }
      }
    }

    if (creditArtists?.length) {
      const main = creditArtists[0];
      if (main) songUpdate.main_artist = main;
      songUpdate.spotify_artists = creditArtists.join(', ');
    }

    if (apply && Object.keys(songUpdate).length > 0) {
      const { error: uErr } = await admin.from('songs').update(songUpdate).eq('id', patch.songId);
      if (uErr) throw uErr;
    }

    clearArtistLookupIndexCache();
    const index = await loadArtistLookupIndex(admin);

    if (creditArtists?.length && apply) {
      for (const name of creditArtists) {
        await ensureArtist(admin, index, name);
      }
      clearArtistLookupIndexCache();
    }

    const input: SongCreditInput = {
      display_title: patch.displayTitle ?? fallbackTitle,
      spotify_artists: (creditArtists ?? []).join(', ') || (row as { spotify_artists?: string }).spotify_artists,
      main_artist:
        (songUpdate.main_artist as string) ?? (row as { main_artist?: string }).main_artist ?? null,
      music8_song_data: null,
      explicitCreditArtists: creditArtists ?? null,
      trackArtistNames,
    };

    const idx2 = await loadArtistLookupIndex(admin);
    const sync = await syncSongCreditsForSong(admin, patch.songId, input, idx2, apply);

    results.push({
      label: patch.label,
      song_id: patch.songId,
      display_title: patch.displayTitle ?? fallbackTitle,
      credit_artists: creditArtists ?? trackArtistNames,
      spotify_track_id: trackId ?? null,
      applied: apply,
      credit_count: sync?.creditCount ?? 0,
      unresolved: sync?.unresolved ?? [],
    });
  }

  const outDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `manual-song-credits-patches-2026-05-24-${apply ? 'apply' : 'dry'}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', count: results.length, report: reportPath }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
