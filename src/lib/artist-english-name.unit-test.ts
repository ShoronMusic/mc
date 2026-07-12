import assert from 'node:assert/strict';
import {
  englishNameFromWikipediaSlug,
  extractEnglishArtistNameFromDescription,
  mergeArtistEnglishNameAfterSpotify,
  mergeArtistEnglishNameAfterWikipedia,
  resolveArtistEnglishName,
} from '@/lib/artist-english-name';

assert.equal(
  extractEnglishArtistNameFromDescription('Kenshi Yonezu is a Japanese singer-songwriter.'),
  'Kenshi Yonezu',
);

assert.equal(englishNameFromWikipediaSlug('Kenshi_Yonezu'), 'Kenshi Yonezu');
assert.equal(englishNameFromWikipediaSlug('米津玄師'), null);

assert.equal(
  resolveArtistEnglishName({
    descriptionEn: 'Kenshi Yonezu is a Japanese singer.',
    spotifyName: 'Kenshi Yonezu',
  }),
  'Kenshi Yonezu',
);

assert.equal(mergeArtistEnglishNameAfterSpotify('Kenshi Yonezu'), 'Kenshi Yonezu');

assert.equal(
  mergeArtistEnglishNameAfterWikipedia({
    currentNameEn: null,
    wikipediaPage: 'Kenshi_Yonezu',
    wikipediaLang: 'en',
  }),
  'Kenshi Yonezu',
);

assert.equal(
  mergeArtistEnglishNameAfterWikipedia({
    currentNameEn: 'Kenshi Yonezu',
    wikipediaPage: 'Other_Artist',
    wikipediaLang: 'en',
  }),
  'Kenshi Yonezu',
);

console.log('artist-english-name.unit-test: ok');
