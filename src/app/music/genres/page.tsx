import Link from 'next/link';
import { MusicLibraryGenreLetterList } from '@/components/music-library/MusicLibraryGenreLetterList';
import { MusicLibraryGenreSearchForm } from '@/components/music-library/MusicLibraryGenreSearchForm';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  parseMusicLibraryArtistLetterDir,
  parseMusicLibraryArtistLetterSort,
  sortMusicLibraryArtistLetterItems,
} from '@/lib/music-library-artist-letter-sort';
import {
  fetchMusicLibraryGenreIndex,
  filterMusicLibraryGenresBySearchQuery,
  countMusicLibraryGenresByLetter,
} from '@/lib/music-library-genre-index';
import { getMusicLibraryAdmin, musicLibraryCatalogFilter } from '@/lib/music-library-query';
import {
  musicLibraryGenreLetterParam,
  musicLibraryGenreLetterHref,
  musicLibraryGenresHref,
  parseMusicLibraryArtistSearchQuery,
  parseMusicLibraryPageParam,
  sliceMusicLibraryPage,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = {
  searchParams?: {
    q?: string | string[];
    page?: string | string[];
    sort?: string | string[];
    dir?: string | string[];
  };
};

function firstQuery(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function MusicLibraryGenresPage({ searchParams }: Props) {
  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const catalog = musicLibraryCatalogFilter();
  const q = parseMusicLibraryArtistSearchQuery(firstQuery(searchParams?.q));
  const items = await fetchMusicLibraryGenreIndex(admin, catalog);
  const counts = countMusicLibraryGenresByLetter(items);
  const mc = isMcProduct();
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '0-9', 'other'];

  const muted = mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400';
  const titleClass = mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white';

  let searchBlock: JSX.Element | null = null;
  if (q) {
    const sortRaw = firstQuery(searchParams?.sort);
    const sort = sortRaw ? parseMusicLibraryArtistLetterSort(sortRaw) : 'songs';
    const dir = parseMusicLibraryArtistLetterDir(firstQuery(searchParams?.dir), sort);
    const matched = filterMusicLibraryGenresBySearchQuery(items, q);
    const sorted = sortMusicLibraryArtistLetterItems(matched, sort, dir);
    const page = parseMusicLibraryPageParam(firstQuery(searchParams?.page)) ?? 1;
    const sliced = sliceMusicLibraryPage(sorted, page);

    searchBlock = (
      <section className="space-y-3" aria-label="検索結果">
        <header className="space-y-1">
          <h2 className={mc ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-white'}>
            「{q}」の検索結果
          </h2>
          <p className={muted}>
            {sliced.totalItems > 0
              ? `${sliced.totalItems} 件 · ${sliced.page} / ${sliced.totalPages} ページ`
              : '一致するジャンルはありません。'}
          </p>
        </header>
        {sliced.totalItems > 0 ? (
          <>
            <MusicLibraryGenreLetterList items={sliced.items} sort={sort} dir={dir} query={q} />
            <MusicLibraryPagination
              page={sliced.page}
              totalPages={sliced.totalPages}
              hrefForPage={(n) => musicLibraryGenresHref({ q, page: n, sort, dir })}
            />
          </>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <h1 className={titleClass}>Genres</h1>
        <div className="max-w-xl">
          <MusicLibraryGenreSearchForm query={q} />
        </div>
      </header>
      {searchBlock}
      <section className="space-y-3" aria-labelledby="music-library-genre-az">
        <h2
          id="music-library-genre-az"
          className={mc ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-white'}
        >
          アルファベット索引
        </h2>
        <ul className="flex flex-wrap gap-2">
          {letters.map((letter) => {
            const count = counts.get(musicLibraryGenreLetterParam(letter)) ?? 0;
            const label = letter === 'other' ? '#' : letter;
            return (
              <li key={letter}>
                <Link
                  href={musicLibraryGenreLetterHref(letter)}
                  className={
                    mc
                      ? `inline-flex ${letter === '0-9' ? 'min-w-[2.75rem]' : 'min-w-[2.25rem]'} items-center justify-center rounded border border-gray-200 bg-white px-2 py-1 text-sm hover:border-gray-400`
                      : `inline-flex ${letter === '0-9' ? 'min-w-[2.75rem]' : 'min-w-[2.25rem]'} items-center justify-center rounded border border-gray-800 bg-gray-900/40 px-2 py-1 text-sm hover:border-gray-600`
                  }
                >
                  {label}
                  <span className={mc ? 'ml-1 text-xs text-gray-500' : 'ml-1 text-xs text-gray-500'}>{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
