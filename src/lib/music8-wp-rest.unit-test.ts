import assert from 'node:assert/strict';
import { wpRestPostToMusic8SongJson } from '@/lib/music8-wp-rest';
import { buildPersistableMusic8SongSnapshot } from '@/lib/music8-song-persist';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

function run() {
  const converted = wpRestPostToMusic8SongJson({
    id: 133074,
    slug: 'i-miss-the-misery',
    date: '2012-06-22T12:00:00',
    title: { rendered: 'I Miss The Misery' },
    content: { rendered: '<p>Halestorm - I Miss The Misery</p>' },
    style: [6409],
    acf: {
      ytvideoid: 'YpJAmlnBxoA',
      ytreleasedate: '2012/06/22',
      spotify_track_id: '3gmEzilP9BzF45wIMvA16l',
      spotify_popularity: '68',
    },
    custom_fields: {
      categories: [
        {
          id: 5012,
          name: 'Halestorm',
          slug: 'halestorm',
          acf: { artistjpname: 'ヘイルストーム', spotify_artist_id: '6om12Ev5ppgoMy3OYSoech' },
        },
      ],
    },
    genre_data: [{ name: 'Hard rock', slug: 'hard-rock', term_id: 553 }],
    vocal_data: [{ name: 'F', slug: 'female', term_id: 2851 }],
  });

  assert.equal(converted.id, 133074);
  assert.equal(converted.videoId, 'YpJAmlnBxoA');

  const ex = extractMusic8SongFields(converted);
  assert.equal(ex.genres[0], 'Hard rock');
  assert.equal(ex.vocalLabel, 'F');
  assert.equal(ex.primaryArtistNameJa, 'ヘイルストーム');
  assert.equal(ex.releaseDate, '2012.06');
  assert.deepEqual(ex.styleIds, [6409]);

  const snap = buildPersistableMusic8SongSnapshot(converted);
  assert.equal(snap?.kind, 'music8_wp_song');
  assert.equal((snap as { id?: number }).id, 133074);

  console.log('music8-wp-rest.unit-test: ok');
}

run();
