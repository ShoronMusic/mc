/**
 * 純粋関数の検証: `npx tsx src/lib/musicbrainz-artist-area.unit-test.ts`
 */
import assert from 'node:assert/strict';
import {
  musicBrainzHitIndicatesJapan,
  isJapaneseArtistByMusicBrainzLookup,
} from './musicbrainz-artist-area';

assert.equal(musicBrainzHitIndicatesJapan({ score: 100, country: 'JP' }, 85), true);
assert.equal(musicBrainzHitIndicatesJapan({ score: 100, country: 'US' }, 85), false);
assert.equal(
  musicBrainzHitIndicatesJapan(
    { score: 99, area: { name: 'Japan', 'iso-3166-1-codes': ['JP'] } },
    85,
  ),
  true,
);
assert.equal(musicBrainzHitIndicatesJapan({ score: 100, area: { name: 'United States' } }, 85), false);
assert.equal(musicBrainzHitIndicatesJapan({ score: 84, country: 'JP' }, 85), false);
assert.equal(musicBrainzHitIndicatesJapan({ score: 85, country: 'JP' }, 85), true);

async function smokeIfConfigured() {
  if (process.env.MUSICBRAINZ_SMOKE !== '1') return;
  const ua = process.env.MUSICBRAINZ_USER_AGENT?.trim();
  assert.ok(ua, 'MUSICBRAINZ_SMOKE=1 には MUSICBRAINZ_USER_AGENT が必要です');
  const king = await isJapaneseArtistByMusicBrainzLookup('King Gnu');
  assert.equal(king, true, 'King Gnu は Japan 期待');
  await new Promise((r) => setTimeout(r, 1200));
  const ts = await isJapaneseArtistByMusicBrainzLookup('Taylor Swift');
  assert.equal(ts, false, 'Taylor Swift は Japan でない期待');
}

smokeIfConfigured()
  .then(() => console.log('musicbrainz-artist-area unit tests: OK'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
