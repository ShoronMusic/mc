import { notFound } from 'next/navigation';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryGenrePage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import {
  isMusicLibraryGenreLetterSegment,
  musicLibraryGenreHref,
  parseMusicLibraryAutoplayIndex,
  parseMusicLibraryPageParam,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';
import MusicLibraryGenreSegmentPage from '../page';

type Props = {
  params: { segment: string; page: string };
  searchParams?: {
    sort?: string | string[];
    dir?: string | string[];
    autoplay?: string | string[];
    i?: string | string[];
  };
};

export default async function MusicLibraryGenreSegmentPagedPage({ params, searchParams }: Props) {
  const raw = (params.segment ?? '').trim().toLowerCase();
  if (isMusicLibraryGenreLetterSegment(raw)) {
    return (
      <MusicLibraryGenreSegmentPage
        params={{ segment: params.segment, page: params.page }}
        searchParams={searchParams}
      />
    );
  }

  const page = parseMusicLibraryPageParam(params.page);
  if (!page) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const result = await fetchMusicLibraryGenrePage(admin, raw, page, musicLibraryCatalogFilter());
  if (!result) notFound();

  const autoplay = parseMusicLibraryAutoplayIndex(searchParams);
  const mc = isMcProduct();
  const nextPageHref =
    result.page < result.totalPages ? musicLibraryGenreHref(result.slug, result.page + 1) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
          {result.name}
        </h1>
        {result.nameJa ? (
          <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>{result.nameJa}</p>
        ) : null}
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
          {result.totalItems} 曲 · {result.page} / {result.totalPages} ページ
        </p>
      </header>
      <MusicLibrarySongList
        songs={result.cards}
        nextPageHref={nextPageHref}
        initialAutoplay={autoplay.autoplay}
        initialIndex={autoplay.index}
        listFooter={
          <MusicLibraryPagination
            page={result.page}
            totalPages={result.totalPages}
            hrefForPage={(n) => musicLibraryGenreHref(result.slug, n)}
          />
        }
      />
    </div>
  );
}
