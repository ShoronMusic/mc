import { notFound, redirect } from 'next/navigation';
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
  filterMusicLibraryGenresByLetter,
} from '@/lib/music-library-genre-index';
import { getMusicLibraryAdmin, musicLibraryCatalogFilter } from '@/lib/music-library-query';
import {
  isMusicLibraryGenreLetterSegment,
  musicLibraryGenreHref,
  musicLibraryGenreLetterHref,
  musicLibraryGenreLetterParam,
  parseMusicLibraryPageParam,
  sliceMusicLibraryPage,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = {
  params: { segment: string; page?: string };
  searchParams?: { sort?: string | string[]; dir?: string | string[] };
};

function firstQuery(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function MusicLibraryGenreSegmentPage({ params, searchParams }: Props) {
  const raw = (params.segment ?? '').trim().toLowerCase();
  if (!raw) notFound();

  const page = params.page ? parseMusicLibraryPageParam(params.page) : 1;
  if (params.page && !page) notFound();

  if (/^[0-9]$/.test(raw)) {
    redirect(musicLibraryGenreLetterHref('0-9', page));
  }

  if (!isMusicLibraryGenreLetterSegment(raw)) {
    redirect(musicLibraryGenreHref(raw, 1));
  }

  const letter = musicLibraryGenreLetterParam(raw);

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const sort = parseMusicLibraryArtistLetterSort(firstQuery(searchParams?.sort));
  const dir = parseMusicLibraryArtistLetterDir(firstQuery(searchParams?.dir), sort);
  const items = await fetchMusicLibraryGenreIndex(admin, musicLibraryCatalogFilter());
  const filtered = filterMusicLibraryGenresByLetter(items, letter);
  const sorted = sortMusicLibraryArtistLetterItems(filtered, sort, dir);
  const sliced = sliceMusicLibraryPage(sorted, page ?? 1);
  const mc = isMcProduct();
  const title = letter === 'other' ? '#' : letter === '0-9' ? '0-9' : letter.toUpperCase();

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
            Genres · {title}
          </h1>
          {sliced.totalItems > 0 ? (
            <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
              {sliced.totalItems} 件 · {sliced.page} / {sliced.totalPages} ページ
            </p>
          ) : null}
        </div>
        <div className="max-w-xl">
          <MusicLibraryGenreSearchForm />
        </div>
      </header>
      {sliced.totalItems === 0 ? (
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>ジャンルがありません。</p>
      ) : (
        <>
          <MusicLibraryGenreLetterList items={sliced.items} letter={letter} sort={sort} dir={dir} />
          <MusicLibraryPagination
            page={sliced.page}
            totalPages={sliced.totalPages}
            hrefForPage={(n) => musicLibraryGenreLetterHref(letter, n, { sort, dir })}
          />
        </>
      )}
    </div>
  );
}
