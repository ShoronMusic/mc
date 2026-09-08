import assert from 'node:assert/strict';
import {
  buildWikipediaSearchPlan,
  wikiSlugFromUrl,
} from '@/lib/wikipedia-page-search';

assert.equal(wikiSlugFromUrl('https://en.wikipedia.org/wiki/Kenshi_Yonezu'), 'Kenshi_Yonezu');
assert.equal(
  wikiSlugFromUrl('https://ja.wikipedia.org/wiki/%E7%B1%B3%E6%B4%A5%E7%8E%84%E5%B8%AB'),
  '米津玄師',
);

{
  const western = buildWikipediaSearchPlan({
    artistName: 'Buffalo Traffic Jam',
    catalog: 'western',
  });
  assert.ok(western.length >= 1);
  assert.ok(western.every((q) => q.lang === 'en'));
  assert.equal(western[0]?.q, 'Buffalo Traffic Jam');
}

{
  const unknown = buildWikipediaSearchPlan({
    artistName: 'The Sways',
    catalog: 'unknown',
  });
  assert.ok(unknown.every((q) => q.lang === 'en'), 'unknown（洋楽主）は英語版のみ');
}

{
  const domestic = buildWikipediaSearchPlan({
    artistName: '米津玄師',
    catalog: 'domestic',
  });
  assert.equal(domestic[0]?.lang, 'ja');
  assert.ok(domestic.some((q) => q.lang === 'en'));
}

{
  const withEnBio = buildWikipediaSearchPlan({
    artistName: 'Buffalo Traffic Jam',
    catalog: 'western',
    descriptionEn: 'Buffalo Traffic Jam is a US band.',
  });
  assert.ok(withEnBio.every((q) => q.lang === 'en'));
}

console.log('wikipedia-page-search.unit-test: ok');
