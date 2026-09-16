import Link from 'next/link';
import { IS_MC_PRODUCT, librarySortChipBtnClass } from '@/lib/product-branding';
import type { MusicLibraryGenreIndexEntry } from '@/lib/music-library-genre-index';
import {
  type MusicLibraryArtistLetterDir,
  type MusicLibraryArtistLetterSort,
} from '@/lib/music-library-artist-letter-sort';
import { musicLibraryGenreLetterHref, musicLibraryGenresHref } from '@/lib/music-library-urls';
import { musicLibraryGenreBarColor } from '@/lib/music-library-artist-charts';

const SORT_CHIPS: Array<{ sort: MusicLibraryArtistLetterSort; dir: MusicLibraryArtistLetterDir; label: string }> = [
  { sort: 'abc', dir: 'asc', label: 'ABC ↑' },
  { sort: 'abc', dir: 'desc', label: 'ABC ↓' },
  { sort: 'songs', dir: 'desc', label: '曲数 ↓' },
  { sort: 'songs', dir: 'asc', label: '曲数 ↑' },
];

export function MusicLibraryGenreLetterList({
  items,
  letter,
  sort,
  dir,
  query,
}: {
  items: MusicLibraryGenreIndexEntry[];
  letter?: string | null;
  sort: MusicLibraryArtistLetterSort;
  dir: MusicLibraryArtistLetterDir;
  query?: string;
}) {
  const q = query?.trim() ?? '';
  const hrefForSort = (chip: (typeof SORT_CHIPS)[number]) =>
    q
      ? musicLibraryGenresHref({ q, page: 1, sort: chip.sort, dir: chip.dir })
      : musicLibraryGenreLetterHref(letter || 'a', 1, { sort: chip.sort, dir: chip.dir });
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
        {items.map((it, i) => (
          <li
            key={it.slug}
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
              style={{ backgroundColor: musicLibraryGenreBarColor(it.name) }}
              aria-hidden
            />
            <Link href={it.href} className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2">
              <span className="min-w-0 flex-1">
                <span
                  className={
                    IS_MC_PRODUCT
                      ? 'block truncate font-medium text-gray-900 hover:underline'
                      : 'block truncate font-medium text-gray-100 decoration-white/25 hover:text-amber-200 hover:underline'
                  }
                >
                  {it.name}
                </span>
                {it.nameJa ? (
                  <span className={IS_MC_PRODUCT ? 'block truncate text-xs text-gray-500' : 'block truncate text-xs text-gray-500'}>
                    {it.nameJa}
                  </span>
                ) : null}
              </span>
            </Link>
            <span className="flex shrink-0 items-center text-xs text-gray-500">{it.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
