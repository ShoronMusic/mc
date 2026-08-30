import assert from 'node:assert/strict';
import {
  songHasLibraryCommentaryIcon,
  songHasMusic8IntroKey,
} from '@/lib/library-commentary-icon';

function run() {
  assert.equal(songHasMusic8IntroKey({ music8_artist_slug: 'sting', music8_song_slug: 'fragile' }), true);
  assert.equal(songHasMusic8IntroKey({ music8_artist_slug: 'sting', music8_song_slug: '' }), false);
  assert.equal(songHasMusic8IntroKey({ music8_artist_slug: null, music8_song_slug: 'fragile' }), false);
  assert.equal(
    songHasLibraryCommentaryIcon({ hasAiCommentary: true, music8ArtistSlug: null, music8SongSlug: null }),
    true,
  );
  assert.equal(
    songHasLibraryCommentaryIcon({
      hasAiCommentary: false,
      music8ArtistSlug: 'sting',
      music8SongSlug: 'fragile',
    }),
    true,
  );
  assert.equal(
    songHasLibraryCommentaryIcon({ hasAiCommentary: false, music8ArtistSlug: 'sting', music8SongSlug: null }),
    false,
  );
  console.log('library-commentary-icon.unit-test: ok');
}

run();
