'use client';

import type { LibraryArtistExternalLinks } from '@/lib/library-artist-public-display';
import { IS_MC_PRODUCT } from '@/lib/product-branding';

const LINK_CLASS =
  'inline-flex max-w-full items-center gap-2 text-sky-400 hover:text-sky-300 hover:underline';

const ICON_CLASS = 'h-4 w-4 shrink-0';

type LinkItem = {
  key: 'wikipedia' | 'spotify' | 'youtube';
  href: string;
  icon: string;
  label: string;
};

export function LibraryArtistExternalLinkButtons({
  links,
}: {
  links: LibraryArtistExternalLinks;
}) {
  const items: LinkItem[] = [];
  if (links.youtube) {
    items.push({
      key: 'youtube',
      href: links.youtube,
      icon: '/svg/youtube.svg',
      label: 'YouTube Channel',
    });
  }
  if (links.spotify) {
    items.push({
      key: 'spotify',
      href: links.spotify,
      icon: '/svg/spotify.svg',
      label: 'Spotify',
    });
  }
  if (links.wikipedia) {
    items.push({
      key: 'wikipedia',
      href: links.wikipedia,
          icon: '/svg/logo_wikipedia.svg',
          label: 'Wikipedia',
    });
  }
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
          aria-label={`${item.label}（別タブ）`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.icon}
            alt=""
            width={16}
            height={16}
            className={item.key === 'wikipedia' ? `${ICON_CLASS} invert` : ICON_CLASS}
          />
          <span className="min-w-0 break-words">{item.label}</span>
        </a>
      ))}
    </div>
  );
}

/** 管理画面 `/admin/library/artist` と同じ色付きラベル。順は YouTube → Spotify → Wikipedia。 */
export function LibraryArtistExternalLinkPills({
  links,
}: {
  links: LibraryArtistExternalLinks;
}) {
  const pills: { key: string; href: string; label: string; className: string }[] = [];
  if (links.youtube) {
    pills.push({
      key: 'youtube',
      href: links.youtube,
      label: 'YouTube',
      className: IS_MC_PRODUCT
        ? 'rounded border border-red-100 bg-red-50/60 px-1.5 py-px text-[10px] leading-tight text-red-400 hover:border-red-300'
        : 'rounded border border-red-900/40 bg-red-950/15 px-1.5 py-px text-[10px] leading-tight text-red-300/70 hover:border-red-800/60 hover:text-red-300',
    });
  }
  if (links.spotify) {
    pills.push({
      key: 'spotify',
      href: links.spotify,
      label: 'Spotify',
      className: IS_MC_PRODUCT
        ? 'rounded border border-green-100 bg-green-50/60 px-1.5 py-px text-[10px] leading-tight text-green-500 hover:border-green-300'
        : 'rounded border border-green-900/40 bg-green-950/15 px-1.5 py-px text-[10px] leading-tight text-green-300/70 hover:border-green-800/60 hover:text-green-300',
    });
  }
  if (links.wikipedia) {
    pills.push({
      key: 'wikipedia',
      href: links.wikipedia,
      label: 'Wikipedia',
      className: IS_MC_PRODUCT
        ? 'rounded border border-gray-200 bg-white px-1.5 py-px text-[10px] leading-tight text-sky-500 hover:border-sky-300'
        : 'rounded border border-gray-700/80 bg-gray-950/40 px-1.5 py-px text-[10px] leading-tight text-sky-400/60 hover:border-gray-600 hover:text-sky-400',
    });
  }
  if (pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((pill) => (
        <a
          key={pill.key}
          href={pill.href}
          target="_blank"
          rel="noopener noreferrer"
          className={pill.className}
        >
          {pill.label}
        </a>
      ))}
    </div>
  );
}
