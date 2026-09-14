import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MusicLibraryPagination } from '@/components/music-library/MusicLibraryPagination';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryStyleAdminLink } from '@/components/music-library/MusicLibraryStyleAdminLink';
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
  const showMembers = profile.showMembersLine;

  return (
    <div className="space-y-8">
      <header className="relative flex flex-col gap-4 pr-20 sm:flex-row">
        <MusicLibraryStyleAdminLink
          href={musicLibraryAdminArtistEditHref({ name: profile.name, slug: profile.slug })}
        />
        {profile.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.imageUrl}
            alt=""
            className="h-36 w-36 shrink-0 rounded-xl object-cover bg-gray-800"
          />
        ) : null}
        <div className="min-w-0 space-y-2">
          <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
            {profile.name}
          </h1>
          {profile.nameJa ? (
            <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
              {profile.nameJa}
              {profile.ageLabel ? ` · ${profile.ageLabel}` : ''}
            </p>
          ) : profile.ageLabel ? (
            <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>{profile.ageLabel}</p>
          ) : null}
          <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
            {[profile.kind, profile.originLabel, profile.activePeriod].filter(Boolean).join(' · ')}
          </p>
          {showMembers && profile.memberLinks.length > 0 ? (
            <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
              メンバー：
              {profile.memberLinks.map((m, i) => (
                <span key={`${m.name}-${i}`}>
                  {i > 0 ? '、' : null}
                  {m.slug ? (
                    <Link href={musicLibraryArtistHref(m.slug)} className={mc ? 'hover:underline' : 'text-sky-400 hover:underline'}>
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </span>
              ))}
            </p>
          ) : null}
          {profile.bandLinks.length > 0 ? (
            <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
              所属：
              {profile.bandLinks.map((m, i) => (
                <span key={`${m.name}-${i}`}>
                  {i > 0 ? '、' : null}
                  {m.slug ? (
                    <Link href={musicLibraryArtistHref(m.slug)} className={mc ? 'hover:underline' : 'text-sky-400 hover:underline'}>
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </span>
              ))}
            </p>
          ) : null}
          <p className="flex flex-wrap gap-3 text-sm">
            {profile.links.youtube ? (
              <a href={profile.links.youtube} target="_blank" rel="noreferrer" className={mc ? 'underline' : 'text-sky-400 underline'}>
                YouTube
              </a>
            ) : null}
            {profile.links.spotify ? (
              <a href={profile.links.spotify} target="_blank" rel="noreferrer" className={mc ? 'underline' : 'text-sky-400 underline'}>
                Spotify
              </a>
            ) : null}
            {profile.links.wikipedia ? (
              <a href={profile.links.wikipedia} target="_blank" rel="noreferrer" className={mc ? 'underline' : 'text-sky-400 underline'}>
                Wikipedia
              </a>
            ) : null}
          </p>
        </div>
      </header>
      {profile.profileText ? (
        <p className={mc ? 'whitespace-pre-wrap text-sm leading-relaxed text-gray-700' : 'whitespace-pre-wrap text-sm leading-relaxed text-gray-300'}>
          {profile.profileText}
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className={mc ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-white'}>
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
