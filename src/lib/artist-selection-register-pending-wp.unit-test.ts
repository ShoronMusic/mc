import assert from 'node:assert/strict';
import { isSelectionRegisteredArtistPendingWp } from '@/lib/artist-selection-register';

assert.equal(
  isSelectionRegisteredArtistPendingWp({
    music8_artist_id: null,
    music8_synced_at: null,
  }),
  true,
  'bare stub stays pending',
);

assert.equal(
  isSelectionRegisteredArtistPendingWp({
    music8_artist_id: 12,
    music8_synced_at: null,
  }),
  false,
  'm8 id clears pending',
);

assert.equal(
  isSelectionRegisteredArtistPendingWp({
    music8_artist_id: null,
    spotify_artist_id: 'abc',
  }),
  false,
  'spotify clears pending',
);

assert.equal(
  isSelectionRegisteredArtistPendingWp({
    music8_artist_id: null,
    profile_text: 'あ'.repeat(40),
  }),
  false,
  'profile clears pending',
);

assert.equal(
  isSelectionRegisteredArtistPendingWp({
    music8_artist_id: null,
    ai_profile_generated_at: '2026-07-01T00:00:00Z',
    name_ja: 'サカナクション',
    origin_country: 'JP',
  }),
  false,
  'domestic basic info clears pending',
);

console.log('artist-selection-register pending-wp.unit-test: ok');
