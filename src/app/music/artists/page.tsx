import Link from 'next/link';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryArtistIndex,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { musicLibraryArtistLetterHref, musicLibraryArtistLetterParam } from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

export default async function MusicLibraryArtistsPage() {
  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const { items } = await fetchMusicLibraryArtistIndex(admin, musicLibraryCatalogFilter());
  const mc = isMcProduct();
  const letters = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
    'other',
  ];

  return (
    <div className="space-y-6">
      <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>Artists</h1>
      <ul className="flex flex-wrap gap-2">
        {letters.map((letter) => {
          const count = items.filter((it) => musicLibraryArtistLetterParam(it.indexLetter) === musicLibraryArtistLetterParam(letter)).length;
          const label = letter === 'other' ? '#' : letter;
          return (
            <li key={letter}>
              <Link
                href={musicLibraryArtistLetterHref(letter)}
                className={
                  mc
                    ? 'inline-flex min-w-[2.25rem] items-center justify-center rounded border border-gray-200 bg-white px-2 py-1 text-sm hover:border-gray-400'
                    : 'inline-flex min-w-[2.25rem] items-center justify-center rounded border border-gray-800 bg-gray-900/40 px-2 py-1 text-sm hover:border-gray-600'
                }
              >
                {label}
                <span className={mc ? 'ml-1 text-xs text-gray-500' : 'ml-1 text-xs text-gray-500'}>{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
