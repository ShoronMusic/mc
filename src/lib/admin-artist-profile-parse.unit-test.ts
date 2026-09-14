import assert from 'node:assert/strict';
import {
  composeAdminArtistDisplayName,
  emptyAdminArtistProfileDraft,
  extractJsonObjectFromGeminiText,
  normalizeAdminArtistActivePeriod,
  normalizeAdminArtistThePrefix,
  parseGeminiArtistProfileFields,
  repairUnescapedControlsInJsonStrings,
  splitAdminArtistNameParts,
} from '@/lib/admin-artist-profile-parse';
import { buildArtistDbPatchFromAdminDraft } from '@/lib/admin-artist-profile-save';

const sample = {
  本文: 'Kenshi Yonezu is a Japanese singer-songwriter and visual artist, known for blending rock, pop, and electronic elements.\n米津玄師は、ロック・ポップ・エレクトロニックを横断するサウンドと、自身で手がけるビジュアル表現が特徴のシンガーソングライターである。',
  Origin: 'JPN',
  活動開始年: '2013 - 現在',
  '生年月日（個人の場合）': '1991.03.10',
  日本語読み: 'ヨネヅ ケンシ',
  '永眠（個人の場合）': '-',
  Occupation: 'Singer, Singer-songwriter',
};

const draft = parseGeminiArtistProfileFields(sample, '米津玄師', 'domestic');

assert.equal(draft.name, '米津玄師');
assert.equal(draft.nameBase, '米津玄師');
assert.equal(draft.thePrefix, null);
assert.equal(draft.nameEn, 'Kenshi Yonezu');
assert.equal(draft.originCountry, 'JPN');
assert.equal(draft.activePeriod, '2013 -');
assert.equal(draft.birthDate, '1991.03.10');
assert.equal(draft.deathDate, null);
assert.deepEqual(draft.occupations, ['Singer', 'Singer-songwriter']);
assert.ok(draft.descriptionEn?.includes('Japanese singer-songwriter'));
assert.ok(draft.profileText?.includes('米津玄師'));

{
  const parts = splitAdminArtistNameParts('The Sways');
  assert.equal(parts.nameBase, 'Sways');
  assert.equal(parts.thePrefix, 'The');
  assert.equal(parts.name, 'The Sways');
  assert.equal(composeAdminArtistDisplayName('Sways', 'The'), 'The Sways');
  assert.equal(normalizeAdminArtistThePrefix('1'), 'The');
  assert.equal(normalizeAdminArtistThePrefix('an'), 'An');

  const western = emptyAdminArtistProfileDraft('Sways', 'western');
  western.thePrefix = 'The';
  western.nameBase = 'Sways';
  const patch = buildArtistDbPatchFromAdminDraft(western);
  assert.equal(patch.name, 'The Sways');
  assert.equal(patch.name_base, 'Sways');
  assert.equal(patch.the_prefix, 'The');

  const withHandle = emptyAdminArtistProfileDraft('Art Official', 'western');
  withHandle.youtubeChannelId = 'https://www.youtube.com/@ArtOfficialMusic';
  const handlePatch = buildArtistDbPatchFromAdminDraft(withHandle);
  assert.equal(handlePatch.youtube_channel_id, '@ArtOfficialMusic');
  assert.equal(handlePatch.youtube_channel_url, 'https://www.youtube.com/@ArtOfficialMusic');
}

assert.equal(normalizeAdminArtistActivePeriod('1989 - 現在'), '1989 -');
assert.equal(normalizeAdminArtistActivePeriod('1989 - present'), '1989 -');
assert.equal(normalizeAdminArtistActivePeriod('1977 - 1986'), '1977 - 1986');
assert.equal(normalizeAdminArtistActivePeriod('1998 -'), '1998 -');

{
  const broken = `{"本文":"Line one.
Line two.","Origin":"AUS","活動開始年":"2012 -","生年月日（個人の場合）":"-","日本語読み":"ポラリス","永眠（個人の場合）":"-","Occupation":"Band",}`;
  const repaired = repairUnescapedControlsInJsonStrings(broken.replace(/,\s*([}\]])/g, '$1'));
  const obj = extractJsonObjectFromGeminiText('```json\n' + broken + '\n```');
  assert.ok(obj);
  assert.equal(obj!.Origin, 'AUS');
  assert.ok(String(obj!['本文']).includes('Line two'));
  assert.ok(repaired.includes('\\n'));
}

console.log('admin-artist-profile-parse.unit-test: ok');
