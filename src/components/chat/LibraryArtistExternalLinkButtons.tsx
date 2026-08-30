'use client';

import type { LibraryArtistExternalLinks } from '@/lib/library-artist-public-display';

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
