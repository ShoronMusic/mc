import fs from 'node:fs';
import path from 'node:path';
import { buildExplicitCreditArtists } from '@/lib/admin-domestic-artist-playlist';
import { ensureDomesticArtistForSongRegistration } from '@/lib/artist-selection-register';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsForSong,
} from '@/lib/song-credits-sync';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  const songId = '627579a3-4c1f-4cac-a1a7-66818400e563';
  const mainArtist = '米津玄師';
  const featured = ['宇多田ヒカル'];
  const names = buildExplicitCreditArtists(mainArtist, featured);

  const { data: song } = await admin
    .from('songs')
    .select('display_title')
    .eq('id', songId)
    .maybeSingle();

  const index = await loadArtistLookupIndex(admin);
  for (const name of names) {
    await ensureDomesticArtistForSongRegistration(admin, name, { index });
  }
  clearArtistLookupIndexCache();
  const freshIndex = await loadArtistLookupIndex(admin);

  const result = await syncSongCreditsForSong(
    admin,
    songId,
    {
      main_artist: mainArtist,
      display_title: (song as { display_title?: string } | null)?.display_title ?? null,
      spotify_artists: null,
      music8_song_data: null,
      explicitCreditArtists: names,
    },
    freshIndex,
    true,
  );
  clearLibraryArtistIndexCache();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
