'use client';

import type { ReactNode } from 'react';
import { formatLibraryArtistNameJaWithAge } from '@/lib/library-artist-public-display';

export function LibraryArtistProfileSummary({
  imageUrl,
  imageAlt = '',
  nameJa,
  ageLabel,
  kind,
  activePeriod,
  members,
  extraMeta,
}: {
  imageUrl: string | null;
  imageAlt?: string;
  nameJa: string | null;
  ageLabel: string | null;
  kind: string | null;
  activePeriod: string | null;
  members: string | null;
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
        {(members ?? '').trim() ? <p className="text-gray-400">メンバー：{members}</p> : null}
        {extraMeta}
      </div>
    </div>
  );
}
