import Link from 'next/link';
import { IS_MC_PRODUCT, librarySortChipBtnClass } from '@/lib/product-branding';
import type { MusicLibraryArtistIndexEntry } from '@/lib/music-library-query';
import {
  type MusicLibraryArtistLetterDir,
  type MusicLibraryArtistLetterSort,
} from '@/lib/music-library-artist-letter-sort';
import { musicLibraryArtistLetterHref, musicLibraryArtistsHref } from '@/lib/music-library-urls';
import { MUSIC8_NAV_STYLE_LABELS, music8NavStyleColor } from '@/lib/music8-catalog-slugs';
import { MusicLibraryArtistThumb } from '@/components/music-library/MusicLibraryArtistThumb';

const SORT_CHIPS: Array<{ sort: MusicLibraryArtistLetterSort; dir: MusicLibraryArtistLetterDir; label: string }> = [
  { sort: 'abc', dir: 'asc', label: 'ABC ↑' },
  { sort: 'abc', dir: 'desc', label: 'ABC ↓' },
  { sort: 'songs', dir: 'desc', label: '曲数 ↓' },
  { sort: 'songs', dir: 'asc', label: '曲数 ↑' },
  { sort: 'active', dir: 'desc', label: '活動開始 ↓' },
  { sort: 'active', dir: 'asc', label: '活動開始 ↑' },
];

const originBadge = IS_MC_PRODUCT
  ? 'shrink-0 rounded border border-gray-300 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-600'
  : 'shrink-0 rounded border border-gray-600 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-300';

export function MusicLibraryArtistLetterList({
  items,
  letter,
  sort,
  dir,
  query,
}: {
  items: MusicLibraryArtistIndexEntry[];
  letter?: string | null;
  sort: MusicLibraryArtistLetterSort;
  dir: MusicLibraryArtistLetterDir;
  query?: string;
}) {
  const q = query?.trim() ?? '';
  const hrefForSort = (chip: (typeof SORT_CHIPS)[number]) =>
    q
      ? musicLibraryArtistsHref({ q, page: 1, sort: chip.sort, dir: chip.dir })
      : musicLibraryArtistLetterHref(letter || 'a', 1, { sort: chip.sort, dir: chip.dir });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="並び替え">
        <span className="mr-1 text-[11px] text-gray-500">並び替え</span>
        {SORT_CHIPS.map((chip) => {
          const active = sort === chip.sort && dir === chip.dir;
          return (
            <Link
              key={`${chip.sort}-${chip.dir}`}
              href={hrefForSort(chip)}
              aria-current={active ? 'true' : undefined}
              className={`inline-block ${librarySortChipBtnClass(active)}`}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>
      <ul
        className={
          IS_MC_PRODUCT
            ? 'divide-y divide-gray-200/70 overflow-hidden rounded-xl border border-gray-200'
            : 'divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08]'
        }
      >
        {items.map((it, i) => {
          const styleColor = music8NavStyleColor(it.styleSlug);
          const styleLabel =
            it.styleSlug && it.styleSlug in MUSIC8_NAV_STYLE_LABELS
              ? MUSIC8_NAV_STYLE_LABELS[it.styleSlug as keyof typeof MUSIC8_NAV_STYLE_LABELS]
              : null;
          return (
            <li
              key={`${it.slug}-${it.name}`}
              className={`flex items-stretch gap-2 pr-4 ${
                i % 2 === 0
                  ? IS_MC_PRODUCT
                    ? 'bg-gray-50'
                    : 'bg-white/[0.04]'
                  : IS_MC_PRODUCT
                    ? 'bg-white'
                    : 'bg-transparent'
              }`}
            >
              <span
                className="w-[5px] shrink-0 self-stretch"
                style={{ backgroundColor: styleColor ?? 'transparent' }}
                title={styleLabel ?? undefined}
                aria-label={styleLabel ?? undefined}
                aria-hidden={!styleLabel}
              />
              <Link
                href={it.href}
                className={`grid min-w-0 flex-1 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-2.5 ${
                  it.imageUrl ? 'py-1.5' : 'py-1'
                }`}
              >
                <MusicLibraryArtistThumb url={it.imageUrl} />
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={
                      IS_MC_PRODUCT
                        ? 'truncate font-medium text-gray-900 hover:underline'
                        : 'truncate font-medium text-gray-100 decoration-white/25 hover:text-amber-200 hover:underline'
                    }
                  >
                    {it.name}
                  </span>
                  {it.originLabel ? <span className={originBadge}>{it.originLabel}</span> : null}
                </span>
              </Link>
              <span className="flex shrink-0 items-center text-xs text-gray-500">{it.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
