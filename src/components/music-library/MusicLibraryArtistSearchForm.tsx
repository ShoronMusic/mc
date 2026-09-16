import Link from 'next/link';
import {
  libraryHeaderSearchBtnClass,
  libraryHeaderSecondaryBtnClass,
  librarySearchInputClass,
} from '@/lib/product-branding';
import { musicLibraryArtistsHref } from '@/lib/music-library-urls';

export function MusicLibraryArtistSearchForm({ query = '' }: { query?: string }) {
  const q = query.trim();
  return (
    <form
      action={musicLibraryArtistsHref()}
      method="get"
      className="flex min-w-0 w-full items-center gap-2"
      role="search"
      aria-label="アーティスト検索"
    >
      <label className="sr-only" htmlFor="music-library-artist-q">
        アーティスト名
      </label>
      <input
        id="music-library-artist-q"
        type="search"
        name="q"
        defaultValue={q}
        placeholder="アーティスト名で検索"
        autoComplete="off"
        className={librarySearchInputClass(false)}
      />
      <div className="flex shrink-0 items-center gap-2">
        <button type="submit" className={libraryHeaderSearchBtnClass(false)}>
          検索
        </button>
        {q ? (
          <Link href={musicLibraryArtistsHref()} className={libraryHeaderSecondaryBtnClass(false)}>
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
