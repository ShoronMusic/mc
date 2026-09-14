import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryStyleAdminLink } from '@/components/music-library/MusicLibraryStyleAdminLink';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibrarySongDetail,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { isMusicLibraryReservedSlug, musicLibraryAdminSongEditHref, musicLibraryArtistHref } from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = { params: { artistSlug: string; songSlug: string } };

export default async function MusicLibrarySongPage({ params }: Props) {
  const artistSlug = (params.artistSlug ?? '').trim().toLowerCase();
  const songSlug = (params.songSlug ?? '').trim().toLowerCase();
  if (!artistSlug || !songSlug || isMusicLibraryReservedSlug(artistSlug)) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const song = await fetchMusicLibrarySongDetail(
    admin,
    artistSlug,
    songSlug,
    musicLibraryCatalogFilter(),
  );
  if (!song) notFound();
  const mc = isMcProduct();
  const year = (song.releaseDate ?? '').slice(0, 4);

  return (
    <div className="space-y-8">
      <header className="relative space-y-2 pr-20">
        <MusicLibraryStyleAdminLink href={musicLibraryAdminSongEditHref(song.id)} />
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
          {song.artistHref ? (
            <Link href={song.artistHref} className={mc ? 'hover:underline' : 'text-sky-400 hover:underline'}>
              {song.artistName}
            </Link>
          ) : (
            song.artistName
          )}
        </p>
        <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
          {song.songTitle}
        </h1>
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
          {[year && /^\d{4}$/.test(year) ? year : null, song.styleLabel, song.vocal].filter(Boolean).join(' · ')}
        </p>
      </header>

      <MusicLibrarySongList songs={[song]} loop={false} hideList />

      {song.artistHref ? (
        <p className="text-sm">
          <Link href={musicLibraryArtistHref(artistSlug)} className={mc ? 'underline' : 'text-amber-400/90 underline'}>
            {song.artistName} の曲一覧
          </Link>
        </p>
      ) : null}
    </div>
  );
}
