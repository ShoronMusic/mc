import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AdminMenuBar } from '@/components/admin/AdminMenuBar';
import { AdminDomesticSongBadge } from '@/components/admin/AdminDomesticSongBadge';
import { isAdminSongJapaneseDomesticDisplay } from '@/lib/song-catalog-scope';
import { ensureWesternTreatedJpArtistCache } from '@/lib/western-treated-jp-artists';
import { AdminSongMasterDeletePanel } from '@/components/admin/AdminSongMasterDeletePanel';
import { AdminSongSpotifyEnrichPanel } from '@/components/admin/AdminSongSpotifyEnrichPanel';
import { AdminSongBasicInfoEditPanel } from '@/components/admin/AdminSongBasicInfoEditPanel';
import { AdminSongMusic8IntroPanel } from '@/components/admin/AdminSongMusic8IntroPanel';
import { AdminSongDetailWorkflow } from '@/components/admin/AdminSongDetailWorkflow';
import {
  isAdminSongBasicInfoFilled,
  isAdminSongIntroFilled,
  isAdminSongSpotifyFilled,
} from '@/lib/admin-song-detail-status';
import { AdminYoutubePlayerWithVolume } from '@/components/admin/AdminYoutubePlayerWithVolume';
import { GenreBestSongDetailActions } from '@/components/admin/GenreBestSongDetailActions';
import {
  AdminSongCreditsPanel,
  type AdminSongCreditRow,
} from '@/components/admin/AdminSongCreditsPanel';
import { music8SongJsonUrl } from '@/lib/music8-data-urls';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchArtistSongDefaultsForAdmin, uniqueNormalizedGenreNames } from '@/lib/admin-song-artist-defaults';
import { pickArtistPhotoUrl } from '@/lib/artist-photo-url';
import { AdminArtistPhoto } from '@/components/admin/AdminArtistPhoto';
import { AdminArtistConfirmedLinks } from '@/components/admin/AdminArtistConfirmedLinks';
import {
  adminSongArtistCreditsMissingLead,
  adminSongArtistNamesMatch,
  mergeAdminSongArtistLinks,
  orderedAdminSongArtistNames,
  type AdminSongArtistLink,
} from '@/lib/admin-song-artist-links';
import { ensureAdminSongArtistLinksByNames } from '@/lib/admin-song-artist-lookup';
import { upsertSpotifyArtistsFromTrack } from '@/lib/admin-song-spotify-by-track-id';
import { syncSongCreditsFromSongId } from '@/lib/song-credits-sync';
import { fetchSpotifyTrackWithArtistsById } from '@/lib/spotify-search-track';
import { AdminNewArtistBadge } from '@/components/admin/AdminNewArtistBadge';
import { AdminSongAlternatePvPanel } from '@/components/admin/AdminSongAlternatePvPanel';
import { SongCoverThumb } from '@/components/song/SongCoverThumb';
import { resolveSongCoverImage } from '@/lib/song-cover-image';
import { formatLibraryVocalDisplay } from '@/lib/library-vocal-display';
import { filterMusic8GenreLabels } from '@/lib/music8-song-fields';
import { applySongDisplayFromSpotifyArtists } from '@/lib/song-display-from-spotify-artists';
import { buildSongDisplayTitle } from '@/lib/music8-canonical-artist-name';
import { isSelectionRegisteredArtistPendingWp } from '@/lib/artist-selection-registered-pending';
import { displayNameFromArtistRow } from '@/lib/music8-artist-import';

interface SongDetailPageProps {
  params: { songId: string };
  searchParams?: { q?: string; modal?: string; from?: string };
}

interface SongRow {
  id: string;
  display_title: string | null;
  main_artist: string | null;
  song_title: string | null;
  song_title_ja?: string | null;
  style: string | null;
  play_count: number | null;
  catalog_scope?: string | null;
  original_release_date?: string | null;
  music8_song_data?: Record<string, unknown> | null;
  music8_intro?: string | null;
  created_at: string;
  // Music8 詳細メタ
  genres?: string[] | null;
  vocal?: string | null;
  primary_artist_name_ja?: string | null;
  structured_style?: string | null;
  music8_song_id?: number | null;
  music8_artist_slug?: string | null;
  music8_song_slug?: string | null;
  music8_video_id?: string | null;
  // Spotify
  spotify_track_id?: string | null;
  spotify_release_date?: string | null;
  spotify_name?: string | null;
  spotify_artists?: string | null;
  spotify_images?: string | null;
  spotify_popularity?: number | null;
  // artists FK
  artist_id?: string | null;
}

interface SongVideoRow {
  video_id: string;
  variant: string | null;
  performance_id: string | null;
  youtube_published_at?: string | null;
  created_at: string;
}

interface SongCommentaryRow {
  video_id: string;
  body: string;
  created_at: string;
}

interface SongTidbitRow {
  id: string;
  song_id: string | null;
  video_id: string | null;
  body: string;
  created_at: string;
  source: string;
  is_active: boolean;
}

interface UserSongPickCountRow {
  userId: string;
  count: number;
}

interface CommentFeedbackRow {
  video_id: string | null;
  ai_message_id: string;
  body: string;
  source: string;
  is_upvote: boolean | null;
  is_duplicate?: boolean | null;
  is_dubious?: boolean | null;
  is_ambiguous?: boolean | null;
  free_comment?: string | null;
  created_at?: string;
  id?: string;
  user_id?: string | null;
}

interface AggregatedFeedback {
  videoId: string | null;
  aiMessageId: string;
  body: string;
  source: string;
  goodCount: number;
  badCount: number;
}

function isSongRow(value: unknown): value is SongRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.created_at === 'string' &&
    ('display_title' in row) &&
    ('main_artist' in row) &&
    ('song_title' in row) &&
    ('style' in row) &&
    ('play_count' in row)
  );
}

