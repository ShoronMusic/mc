import { notFound } from 'next/navigation';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryStylePage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import {
  isMusicLibraryNavStyleSlug,
  musicLibraryStyleHref,
  parseMusicLibraryAutoplayIndex,
  parseMusicLibraryPageParam,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = {
  params: { style: string; page: string };
  searchParams?: { autoplay?: string | string[]; i?: string | string[] };
};

export default async function MusicLibraryStylePagedPage({ params, searchParams }: Props) {
  const slug = (params.style ?? '').trim().toLowerCase();
  if (!isMusicLibraryNavStyleSlug(slug)) notFound();
  const page = parseMusicLibraryPageParam(params.page);
  if (!page) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const result = await fetchMusicLibraryStylePage(admin, slug, page, musicLibraryCatalogFilter());
  const autoplay = parseMusicLibraryAutoplayIndex(searchParams);
  const mc = isMcProduct();
  const nextPageHref =
    result.page < result.totalPages ? musicLibraryStyleHref(result.slug, result.page + 1) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
          {result.name}
        </h1>
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
          {result.totalItems} 曲 · {result.page} / {result.totalPages} ページ
        </p>
      </header>
      <MusicLibrarySongList
        songs={result.cards}
        nextPageHref={nextPageHref}
        initialAutoplay={autoplay.autoplay}
        initialIndex={autoplay.index}
      />
      <MusicLibraryPagination
        page={result.page}
        totalPages={result.totalPages}
        hrefForPage={(n) => musicLibraryStyleHref(result.slug, n)}
      />
    </div>
  );
}
