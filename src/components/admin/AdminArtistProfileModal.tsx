'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LibrarySongByArtistItem } from '@/app/api/library/songs-by-artist/route';
import { AdminYoutubePlayerWithVolume } from '@/components/admin/AdminYoutubePlayerWithVolume';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { normalizeCatalogGenreName } from '@/lib/admin-song-artist-defaults';
import { isLibraryArtistInfoSparse } from '@/lib/library-artist-info-display';
import {
  buildLibraryArtistExternalLinks,
  formatLibraryArtistAgeLabel,
  formatLibraryArtistNameJaWithAge,
  formatLibraryOriginCountry,
  type LibraryArtistExternalLinks,
} from '@/lib/library-artist-public-display';
import { libraryEffectiveReleaseDateForSort } from '@/lib/library-release-sort-date';
import {
  dedupeIdenticalBioParagraphs,
  formatArtistBorn,
  formatArtistDied,
  formatMusic8ArtistDisplayLines,
  getMusic8ArtistJapaneseName,
  splitMusic8ArtistDescription,
  type Music8ArtistJson,
} from '@/lib/music8-artist-display';
import { pickArtistPhotoUrl } from '@/lib/artist-photo-url';
import { isSelectionRegisteredArtistPendingWp } from '@/lib/artist-selection-registered-pending';
import { AdminNewArtistBadge } from '@/components/admin/AdminNewArtistBadge';
import {
  GenreBestRegisteredLabelLinks,
  useGenreBestLabelsBySongIds,
} from '@/components/admin/GenreBestRegisteredLabels';

type DbArtist = {
  id?: string;
  name: string;
  name_ja?: string | null;
  name_en?: string | null;
  music8_artist_slug?: string | null;
  music8_artist_id?: number | null;
  music8_synced_at?: string | null;
  kind?: string | null;
  occupations?: string[] | null;
  origin_country?: string | null;
  active_period?: string | null;
  members?: string | null;
  image_url?: string | null;
  spotify_artist_images?: string | null;
  profile_text?: string | null;
  description_en?: string | null;
  ai_profile_generated_at?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  youtube_channel_url?: string | null;
  youtube_channel_id?: string | null;
  youtube_channel?: string | null;
  spotify_artist_id?: string | null;
  wikipedia_page?: string | null;
  wikipedia_url?: string | null;
  memberArtists?: { name: string; music8_artist_slug?: string | null }[];
  bandArtists?: { name: string; music8_artist_slug?: string | null }[];
};

type Props = {
  artistName: string;
  currentSongId: string;
  modalEmbed?: boolean;
  onClose: () => void;
};

function hasCjk(text: string): boolean {
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(text);
}

function music8PublicArtistUrl(slug: string | null | undefined): string | null {
  const s = (slug ?? '').trim();
  return s ? `https://www.music8.jp/${encodeURIComponent(s)}/1` : null;
}

function releaseYear(song: LibrarySongByArtistItem): string {
  const d = libraryEffectiveReleaseDateForSort({
    originalReleaseDate: song.original_release_date,
    youtubePublishedAt: song.youtube_published_at,
  });
  return d && /^\d{4}/.test(d) ? d.slice(0, 4) : '年不明';
}

function releaseMonthLabel(song: LibrarySongByArtistItem): string | null {
  const d = libraryEffectiveReleaseDateForSort({
    originalReleaseDate: song.original_release_date,
    youtubePublishedAt: song.youtube_published_at,
  });
  if (!d || d.length < 7) return d ? d.slice(0, 4) : null;
  return `${d.slice(0, 4)}.${d.slice(5, 7)}`;
}

function formatGenreLine(raw: string | null, style: string | null): string | null {
  const parts = (raw ?? '')
    .split(/[,/、]/)
    .map((x) => normalizeCatalogGenreName(x))
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }
  if (unique.length > 0) return unique.slice(0, 3).join(' / ');
  const st = (style ?? '').trim();
  return st || null;
}

function groupSongsByYear(songs: LibrarySongByArtistItem[]): { year: string; songs: LibrarySongByArtistItem[] }[] {
  const map = new Map<string, LibrarySongByArtistItem[]>();
  for (const s of songs) {
    const year = releaseYear(s);
    const arr = map.get(year) ?? [];
    arr.push(s);
    map.set(year, arr);
  }
  return [...map.entries()]
    .sort((a, b) => {
      if (a[0] === '年不明') return 1;
      if (b[0] === '年不明') return -1;
      return b[0].localeCompare(a[0]);
    })
    .map(([year, list]) => ({ year, songs: list }));
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
      typeof source.youtube_channel === 'string' ? source.youtube_channel : null,
    spotify_artist_id:
      typeof source.spotify_artist_id === 'string' ? source.spotify_artist_id : null,
    wikipedia_page: typeof source.wikipedia_page === 'string' ? source.wikipedia_page : null,
    wikipedia_url: typeof source.wikipedia_url === 'string' ? source.wikipedia_url : null,
  });
}

