import Link from 'next/link';
import { IS_MC_PRODUCT } from '@/lib/product-branding';
import {
  visibleMusicLibraryGenreBestLabels,
  type MusicLibraryGenreBestLabel,
} from '@/lib/music-library-types';
import { musicLibraryGenreBestDetailHref } from '@/lib/music-library-urls';

/** 曲一覧の Genre BEST 登録ラベル。プレイリスト詳細へリンクする。 */
export function MusicLibraryGenreBestLabels({
  labels,
  omitSlug,
  className = '',
}: {
  labels: readonly MusicLibraryGenreBestLabel[] | undefined;
  /** いま開いている Genre BEST 自身は出さない */
  omitSlug?: string | null;
  className?: string;
}) {
  const shown = visibleMusicLibraryGenreBestLabels(labels, omitSlug);
  if (shown.length === 0) return null;
  const chipClass = IS_MC_PRODUCT
    ? 'max-w-[12rem] truncate rounded border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-medium leading-none text-amber-800 hover:bg-amber-100'
    : 'max-w-[12rem] truncate rounded border border-amber-400/45 bg-amber-400/15 px-1.5 py-px text-[10px] font-medium leading-none text-amber-200 hover:border-amber-300/70 hover:bg-amber-400/25 hover:text-amber-100';
  return (
    <span className={`inline-flex max-w-full shrink-0 flex-wrap items-center gap-1 ${className}`}>
      {shown.map((lb) => (
        <Link
          key={lb.slug}
          href={musicLibraryGenreBestDetailHref(lb.slug)}
          title={`Genre BEST: ${lb.title}`}
          className={chipClass}
        >
          {lb.title}
        </Link>
      ))}
    </span>
  );
}
