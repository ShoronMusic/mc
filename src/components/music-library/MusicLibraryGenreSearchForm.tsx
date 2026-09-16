import Link from 'next/link';
import {
  libraryHeaderSearchBtnClass,
  libraryHeaderSecondaryBtnClass,
  librarySearchInputClass,
} from '@/lib/product-branding';
import { musicLibraryGenresHref } from '@/lib/music-library-urls';

export function MusicLibraryGenreSearchForm({ query = '' }: { query?: string }) {
  const q = query.trim();
  return (
    <form
      action={musicLibraryGenresHref()}
      method="get"
      className="flex min-w-0 w-full items-center gap-2"
      role="search"
      aria-label="ジャンル検索"
    >
      <label className="sr-only" htmlFor="music-library-genre-q">
        ジャンル名
      </label>
      <input
        id="music-library-genre-q"
        type="search"
        name="q"
        defaultValue={q}
        placeholder="ジャンル名で検索"
        autoComplete="off"
        className={librarySearchInputClass(false)}
      />
      <div className="flex shrink-0 items-center gap-2">
        <button type="submit" className={libraryHeaderSearchBtnClass(false)}>
          検索
        </button>
        {q ? (
          <Link href={musicLibraryGenresHref()} className={libraryHeaderSecondaryBtnClass(false)}>
            リセット
          </Link>
        ) : (
          <button type="reset" className={libraryHeaderSecondaryBtnClass(false)}>
            リセット
          </button>
        )}
      </div>
    </form>
  );
}
