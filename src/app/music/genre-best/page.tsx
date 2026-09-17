import { MusicLibraryGenreBestIndex } from '@/components/music-library/MusicLibraryGenreBestIndex';
import { MusicLibraryUnavailable } from '@/components/music-library/MusicLibraryStatus';
import {
  buildGenreBestTabGroups,
  filterGenreBestByTab,
  genreBestTabsEqual,
  parseGenreBestTabKey,
} from '@/lib/catalog-genre-best';
import { fetchMusicLibraryGenreBestList, getMusicLibraryAdmin, musicLibraryCatalogFilter } from '@/lib/music-library-query';
import { isMcProduct } from '@/lib/product-mode';

type Props = {
  searchParams?: { tab?: string | string[] };
};

function firstQuery(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function MusicLibraryGenreBestPage({ searchParams }: Props) {
  const admin = getMusicLibraryAdmin();
  if (!admin) return <MusicLibraryUnavailable />;

  const { items, tableMissing } = await fetchMusicLibraryGenreBestList(admin, musicLibraryCatalogFilter());
  if (tableMissing) return <MusicLibraryUnavailable />;

  const tabs = buildGenreBestTabGroups(items);
  const requested = parseGenreBestTabKey(firstQuery(searchParams?.tab));
  const activeTab = tabs.some((t) => genreBestTabsEqual(t.key, requested))
    ? requested
    : (tabs[0]?.key ?? 'genre');
  const visible = filterGenreBestByTab(items, activeTab);
  const mc = isMcProduct();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className={mc ? 'text-2xl font-bold text-gray-900' : 'text-2xl font-bold text-white'}>
          Genre BEST
        </h1>
        <p className={mc ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
          ジャンル／スタイル別のおすすめ曲リスト
        </p>
      </header>
      <MusicLibraryGenreBestIndex items={visible} tabs={tabs} activeTab={activeTab} />
    </div>
  );
}
