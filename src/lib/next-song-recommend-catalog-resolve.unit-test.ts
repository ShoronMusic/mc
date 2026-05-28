import assert from 'node:assert/strict';
import { formatMcDbMatchDisplayLine } from '@/lib/next-song-recommend-display';
import { normalizeNextSongPickMatchKey } from '@/lib/next-song-recommend-store';

function run() {
  assert.equal(
    normalizeNextSongPickMatchKey('Tears for Fears', 'Shout'),
    normalizeNextSongPickMatchKey('tears for fears', 'shout'),
  );

  assert.equal(
    formatMcDbMatchDisplayLine({
      dbDisplayTitle: 'Tears For Fears - Shout',
      dbMainArtist: 'Tears For Fears',
      dbSongTitle: 'Shout',
    }),
    'Tears For Fears - Shout',
  );
  assert.equal(
    formatMcDbMatchDisplayLine({
      dbDisplayTitle: null,
      dbMainArtist: 'Duran Duran',
      dbSongTitle: 'A View To A Kill',
    }),
    'Duran Duran - A View To A Kill',
  );

  console.log('next-song-recommend-catalog-resolve.unit-test: ok');
}

run();
