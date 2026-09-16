import { notFound, redirect } from 'next/navigation';
import { MusicLibraryArtistLetterList } from '@/components/music-library/MusicLibraryArtistLetterList';
import { MusicLibraryArtistSearchForm } from '@/components/music-library/MusicLibraryArtistSearchForm';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  parseMusicLibraryArtistLetterDir,
  parseMusicLibraryArtistLetterSort,
  sortMusicLibraryArtistLetterItems,
} from '@/lib/music-library-artist-letter-sort';
import {
  fetchMusicLibraryArtistIndex,
  filterMusicLibraryArtistsByLetter,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import {
  musicLibraryArtistLetterHref,
  musicLibraryArtistLetterParam,
  parseMusicLibraryPageParam,
  sliceMusicLibraryPage,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = {
  params: { letter: string; page?: string };
  searchParams?: { sort?: string | string[]; dir?: string | string[] };
};

function firstQuery(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function MusicLibraryArtistLetterPage({ params, searchParams }: Props) {
  const raw = (params.letter ?? '').trim().toLowerCase();
  const parsedPage = params.page ? parseMusicLibraryPageParam(params.page) : 1;
  if (params.page && parsedPage == null) notFound();
  const page = parsedPage ?? 1;
  if (/^[0-9]$/.test(raw)) {
    redirect(musicLibraryArtistLetterHref('0-9', page));
  }
  const letter = musicLibraryArtistLetterParam(params.letter ?? '');
  if (raw !== letter) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const sort = parseMusicLibraryArtistLetterSort(firstQuery(searchParams?.sort));
  const dir = parseMusicLibraryArtistLetterDir(firstQuery(searchParams?.dir), sort);
  const { items } = await fetchMusicLibraryArtistIndex(admin, musicLibraryCatalogFilter());
  const filtered = filterMusicLibraryArtistsByLetter(items, letter);
  const sorted = sortMusicLibraryArtistLetterItems(filtered, sort, dir);
  const sliced = sliceMusicLibraryPage(sorted, page);
  const mc = isMcProduct();
  const title = letter === 'other' ? '#' : letter === '0-9' ? '0-9' : letter.toUpperCase();

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
            Artists · {title}
          </h1>
          {sliced.totalItems > 0 ? (
            <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
              {sliced.totalItems} 人 · {sliced.page} / {sliced.totalPages} ページ
            </p>
          ) : null}
        </div>
        <div className="max-w-xl">
          <MusicLibraryArtistSearchForm />
        </div>
      </header>
      {sliced.totalItems === 0 ? (
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>アーティストがありません。</p>
      ) : (
        <>
          <MusicLibraryArtistLetterList items={sliced.items} letter={letter} sort={sort} dir={dir} />
          <MusicLibraryPagination
            page={sliced.page}
            totalPages={sliced.totalPages}
            hrefForPage={(n) => musicLibraryArtistLetterHref(letter, n, { sort, dir })}
          />
        </>
      )}
    </div>
  );
}