export function AdminArtistProfileModal({
  artistName,
  currentSongId,
  modalEmbed = false,
  onClose,
}: Props) {
  const [dbArtist, setDbArtist] = useState<DbArtist | null>(null);
  const [music8, setMusic8] = useState<Music8ArtistJson | null>(null);
  const [songs, setSongs] = useState<LibrarySongByArtistItem[]>([]);
  const [playing, setPlaying] = useState<LibrarySongByArtistItem | null>(null);
  const [playerMsg, setPlayerMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const name = artistName.trim();
    if (!name) {
      setLoading(false);
      setError('アーティスト名がありません。');
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [infoRes, songsRes, m8Res] = await Promise.all([
          fetch(`/api/library/artist-info?artist=${encodeURIComponent(name)}`, {
            credentials: 'include',
          }),
          fetch(`/api/library/songs-by-artist?artist=${encodeURIComponent(name)}&sort=release`, {
            credentials: 'include',
          }),
          fetch(`/api/music8/artist-by-name?artistName=${encodeURIComponent(name)}`, {
            credentials: 'include',
          }),
        ]);
        const infoJson = (await infoRes.json().catch(() => ({}))) as {
          artist?: DbArtist | null;
          music8?: Music8ArtistJson | null;
          error?: string;
        };
        const songsJson = (await songsRes.json().catch(() => ({}))) as {
          items?: LibrarySongByArtistItem[];
          error?: string;
        };
        const m8Json = (await m8Res.json().catch(() => ({}))) as {
          artist?: Music8ArtistJson | null;
        };
        if (cancelled) return;
        if (!infoRes.ok && !songsRes.ok && !m8Res.ok) {
          setError(infoJson.error || songsJson.error || 'アーティスト情報の取得に失敗しました。');
          return;
        }
        setDbArtist(infoJson.artist ?? null);
        setMusic8(infoJson.music8 ?? m8Json.artist ?? null);
        setSongs(Array.isArray(songsJson.items) ? songsJson.items : []);
        if (!infoRes.ok) {
          setError(infoJson.error || 'アーティスト情報の一部を取得できませんでした。');
        }
      } catch {
        if (!cancelled) setError('アーティスト情報の取得に失敗しました。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  const m8Lines = useMemo(() => (music8 ? formatMusic8ArtistDisplayLines(music8) : null), [music8]);
  const useMusic8 = Boolean(music8) && isLibraryArtistInfoSparse(dbArtist);

  const imageUrl =
    pickArtistPhotoUrl({
      image_url: dbArtist?.image_url,
      spotify_artist_images: dbArtist?.spotify_artist_images,
    }) ||
    m8Lines?.imageUrl ||
    null;
  const displayName = (dbArtist?.name ?? '').trim() || m8Lines?.nameDisplay || artistName;
  const isNewArtist = dbArtist ? isSelectionRegisteredArtistPendingWp(dbArtist) : false;
  const nameJa =
    (dbArtist?.name_ja ?? '').trim() ||
    (music8 ? getMusic8ArtistJapaneseName(music8) : null) ||
    null;
  const birthRaw = (() => {
    const fromDb = (dbArtist?.birth_date ?? '').trim();
    if (fromDb) return fromDb;
    if (!music8) return '';
    const raw = music8 as Record<string, unknown>;
    const acf =
      raw.acf && typeof raw.acf === 'object' && !Array.isArray(raw.acf)
        ? (raw.acf as Record<string, unknown>)
        : {};
    const source = { ...raw, ...acf };
    return typeof source.artistborn === 'string' ? source.artistborn.trim() : '';
  })();
  const deathRaw = (() => {
    const fromDb = (dbArtist?.death_date ?? '').trim();
    if (fromDb) return fromDb;
    if (!music8) return '';
    const raw = music8 as Record<string, unknown>;
    const acf =
      raw.acf && typeof raw.acf === 'object' && !Array.isArray(raw.acf)
        ? (raw.acf as Record<string, unknown>)
        : {};
    const source = { ...raw, ...acf };
    return typeof source.artistdied === 'string' ? source.artistdied.trim() : '';
  })();
  const ageLabel = formatLibraryArtistAgeLabel(birthRaw || null, deathRaw || null);
  const bornFormatted =
    (m8Lines?.bornFormatted ?? '').trim() ||
    formatArtistBorn(birthRaw || undefined, deathRaw || undefined) ||
    null;
  const diedFormatted =
    (m8Lines?.diedFormatted ?? '').trim() ||
    formatArtistDied(deathRaw || undefined, birthRaw || undefined) ||
    null;
  const origin =
    formatLibraryOriginCountry(dbArtist?.origin_country) ||
    (m8Lines?.origin ?? '').trim() ||
    null;
  const kind = (dbArtist?.kind ?? '').trim() || (m8Lines?.occupationDisplay ?? '').trim() || null;
  const activeRaw = (dbArtist?.active_period ?? '').trim() || (m8Lines?.activeYears ?? '').trim() || null;
  const active = activeRaw ? (activeRaw.match(/ -$/) ? `${activeRaw} /` : activeRaw) : null;
  const memberLinks = (dbArtist?.memberArtists ?? []).filter((l) => (l.name ?? '').trim());
  const bandLinks = (dbArtist?.bandArtists ?? []).filter((l) => (l.name ?? '').trim());
  const membersFallback = (dbArtist?.members ?? '').trim() || (m8Lines?.memberDisplay ?? '').trim() || null;
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
  const dbLinks = dbArtist ? buildLibraryArtistExternalLinks(dbArtist) : { youtube: null, spotify: null, wikipedia: null };
  const m8Links = music8ExternalLinks(music8);
  const links: LibraryArtistExternalLinks = {
    youtube: dbLinks.youtube || m8Links.youtube,
    spotify: dbLinks.spotify || m8Links.spotify,
    wikipedia: dbLinks.wikipedia || m8Links.wikipedia,
  };
  const slug = (dbArtist?.music8_artist_slug ?? music8?.slug ?? '').trim() || null;
  const music8Page = music8PublicArtistUrl(slug);
  const grouped = useMemo(() => groupSongsByYear(songs), [songs]);
  const genreBestLabelsBySong = useGenreBestLabelsBySongIds(songs.map((s) => s.id));
  const songHref = (id: string) =>
    modalEmbed ? `/admin/songs/${id}?modal=1` : `/admin/songs/${id}`;
  const highlightedId = playing?.id ?? currentSongId;

  function playSong(song: LibrarySongByArtistItem) {
    const vid = (song.video_id ?? '').trim();
    if (!vid) {
      setPlaying(null);
      setPlayerMsg('この曲に YouTube 動画がありません。');
      return;
    }
    setPlayerMsg(null);
    setPlaying(song);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-artist-profile-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-800 px-4 py-2.5">
          <h3 id="admin-artist-profile-title" className="min-w-0 truncate text-sm font-semibold text-gray-100">
            アーティスト情報
            <span className="ml-2 font-normal text-gray-400">{displayName}</span>
            {isNewArtist ? (
              <span className="ml-2 inline-block align-middle">
                <AdminNewArtistBadge />
              </span>
            ) : null}
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            {dbArtist?.id ? (
              <Link
                href={`/admin/domestic-artist-register/${dbArtist.id}`}
                className="rounded border border-emerald-700/80 bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50"
              >
                アーティストを編集
              </Link>
            ) : (
              <Link
                href={`/admin/domestic-artist-register/new?name=${encodeURIComponent(displayName)}&autoload=1`}
                className="rounded border border-emerald-700/80 bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-900/50"
              >
                アーティストを編集
              </Link>
            )}
            {music8Page ? (
              <a
                href={music8Page}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-400 hover:underline"
              >
                Music8
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-800"
            >
              閉じる
            </button>
          </div>
        </div>

        {playing?.video_id ? (
          <div className="shrink-0 border-b border-gray-800 bg-gray-950 px-4 py-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-xs text-gray-200">
                {(playing.song_title ?? playing.display_title ?? '再生中').trim()}
              </p>
              <button
                type="button"
                onClick={() => setPlaying(null)}
                className="shrink-0 rounded border border-gray-600 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
              >
                再生を閉じる
              </button>
            </div>
            <AdminYoutubePlayerWithVolume videoId={playing.video_id} className="mx-auto max-w-lg" />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm">
          {loading ? (
            <p className="text-gray-500">読み込み中…</p>
          ) : error && !dbArtist && !music8 && songs.length === 0 ? (
            <p className="text-red-400">{error}</p>
          ) : (
            <>
              {playerMsg ? (
                <p className="mb-3 text-xs text-amber-200">{playerMsg}</p>
              ) : null}

              <section className="flex flex-col gap-4 sm:flex-row">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={displayName}
                    className="h-44 w-44 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded bg-gray-900 text-xs text-gray-600">
                    画像なし
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1.5 text-gray-300">
                  <p className="flex flex-wrap items-center gap-2 text-xl font-semibold text-white">
                    <span>{displayName}</span>
                    {isNewArtist ? <AdminNewArtistBadge /> : null}
                  </p>
                  {origin ? <p className="text-xs text-gray-400">{origin}</p> : null}
                  {nameJa && nameJa.toLowerCase() !== displayName.toLowerCase() ? (
                    <p className="text-gray-200">
                      {bornFormatted || !ageLabel
                        ? nameJa
                        : formatLibraryArtistNameJaWithAge(nameJa, ageLabel)}
                    </p>
                  ) : null}
                  {bornFormatted ? (
                    <p className="text-gray-400">生年月日: {bornFormatted}</p>
                  ) : ageLabel && !(nameJa && nameJa.toLowerCase() !== displayName.toLowerCase()) ? (
                    <p className="text-gray-200">{ageLabel}</p>
                  ) : null}
                  {diedFormatted ? <p className="text-gray-400">{diedFormatted}</p> : null}
                  {kind ? <p className="lowercase text-gray-400">{kind}</p> : null}
                  {active ? <p>Active: {active}</p> : null}
                  {bandLinks.length > 0 ? (
                    <p>
                      所属バンド：
                      {bandLinks.map((l, i) => (
                        <span key={`${l.name}-${i}`}>
                          {i > 0 ? '、' : null}
                          {l.name}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {memberLinks.length > 0 ? (
                    <p>
                      Members:{' '}
                      {memberLinks.map((l, i) => (
                        <span key={`${l.name}-${i}`}>
                          {i > 0 ? '、' : null}
                          {l.name}
                        </span>
                      ))}
                    </p>
                  ) : membersFallback ? (
                    <p>Members: {membersFallback}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
                    {links.wikipedia ? (
                      <a
                        href={links.wikipedia}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/svg/logo_wikipedia.svg" alt="" width={14} height={14} className="h-3.5 w-3.5 invert" />
                        Wikipedia
                      </a>
                    ) : null}
                    {links.spotify ? (
                      <a
                        href={links.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/svg/spotify.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                        Spotify
                      </a>
                    ) : null}
                    {links.youtube ? (
                      <a
                        href={links.youtube}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/svg/youtube.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                        YouTube
                      </a>
                    ) : null}
                  </div>
                  {useMusic8 ? (
                    <p className="text-[10px] text-gray-500">参照: Music8（DB プロフィール未整備）</p>
                  ) : null}
                </div>
              </section>

              {showBioEn || showBioJa ? (
                <div className="mt-4 space-y-3 border-t border-gray-800 pt-3">
                  {showBioEn ? (
                    <p className="whitespace-pre-wrap leading-relaxed text-gray-400">{bioEn}</p>
                  ) : null}
                  {showBioJa ? (
                    <p className="whitespace-pre-wrap leading-relaxed text-gray-200">{bioJa}</p>
                  ) : null}
                </div>
              ) : null}

              <section className="mt-5 border-t border-gray-800 pt-4">
                <h4 className="text-sm font-semibold text-amber-200">
                  曲一覧
                  {songs.length > 0 ? (
                    <span className="ml-2 text-xs font-normal text-gray-500">（{songs.length}）</span>
                  ) : null}
                </h4>
                {songs.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">このアーティストの曲はまだありません。</p>
                ) : (
                  grouped.map((g) => (
                    <div key={g.year} className="mt-3">
                      <p className="mb-1.5 text-xs font-semibold text-gray-400">{g.year}</p>
                      <ul className="space-y-1.5">
                        {g.songs.map((s) => {
                          const title = (s.song_title ?? s.display_title ?? '—').trim();
                          const month = releaseMonthLabel(s);
                          const genres = formatGenreLine(s.genres, s.style);
                          const current = s.id === highlightedId;
                          return (
                            <li key={s.id}>
                              <div
                                className={`flex items-center gap-3 rounded px-1.5 py-1.5 ${
                                  current ? 'bg-emerald-950/40 ring-1 ring-emerald-800/70' : ''
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => playSong(s)}
                                  className="shrink-0 rounded hover:opacity-90"
                                  title={s.video_id ? 'モーダル内で再生' : 'YouTube なし'}
                                  aria-label={`${title} を再生`}
                                >
                                  <SongCoverThumb
                                    spotifyImages={s.spotify_images}
                                    videoId={s.video_id}
                                    alt=""
                                    className="h-12 w-12"
                                  />
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <Link
                                      href={songHref(s.id)}
                                      className="min-w-0 truncate text-sm text-gray-100 hover:underline"
                                    >
                                      {title}
                                    </Link>
                                    <GenreBestRegisteredLabelLinks
                                      labels={genreBestLabelsBySong[s.id]}
                                      className="shrink-0 text-[11px] text-gray-400"
                                    />
                                  </div>
                                  <Link
                                    href={songHref(s.id)}
                                    className="block truncate text-[11px] text-gray-500 hover:underline"
                                  >
                                    {(s.main_artist ?? displayName).trim()}
                                    {month ? ` · ${month}` : ''}
                                    {genres ? ` (${genres})` : ''}
                                  </Link>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
