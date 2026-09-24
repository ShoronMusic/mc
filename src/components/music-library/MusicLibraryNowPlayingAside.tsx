'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { IS_MC_PRODUCT } from '@/lib/product-branding';
import { LibraryArtistExternalLinkPills } from '@/components/chat/LibraryArtistExternalLinkButtons';
import { MusicLibraryGenreBestLabels } from '@/components/music-library/MusicLibraryGenreBestLabels';
import { MusicLibraryStyleAdminLink } from '@/components/music-library/MusicLibraryStyleAdminLink';
import { formatMusicLibraryActivePeriod, formatMusicLibraryAgeParen, formatMusicLibraryOriginLabel, formatMusicLibraryYearMonth } from '@/lib/music-library-labels';
import type { MusicLibraryArtistProfile, MusicLibraryListArtist, MusicLibrarySongCard } from '@/lib/music-library-types';
import {
  musicLibraryNowPlayingArtistTabs,
  type MusicLibraryPageArtistRef,
} from '@/lib/music-library-now-playing-tabs';
import {
  isMusicLibraryNavStyleSlug,
  musicLibraryAdminArtistEditHref,
  musicLibraryAdminSongEditHref,
  musicLibraryArtistHref,
  musicLibraryStyleHref,
} from '@/lib/music-library-urls';

type Tab = { id: string; label: string; artist?: MusicLibraryListArtist };

const profileCache = new Map<string, MusicLibraryArtistProfile | null>();

function listArtists(song: MusicLibrarySongCard): MusicLibraryListArtist[] {
  if (song.artists?.length) return song.artists;
  return [{ name: song.artistName, href: song.artistHref, slug: song.artistSlug, originLabel: null }];
}

function artistCacheKey(artist: MusicLibraryListArtist): string {
  return (artist.slug || artist.name).trim().toLowerCase();
}

function tabsForSong(song: MusicLibrarySongCard, pageArtist?: MusicLibraryPageArtistRef | null): Tab[] {
  const seen = new Set<string>();
  const artistTabs: Tab[] = [];
  for (const artist of musicLibraryNowPlayingArtistTabs(listArtists(song), pageArtist)) {
    const key = artistCacheKey(artist);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    artistTabs.push({ id: `artist:${key}`, label: artist.name, artist });
  }
  return [{ id: 'song', label: 'SONG DATA' }, ...artistTabs];
}

function vocalBadge(label: 'F' | 'M'): string {
  const base = IS_MC_PRODUCT
    ? 'shrink-0 rounded border border-gray-300 px-1 py-px text-[10px] font-normal leading-none text-gray-600'
    : 'shrink-0 rounded border border-gray-600 px-1 py-px text-[10px] font-normal leading-none text-gray-300';
  if (label === 'F') {
    return IS_MC_PRODUCT ? `${base} bg-rose-100` : `${base} bg-rose-500/25`;
  }
  return IS_MC_PRODUCT ? `${base} bg-sky-100` : `${base} bg-sky-500/25`;
}

