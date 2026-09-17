import Link from 'next/link';
import { musicLibraryWeeklyChartHref } from '@/lib/music-library-urls';
import type { MusicLibraryWeeklyChartIndexItem } from '@/lib/music-library-query';
import { isMcProduct } from '@/lib/product-mode';

export function MusicLibraryWeeklyChartsIndex({ items }: { items: MusicLibraryWeeklyChartIndexItem[] }) {
  const mc = isMcProduct();
  const rowClass = mc
    ? 'flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-gray-400'
    : 'flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 hover:border-gray-600';
  const titleClass = mc ? 'font-medium text-gray-900' : 'font-medium text-gray-100';
  const metaClass = mc ? 'mt-0.5 text-xs text-gray-500' : 'mt-0.5 text-xs text-gray-400';
  const countClass = mc ? 'shrink-0 text-xs tabular-nums text-gray-500' : 'shrink-0 text-xs tabular-nums text-gray-400';
  const mutedRow = mc
    ? 'flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/60 px-4 py-3'
    : 'flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-900/20 px-4 py-3';

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        if (!item.available) {
          return (
            <li key={item.region} className={mutedRow}>
              <div className="min-w-0">
                <p className={titleClass}>{item.title}</p>
                <p className={metaClass}>{item.subtitle} · まだ公開していません</p>
              </div>
            </li>
          );
        }
        return (
          <li key={item.region}>
            <Link href={musicLibraryWeeklyChartHref(item.region)} className={rowClass}>
              <span className="min-w-0">
                <span className={`block ${titleClass}`}>{item.title}</span>
                <span className={`block ${metaClass}`}>
                  {item.subtitle}
                  {item.chartWeekLabel ? ` · ${item.chartWeekLabel}` : ''}
                </span>
              </span>
              <span className={countClass}>{item.songCount} 曲</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
