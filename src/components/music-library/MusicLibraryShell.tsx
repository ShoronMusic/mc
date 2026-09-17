import Link from 'next/link';
import type { ReactNode } from 'react';
import { isMcProduct } from '@/lib/product-mode';
import {
  musicLibraryArtistsHref,
  musicLibraryChartsHref,
  musicLibraryGenreBestHref,
  musicLibraryGenresHref,
  musicLibraryHomeHref,
  musicLibraryStylesHref,
} from '@/lib/music-library-urls';

const NAV = [
  { href: musicLibraryHomeHref(), label: 'Home' },
  { href: musicLibraryStylesHref(), label: 'Styles' },
  { href: musicLibraryArtistsHref(), label: 'Artists' },
  { href: musicLibraryGenresHref(), label: 'Genres' },
  { href: musicLibraryGenreBestHref(), label: 'Genre BEST' },
  { href: musicLibraryChartsHref(), label: 'Charts' },
] as const;

export function MusicLibraryShell({ children }: { children: ReactNode }) {
  const mc = isMcProduct();
  return (
    <div className={mc ? 'min-h-screen bg-[var(--mc-bg-page)] text-gray-900' : 'min-h-screen bg-gray-950 text-gray-100'}>
      <header
        className={
          mc
            ? 'border-b border-gray-200 bg-white/80'
            : 'border-b border-gray-800 bg-gray-900/70'
        }
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/"
              className={mc ? 'text-sm text-gray-500 hover:text-gray-900' : 'text-sm text-gray-400 hover:text-white'}
            >
              ← チャット
            </Link>
            <Link href={musicLibraryHomeHref()} className="text-sm font-semibold tracking-wide">
              Music Library
            </Link>
            <nav className="flex flex-wrap gap-3 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={mc ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer
        className={
          mc
            ? 'border-t border-gray-200 px-4 py-6 text-center text-xs text-gray-500'
            : 'border-t border-gray-800 px-4 py-6 text-center text-xs text-gray-500'
        }
      >
        <p>
          連続再生は YouTube 埋め込みです。部屋の選曲とは連動しません。{' '}
          <Link href="/guide/music" className={mc ? 'underline hover:text-gray-800' : 'underline hover:text-gray-300'}>
            曲・コメントの注意
          </Link>
        </p>
      </footer>
    </div>
  );
}
