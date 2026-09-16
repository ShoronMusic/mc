import Link from 'next/link';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryStyleSummaries,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { musicLibraryStyleHref } from '@/lib/music-library-urls';
import { music8NavStyleColor } from '@/lib/music8-catalog-slugs';
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
        {summaries.map((s) => {
          const styleColor = music8NavStyleColor(s.slug);
          return (
            <li key={s.slug}>
              <Link
                href={musicLibraryStyleHref(s.slug, 1)}
                className={
                  mc
                    ? 'flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-gray-400'
                    : 'flex items-stretch overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40 hover:border-gray-600'
                }
              >
                <span
                  className="w-[5px] shrink-0 self-stretch"
                  style={{ backgroundColor: styleColor ?? 'transparent' }}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pl-2 pr-4">
                  <span className="font-medium">{s.name}</span>
                  <span className={mc ? 'text-sm text-gray-500' : 'text-sm text-gray-400'}>{s.count}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
