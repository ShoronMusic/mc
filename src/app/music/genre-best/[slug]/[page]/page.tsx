import { notFound } from 'next/navigation';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryStyleAdminLink } from '@/components/music-library/MusicLibraryStyleAdminLink';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryGenreBestPage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import {
  musicLibraryGenreBestDetailHref,
  musicLibraryGenreBestHref,
  parseMusicLibraryAutoplayIndex,
  parseMusicLibraryPageParam,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';
import Link from 'next/link';

type Props = {
  params: { slug: string; page: string };
  searchParams?: { autoplay?: string | string[]; i?: string | string[] };
};

export default async function MusicLibraryGenreBestPagedPage({ params, searchParams }: Props) {
  const slug = (params.slug ?? '').trim();
  if (!slug) notFound();
  const page = parseMusicLibraryPageParam(params.page);
  if (!page) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const result = await fetchMusicLibraryGenreBestPage(admin, slug, page, musicLibraryCatalogFilter());
  if (!result) notFound();

  const autoplay = parseMusicLibraryAutoplayIndex(searchParams);
  const mc = isMcProduct();
  const nextPageHref =
    result.page < result.totalPages ? musicLibraryGenreBestDetailHref(result.slug, result.page + 1) : null;

  return (
    <div className="space-y-6">
      <header className="relative space-y-3">
        <p>
          <Link
            href={musicLibraryGenreBestHref()}
            className={mc ? 'text-sm text-gray-500 hover:text-gray-900' : 'text-sm text-gray-400 hover:text-white'}
          >
            ← Genre BEST
          </Link>
        </p>
        <div className="relative flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
              {result.title}
            </h1>
            {result.showGenreBestSubtitle ? (
              <p className={mc ? 'mt-1 text-sm text-emerald-700' : 'mt-1 text-sm text-emerald-400/90'}>
                Genre Best
              </p>
            ) : null}
            {result.styles.length > 0 ? (
              <p className={mc ? 'mt-1 text-sm text-gray-600' : 'mt-1 text-sm text-gray-400'}>
                {result.styles.join(', ')}
              </p>
            ) : null}
            <p className={mc ? 'mt-1 text-sm text-gray-600' : 'mt-1 text-sm text-gray-400'}>
              {result.totalItems} 曲 · {result.page} / {result.totalPages} ページ
            </p>
          </div>
        <MusicLibraryStyleAdminLink href={`/admin/genre-best/${encodeURIComponent(result.slug)}`} />
        </div>
      </header>
      {result.totalItems === 0 ? (
        <p className={mc ? 'text-sm text-gray-500' : 'text-sm text-gray-400'}>登録曲がありません。</p>
      ) : (
        <MusicLibrarySongList
          songs={result.cards}
          nextPageHref={nextPageHref}
          initialAutoplay={autoplay.autoplay}
          initialIndex={autoplay.index}
          listFooter={
            <MusicLibraryPagination
              page={result.page}
              totalPages={result.totalPages}
              hrefForPage={(n) => musicLibraryGenreBestDetailHref(result.slug, n)}
            />
          }
        />
      )}
    </div>
  );
}
