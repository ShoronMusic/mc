'use client';

import { LibraryArtistExternalLinkButtons } from '@/components/chat/LibraryArtistExternalLinkButtons';
import { LibraryArtistProfileSummary } from '@/components/chat/LibraryArtistProfileSummary';
import {
  buildLibraryArtistExternalLinks,
  formatLibraryArtistAgeLabel,
} from '@/lib/library-artist-public-display';

export type LibraryArtistDetailDbInfo = {
  name: string;
  name_ja: string | null;
  kind: string | null;
  origin_country: string | null;
  active_period: string | null;
  members: string | null;
  birth_date: string | null;
  death_date: string | null;
  image_url: string | null;
  profile_text: string | null;
  youtube_channel_url: string | null;
  youtube_channel_id: string | null;
  spotify_artist_id: string | null;
  wikipedia_page: string | null;
};

export function LibraryArtistDetailDbBody({ artist }: { artist: LibraryArtistDetailDbInfo }) {
  const links = buildLibraryArtistExternalLinks(artist);

  return (
    <div className="flex flex-col gap-2">
      <LibraryArtistProfileSummary
        imageUrl={artist.image_url}
        imageAlt={artist.name}
        nameJa={(artist.name_ja ?? '').trim() || null}
        ageLabel={formatLibraryArtistAgeLabel(artist.birth_date, artist.death_date)}
        kind={artist.kind}
        activePeriod={artist.active_period}
        members={artist.members}
      />
      <LibraryArtistExternalLinkButtons links={links} />
      {(artist.profile_text ?? '').trim() ? (
        <p className="border-t border-gray-700/60 pt-2 leading-relaxed text-gray-400">
          {artist.profile_text}
        </p>
      ) : null}
    </div>
  );
}
