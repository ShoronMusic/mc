import Link from 'next/link';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryStyleSummaries,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { musicLibraryStyleHref } from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';

export default async function MusicLibraryStylesPage() {
  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const summaries = await fetchMusicLibraryStyleSummaries(admin, musicLibraryCatalogFilter());
  const mc = isMcProduct();

  return (
    <div className="space-y-6">
      <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>Styles</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {summaries.map((s) => (
          <li key={s.slug}>
            <Link
              href={musicLibraryStyleHref(s.slug, 1)}
              className={
                mc
                  ? 'flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-400'
                  : 'flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 hover:border-gray-600'
              }
            >
              <span className="font-medium">{s.name}</span>
              <span className={mc ? 'text-sm text-gray-500' : 'text-sm text-gray-400'}>{s.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