/** ラベル＋値の1行表示（null のときは「—」、href があれば別ウインドリンク） */
function MetaRow({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  href?: string | null;
}) {
  const textClass = `break-all ${mono ? 'font-mono text-blue-300' : 'text-gray-200'} ${!value ? 'text-gray-600' : ''}`;
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-gray-500">{label}：</span>
      {value && href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${textClass} hover:underline`}>
          {value}
        </a>
      ) : (
        <span className={textClass}>{value ?? '—'}</span>
      )}
    </div>
  );
}

/** モーダルからの詳細フィードバック（チェックまたは自由コメントあり） */
function isDetailFeedbackRow(row: CommentFeedbackRow): boolean {
  if (row.is_duplicate === true || row.is_dubious === true || row.is_ambiguous === true) return true;
  const fc = typeof row.free_comment === 'string' ? row.free_comment.trim() : '';
  return fc.length > 0;
}

function adminSongGenreLabels(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string')
    : [];
  return filterMusic8GenreLabels(uniqueNormalizedGenreNames(list));
}

function AdminMetaLabel({ children }: { children: ReactNode }) {
  return <dt className="pt-0.5 text-[13px] text-gray-500">{children}</dt>;
}

function AdminMetaValue({ children }: { children: ReactNode }) {
  return <dd className="min-w-0 break-words text-gray-100">{children}</dd>;
}

export default async function SongDetailPage({ params, searchParams }: SongDetailPageProps) {
  const listQuery = typeof searchParams?.q === 'string' ? searchParams.q.trim() : '';
  const isModalEmbed = searchParams?.modal === '1';
  const fromYoutubePlaylistImport = searchParams?.from === 'youtube-playlist-import';
  const supabase = await createClient();
  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>DBが利用できません。</p>
      </main>
    );
  }

  let { data, error } = await supabase
    .from('songs')
    .select(
      'id, display_title, main_artist, song_title, song_title_ja, style, play_count, catalog_scope, original_release_date, music8_song_data, music8_intro, created_at,' +
        'genres, vocal, primary_artist_name_ja, structured_style,' +
        'music8_song_id, music8_artist_slug, music8_song_slug, music8_video_id,' +
        'spotify_track_id, spotify_release_date, spotify_name, spotify_artists, spotify_images, spotify_popularity,' +
        'artist_id',
    )
    .eq('id', params.songId)
    .maybeSingle();

  if (error?.code === '42703') {
    const fallback = await supabase
      .from('songs')
      .select(
        'id, display_title, main_artist, song_title, style, play_count, catalog_scope, original_release_date, music8_song_data, created_at,' +
          'genres, vocal, primary_artist_name_ja, structured_style,' +
          'music8_song_id, music8_artist_slug, music8_song_slug, music8_video_id,' +
          'spotify_track_id, spotify_release_date, spotify_name, spotify_artists, spotify_images, spotify_popularity,' +
          'artist_id',
      )
      .eq('id', params.songId)
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>曲情報の取得に失敗しました: {error.message}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>指定された曲が見つかりませんでした。</p>
      </main>
    );
  }

  if (!isSongRow(data)) {
    return (
      <main className="mx-auto max-w-3xl p-4 text-gray-100">
        <p>曲データ形式が不正です。管理者に連絡してください。</p>
      </main>
    );
  }

  let song: SongRow = data;
  let displayAlignedFromSpotify: string | null = null;
  // Spotify 共演並びが正。main_artist / display_title がメインのみのときは開いた時点で揃える
  if ((song.spotify_artists ?? '').trim() || (song.spotify_track_id ?? '').trim()) {
    const adminForAlign = createAdminClient();
    if (adminForAlign) {
      try {
        const aligned = await applySongDisplayFromSpotifyArtists(adminForAlign, song.id);
        if (aligned.updated && aligned.mainArtist) {
          const nextTitle =
            aligned.displayTitle ??
            buildSongDisplayTitle(aligned.mainArtist, (song.song_title ?? '').trim());
          song = {
            ...song,
            main_artist: aligned.mainArtist,
            display_title: nextTitle || song.display_title,
          };
          displayAlignedFromSpotify = nextTitle || aligned.mainArtist;
        }
      } catch (e) {
        console.warn(
          '[admin/songs/detail] align display from spotify',
          song.id,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  await ensureWesternTreatedJpArtistCache();
  const isJapaneseDomestic = isAdminSongJapaneseDomesticDisplay({
    catalog_scope: song.catalog_scope ?? null,
    main_artist: song.main_artist,
    song_title: song.song_title,
    display_title: song.display_title,
  });

  let songCredits: AdminSongCreditRow[] = [];
  /** artist_id → 選曲登録の未整備（新規）か */
  const artistIsNewById = new Map<string, boolean>();
  let primaryArtistLinkName: string | null = null;
  let primaryArtistSpotifyId: string | null = null;
  let extraArtistLinks: AdminSongArtistLink[] = [];
  let orderedArtistNames: string[] = [];
  try {
    const admin = createAdminClient();
    if (admin) {
      const artistPendingSelect =
        'name, name_base, the_prefix, music8_artist_id, music8_synced_at, spotify_artist_id, profile_text, description_en, ai_profile_generated_at, name_ja, name_en, origin_country, youtube_channel_id, wikipedia_page, kind, occupations';

      type ArtistJoinRow = {
        name?: string | null;
        name_base?: string | null;
        the_prefix?: string | null;
        music8_artist_id?: number | null;
        music8_synced_at?: string | null;
        spotify_artist_id?: string | null;
        profile_text?: string | null;
        description_en?: string | null;
        ai_profile_generated_at?: string | null;
        name_ja?: string | null;
        name_en?: string | null;
        origin_country?: string | null;
        youtube_channel_id?: string | null;
        wikipedia_page?: string | null;
        kind?: string | null;
        occupations?: string[] | null;
      };

      const markNew = (artistId: string, row: ArtistJoinRow) => {
        artistIsNewById.set(artistId, isSelectionRegisteredArtistPendingWp(row));
      };

      const { data: creditRows, error: creditErr } = await admin
        .from('song_credits')
        .select(`artist_id, role, display_order, artists(${artistPendingSelect})`)
        .eq('song_id', song.id)
        .order('display_order', { ascending: true });
      if (!creditErr && Array.isArray(creditRows)) {
        const nextCredits: AdminSongCreditRow[] = [];
        for (const row of creditRows) {
          const r = row as {
            artist_id?: string;
            role?: string;
            display_order?: number;
            artists?: ArtistJoinRow | ArtistJoinRow[] | null;
          };
          const artistId = r.artist_id?.trim() ?? '';
          const artistsJoin = r.artists;
          const artistRow = Array.isArray(artistsJoin) ? artistsJoin[0] : artistsJoin;
          const artistName =
            displayNameFromArtistRow(artistRow ?? {})?.trim() ||
            artistRow?.name?.trim() ||
            '';
          if (!artistId || !artistName) continue;
          if (artistRow) markNew(artistId, artistRow);
          nextCredits.push({
            artistId,
            artistName,
            role: r.role?.trim() || 'main',
            displayOrder:
              typeof r.display_order === 'number' ? Math.floor(r.display_order) : 0,
            isNewArtist: artistRow
              ? isSelectionRegisteredArtistPendingWp(artistRow)
              : false,
            spotifyArtistId: artistRow?.spotify_artist_id?.trim() || null,
          });
        }
        songCredits = nextCredits;
      }

      const primaryId = (song.artist_id ?? '').trim();
      if (primaryId) {
        const fromCredit = songCredits.find((c) => c.artistId === primaryId);
        if (fromCredit) {
          primaryArtistLinkName = fromCredit.artistName;
          primaryArtistSpotifyId = fromCredit.spotifyArtistId ?? null;
        }
        if (!artistIsNewById.has(primaryId)) {
          const { data: primaryArtist } = await admin
            .from('artists')
            .select(artistPendingSelect)
            .eq('id', primaryId)
            .maybeSingle();
          if (primaryArtist) {
            const row = primaryArtist as ArtistJoinRow;
            markNew(primaryId, row);
            primaryArtistLinkName =
              displayNameFromArtistRow(row)?.trim() || row.name?.trim() || primaryArtistLinkName;
            primaryArtistSpotifyId = row.spotify_artist_id?.trim() || primaryArtistSpotifyId;
          }
        }
      }

      orderedArtistNames = orderedAdminSongArtistNames({
        spotifyArtists: song.spotify_artists ?? null,
        mainArtist: song.main_artist ?? null,
        displayTitle: song.display_title ?? null,
        music8SongData: song.music8_song_data ?? null,
      });

      const ingestCreditRows = (creditRows: unknown[] | null | undefined) => {
        const nextCredits: AdminSongCreditRow[] = [];
        if (!Array.isArray(creditRows)) return nextCredits;
        for (const row of creditRows) {
          const r = row as {
            artist_id?: string;
            role?: string;
            display_order?: number;
            artists?: ArtistJoinRow | ArtistJoinRow[] | null;
          };
          const artistId = r.artist_id?.trim() ?? '';
          const artistsJoin = r.artists;
          const artistRow = Array.isArray(artistsJoin) ? artistsJoin[0] : artistsJoin;
          const artistName =
            displayNameFromArtistRow(artistRow ?? {})?.trim() ||
            artistRow?.name?.trim() ||
            '';
          if (!artistId || !artistName) continue;
          if (artistRow) markNew(artistId, artistRow);
          nextCredits.push({
            artistId,
            artistName,
            role: r.role?.trim() || 'main',
            displayOrder:
              typeof r.display_order === 'number' ? Math.floor(r.display_order) : 0,
            isNewArtist: artistRow
              ? isSelectionRegisteredArtistPendingWp(artistRow)
              : false,
            spotifyArtistId: artistRow?.spotify_artist_id?.trim() || null,
          });
        }
        return nextCredits;
      };

      if (adminSongArtistCreditsMissingLead(orderedArtistNames, songCredits)) {
        const trackId = (song.spotify_track_id ?? '').trim();
        if (trackId) {
          try {
            const track = await fetchSpotifyTrackWithArtistsById(trackId);
            if (track.artists.length > 0) {
              await upsertSpotifyArtistsFromTrack(admin, track.artists);
            }
          } catch (e) {
            console.warn(
              '[admin/song-detail] upsert spotify artists',
              song.id,
              e instanceof Error ? e.message : e,
            );
          }
        }
        try {
          await syncSongCreditsFromSongId(admin, song.id, true);
          const { data: creditRowsAfter } = await admin
            .from('song_credits')
            .select(`artist_id, role, display_order, artists(${artistPendingSelect})`)
            .eq('song_id', song.id)
            .order('display_order', { ascending: true });
          songCredits = ingestCreditRows(creditRowsAfter);
        } catch (e) {
          console.warn(
            '[admin/song-detail] resync song_credits',
            song.id,
            e instanceof Error ? e.message : e,
          );
        }
      }

      const missingNames = orderedArtistNames.filter(
        (n) =>
          !songCredits.some((c) => adminSongArtistNamesMatch(c.artistName, n)) &&
          !adminSongArtistNamesMatch(primaryArtistLinkName ?? '', n),
      );
      if (missingNames.length > 0) {
        const spotifyArtistIdByName: Record<string, string> = {};
        const trackIdForNames = (song.spotify_track_id ?? '').trim();
        if (trackIdForNames) {
          try {
            const track = await fetchSpotifyTrackWithArtistsById(trackIdForNames);
            for (const a of track.artists) {
              if (a.id && a.name) spotifyArtistIdByName[a.name] = a.id;
            }
          } catch {
            /* 名前確保は続行 */
          }
        }
        extraArtistLinks = await ensureAdminSongArtistLinksByNames(
          admin,
          missingNames,
          artistPendingSelect,
          { spotifyArtistIdByName },
        );
        for (const extra of extraArtistLinks) {
          artistIsNewById.set(extra.id, Boolean(extra.isNewArtist));
        }
      }

      const leadName = orderedArtistNames[0]?.trim() ?? '';
      if (leadName) {
        const leadHit =
          extraArtistLinks.find((e) => adminSongArtistNamesMatch(e.name, leadName)) ??
          songCredits.find((c) => adminSongArtistNamesMatch(c.artistName, leadName));
        const leadId = (
          leadHit && 'artistId' in leadHit ? leadHit.artistId : leadHit?.id ?? ''
        ).trim();
        if (leadId && leadId !== (song.artist_id ?? '').trim()) {
          const { error: leadErr } = await admin
            .from('songs')
            .update({ artist_id: leadId })
            .eq('id', song.id);
          if (!leadErr) {
            song.artist_id = leadId;
            const fromCredit = songCredits.find((c) => c.artistId === leadId);
            if (fromCredit) {
              primaryArtistLinkName = fromCredit.artistName;
              primaryArtistSpotifyId = fromCredit.spotifyArtistId ?? null;
            } else {
              const extraLead = extraArtistLinks.find((e) => e.id === leadId);
              if (extraLead) {
                primaryArtistLinkName = extraLead.name;
                primaryArtistSpotifyId = extraLead.spotifyArtistId ?? null;
              }
            }
          } else if (leadErr.code !== '42703' && leadErr.code !== '42P01') {
            console.warn('[admin/song-detail] fix songs.artist_id', leadErr.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('[admin/song-detail] song_credits', e);
  }

  let artistDefaults = {
    suggestedVocal: null as string | null,
    suggestedGenres: [] as { name: string; count: number }[],
    allGenres: [] as string[],
  };
  let artistImageUrl: string | null = null;
  const originalVocal = (song.vocal ?? '').trim();
  try {
    const adminForDefaults = createAdminClient();
    if (adminForDefaults) {
      artistDefaults = await fetchArtistSongDefaultsForAdmin(adminForDefaults, {
        songId: song.id,
        artistId: song.artist_id ?? null,
        mainArtist: song.main_artist ?? null,
        creditCount: songCredits.length,
      });
      if (!originalVocal && artistDefaults.suggestedVocal) {
        const { error: vocalErr } = await adminForDefaults
          .from('songs')
          .update({ vocal: artistDefaults.suggestedVocal })
          .eq('id', song.id);
        if (!vocalErr) {
          song.vocal = artistDefaults.suggestedVocal;
        } else if (vocalErr.code !== '42703' && vocalErr.code !== '42P01') {
          console.warn('[admin/song-detail] auto vocal', vocalErr.message);
        }
      }
      if (song.artist_id) {
        const { data: artistRow } = await adminForDefaults
          .from('artists')
          .select('image_url, spotify_artist_images')
          .eq('id', song.artist_id)
          .maybeSingle();
        artistImageUrl = pickArtistPhotoUrl(
          (artistRow ?? {}) as { image_url?: string | null; spotify_artist_images?: string | null },
        );
      }
      if (!artistImageUrl && (song.main_artist ?? '').trim()) {
        const { data: byName } = await adminForDefaults
          .from('artists')
          .select('image_url, spotify_artist_images')
          .ilike('name', song.main_artist!.trim())
          .limit(1)
          .maybeSingle();
        artistImageUrl = pickArtistPhotoUrl(
          (byName ?? {}) as { image_url?: string | null; spotify_artist_images?: string | null },
        );
      }
    }
  } catch (e) {
    console.error('[admin/song-detail] artist defaults', e);
  }

  // Spotify アーティスト ID を取得（優先順位: artists テーブル → music8_song_data スナップショット）
  let spotifyArtistId: string | null = null;
  if (song.artist_id) {
    try {
      const { data: artistData } = await supabase
        .from('artists')
        .select('spotify_artist_id')
        .eq('id', song.artist_id)
        .maybeSingle();
      const raw = (artistData as { spotify_artist_id?: string | null } | null)?.spotify_artist_id;
      if (typeof raw === 'string' && raw.trim()) spotifyArtistId = raw.trim();
    } catch {
      // artists テーブルがなくても続行
    }
  }
  // フォールバック: music8_song_data スナップショットの artist_spotify_id
  if (!spotifyArtistId && song.music8_song_data && typeof song.music8_song_data === 'object') {
    const snap = song.music8_song_data as Record<string, unknown>;
    const fromSnap = snap.artist_spotify_id;
    if (typeof fromSnap === 'string' && fromSnap.trim()) spotifyArtistId = fromSnap.trim();
  }

  // song_videos の取得
  let videos: SongVideoRow[] = [];
  try {
    const { data: videoData, error: videoError } = await supabase
      .from('song_videos')
      .select('video_id, variant, performance_id, youtube_published_at, created_at')
      .eq('song_id', song.id)
      .order('created_at', { ascending: true });
    if (videoError && videoError.code !== '42P01') {
      console.error('[admin/song-detail] song_videos', videoError.code, videoError.message);
    }
    videos = (videoData as SongVideoRow[]) ?? [];
  } catch (e) {
    console.error('[admin/song-detail] song_videos exception', e);
  }

  // song_commentary を video_id ごとに取得（基本情報コメント）
  let commentaryMap = new Map<string, SongCommentaryRow>();
  if (videos.length > 0) {
    const ids = Array.from(new Set(videos.map((v) => v.video_id))).filter(Boolean);
    if (ids.length > 0) {
      try {
        const { data: commData, error: commError } = await supabase
          .from('song_commentary')
          .select('video_id, body, created_at')
          .in('video_id', ids);
        if (commError && commError.code !== '42P01') {
          console.error('[admin/song-detail] song_commentary', commError.code, commError.message);
        }
        if (Array.isArray(commData)) {
          commentaryMap = new Map(
            (commData as SongCommentaryRow[]).map((c) => [c.video_id, c]),
          );
        }
      } catch (e) {
        console.error('[admin/song-detail] song_commentary exception', e);
      }
    }
  }

  // song_tidbits（豆知識ライブラリ）
  let tidbits: SongTidbitRow[] = [];
  try {
    const { data: tidbitData, error: tidbitError } = await supabase
      .from('song_tidbits')
      .select('id, song_id, video_id, body, created_at, source, is_active')
      .eq('song_id', song.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (tidbitError && tidbitError.code !== '42P01') {
      console.error('[admin/song-detail] song_tidbits', tidbitError.code, tidbitError.message);
    }
    tidbits = (tidbitData as SongTidbitRow[]) ?? [];
  } catch (e) {
    console.error('[admin/song-detail] song_tidbits exception', e);
  }

  // 当該曲（song_videos.video_id 群）に対するログインユーザー別選曲回数
  let userPickCounts: UserSongPickCountRow[] = [];
  let userPickCountTruncated = false;
  if (videos.length > 0) {
    const videoIds = Array.from(new Set(videos.map((v) => v.video_id).filter(Boolean)));
    if (videoIds.length > 0) {
      const PAGE = 1000;
      const MAX_SCAN = 12000;
      const byUser = new Map<string, number>();
      let scanned = 0;
      for (let offset = 0; ; offset += PAGE) {
        const { data: playRows, error: playErr } = await supabase
          .from('room_playback_history')
          .select('user_id')
          .in('video_id', videoIds)
          .not('user_id', 'is', null)
          .range(offset, offset + PAGE - 1);
        if (playErr) {
          if (playErr.code !== '42P01') {
            console.error('[admin/song-detail] room_playback_history user-count', playErr.code, playErr.message);
          }
          break;
        }
        const rows = (playRows ?? []) as { user_id?: string | null }[];
        for (const r of rows) {
          const uid = typeof r.user_id === 'string' ? r.user_id.trim() : '';
          if (!uid) continue;
          byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
        }
        scanned += rows.length;
        if (rows.length < PAGE) break;
        if (scanned >= MAX_SCAN) {
          userPickCountTruncated = true;
          break;
        }
      }
      userPickCounts = [...byUser.entries()]
        .map(([userId, count]) => ({ userId, count }))
        .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId));
    }
  }

  // comment_feedback（AIコメント評価）: song_id 単位で取得して集約
  let feedback: AggregatedFeedback[] = [];
  let detailFeedbackRows: CommentFeedbackRow[] = [];
  try {
    const { data: fbData, error: fbError } = await supabase
      .from('comment_feedback')
      .select(
        'id, created_at, user_id, video_id, ai_message_id, body, source, is_upvote, is_duplicate, is_dubious, is_ambiguous, free_comment',
      )
      .eq('song_id', song.id)
      .order('created_at', { ascending: false });
    if (fbError && fbError.code !== '42P01') {
      console.error('[admin/song-detail] comment_feedback', fbError.code, fbError.message);
    }
    if (Array.isArray(fbData)) {
      const rows = fbData as CommentFeedbackRow[];
      detailFeedbackRows = rows.filter(isDetailFeedbackRow);

      const map = new Map<string, AggregatedFeedback>();
      rows.forEach((row) => {
        if (!row.ai_message_id) return;
        const key = `${row.video_id ?? ''}__${row.ai_message_id}`;
        const existing = map.get(key);
        const good = row.is_upvote === true ? 1 : 0;
        const bad =
          row.is_upvote === false && !isDetailFeedbackRow(row) ? 1 : 0;
        if (existing) {
          existing.goodCount += good;
          existing.badCount += bad;
        } else {
          map.set(key, {
            videoId: row.video_id ?? null,
            aiMessageId: row.ai_message_id,
            body: row.body,
            source: row.source ?? 'unknown',
            goodCount: good,
            badCount: bad,
          });
        }
      });
      feedback = Array.from(map.values()).sort((a, b) => (b.goodCount - b.badCount) || (a.badCount - b.badCount));
    }
  } catch (e) {
    console.error('[admin/song-detail] comment_feedback exception', e);
  }

  const primaryVideoId =
    (typeof song.music8_video_id === 'string' && song.music8_video_id.trim()) ||
    videos.find((v) => (v.variant ?? '').trim().toLowerCase() === 'official')?.video_id.trim() ||
    videos.find((v) => v.video_id.trim())?.video_id.trim() ||
    null;
  const genreLabels = adminSongGenreLabels(song.genres);
  const vocalDisplay =
    formatLibraryVocalDisplay((song.vocal ?? '').trim() || artistDefaults.suggestedVocal) ||
    ((song.vocal ?? '').trim() || null);
  const songCover = resolveSongCoverImage({
    spotifyImages: song.spotify_images,
    videoId: primaryVideoId,
  });

  return (
    <main className="mx-auto max-w-4xl bg-gray-950 p-4 text-gray-100">
      <AdminMenuBar />
      <p className="mb-2">
        {fromYoutubePlaylistImport ? (
          <Link
            href="/admin/youtube-playlist-import"
            className="text-sm text-sky-300 hover:underline"
          >
            ← YouTube プレイリスト取込に戻る
          </Link>
        ) : listQuery ? (
          <Link
            href={`/admin/songs?q=${encodeURIComponent(listQuery)}`}
            className="text-sm text-sky-300 hover:underline"
          >
            ← 「{listQuery}」の曲一覧に戻る
          </Link>
        ) : (
          <Link href="/admin/songs" className="text-sm text-sky-300 hover:underline">
            ← 曲ダッシュボード（検索）
          </Link>
        )}
        <span className="mx-2 text-gray-600">·</span>
        <Link href="/admin/songs/list" className="text-sm text-sky-300 hover:underline">
          登録曲一覧
        </Link>
      </p>
      <h1 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-semibold">
        <span>管理者: 曲詳細</span>
        {isJapaneseDomestic ? <AdminDomesticSongBadge /> : null}
      </h1>

      <AdminSongDetailWorkflow
        initialBasicFilled={isAdminSongBasicInfoFilled({
          style: song.style,
          vocal: (song.vocal ?? '').trim() || artistDefaults.suggestedVocal,
          originalReleaseDate: song.original_release_date,
        })}
        initialIntroFilled={isAdminSongIntroFilled(song.music8_intro)}
        initialSpotifyFilled={isAdminSongSpotifyFilled({
          hasTrackId: Boolean((song.spotify_track_id ?? '').trim()),
          hasPopularity: song.spotify_popularity != null,
        })}
      >
      {/* 曲メイン情報 */}
      <section className="mb-4 space-y-4 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 p-4 text-sm shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)]">
        <h2 className="text-sm font-semibold text-gray-200">基本情報（songs）</h2>
        {displayAlignedFromSpotify ? (
          <p className="rounded border border-green-800/60 bg-green-950/30 px-3 py-2 text-xs text-green-100">
            Spotify の共演並び（spotify_artists）に合わせて display_title / main_artist を更新しました:{' '}
            <span className="font-medium">{displayAlignedFromSpotify}</span>
          </p>
        ) : null}
        <div
          className={
            isModalEmbed
              ? 'min-w-0 space-y-2'
              : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,32rem)] lg:items-start'
          }
        >
          <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {songCover.url ? (
                <div className="shrink-0">
                  <SongCoverThumb
                    spotifyImages={song.spotify_images}
                    videoId={primaryVideoId}
                    alt={
                      songCover.source === 'spotify'
                        ? 'Spotify album art'
                        : 'YouTube thumbnail'
                    }
                    className="h-32 w-32 rounded-lg border border-gray-700 shadow-md"
                  />
                  <p className="mt-1.5 text-[11px] text-gray-500">
                    {songCover.source === 'spotify'
                      ? '曲ジャケット（Spotify）'
                      : '曲サムネ（YouTube・Spotify 未取得）'}
                  </p>
                </div>
              ) : null}
              <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2">
                <AdminMetaLabel>display_title</AdminMetaLabel>
                <AdminMetaValue>
                  <span className="text-base font-semibold tracking-tight text-white">
                    {song.display_title || '(なし)'}
                  </span>
                  {isJapaneseDomestic ? (
                    <span className="ml-2 inline-block align-middle">
                      <AdminDomesticSongBadge />
                    </span>
                  ) : null}
                </AdminMetaValue>
                <AdminMetaLabel>メインアーティスト</AdminMetaLabel>
                <dd className="flex min-w-0 flex-wrap items-center gap-2 text-gray-100">
                  <AdminArtistPhoto url={artistImageUrl} name={song.main_artist ?? ''} size={40} />
                  <span className="min-w-0 break-words">{song.main_artist || '(なし)'}</span>
                  {song.artist_id && artistIsNewById.get(song.artist_id) ? (
                    <AdminNewArtistBadge />
                  ) : null}
                </dd>
                {songCredits.filter((c) => c.displayOrder > 0).length > 0 ? (
                  <>
                    <AdminMetaLabel>共演（song_credits）</AdminMetaLabel>
                    <AdminMetaValue>
                      <span className="text-violet-200">
                        {songCredits
                          .filter((c) => c.displayOrder > 0)
                          .map((c) => c.artistName)
                          .join(', ')}
                      </span>
                    </AdminMetaValue>
                  </>
                ) : null}
                <AdminMetaLabel>曲タイトル</AdminMetaLabel>
                <AdminMetaValue>{song.song_title || '(なし)'}</AdminMetaValue>
                <AdminMetaLabel>日本語読み</AdminMetaLabel>
                <AdminMetaValue>
                  <span className={(song.song_title_ja ?? '').trim() ? '' : 'text-gray-500'}>
                    {song.song_title_ja || '—'}
                  </span>
                </AdminMetaValue>
                <AdminMetaLabel>スタイル</AdminMetaLabel>
                <AdminMetaValue>
                  {song.style ? (
                    <span className="inline-flex rounded border border-gray-600 bg-gray-950 px-2 py-0.5 text-xs font-medium text-gray-100">
                      {song.style}
                    </span>
                  ) : (
                    <span className="text-gray-500">(未設定)</span>
                  )}
                </AdminMetaValue>
                <AdminMetaLabel>ジャンル</AdminMetaLabel>
                <AdminMetaValue>
                  {genreLabels.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {genreLabels.map((g) => (
                        <span
                          key={g}
                          className="inline-flex rounded border border-gray-600 bg-gray-950 px-2 py-0.5 text-xs text-gray-200"
                        >
                          {g}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </AdminMetaValue>
                <AdminMetaLabel>ボーカル</AdminMetaLabel>
                <AdminMetaValue>
                  {vocalDisplay ? (
                    <span className="inline-flex rounded border border-sky-800/80 bg-sky-950/40 px-2 py-0.5 text-xs font-medium text-sky-200">
                      {vocalDisplay}
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </AdminMetaValue>
                <AdminMetaLabel>原盤日</AdminMetaLabel>
                <AdminMetaValue>
                  <span className={song.original_release_date ? '' : 'text-gray-500'}>
                    {song.original_release_date ?? '—'}
                  </span>
                </AdminMetaValue>
                <AdminMetaLabel>catalog_scope</AdminMetaLabel>
                <AdminMetaValue>
                  <span className="text-gray-300">{song.catalog_scope || 'unknown'}</span>
                </AdminMetaValue>
                <AdminMetaLabel>play_count</AdminMetaLabel>
                <AdminMetaValue>{song.play_count ?? 0}</AdminMetaValue>
                <AdminMetaLabel>ID</AdminMetaLabel>
                <dd className="min-w-0 break-all font-mono text-[12px] text-gray-400">{song.id}</dd>
                <AdminMetaLabel>music8_song_data</AdminMetaLabel>
                <dd className="min-w-0 text-gray-400">
                  {song.music8_song_data && typeof song.music8_song_data === 'object' ? (
                    <details className="rounded border border-gray-800 bg-gray-950/80 p-2">
                      <summary className="cursor-pointer text-gray-400">
                        公開 JSON 向けキャッシュ（正本は上の列）
                      </summary>
                      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-[11px] text-gray-300">
                        {JSON.stringify(song.music8_song_data, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    '—'
                  )}
                </dd>
              </dl>
            </div>
            {(() => {
              const primaryId = (song.artist_id ?? '').trim();
              const linkArtists = mergeAdminSongArtistLinks({
                orderedNames: orderedArtistNames,
                primary: primaryId
                  ? {
                      id: primaryId,
                      name:
                        (primaryArtistLinkName ?? '').trim() ||
                        (orderedArtistNames[0] ?? '').trim() ||
                        '（無名）',
                      isNewArtist: artistIsNewById.get(primaryId) === true,
                      spotifyArtistId: primaryArtistSpotifyId ?? spotifyArtistId,
                    }
                  : null,
                credits: songCredits.map((c) => ({
                  id: c.artistId,
                  name: c.artistName,
                  isNewArtist: artistIsNewById.get(c.artistId) === true,
                  spotifyArtistId: c.spotifyArtistId ?? null,
                })),
                extra: extraArtistLinks,
              });
              return linkArtists.length > 0 ? (
                <AdminArtistConfirmedLinks
                  artists={linkArtists}
                  currentSongId={song.id}
                  modalEmbed={isModalEmbed}
                />
              ) : null;
            })()}
            {primaryVideoId ? (
              <p>
                <a
                  href={`https://www.youtube.com/watch?v=${encodeURIComponent(primaryVideoId)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-sky-400 hover:text-sky-300"
                >
                  YouTube を開く
                </a>
              </p>
            ) : null}
          </div>

          {!isModalEmbed ? (
            <div className="min-w-0">
              {primaryVideoId ? (
                <AdminYoutubePlayerWithVolume
                  videoId={primaryVideoId}
                  playerClassName="min-h-[12.5rem]"
                />
              ) : (
                <div className="flex aspect-video min-h-[12.5rem] items-center justify-center rounded border border-dashed border-gray-700 bg-black/40 px-3 text-center text-xs text-gray-500">
                  紐づく YouTube 動画がありません
                </div>
              )}
              <GenreBestSongDetailActions
                songId={song.id}
                songLabel={
                  (song.display_title ?? '').trim() ||
                  [song.main_artist, song.song_title].filter(Boolean).join(' - ') ||
                  undefined
                }
              />
            </div>
          ) : null}
        </div>

        <AdminSongBasicInfoEditPanel
          songId={song.id}
          initialDisplayTitle={song.display_title ?? null}
          initialMainArtist={song.main_artist ?? null}
          initialSongTitle={song.song_title ?? null}
          initialSongTitleJa={song.song_title_ja ?? null}
          initialStyle={song.style ?? null}
          initialOriginalReleaseDate={song.original_release_date ?? null}
          initialCatalogScope={song.catalog_scope ?? null}
          initialVocal={(song.vocal ?? '').trim() || artistDefaults.suggestedVocal}
          initialGenres={Array.isArray(song.genres) ? song.genres : null}
          suggestedGenres={artistDefaults.suggestedGenres}
          allGenres={artistDefaults.allGenres}
          artistImageUrl={artistImageUrl}
          vocalFromArtistHistory={!originalVocal && Boolean(artistDefaults.suggestedVocal)}
          vocalNoArtistHistory={!originalVocal && !artistDefaults.suggestedVocal}
          highlightStyle={fromYoutubePlaylistImport}
        />
        <AdminSongMusic8IntroPanel songId={song.id} initialIntro={song.music8_intro ?? null} />
        <AdminSongSpotifyEnrichPanel
          songId={song.id}
          hasTrackId={Boolean((song.spotify_track_id ?? '').trim())}
          hasPopularity={song.spotify_popularity != null}
          hasSpotifyArtists={Boolean((song.spotify_artists ?? '').trim())}
          currentTrackId={song.spotify_track_id ?? null}
        />
        <AdminSongCreditsPanel
          songId={song.id}
          mainArtist={song.main_artist ?? null}
          artistImageUrl={artistImageUrl}
          initialCredits={songCredits}
          modalEmbed={isModalEmbed}
        />
        <p>
          <span className="text-gray-500">作成日時：</span>
          {new Date(song.created_at).toLocaleString('ja-JP')}
        </p>
        <AdminSongMasterDeletePanel
          songId={song.id}
          confirmLabel={(song.display_title ?? '').trim() || song.id}
        />
      </section>
      </AdminSongDetailWorkflow>

      {/* song_videos 一覧 */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">動画一覧（song_videos）</h2>
        {videos.length === 0 ? (
          <p className="text-gray-400 text-sm">紐づく動画はありません。</p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">video_id</th>
                  <th className="px-2 py-1 text-left">variant</th>
                  <th className="px-2 py-1 text-left">performance_id</th>
                  <th className="px-2 py-1 text-left">YouTube公開</th>
                  <th className="px-2 py-1 text-left">登録日時</th>
                  <th className="px-2 py-1 text-left">曲解説</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => {
                  const comm = commentaryMap.get(v.video_id);
                  return (
                    <tr key={v.video_id} className="border-t border-gray-800">
                      <td className="px-2 py-1 font-mono text-[11px] text-blue-300">
                        {v.video_id}
                      </td>
                      <td className="px-2 py-1">{v.variant ?? ''}</td>
                      <td className="px-2 py-1 text-[11px] font-mono text-gray-400">
                        {v.performance_id ?? ''}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-gray-300">
                        {v.youtube_published_at
                          ? new Date(v.youtube_published_at).toLocaleString('ja-JP')
                          : '—'}
                      </td>
                      <td className="px-2 py-1">
                        {new Date(v.created_at).toLocaleString('ja-JP')}
                      </td>
                      <td className="px-2 py-1 max-w-xs">
                        {comm ? (
                          <div className="text-gray-200">
                            <div className="whitespace-pre-wrap text-[11px] leading-snug">
                              {comm.body}
                            </div>
                            <div className="mt-1 text-[10px] text-gray-500">
                              ({new Date(comm.created_at).toLocaleString('ja-JP')})
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            song_commentary に登録なし
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminSongAlternatePvPanel songId={song.id} currentCount={videos.length} />
      </section>

      {/* song_tidbits 一覧（豆知識） */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">
          豆知識ライブラリ（song_tidbits）
        </h2>
        {tidbits.length === 0 ? (
          <p className="text-gray-400 text-sm">
            この曲の豆知識はまだ登録されていません（AIコメント保存後に蓄積されます）。
          </p>
        ) : (
          <div className="space-y-3 max-h-[320px] overflow-auto">
            {tidbits.map((t) => {
              const preview = t.body.split('\n').slice(0, 3).join(' ');
              return (
                <div
                  key={t.id}
                  className="rounded border border-gray-700 bg-gray-800/70 p-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-200">
                        {t.source || 'ai'}
                      </span>
                      {t.video_id && (
                        <span className="font-mono text-[10px] text-blue-300">
                          {t.video_id}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {new Date(t.created_at).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-[11px] leading-snug text-gray-200">
                    {preview}
                    {t.body.length > preview.length ? ' …' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* comment_feedback 集計（AIコメント評価） */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">
          AIコメント評価（comment_feedback）
        </h2>
        {feedback.length === 0 ? (
          <p className="text-gray-400 text-sm">
            Good / no good の集計対象となるフィードバックはまだありません。
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">video_id</th>
                  <th className="px-2 py-1 text-left">ai_message_id</th>
                  <th className="px-2 py-1 text-left">source</th>
                  <th className="px-2 py-1 text-right">Good</th>
                  <th className="px-2 py-1 text-right">no good</th>
                  <th className="px-2 py-1 text-left">コメント本文（先頭）</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f) => {
                  const preview = f.body.split('\n').slice(0, 2).join(' ');
                  return (
                    <tr key={`${f.videoId ?? 'null'}__${f.aiMessageId}`} className="border-t border-gray-800">
                      <td className="px-2 py-1 font-mono text-[10px] text-blue-300">
                        {f.videoId ?? '(なし)'}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-gray-400">
                        {f.aiMessageId}
                      </td>
                      <td className="px-2 py-1 text-[11px]">{f.source}</td>
                      <td className="px-2 py-1 text-right text-[11px] text-emerald-300">
                        {f.goodCount}
                      </td>
                      <td className="px-2 py-1 text-right text-[11px] text-red-300">
                        {f.badCount}
                      </td>
                      <td className="px-2 py-1 max-w-xs">
                        <div className="whitespace-pre-wrap text-[11px] leading-snug text-gray-200">
                          {preview}
                          {f.body.length > preview.length ? ' …' : ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 詳細フィードバック（チェックボックス・自由コメント） */}
        <h3 className="mb-2 mt-6 text-xs font-semibold text-gray-300">
          詳細フィードバック（チェック・自由コメント）
        </h3>
        {detailFeedbackRows.length === 0 ? (
          <p className="text-gray-400 text-sm">
            チェックまたは自由コメント付きのフィードバックはまだありません。
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">日時</th>
                  <th className="px-2 py-1 text-left">ユーザー</th>
                  <th className="px-2 py-1 text-left">video_id</th>
                  <th className="px-2 py-1 text-left">ai_message_id</th>
                  <th className="px-2 py-1 text-center">重複</th>
                  <th className="px-2 py-1 text-center">真偽</th>
                  <th className="px-2 py-1 text-center" title="曖昧・ありきたり（正誤はないが陳腐）">
                    ありきたり
                  </th>
                  <th className="px-2 py-1 text-left">自由コメント</th>
                  <th className="px-2 py-1 text-left">対象AIコメント（先頭）</th>
                </tr>
              </thead>
              <tbody>
                {detailFeedbackRows.map((r) => {
                  const bodyPreview = (r.body ?? '').split('\n').slice(0, 2).join(' ');
                  const t = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '—';
                  const chk = (v: boolean | null | undefined) =>
                    v === true ? '✓' : v === false ? '—' : '?';
                  return (
                    <tr key={r.id ?? `${r.ai_message_id}-${r.created_at}`} className="border-t border-gray-800">
                      <td className="whitespace-nowrap px-2 py-1 text-[10px] text-gray-400">{t}</td>
                      <td className="max-w-[140px] px-2 py-1 font-mono text-[10px] text-gray-300 break-all" title={r.user_id ?? ''}>
                        {r.user_id && r.user_id.trim() ? r.user_id : <span className="text-gray-500">ゲスト（未ログイン）</span>}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-blue-300">
                        {r.video_id ?? '(なし)'}
                      </td>
                      <td className="px-2 py-1 font-mono text-[10px] text-gray-400">{r.ai_message_id}</td>
                      <td className="px-2 py-1 text-center text-amber-200">{chk(r.is_duplicate)}</td>
                      <td className="px-2 py-1 text-center text-amber-200">{chk(r.is_dubious)}</td>
                      <td className="px-2 py-1 text-center text-amber-200">{chk(r.is_ambiguous)}</td>
                      <td className="max-w-[200px] px-2 py-1 whitespace-pre-wrap text-[11px] text-gray-200">
                        {r.free_comment?.trim() ? r.free_comment.trim() : '—'}
                      </td>
                      <td className="max-w-xs px-2 py-1">
                        <div className="whitespace-pre-wrap text-[11px] leading-snug text-gray-200">
                          {bodyPreview}
                          {(r.body?.length ?? 0) > bodyPreview.length ? ' …' : ''}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">
          当該曲の選曲回数（ログインユーザー別）
        </h2>
        {userPickCounts.length === 0 ? (
          <p className="text-gray-400 text-sm">
            ログインユーザーの選曲履歴はまだありません（または取得対象外）。
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-gray-800 text-gray-300">
                <tr>
                  <th className="px-2 py-1 text-left">user_id</th>
                  <th className="px-2 py-1 text-right">回数</th>
                </tr>
              </thead>
              <tbody>
                {userPickCounts.map((r) => (
                  <tr key={r.userId} className="border-t border-gray-800">
                    <td className="px-2 py-1 font-mono text-[11px] text-gray-300">{r.userId}</td>
                    <td className="px-2 py-1 text-right text-[11px] text-emerald-300">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {userPickCountTruncated ? (
          <p className="mt-2 text-[11px] text-amber-300">
            件数が多いため上限までで集計しています（最大 12,000 履歴行）。
          </p>
        ) : null}
      </section>

      {/* カタログ詳細（DB 列） */}
      <section className="mb-4 rounded border border-gray-700 bg-gray-900 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-200">カタログ詳細（songs）</h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 text-xs">
          <MetaRow label="music8_song_id" value={song.music8_song_id != null ? String(song.music8_song_id) : null} />
          <MetaRow label="music8_artist_slug" value={song.music8_artist_slug ?? null} mono />
          <MetaRow label="music8_song_slug" value={song.music8_song_slug ?? null} mono />
          <MetaRow label="music8_video_id (canonical)" value={song.music8_video_id ?? null} mono />
          <MetaRow label="genres" value={Array.isArray(song.genres) && song.genres.length > 0 ? song.genres.join(', ') : null} />
          <MetaRow label="vocal" value={song.vocal ?? null} />
          <MetaRow label="primary_artist_name_ja" value={song.primary_artist_name_ja ?? null} />
          <MetaRow label="structured_style" value={song.structured_style ?? null} />
          <MetaRow
            label="spotify_track_id"
            value={song.spotify_track_id ?? null}
            mono
            href={song.spotify_track_id ? `https://open.spotify.com/track/${song.spotify_track_id}` : null}
          />
          <MetaRow
            label="spotify_artists01_id"
            value={spotifyArtistId}
            mono
            href={spotifyArtistId ? `https://open.spotify.com/artist/${spotifyArtistId}` : null}
          />
          <MetaRow label="spotify_release_date" value={song.spotify_release_date ?? null} />
          <MetaRow label="spotify_name" value={song.spotify_name ?? null} />
          <MetaRow label="spotify_artists" value={song.spotify_artists ?? null} />
          <MetaRow label="spotify_popularity" value={song.spotify_popularity != null ? String(song.spotify_popularity) : null} />
        </div>
        {(() => {
          const cover = resolveSongCoverImage({
            spotifyImages: song.spotify_images,
            videoId: primaryVideoId,
          });
          if (!cover.url) return null;
          return (
            <div className="mt-2 flex items-start gap-3">
              <SongCoverThumb
                spotifyImages={song.spotify_images}
                videoId={primaryVideoId}
                alt={cover.source === 'youtube' ? 'YouTube thumbnail' : 'Spotify album art'}
                className="h-14 w-14"
              />
              <p className="break-all text-[11px] text-gray-500">
                {cover.source === 'youtube' ? 'YouTube サムネ（Spotify ジャケットなし）: ' : ''}
                {cover.url}
              </p>
            </div>
          );
        })()}
        {song.music8_artist_slug && song.music8_song_slug ? (
          <p className="mt-2 text-[11px] text-gray-500">
            公開 JSON（参照のみ・取込しない）:{' '}
            <a
              href={music8SongJsonUrl(song.music8_artist_slug, song.music8_song_slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:underline"
            >
              {`/data/songs/${song.music8_artist_slug}_${song.music8_song_slug}.json`}
            </a>
          </p>
        ) : null}
      </section>
    </main>
  );
}


