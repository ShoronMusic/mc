/**
 * 一時: admin-domestic-artist-playlist の取得・dry-run 投入テスト
 * Usage: npx tsx scripts/tmp-test-domestic-artist-playlist.ts [--max-items=2] [--dry-run-apply] [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  applyDomesticArtistPlaylistItems,
  fetchDomesticArtistPlaylist,
} from '@/lib/admin-domestic-artist-playlist';
import { createAdminClient } from '@/lib/supabase/admin';

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function parseArg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  delete process.env.YT_ARTIST_TITLE_MODE;

  const maxItems = Math.max(1, Math.floor(Number(parseArg('max-items', '2'))));
  const dryRunApply = process.argv.includes('--dry-run-apply');
  const realApply = process.argv.includes('--apply');
  const admin = createAdminClient();

  const yonezuChannelId = 'UCUCeZaZeJbEYAAzvMgrKOPQ';

  console.error(`[test] fetch maxItems=${maxItems}`);
  const t0 = Date.now();
  const result = await fetchDomesticArtistPlaylist({
    playlistUrl: 'https://www.youtube.com/playlist?list=PLb02MaZXm5_OGFGXSV-6U2_9f2MqnDBbm',
    maxItems,
    artistHints: {
      name: '米津玄師',
      nameEn: 'Kenshi Yonezu',
      nameJa: 'ヨネヅケンシ',
      youtubeChannelId: yonezuChannelId,
    },
    admin,
  });
  console.error(`[test] fetch done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify({ summary: result.summary, items: result.items }, null, 2));

  if (dryRunApply || realApply) {
    const included = result.items.filter((i) => i.include);
    const manual = result.items.filter((i) => i.videoId === '1cnndBdzCAk');
    const targets = included.length > 0 ? included : manual.map((i) => ({ ...i, include: true }));
    const mode = realApply ? 'apply' : 'dry-run';
    console.error(`[test] ${mode} ${targets.length} items (forceAllow)`);
    const applyResults = await applyDomesticArtistPlaylistItems(
      admin,
      targets.map((i) => ({
        videoId: i.videoId,
        artist: '米津玄師',
        title: i.title,
        displayTitle: i.displayTitle,
        releaseDate: i.releaseDate,
        youtubeDate: i.youtubeDate,
        genres: i.genres,
        include: true,
        rawTitle: i.rawTitle,
        channelTitle: i.channelTitle,
        channelId: i.channelId ?? yonezuChannelId,
      })),
      {
        dryRun: !realApply,
        forceAllow: true,
        registrationArtistName: '米津玄師',
      },
    );
    console.log(JSON.stringify({ applyResults }, null, 2));

    if (realApply) {
      const imported = applyResults.filter((r) => r.status === 'imported');
      if (imported.length > 0) {
        const { clearLibraryArtistIndexCache } = await import('@/lib/build-library-artist-index');
        clearLibraryArtistIndexCache();
        console.error(`[test] imported ${imported.length}, library cache cleared`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
