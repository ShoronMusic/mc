'use client';

import type { ReactNode } from 'react';
import { shouldShowArtistMembersLine } from '@/lib/artist-members';
import { formatLibraryArtistNameJaWithAge } from '@/lib/library-artist-public-display';

export type LibraryArtistNavLink = {
  name: string;
  music8_artist_slug?: string | null;
};

function ArtistRelationLine({
  label,
  links,
  fallbackText,
  onSelectArtist,
  hrefFor,
}: {
  label: string;
  links: LibraryArtistNavLink[] | undefined;
  fallbackText: string | null;
  onSelectArtist?: (name: string) => void;
  hrefFor?: (link: LibraryArtistNavLink) => string;
}) {
  const items = (links ?? []).filter((l) => (l.name ?? '').trim());
  if (items.length > 0) {
    return (
      <p className="text-gray-400">
        {label}：
        {items.map((link, i) => {
          const name = link.name.trim();
          return (
            <span key={`${name}-${i}`}>
              {i > 0 ? '、' : null}
              {onSelectArtist ? (
                <button
                  type="button"
                  className="text-sky-400 hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectArtist(name);
                  }}
                >
                  {name}
                </button>
              ) : hrefFor ? (
                <a href={hrefFor(link)} className="text-sky-400 hover:underline">
                  {name}
                </a>
              ) : (
                name
              )}
            </span>
          );
        })}
      </p>
    );
  }
  if ((fallbackText ?? '').trim()) {
    return (
      <p className="text-gray-400">
        {label}：{fallbackText}
      </p>
    );
  }
  return null;
}

export function LibraryArtistProfileSummary({
  imageUrl,
  imageAlt = '',
  nameJa,
  ageLabel,
  kind,
  activePeriod,
  members,
  memberLinks,
  bandLinks,
  onSelectArtist,
  hrefFor,
  extraMeta,
}: {
  imageUrl: string | null;
  imageAlt?: string;
  nameJa: string | null;
  ageLabel: string | null;
  kind: string | null;
  activePeriod: string | null;
  members: string | null;
  memberLinks?: LibraryArtistNavLink[];
  bandLinks?: LibraryArtistNavLink[];
  onSelectArtist?: (name: string) => void;
  hrefFor?: (link: LibraryArtistNavLink) => string;
  extraMeta?: ReactNode;
}) {
  const nameJaWithAge = formatLibraryArtistNameJaWithAge(nameJa, ageLabel);

  return (
    <div className="flex flex-col gap-2">
      {(imageUrl ?? '').trim() ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl as string}
          alt={imageAlt}
          className="aspect-square w-full rounded object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="min-w-0 space-y-1 text-gray-300">
        {nameJaWithAge ? <p className="text-gray-100">{nameJaWithAge}</p> : null}
        {(kind ?? '').trim() ? <p className="lowercase text-gray-400">{kind}</p> : null}
        {(activePeriod ?? '').trim() ? <p className="text-gray-400">{activePeriod}</p> : null}
        {(bandLinks ?? []).length > 0 ? (
          <ArtistRelationLine
            label="所属バンド"
            links={bandLinks}
            fallbackText={null}
            onSelectArtist={onSelectArtist}
            hrefFor={hrefFor}
          />
        ) : null}
        {shouldShowArtistMembersLine({
          kind,
          memberLinkCount: (memberLinks ?? []).filter((l) => (l.name ?? '').trim()).length,
          bandLinkCount: (bandLinks ?? []).filter((l) => (l.name ?? '').trim()).length,
          hasMembersFallback: Boolean((members ?? '').trim()),
        }) ? (
          <ArtistRelationLine
            label="メンバー"
            links={memberLinks}
            fallbackText={members}
            onSelectArtist={onSelectArtist}
            hrefFor={hrefFor}
          />
        ) : null}
        {extraMeta}
      </div>
    </div>
  );
}