export function MusicLibraryNowPlayingAside({
  song,
  pageArtist = null,
  omitGenreBestSlug = null,
}: {
  song: MusicLibrarySongCard;
  pageArtist?: MusicLibraryPageArtistRef | null;
  omitGenreBestSlug?: string | null;
}) {
  const tabs = useMemo(() => tabsForSong(song, pageArtist), [song, pageArtist]);
  const [tabId, setTabId] = useState('song');

  useEffect(() => {
    setTabId('song');
  }, [song.id]);

  const active = tabs.some((t) => t.id === tabId) ? tabId : 'song';
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0]!;

  const titleClass = IS_MC_PRODUCT
    ? 'font-medium text-gray-900 hover:underline'
    : 'font-medium text-gray-100 hover:text-amber-200 hover:underline';
  const artistClass = IS_MC_PRODUCT
    ? 'text-sm text-gray-600 hover:underline'
    : 'text-sm text-gray-400 hover:text-sky-300 hover:underline';
  const originBadge = IS_MC_PRODUCT
    ? 'shrink-0 rounded border border-gray-300 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-600'
    : 'shrink-0 rounded border border-gray-600 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-300';
  const muted = IS_MC_PRODUCT ? 'text-[11px] text-gray-600' : 'text-[11px] text-gray-400';
  const shell = IS_MC_PRODUCT
    ? 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white md:h-full'
    : 'flex min-h-0 flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60 md:h-full';
  const tabIdle = IS_MC_PRODUCT ? 'text-gray-500 hover:text-gray-800' : 'text-gray-500 hover:text-gray-200';
  const tabActive = IS_MC_PRODUCT
    ? 'border-b-2 border-gray-900 text-gray-900'
    : 'border-b-2 border-amber-400 text-gray-100';
  const tabBar = IS_MC_PRODUCT ? 'border-gray-200' : 'border-gray-800';

  return (
    <aside className={shell}>
      <div className={`flex w-full shrink-0 border-b ${tabBar}`} role="tablist" aria-label="曲とアーティスト">
        {tabs.map((tab, i) => (
          <Fragment key={tab.id}>
            {i > 0 ? (
              <span
                className={`shrink-0 self-center px-0.5 text-[11px] ${IS_MC_PRODUCT ? 'text-gray-300' : 'text-gray-600'}`}
                aria-hidden
              >
                |
              </span>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              title={tab.label}
              onClick={() => setTabId(tab.id)}
              className={`min-w-0 flex-1 truncate px-1.5 py-1.5 text-center text-[11px] leading-tight ${
                active === tab.id ? tabActive : `border-b-2 border-transparent ${tabIdle}`
              }`}
            >
              {tab.label}
            </button>
          </Fragment>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {active === 'song' || !activeTab.artist ? (
          <SongDataBody
            song={song}
            titleClass={titleClass}
            artistClass={artistClass}
            originBadge={originBadge}
            muted={muted}
            omitGenreBestSlug={omitGenreBestSlug}
          />
        ) : (
          <ArtistDataBody artist={activeTab.artist} />
        )}
      </div>
    </aside>
  );
}

function SongDataBody({
  song,
  titleClass,
  artistClass,
  originBadge,
  muted,
  omitGenreBestSlug,
}: {
  song: MusicLibrarySongCard;
  titleClass: string;
  artistClass: string;
  originBadge: string;
  muted: string;
  omitGenreBestSlug?: string | null;
}) {
  const genreClass = IS_MC_PRODUCT
    ? 'min-w-0 max-w-[18rem] truncate text-[11px] text-gray-500'
    : 'min-w-0 max-w-[18rem] truncate text-[11px] text-gray-500';
  const dateClass = IS_MC_PRODUCT
    ? 'shrink-0 tabular-nums text-xs text-gray-500'
    : 'shrink-0 tabular-nums text-xs text-gray-500';
  return (
    <div className="relative space-y-3 pr-16">
      <MusicLibraryStyleAdminLink href={musicLibraryAdminSongEditHref(song.id)} />
      <div className="flex gap-3">
        <SongCoverThumb
          spotifyImages={song.spotifyImages}
          videoId={song.videoId}
          alt=""
          className="h-24 w-24 rounded-lg"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className={IS_MC_PRODUCT ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-gray-100'}>
            {song.href ? (
              <Link href={song.href} className={titleClass}>
                {song.songTitle}
              </Link>
            ) : (
              song.songTitle
            )}
          </h2>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {listArtists(song).map((artist, i) => {
              const nameEl = artist.href ? (
                <Link href={artist.href} className={artistClass}>
                  {artist.name}
                </Link>
              ) : (
                <span className={IS_MC_PRODUCT ? 'text-sm text-gray-600' : 'text-sm text-gray-400'}>
                  {artist.name}
                </span>
              );
              return (
                <span key={`${artist.slug ?? artist.name}-${i}`} className="inline-flex min-w-0 max-w-full items-center gap-1">
                  <span className="min-w-0 truncate">{nameEl}</span>
                  {artist.originLabel ? <span className={originBadge}>{artist.originLabel}</span> : null}
                </span>
              );
            })}
          </p>
          <p className="flex min-w-0 flex-wrap items-center gap-1.5">
            {song.styleLabel ? (
              song.styleSlug && isMusicLibraryNavStyleSlug(song.styleSlug) ? (
                <Link
                  href={musicLibraryStyleHref(song.styleSlug, 1)}
                  className={IS_MC_PRODUCT ? `${muted} hover:underline` : `${muted} hover:text-sky-300 hover:underline`}
                >
                  {song.styleLabel}
                </Link>
              ) : (
                <span className={muted}>{song.styleLabel}</span>
              )
            ) : null}
            {(song.vocalLabels ?? []).map((label) => (
              <span key={label} className={vocalBadge(label)}>
                {label}
              </span>
            ))}
            {song.genreLabel ? <span className={genreClass}>{song.genreLabel}</span> : null}
            <MusicLibraryGenreBestLabels labels={song.genreBestLabels} omitSlug={omitGenreBestSlug} />
            {formatMusicLibraryYearMonth(song.releaseDate) ? (
              <span className={dateClass}>{formatMusicLibraryYearMonth(song.releaseDate)}</span>
            ) : null}
          </p>
        </div>
      </div>
      {song.intro ? (
        <p className={IS_MC_PRODUCT ? 'whitespace-pre-wrap text-sm leading-relaxed text-gray-700' : 'whitespace-pre-wrap text-sm leading-relaxed text-gray-300'}>
          {song.intro}
        </p>
      ) : null}
    </div>
  );
}

function ArtistDataBody({ artist }: { artist: MusicLibraryListArtist }) {
  const key = artistCacheKey(artist);
  const [profile, setProfile] = useState<MusicLibraryArtistProfile | null | undefined>(() =>
    profileCache.has(key) ? profileCache.get(key) : undefined,
  );

  useEffect(() => {
    if (profileCache.has(key)) {
      setProfile(profileCache.get(key));
      return;
    }
    let cancelled = false;
    setProfile(undefined);
    const qs = new URLSearchParams();
    if (artist.slug) qs.set('slug', artist.slug);
    if (artist.name) qs.set('name', artist.name);
    (async () => {
      try {
        const res = await fetch(`/api/music/artist?${qs.toString()}`);
        if (!res.ok) throw new Error('artist profile failed');
        const json = (await res.json().catch(() => ({}))) as { profile?: MusicLibraryArtistProfile | null };
        const next = json.profile ?? null;
        profileCache.set(key, next);
        if (!cancelled) setProfile(next);
      } catch {
        profileCache.set(key, null);
        if (!cancelled) setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artist.name, artist.slug, key]);

  const adminHref = musicLibraryAdminArtistEditHref({ name: artist.name, slug: artist.slug });
  const muted = IS_MC_PRODUCT ? 'text-sm text-gray-600' : 'text-sm text-gray-400';
  const body = IS_MC_PRODUCT ? 'text-sm leading-relaxed text-gray-700' : 'text-sm leading-relaxed text-gray-300';
  const memberLinkClass = IS_MC_PRODUCT
    ? 'text-gray-400 hover:text-gray-600'
    : 'text-gray-500 hover:text-gray-400';

  if (profile === undefined) {
    return (
      <div className="relative pr-16">
        <MusicLibraryStyleAdminLink href={adminHref} />
        <p className={muted}>読み込み中…</p>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="relative space-y-2 pr-16">
        <MusicLibraryStyleAdminLink href={adminHref} />
        <h2 className={IS_MC_PRODUCT ? 'text-lg font-semibold text-gray-900' : 'text-lg font-semibold text-gray-100'}>
          {artist.name}
        </h2>
        <p className={muted}>アーティスト情報はまだありません。</p>
      </div>
    );
  }

  const href = musicLibraryArtistHref(profile.slug);
  const originShort = formatMusicLibraryOriginLabel(profile.originCountry ?? profile.originLabel);
  const ageParen = formatMusicLibraryAgeParen(profile.ageLabel);
  const roleLine = [profile.kind, formatMusicLibraryActivePeriod(profile.activePeriod)].filter(Boolean).join(' / ');
  const originBadge = IS_MC_PRODUCT
    ? 'shrink-0 rounded border border-gray-300 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-600'
    : 'shrink-0 rounded border border-gray-600 px-1 py-px text-[10px] font-medium leading-none tracking-wide text-gray-300';
  const memberEntries = profile.bandLinks.length > 0 ? profile.bandLinks : profile.showMembersLine ? profile.memberLinks : [];
  const memberFallback =
    profile.bandLinks.length === 0 && profile.showMembersLine && profile.memberLinks.length === 0
      ? profile.membersFallback
      : null;

  return (
    <div className="relative space-y-3 pr-16">
      <MusicLibraryStyleAdminLink
        href={musicLibraryAdminArtistEditHref({ name: profile.name, slug: profile.slug })}
      />
      <div className="flex gap-3">
        {profile.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.imageUrl} alt="" className="h-24 w-24 shrink-0 rounded-lg bg-gray-800 object-cover" />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Link
              href={href}
              className={
                IS_MC_PRODUCT
                  ? 'text-lg font-semibold text-gray-900 hover:underline'
                  : 'text-lg font-semibold text-gray-100 hover:text-amber-200 hover:underline'
              }
            >
              {profile.name}
            </Link>
            {originShort ? <span className={originBadge}>{originShort}</span> : null}
          </h2>
          {profile.nameJa || ageParen ? (
            <p className={muted}>
              {profile.nameJa ? profile.nameJa : null}
              {profile.nameJa && ageParen ? ' ' : null}
              {ageParen}
            </p>
          ) : null}
          {roleLine ? <p className={muted}>{roleLine}</p> : null}
          {memberEntries.length > 0 ? (
            <p className={muted}>
              Member：
              {memberEntries.map((m, i) => (
                <span key={`${m.name}-${i}`}>
                  {i > 0 ? '、' : null}
                  {m.slug ? (
                    <Link href={musicLibraryArtistHref(m.slug)} className={memberLinkClass}>
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </span>
              ))}
            </p>
          ) : memberFallback ? (
            <p className={muted}>Member：{memberFallback}</p>
          ) : null}
          <LibraryArtistExternalLinkPills links={profile.links} />
        </div>
      </div>
      {profile.profileText ? <p className={`whitespace-pre-wrap ${body}`}>{profile.profileText}</p> : null}
    </div>
  );
}
