'use client';

import { LibraryArtistExternalLinkButtons } from '@/components/chat/LibraryArtistExternalLinkButtons';
import { LibraryArtistProfileSummary } from '@/components/chat/LibraryArtistProfileSummary';
import {
  formatMusic8ArtistDisplayLines,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import {
  buildLibraryArtistExternalLinks,
  formatLibraryArtistAgeLabel,
  type LibraryArtistExternalLinks,
} from '@/lib/library-artist-public-display';

/** ライブラリ「アーティスト詳細」列用（DB 未整備時は Music8 GCS JSON を表示） */
export function LibraryArtistDetailMusic8Body({
  artist,
  dbRegistered = false,
  externalLinks,
}: {
  artist: Music8ArtistJson;
  dbRegistered?: boolean;
  externalLinks?: LibraryArtistExternalLinks | null;
}) {
  const lines = formatMusic8ArtistDisplayLines(artist);
  const raw = artist as Record<string, unknown>;
  const acf =
    raw.acf && typeof raw.acf === 'object' && !Array.isArray(raw.acf)
      ? (raw.acf as Record<string, unknown>)
      : {};
  const source = { ...raw, ...acf };

  const nameJa =
    typeof source.artistjpname === 'string' && /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(source.artistjpname)
      ? source.artistjpname.trim()
      : /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(lines.nameDisplay)
        ? lines.nameDisplay
        : null;
  const links =
    externalLinks ??
    buildLibraryArtistExternalLinks({
      youtube_channel_id:
        (typeof source.youtube_channel === 'string' ? source.youtube_channel : null) ??
        (typeof source.youtube_channel_id === 'string' ? source.youtube_channel_id : null),
      spotify_artist_id:
        typeof source.spotify_artist_id === 'string' ? source.spotify_artist_id : null,
      wikipedia_page:
        typeof source.wikipedia_page === 'string' ? source.wikipedia_page : null,
    });
  const birthRaw = typeof source.artistborn === 'string' ? source.artistborn : null;
  const deathRaw = typeof source.artistdied === 'string' ? source.artistdied : null;
  const ageLabel = formatLibraryArtistAgeLabel(birthRaw, deathRaw);

  return (
    <div className="flex flex-col gap-2">
      <LibraryArtistProfileSummary
        imageUrl={lines.imageUrl}
        nameJa={nameJa}
        ageLabel={ageLabel}
        kind={lines.occupationDisplay || null}
        activePeriod={lines.activeYears || null}
        members={lines.memberDisplay || null}
        extraMeta={
          lines.bornFormatted && !ageLabel ? (
            <p className="text-gray-400">{lines.bornFormatted}</p>
          ) : lines.diedFormatted ? (
            <p className="text-gray-400">{lines.diedFormatted}</p>
          ) : null
        }
      />
      <LibraryArtistExternalLinkButtons links={links} />
      {lines.descriptionJa ? (
        <p className="border-t border-gray-700/60 pt-2 leading-relaxed text-gray-400">
          {lines.descriptionJa}
        </p>
      ) : null}
      <p className="text-[10px] text-gray-500">
        {dbRegistered ? '参照: Music8（DB プロフィール未整備）' : '参照: Music8（曲マスタ未登録のため）'}
      </p>
    </div>
  );
}
