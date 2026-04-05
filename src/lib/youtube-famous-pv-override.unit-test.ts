/**
 * 有名PVの videoId 固定オーバーライドの検証。
 * `npx tsx src/lib/youtube-famous-pv-override.unit-test.ts` / `npm run test:youtube-pv`
 */
import assert from 'node:assert/strict';
import { resolveFamousPvArtistSongPack } from './youtube-famous-pv-override';
import { resolveArtistSongForPack, resolveArtistSongForPackAsync } from './youtube-artist-song-for-pack';

async function run(): Promise<void> {
  assert.equal(resolveFamousPvArtistSongPack(null), null);
  assert.equal(resolveFamousPvArtistSongPack(''), null);

  {
    const r = resolveFamousPvArtistSongPack('4B_UYYPb-Gk');
    assert.ok(r);
    assert.equal(r!.artistDisplay, 'RUN DMC ft. Aerosmith');
    assert.equal(r!.song, 'Walk This Way');
    assert.equal(r!.artist, 'RUN DMC');
  }

  {
    const pack = resolveArtistSongForPack(
      'Walk This Way - RUN DMC ft. Aerosmith',
      'Totally Unrelated',
      null,
      '4B_UYYPb-Gk',
    );
    assert.equal(pack.artistDisplay, 'RUN DMC ft. Aerosmith');
    assert.equal(pack.song, 'Walk This Way');
  }

  {
    const asyncPack = await resolveArtistSongForPackAsync(
      'Walk This Way - RUN DMC ft. Aerosmith',
      'Totally Unrelated',
      null,
      '4B_UYYPb-Gk',
    );
    assert.equal(asyncPack.artistDisplay, 'RUN DMC ft. Aerosmith');
    assert.equal(asyncPack.song, 'Walk This Way');
  }

  {
    const packTrust = resolveArtistSongForPack(
      'Admin Fixed Artist - Admin Fixed Song',
      null,
      null,
      '4B_UYYPb-Gk',
      { trustProvidedTitleOverFamousPv: true },
    );
    assert.equal(packTrust.artistDisplay, 'Admin Fixed Artist');
    assert.equal(packTrust.song, 'Admin Fixed Song');
  }

  {
    const asyncTrust = await resolveArtistSongForPackAsync(
      'Admin Fixed Artist - Admin Fixed Song',
      null,
      null,
      '4B_UYYPb-Gk',
      { trustProvidedTitleOverFamousPv: true },
    );
    assert.equal(asyncTrust.artistDisplay, 'Admin Fixed Artist');
    assert.equal(asyncTrust.song, 'Admin Fixed Song');
  }

  console.log('youtube-famous-pv-override unit tests: OK');
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
