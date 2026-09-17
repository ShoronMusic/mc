import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import { MusicLibraryWeeklyChartsIndex } from '@/components/music-library/MusicLibraryWeeklyChartsIndex';
import {
  fetchMusicLibraryWeeklyChartIndex,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { isMcProduct } from '@/lib/product-mode';

export default async function MusicLibraryChartsPage() {
  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const { items, tableMissing } = await fetchMusicLibraryWeeklyChartIndex(
    admin,
    musicLibraryCatalogFilter(),
  );
  if (tableMissing) return <MusicLibraryUnavailable />;

  const mc = isMcProduct();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
          Charts
        </h1>
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
          US（火曜更新）と UK（金曜更新）の週間チャート Top 10
        </p>
      </header>
      <MusicLibraryWeeklyChartsIndex items={items} />
    </div>
  );
}
