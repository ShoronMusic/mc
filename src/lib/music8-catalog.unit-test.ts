import assert from 'node:assert/strict';
import {
  artistSlugFromName,
  buildMusicaichatSongJson,
  buildStyleMonthly,
  emptyStylesSummary,
  mergeYoutubeIndex,
  songJsonFileName,
  youtubeIndexEntriesForSong,
} from '@/lib/music8-catalog-json-export';
import {
  music8NavStyleSlugFromName,
  music8NavStyleSlugFromStyleIds,
  slugifyCatalogLabel,
  termSlugAndName,
  youtubeVideoIdFromUnknown,
} from '@/lib/music8-catalog-slugs';

function run() {
  assert.equal(music8NavStyleSlugFromStyleIds([2844, 2849]), 'pop');
  assert.equal(music8NavStyleSlugFromName('R&B'), 'rb');
  assert.equal(music8NavStyleSlugFromName('Hip-hop'), 'hip-hop');
  assert.equal(slugifyCatalogLabel('New Wave'), 'new-wave');
  assert.equal(youtubeVideoIdFromUnknown('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeVideoIdFromUnknown('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');

  const term = termSlugAndName({ id: 12, slug: 'soft-rock', name: 'Soft rock' });
  assert.ok(term);
  assert.equal(term.wpTermId, 12);
  assert.equal(term.slug, 'soft-rock');

  const json = buildMusicaichatSongJson({
    row: {
      id: 'abc',
      main_artist: 'The Police',
      song_title: 'Every Breath You Take',
      display_title: 'The Police - Every Breath You Take',
      original_release_date: '1983-05-01',
      genres: ['New wave'],
      vocal: 'M',
      style: 'Rock',
      music8_artist_slug: 'police',
      music8_song_slug: 'every-breath-you-take',
      music8_song_id: 48794,
      music8_video_id: 'OMOGaugKpzs',
      spotify_track_id: 'track',
      spotify_artists: 'The Police',
      primary_artist_name_ja: 'ポリス',
    },
    videoIds: ['OMOGaugKpzs'],
    styleSlugs: ['rock'],
    genreNames: ['New wave'],
  });
  assert.equal(json.stable_key.artist_slug, 'police');
  assert.equal(json.stable_key.song_slug, 'every-breath-you-take');
  assert.equal(songJsonFileName(json.stable_key), 'police_every-breath-you-take.json');
  assert.equal(json.youtube.primary_id, 'OMOGaugKpzs');
  assert.ok(json.classification.includes('rock'));
  assert.equal(json.identifiers.music8_song_id, 48794);

  const idx = youtubeIndexEntriesForSong(json);
  assert.equal(idx.OMOGaugKpzs.role, 'primary');
  const merged = mergeYoutubeIndex({ oldid: { artist_slug: 'a', song_slug: 'b', role: 'primary' } }, idx);
  assert.equal(merged.oldid.artist_slug, 'a');
  assert.equal(merged.OMOGaugKpzs.song_slug, 'every-breath-you-take');

  assert.equal(artistSlugFromName('The Police', 'x'), 'police');

  const summary = emptyStylesSummary();
  assert.equal(summary.length, 9);
  assert.equal(summary[0].slug, 'pop');

  const monthly = buildStyleMonthly(
    [
      { styleSlug: 'pop', year: 2026, month: 8 },
      { styleSlug: 'pop', year: 2026, month: 8 },
      { styleSlug: 'rock', year: 2025, month: 1 },
    ],
    2026,
  );
  assert.equal(monthly.total, 2);
  assert.equal(monthly.styles.find((s) => s.style === 'pop')?.months[7], 2);

  console.log('music8-catalog unit tests: OK');
}

run();
