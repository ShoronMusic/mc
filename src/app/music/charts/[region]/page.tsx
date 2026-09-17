import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MusicLibrarySongList } from '@/components/music-library/MusicLibrarySongList';
import { MusicLibraryStyleAdminLink } from '@/components/music-library/MusicLibraryStyleAdminLink';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  fetchMusicLibraryWeeklyChartPage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { musicLibraryChartsHref, parseMusicLibraryAutoplayIndex } from '@/lib/music-library-urls';
import { isMcProduct } from '@/lib/product-mode';
import { isWeeklyChartRegion } from '@/lib/weekly-charts';

type Props = {
  params: { region: string };
  searchParams?: { autoplay?: string | string[]; i?: string | string[] };
};

export default async function MusicLibraryWeeklyChartPage({ params, searchParams }: Props) {
  const regionRaw = (params.region ?? '').trim().toLowerCase();
  if (!isWeeklyChartRegion(regionRaw)) notFound();

  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const { page, tableMissing } = await fetchMusicLibraryWeeklyChartPage(
    admin,
    regionRaw,
    musicLibraryCatalogFilter(),
  );
  if (tableMissing) return <MusicLibraryUnavailable />;
  if (!page) notFound();

  const autoplay = parseMusicLibraryAutoplayIndex(searchParams);
  const mc = isMcProduct();

  return (
    <div className="space-y-6">
      <header className="relative space-y-3">
        <p>
          <Link
            href={musicLibraryChartsHref()}
            className={mc ? 'text-sm text-gray-500 hover:text-gray-900' : 'text-sm text-gray-400 hover:text-white'}
          >
            ← Charts
          </Link>
        </p>
        <div className="relative flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
              {page.title}
            </h1>
            <p className={mc ? 'mt-1 text-sm text-emerald-700' : 'mt-1 text-sm text-emerald-400/90'}>
              {page.subtitle}
            </p>
            <p className={mc ? 'mt-1 text-sm text-gray-600' : 'mt-1 text-sm text-gray-400'}>
              {page.chartWeekLabel}
              {page.cards.length > 0 ? ` · ${page.cards.length} 曲` : ''}
            </p>
          </div>
          <MusicLibraryStyleAdminLink href="/admin/weekly-charts" />
        </div>
      </header>
      {page.cards.length === 0 ? (
        <p className={mc ? 'text-sm text-gray-500' : 'text-sm text-gray-400'}>
          公開できる登録曲がありません。
        </p>
      ) : (
        <MusicLibrarySongList
          songs={page.cards}
          groupByYear={false}
          initialAutoplay={autoplay.autoplay}
          initialIndex={autoplay.index}
        />
      )}
    </div>
  );
}
