import Link from 'next/link';
import {
  genreBestTabParam,
  genreBestTabsEqual,
  type GenreBestListItem,
  type GenreBestTabKey,
} from '@/lib/catalog-genre-best';
import { musicLibraryGenreBestDetailHref, musicLibraryGenreBestHref } from '@/lib/music-library-urls';
import { music8NavStyleColor, music8NavStyleSlugFromName } from '@/lib/music8-catalog-slugs';
import { isMcProduct } from '@/lib/product-mode';

function playlistStyleColor(styles: string[]): string | null {
  for (const name of styles) {
    const color = music8NavStyleColor(music8NavStyleSlugFromName(name));
    if (color) return color;
  }
  return null;
}

export function MusicLibraryGenreBestIndex({
  items,
  tabs,
  activeTab,
}: {
  items: GenreBestListItem[];
  tabs: Array<{ key: GenreBestTabKey; label: string }>;
  activeTab: GenreBestTabKey;
}) {
  const mc = isMcProduct();
  const firstTab = tabs[0]?.key ?? 'genre';
  const hrefForTab = (key: GenreBestTabKey) =>
    genreBestTabsEqual(key, firstTab)
      ? musicLibraryGenreBestHref()
      : musicLibraryGenreBestHref(genreBestTabParam(key));

  const tabClass = (active: boolean) =>
    mc
      ? active
        ? 'rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white'
        : 'rounded-full px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      : active
        ? 'rounded-full bg-emerald-900/50 px-3 py-1 text-sm font-medium text-emerald-100 ring-1 ring-emerald-700/60'
        : 'rounded-full px-3 py-1 text-sm text-gray-400 hover:bg-gray-900 hover:text-gray-200';

  const rowClass = mc
    ? 'flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-gray-400'
    : 'flex items-stretch overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40 hover:border-gray-600';
  const titleClass = mc ? 'truncate font-medium text-gray-900' : 'truncate font-medium text-gray-100';
  const metaClass = mc ? 'truncate text-xs text-gray-500' : 'truncate text-xs text-gray-400';
  const countClass = mc ? 'shrink-0 text-xs tabular-nums text-gray-500' : 'shrink-0 text-xs tabular-nums text-gray-400';

  return (
    <div className="space-y-4">
      {tabs.length > 0 ? (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Genre BEST タブ">
          {tabs.map((tab) => {
            const active = genreBestTabsEqual(tab.key, activeTab);
            return (
              <Link
                key={String(tab.key)}
                href={hrefForTab(tab.key)}
                role="tab"
                aria-selected={active}
                className={tabClass(active)}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ) : null}
      <p className={mc ? 'text-xs text-gray-500 tabular-nums' : 'text-xs text-gray-500 tabular-nums'}>
        {items.length} リスト
      </p>
      {items.length === 0 ? (
        <p className={mc ? 'text-sm text-gray-500' : 'text-sm text-gray-400'}>
          このタブに該当する Genre BEST はありません。
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const styleColor = playlistStyleColor(item.styles);
            return (
              <li key={item.id}>
                <Link href={musicLibraryGenreBestDetailHref(item.slug, 1)} className={rowClass}>
                  <span
                    className="w-[5px] shrink-0 self-stretch"
                    style={{ backgroundColor: styleColor ?? 'transparent' }}
                    aria-hidden
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 pr-3">
                    <span className="min-w-0 flex-1">
                      <span className={titleClass}>{item.title}</span>
                      <span className={`mt-0.5 block ${metaClass}`}>
                        {item.styles.length > 0 ? item.styles.join(', ') : 'Genre'}
                      </span>
                    </span>
                    <span className={countClass}>{item.songCount} 曲</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
