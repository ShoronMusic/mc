import Link from 'next/link';
import { notFound } from 'next/navigation';
import { compareDisplayTitleCaseInsensitive } from '@/lib/admin-library-index';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryArtistIndex,
  filterMusicLibraryArtistsByLetter,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { musicLibraryArtistLetterParam } from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

type Props = { params: { letter: string } };

export default async function MusicLibraryArtistLetterPage({ params }: Props) {
  const letter = musicLibraryArtistLetterParam(params.letter ?? '');
  const raw = (params.letter ?? '').trim().toLowerCase();
  if (raw !== letter) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const { items } = await fetchMusicLibraryArtistIndex(admin, musicLibraryCatalogFilter());
  const filtered = filterMusicLibraryArtistsByLetter(items, letter).sort((a, b) =>
    compareDisplayTitleCaseInsensitive(a.name, b.name),
  );
  const mc = isMcProduct();
  const title = letter === 'other' ? '#' : letter.toUpperCase();

  return (
    <div className="space-y-6">
      <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
        Artists · {title}
      </h1>
      {filtered.length === 0 ? (
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>アーティストがありません。</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border border-gray-800">
          {filtered.map((it) => (
            <li key={`${it.slug}-${it.name}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <Link
                href={it.href}
                className={mc ? 'font-medium text-gray-900 hover:underline' : 'font-medium text-gray-100 hover:text-amber-200 hover:underline'}
              >
                {it.name}
              </Link>
              <span className="text-xs text-gray-500">{it.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
