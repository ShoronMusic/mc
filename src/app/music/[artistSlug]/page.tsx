import { notFound } from 'next/navigation';
import { MusicLibraryArtistCharts } from '@/components/music-library/MusicLibraryArtistCharts';
import { MusicLibraryArtistHero } from '@/components/music-library/MusicLibraryArtistHero';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryArtistPage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import {
  isMusicLibraryReservedSlug,
  musicLibraryAdminArtistEditHref,
  musicLibraryArtistHref,
  parseMusicLibraryAutoplayIndex,
  parseMusicLibraryPageParam,
} from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = {
  params: { artistSlug: string; page?: string };
  searchParams?: { autoplay?: string | string[]; i?: string | string[] };
};

export default async function MusicLibraryArtistPage({ params, searchParams }: Props) {
  const slug = (params.artistSlug ?? '').trim().toLowerCase();
  if (!slug || isMusicLibraryReservedSlug(slug)) notFound();
  const page = params.page ? parseMusicLibraryPageParam(params.page) : 1;
  if (!page) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const result = await fetchMusicLibraryArtistPage(admin, slug, page, musicLibraryCatalogFilter());
  if (!result) notFound();

  const autoplay = parseMusicLibraryAutoplayIndex(searchParams);
  const mc = isMcProduct();
  const { profile } = result;
  const nextPageHref =
    result.page < result.totalPages ? musicLibraryArtistHref(profile.slug, result.page + 1) : null;

  return (
    <div className="space-y-8">
      <MusicLibraryArtistHero
        profile={profile}
        adminEditHref={musicLibraryAdminArtistEditHref({ name: profile.name, slug: profile.slug })}
      />
      <MusicLibraryArtistCharts charts={result.charts} />

      <section className="space-y-4">
        <h2 className={mc ? 'text-lg font-semibold tracking-tight text-gray-900' : 'text-lg font-semibold tracking-tight text-white'}>
          Songs
          <span className="ml-2 text-sm font-normal text-gray-500">
            {result.totalItems} 曲 · {result.page} / {result.totalPages}
          </span>
        </h2>
        <MusicLibrarySongList
          songs={result.cards}
          nextPageHref={nextPageHref}
          initialAutoplay={autoplay.autoplay}
          initialIndex={autoplay.index}
          pageArtist={{ slug: profile.slug, name: profile.name }}
          listFooter={
            <MusicLibraryPagination
              page={result.page}
              totalPages={result.totalPages}
              hrefForPage={(n) => musicLibraryArtistHref(profile.slug, n)}
            />
          }
        />
      </section>
    </div>
  );
}
