import assert from 'node:assert/strict';
import { resolveDomesticArtistRegistrationStatus } from '@/lib/admin-domestic-artist-registration-status';

const nameOnly = resolveDomesticArtistRegistrationStatus({ name_ja: 'ヨネヅケンシ' });
assert.equal(nameOnly.stage, 1);
assert.equal(nameOnly.hasBasicInfo, false);

const basic = resolveDomesticArtistRegistrationStatus({
  description_en: 'Kenshi Yonezu is a Japanese musician.',
  name_ja: 'ヨネヅケンシ',
  origin_country: 'JPN',
});
assert.equal(basic.stage, 2);
assert.equal(basic.hasBasicInfo, true);
assert.equal(basic.hasSpotify, false);

const withSpotify = resolveDomesticArtistRegistrationStatus({
  profile_text: 'プロフィール',
  name_ja: 'ヨネヅケンシ',
  spotify_artist_id: 'abc',
});
assert.equal(withSpotify.stage, 3);
assert.equal(withSpotify.hasSpotify, true);

const complete = resolveDomesticArtistRegistrationStatus({
  ai_profile_generated_at: '2026-07-12T00:00:00.000Z',
  spotify_artist_id: 'abc',
  youtube_channel_id: 'UCxxx',
  wikipedia_page: '米津玄師',
});
assert.equal(complete.stage, 5);
assert.equal(complete.hasWikipedia, true);

console.log('admin-domestic-artist-registration-status.unit-test: ok');
