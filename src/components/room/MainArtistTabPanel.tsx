'use client';

/**
 * メインアーティストタブ。管理画面のアーティスト情報カードに合わせた表示。
 */

import { useEffect, useMemo, useState } from 'react';
import { pickArtistPhotoUrl } from '@/lib/artist-photo-url';
import { isPersonLikeKind, shouldShowArtistMembersLine } from '@/lib/artist-members';
import { findLibraryMainArtistInIndex } from '@/lib/library-artist-index-match';
import {
  buildLibraryArtistExternalLinks,
  type LibraryArtistExternalLinks,
} from '@/lib/library-artist-public-display';
import {
  dedupeIdenticalBioParagraphs,
  formatArtistBorn,
  formatArtistDied,
  formatArtistDisplayName,
  formatMusic8ArtistDisplayLines,
  getMusic8ArtistJapaneseName,
  splitMusic8ArtistDescription,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { ReferencedMusicDataDisclaimer } from '@/components/room/ReferencedMusicDataDisclaimer';

type DbArtistInfo = {
  id?: string;
  name?: string | null;
  name_ja?: string | null;
  name_en?: string | null;
  the_prefix?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
  origin_country?: string | null;
  active_period?: string | null;
  members?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  image_url?: string | null;
  image_credit?: string | null;
  spotify_artist_images?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
  youtube_channel_url?: string | null;
  youtube_channel_id?: string | null;
  spotify_artist_id?: string | null;
  wikipedia_page?: string | null;
  memberArtists?: { name: string; music8_artist_slug?: string | null }[];
  bandArtists?: { name: string; music8_artist_slug?: string | null }[];
};

interface MainArtistTabPanelProps {
  artistName: string;
  songTitle: string | null;
  /** 索引にいるとき「ライブラリ」から部屋の選曲ライブラリを開く */
  onOpenLibraryForArtist?: (
    mainArtist: string,
    options?: { music8Artist?: Music8ArtistJson | null },
  ) => void;
}

function hasCjk(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(text);
}

function prettyOccupation(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (t === t.toLowerCase()) {
    return t.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return t;
}

function occupationFromDb(artist: DbArtistInfo | null): string | null {
  if (!artist) return null;
  const occ = Array.isArray(artist.occupations)
    ? artist.occupations.map((s) => s.trim()).filter(Boolean)
    : [];
  if (occ.length > 0) return occ.join(', ');
  const kind = (artist.kind ?? '').trim();
  return kind || null;
}

function music8ExternalLinks(artist: Music8ArtistJson | null): LibraryArtistExternalLinks {
  if (!artist) return { youtube: null, spotify: null, wikipedia: null };
  const lines = formatMusic8ArtistDisplayLines(artist);
  const raw = artist as Record<string, unknown>;
  const acf =
    raw.acf && typeof raw.acf === 'object' && !Array.isArray(raw.acf)
      ? (raw.acf as Record<string, unknown>)
      : {};
  const source = { ...raw, ...acf };
  return buildLibraryArtistExternalLinks({
    youtube_channel_url: lines.youtubeChannelHref,
    youtube_channel_id:
      (typeof source.youtube_channel === 'string' ? source.youtube_channel : null) ??
      (typeof source.youtube_channel_id === 'string' ? source.youtube_channel_id : null),
    spotify_artist_id:
      typeof source.spotify_artist_id === 'string' ? source.spotify_artist_id : null,
    wikipedia_page: typeof source.wikipedia_page === 'string' ? source.wikipedia_page : null,
  });
}

function memberNamesFromDisplay(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/\s*[,、]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function RelationNames({
  names,
  onSelect,
}: {
  names: string[];
  onSelect?: (name: string) => void;
}) {
  if (names.length === 0) return <span className="text-gray-500">—</span>;
  return (
    <span>
      {names.map((name, i) => (
        <span key={`${name}-${i}`}>
          {i > 0 ? '、' : null}
          {onSelect ? (
            <button
              type="button"
              className="text-sky-400 hover:underline"
              onClick={() => onSelect(name)}
            >
              {name}
            </button>
          ) : (
            <span className="text-sky-300">{name}</span>
          )}
        </span>
      ))}
    </span>
  );
}

function ExternalLinkPills({
  links,
  libraryLabel,
  onOpenLibrary,
}: {
  links: LibraryArtistExternalLinks;
  libraryLabel: string | null;
  onOpenLibrary?: () => void;
}) {
  const hasLinks = Boolean(links.wikipedia || links.spotify || links.youtube || libraryLabel);
  if (!hasLinks) return null;
  return (
    <div className="mt-auto flex flex-wrap gap-2 border-t border-gray-800 pt-3">
      {links.wikipedia ? (
        <a
          href={links.wikipedia}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-gray-600 bg-gray-950 px-2.5 py-1.5 text-xs text-sky-300 hover:border-sky-600"
        >
          Wikipedia
        </a>
      ) : null}
      {links.spotify ? (
        <a
          href={links.spotify}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-green-800/80 bg-green-950/40 px-2.5 py-1.5 text-xs text-green-200 hover:border-green-600"
        >
          Spotify
        </a>
      ) : null}
      {links.youtube ? (
        <a
          href={links.youtube}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-red-900/70 bg-red-950/30 px-2.5 py-1.5 text-xs text-red-200 hover:border-red-700"
        >
          YouTube
        </a>
      ) : null}
      {libraryLabel && onOpenLibrary ? (
        <button
          type="button"
          onClick={onOpenLibrary}
          className="rounded border border-lime-700/70 bg-lime-950/40 px-2.5 py-1.5 text-xs font-medium text-lime-100 hover:border-lime-500"
          title="ライブラリでこのアーティストの曲一覧を開く"
        >
          ライブラリ
        </button>
      ) : null}
    </div>
  );
}

export default function MainArtistTabPanel({
  artistName,
  songTitle,
  onOpenLibraryForArtist,
}: MainArtistTabPanelProps) {
  const [dbArtist, setDbArtist] = useState<DbArtistInfo | null>(null);
  const [music8, setMusic8] = useState<Music8ArtistJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [libraryMainArtist, setLibraryMainArtist] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName?.trim()) {
      setDbArtist(null);
      setMusic8(null);
      setLoading(false);
      setError(false);
      return;
    }
    const name = artistName.trim();
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const [infoRes, m8Res] = await Promise.all([
          fetch(`/api/library/artist-info?artist=${encodeURIComponent(name)}`, {
            credentials: 'include',
          }),
          fetch(`/api/music8/artist-by-name?artistName=${encodeURIComponent(name)}`, {
            credentials: 'include',
          }),
        ]);
        const infoJson = (await infoRes.json().catch(() => ({}))) as {
          artist?: DbArtistInfo | null;
          music8?: Music8ArtistJson | null;
        };
        const m8Json = (await m8Res.json().catch(() => ({}))) as {
          artist?: Music8ArtistJson | null;
        };
        if (cancelled) return;
        const nextDb = infoJson.artist ?? null;
        const nextM8 = infoJson.music8 ?? m8Json.artist ?? null;
        setDbArtist(nextDb);
        setMusic8(nextM8);
        setError(!nextDb && !nextM8);
      } catch {
        if (!cancelled) {
          setDbArtist(null);
          setMusic8(null);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  const m8Lines = useMemo(
    () => (music8 ? formatMusic8ArtistDisplayLines(music8) : null),
    [music8],
  );

  const englishDisplay = useMemo(() => {
    if (!music8) return '';
    return formatArtistDisplayName(
      music8.name,
      typeof music8.thePrefix === 'string' ? music8.thePrefix : undefined,
    );
  }, [music8]);

  useEffect(() => {
    if (!onOpenLibraryForArtist || (!dbArtist && !music8)) {
      setLibraryMainArtist(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/library/artists');
        const json = (await res.json().catch(() => null)) as {
          items?: { main_artist: string }[];
        } | null;
        if (!res.ok || cancelled) {
          if (!cancelled) setLibraryMainArtist(null);
          return;
        }
        const items = Array.isArray(json?.items) ? json!.items! : [];
        const found = findLibraryMainArtistInIndex(
          [
            artistName,
            (dbArtist?.name ?? '').trim(),
            (dbArtist?.name_ja ?? '').trim(),
            (dbArtist?.name_en ?? '').trim(),
            englishDisplay,
            m8Lines?.nameDisplay ?? '',
          ],
          items,
        );
        if (!cancelled) setLibraryMainArtist(found);
      } catch {
        if (!cancelled) setLibraryMainArtist(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistName, dbArtist, music8, englishDisplay, m8Lines?.nameDisplay, onOpenLibraryForArtist]);

  if (!artistName?.trim()) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center p-4 text-sm text-gray-500">
        再生中の曲のメインアーティストが取得できていません
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto p-3">
        <div className="animate-pulse overflow-hidden rounded-xl border border-gray-800 bg-gray-900/70">
          <div className="grid sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)]">
            <div className="aspect-[3/4] bg-gray-800/80" />
            <div className="space-y-2.5 p-4">
              <div className="h-7 w-44 rounded bg-gray-800" />
              <div className="h-4 w-20 rounded bg-gray-800/80" />
              <div className="h-3.5 w-28 rounded bg-gray-800/70" />
              <div className="h-3.5 w-40 rounded bg-gray-800/70" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || (!dbArtist && !music8)) {
    return (
      <div className="flex h-full flex-col gap-2 overflow-auto p-4 text-sm">
        <p className="font-medium text-gray-200">
          {artistName}
          {songTitle ? ` - ${songTitle}` : ''}
        </p>
        <p className="text-xs text-gray-500">登録が見つかりません</p>
        <ReferencedMusicDataDisclaimer />
      </div>
    );
  }

  const displayName =
    (dbArtist?.name
      ? formatArtistDisplayName(dbArtist.name, dbArtist.the_prefix)
      : '') ||
    englishDisplay ||
    (dbArtist?.name_en ?? '').trim() ||
    artistName.trim();
  const nameJa =
    (dbArtist?.name_ja ?? '').trim() ||
    (music8 ? getMusic8ArtistJapaneseName(music8) : null) ||
    '';
  const nameEn = (dbArtist?.name_en ?? '').trim();
  const origin = (dbArtist?.origin_country ?? '').trim() || (m8Lines?.origin ?? '').trim();
  const occupationRaw =
    occupationFromDb(dbArtist) || (m8Lines?.occupationDisplay ?? '').trim() || '';
  const occupation = occupationRaw ? prettyOccupation(occupationRaw) : '';
  const photoUrl =
    pickArtistPhotoUrl({
      image_url: dbArtist?.image_url,
      spotify_artist_images: dbArtist?.spotify_artist_images,
    }) ||
    m8Lines?.imageUrl ||
    null;
  const imageCredit = (dbArtist?.image_credit ?? '').trim();
  const active = (dbArtist?.active_period ?? '').trim() || (m8Lines?.activeYears ?? '').trim();
  const birthDisplay =
    (m8Lines?.bornFormatted ?? '').trim() ||
    formatArtistBorn(dbArtist?.birth_date ?? undefined, dbArtist?.death_date ?? undefined) ||
    '';
  const deathDisplay =
    (m8Lines?.diedFormatted ?? '').trim() ||
    formatArtistDied(dbArtist?.death_date ?? undefined, dbArtist?.birth_date ?? undefined) ||
    '';

  const memberLinks = (dbArtist?.memberArtists ?? [])
    .map((l) => (l.name ?? '').trim())
    .filter(Boolean);
  const bandLinks = (dbArtist?.bandArtists ?? [])
    .map((l) => (l.name ?? '').trim())
    .filter(Boolean);
  const membersFallback = memberNamesFromDisplay(
    (dbArtist?.members ?? '').trim() || (m8Lines?.memberDisplay ?? '').trim(),
  );
  const kindForMembers = (dbArtist?.kind ?? '').trim() || occupation;
  const showMembers =
    shouldShowArtistMembersLine({
      kind: kindForMembers,
      memberLinkCount: memberLinks.length,
      bandLinkCount: bandLinks.length,
      hasMembersFallback: membersFallback.length > 0,
    }) ||
    (!isPersonLikeKind(kindForMembers) &&
      bandLinks.length === 0 &&
      (memberLinks.length > 0 || membersFallback.length > 0));

  const m8Desc = splitMusic8ArtistDescription(
    typeof music8?.description === 'string' ? music8.description : '',
  );
  const dbProfile = (dbArtist?.profile_text ?? '').trim();
  const dbEn = (dbArtist?.description_en ?? '').trim();
  const fromDbProfile = splitMusic8ArtistDescription(dbProfile);
  const bioJa = dedupeIdenticalBioParagraphs(
    fromDbProfile.ja ||
      (dbProfile && hasCjk(dbProfile) && !fromDbProfile.en ? dbProfile : '') ||
      m8Desc.ja ||
      (m8Lines?.descriptionJa ?? '').trim() ||
      '',
  );
  const bioEn = dedupeIdenticalBioParagraphs(
    dbEn ||
      fromDbProfile.en ||
      (dbProfile && !hasCjk(dbProfile) ? dbProfile : '') ||
      m8Desc.en ||
      '',
  );
  const showBioEn = Boolean(bioEn && bioEn !== bioJa && !(bioJa && bioJa.includes(bioEn)));
  const showBioJa = Boolean(bioJa);

  const dbLinks = dbArtist
    ? buildLibraryArtistExternalLinks(dbArtist)
    : { youtube: null, spotify: null, wikipedia: null };
  const m8Links = music8ExternalLinks(music8);
  const links: LibraryArtistExternalLinks = {
    youtube: dbLinks.youtube || m8Links.youtube,
    spotify: dbLinks.spotify || m8Links.spotify,
    wikipedia: dbLinks.wikipedia || m8Links.wikipedia,
  };

  const openLibrary = libraryMainArtist && onOpenLibraryForArtist
    ? () => onOpenLibraryForArtist(libraryMainArtist, { music8Artist: music8 })
    : undefined;
  const selectRelated = onOpenLibraryForArtist
    ? (name: string) => onOpenLibraryForArtist(name)
    : undefined;

  return (
    <div className="h-full overflow-auto p-3 text-sm">
      <section className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)]">
        <div className="grid gap-0 sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)]">
          <div className="border-b border-gray-800 bg-black/40 sm:border-b-0 sm:border-r">
            {photoUrl ? (
              // Music8 / Spotify の外部 URL は next.config に remotePatterns が無いため img のまま
              // eslint-disable-next-line @next/next/no-img-element -- 動的外部ドメイン
              <img
                src={photoUrl}
                alt={displayName}
                className="aspect-[3/4] w-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex aspect-[3/4] min-h-[9rem] items-center justify-center bg-gray-950 text-xs text-gray-600">
                画像なし
              </div>
            )}
            {imageCredit ? (
              <p className="border-t border-gray-800 px-2.5 py-1.5 text-[10px] text-gray-500">
                {imageCredit}
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                  {displayName}
                </h2>
                {origin ? (
                  <span className="rounded border border-gray-600 bg-gray-950 px-1.5 py-0.5 text-[11px] font-medium text-gray-300">
                    {origin}
                  </span>
                ) : null}
              </div>
              {nameJa && nameJa !== displayName ? (
                <p className="mt-1 text-sm text-gray-300">{nameJa}</p>
              ) : null}
              {nameEn && nameEn !== displayName && nameEn !== nameJa ? (
                <p className="mt-0.5 text-xs text-gray-500">{nameEn}</p>
              ) : null}
            </div>

            <div className="space-y-1 text-sm text-gray-300">
              {occupation ? <p className="text-gray-200">{occupation}</p> : null}
              {active ? (
                <p>
                  <span className="text-gray-500">Active: </span>
                  {active}
                </p>
              ) : null}
              {birthDisplay ? (
                <p>
                  <span className="text-gray-500">Born: </span>
                  {birthDisplay}
                </p>
              ) : null}
              {deathDisplay ? (
                <p>
                  <span className="text-gray-500">Died: </span>
                  {deathDisplay}
                </p>
              ) : null}
              {bandLinks.length > 0 ? (
                <p>
                  <span className="text-gray-500">所属バンド: </span>
                  <RelationNames names={bandLinks} onSelect={selectRelated} />
                </p>
              ) : null}
              {showMembers ? (
                <p>
                  <span className="text-gray-500">Members: </span>
                  <RelationNames
                    names={memberLinks.length > 0 ? memberLinks : membersFallback}
                    onSelect={selectRelated}
                  />
                </p>
              ) : null}
            </div>

            <ExternalLinkPills
              links={links}
              libraryLabel={libraryMainArtist}
              onOpenLibrary={openLibrary}
            />
          </div>
        </div>

        {(showBioEn || showBioJa) && (
          <div className="space-y-2.5 border-t border-gray-800 px-3 py-3 text-sm leading-relaxed sm:px-4">
            {showBioEn ? (
              <p className="whitespace-pre-wrap text-gray-400">{bioEn}</p>
            ) : null}
            {showBioJa ? (
              <p className="whitespace-pre-wrap text-gray-200">{bioJa}</p>
            ) : null}
          </div>
        )}
      </section>
      <ReferencedMusicDataDisclaimer />
    </div>
  );
}
