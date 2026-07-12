import assert from 'node:assert/strict';

// wikiSlugFromUrl logic mirrored for test
function wikiSlugFromUrl(wikiUrl: string): string | null {
  const m = wikiUrl.match(/^https?:\/\/[^/]+\/wiki\/(.+)$/i);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].trim()) || null;
  } catch {
    return m[1].trim() || null;
  }
}

assert.equal(wikiSlugFromUrl('https://en.wikipedia.org/wiki/Kenshi_Yonezu'), 'Kenshi_Yonezu');
assert.equal(wikiSlugFromUrl('https://ja.wikipedia.org/wiki/%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB'), '米津玄師');

function extractEnglishName(descriptionEn: string): string | null {
  const m = descriptionEn.match(/^([A-Za-z][A-Za-z0-9\s.'-]{1,60}?)\s+is\b/i);
  return m?.[1]?.trim() ?? null;
}

assert.equal(
  extractEnglishName('Kenshi Yonezu is a Japanese singer-songwriter.'),
  'Kenshi Yonezu',
);

console.log('wikipedia-page-search.unit-test: ok');
