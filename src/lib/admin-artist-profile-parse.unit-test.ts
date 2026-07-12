import assert from 'node:assert/strict';
import { parseGeminiArtistProfileFields } from '@/lib/admin-artist-profile-parse';

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
assert.equal(draft.nameEn, 'Kenshi Yonezu');
assert.equal(draft.originCountry, 'JPN');
assert.equal(draft.birthDate, '1991.03.10');
assert.equal(draft.deathDate, null);
assert.deepEqual(draft.occupations, ['Singer', 'Singer-songwriter']);
assert.ok(draft.descriptionEn?.includes('Japanese singer-songwriter'));
assert.ok(draft.profileText?.includes('米津玄師'));

console.log('admin-artist-profile-parse.unit-test: ok');
