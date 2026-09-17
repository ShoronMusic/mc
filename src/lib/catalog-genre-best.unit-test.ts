/**
 * Genre BEST タブ分類の単体テスト
 * Run: npx tsx src/lib/catalog-genre-best.unit-test.ts
 */
import {
  buildGenreBestTabGroups,
  filterGenreBestByTab,
  genreBestTabParam,
  genreBestTabsEqual,
  isGenrePlaylistStyles,
  normalizeStyleKey,
  parseGenreBestTabKey,
  styleKeysMatch,
  type GenreBestListItem,
} from '@/lib/catalog-genre-best';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function item(partial: Partial<GenreBestListItem> & { title: string; styles: string[] }): GenreBestListItem {
  return {
    id: partial.id ?? partial.title,
    slug: partial.slug ?? partial.title.toLowerCase().replace(/\s+/g, '-'),
    title: partial.title,
    description: partial.description ?? null,
    coverImageUrl: null,
    wpPostId: null,
    styles: partial.styles,
    songCount: partial.songCount ?? 0,
    lastSongUpdatedAt: partial.lastSongUpdatedAt ?? null,
    updatedAtMs: partial.updatedAtMs ?? 0,
  };
}

assert(normalizeStyleKey('R&B') === normalizeStyleKey('rb'), 'R&B normalize');
assert(styleKeysMatch('Hip-hop', 'Hip hop'), 'Hip-hop match');
assert(isGenrePlaylistStyles([]), 'empty = genre');
assert(!isGenrePlaylistStyles(['Pop']), 'Pop not genre');

const items = [
  item({ title: 'Disco', styles: [], updatedAtMs: 100 }),
  item({ title: 'Afro House', styles: [], updatedAtMs: 50 }),
  item({ title: 'Pop//Alt-pop', styles: ['Pop'], updatedAtMs: 200 }),
  item({ title: 'Metal//Power metal', styles: ['metal'], updatedAtMs: 10 }),
];

const tabs = buildGenreBestTabGroups(items);
assert(tabs[0]?.key === 'genre', 'first tab Genre');
assert(tabs.some((t) => t.key === 'Pop'), 'has Pop');
assert(tabs.some((t) => t.key === 'metal'), 'has metal');
assert(tabs[tabs.length - 1]?.key === 'updated', 'last updated');

const genre = filterGenreBestByTab(items, 'genre');
assert(genre.length === 2, 'genre count');
assert(genre[0]?.title === 'Afro House', 'genre A-Z');

const updated = filterGenreBestByTab(items, 'updated');
assert(updated[0]?.title === 'Pop//Alt-pop', 'updated desc');

assert(genreBestTabParam('genre') === 'genre', 'tab param genre');
assert(genreBestTabParam('Pop') === 'pop', 'tab param Pop');
assert(genreBestTabParam('R&B') === 'rb', 'tab param R&B');
assert(parseGenreBestTabKey('pop') === 'Pop', 'parse pop');
assert(parseGenreBestTabKey('rb') === 'R&B', 'parse rb');
assert(parseGenreBestTabKey('') === 'genre', 'parse empty');
assert(genreBestTabsEqual('Pop', 'pop'), 'tabs equal Pop/pop');
assert(genreBestTabsEqual('genre', 'Genre'), 'tabs equal genre');

console.log('catalog-genre-best.unit-test: ok');
