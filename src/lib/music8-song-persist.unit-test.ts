import assert from 'node:assert/strict';
import { buildPersistableMusic8SongSnapshot } from '@/lib/music8-song-persist';

function run() {
  const v1 = buildPersistableMusic8SongSnapshot({
    schema_version: '1',
    stable_key: { artist_slug: 'police', song_slug: 'every-breath-you-take' },
    display: {
      song_title: 'Every Breath You Take',
      primary_artist_name: 'The Police',
      primary_artist_name_ja: 'ポリス',
    },
    youtube: { primary_id: 'abcd', ids: ['abcd', 'efgh'] },
    releases: { original_release_date: '1983-05-20' },
    styles: [2849],
    facts_for_ai: {
      opening_lines: ['ボーカル: M', 'スタイル: Metal', '本文はここから'],
    },
  });
  assert.equal(v1?.kind, 'musicaichat_v1');
  assert.equal((v1 as { stable_key?: { artist_slug: string } }).stable_key?.artist_slug, 'police');
  assert.equal((v1 as { releaseDate_normalized?: string }).releaseDate_normalized, '1983.05');
  assert.equal((v1 as { primary_artist_name_ja?: string }).primary_artist_name_ja, 'ポリス');
  assert.equal((v1 as { vocal?: string }).vocal, 'M');
  assert.equal((v1 as { structured_style?: string }).structured_style, 'Metal');

  const wp = buildPersistableMusic8SongSnapshot({
    id: 48794,
    slug: 'every-breath-you-take',
    title: 'Every Breath You Take',
    artists: [{ id: 2, name: 'The Police', slug: 'police' }],
    videoId: 'OMOGaugKpzs',
    date: '1983-05-01',
    styles: [2849],
  });
  assert.equal(wp?.kind, 'music8_wp_song');
  assert.equal((wp as { id?: number }).id, 48794);
  assert.ok(Array.isArray((wp as { main_artists?: unknown[] }).main_artists));

  assert.equal(buildPersistableMusic8SongSnapshot(null), null);
  assert.equal(buildPersistableMusic8SongSnapshot({}), null);

  console.log('music8-song-persist.unit-test: ok');
}

run();
