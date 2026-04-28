/**
 * 曲マスタと song_videos への登録・更新ヘルパー
 * - 既存API（room-playback-history / commentary）から呼び出して、
 *   video_id ごとに「曲（songs）」をひとつに集約する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPersistableMusic8SongSnapshot } from '@/lib/music8-song-persist';
import {
  extractMusic8SongFields,
  extractMusic8SongFieldsFromPersistedSnapshot,
  music8ReleaseYearMonthToPostgresDate,
  resolveSongStyleForOverwriteFromMusic8,
  type Music8SongExtract,
} from '@/lib/music8-song-fields';

export interface UpsertSongAndVideoParams {
  supabase: SupabaseClient | null;
  videoId: string;
  mainArtist?: string | null;
  songTitle?: string | null;
  variant?: string | null;
  performanceId?: string | null;
  /** YouTube Data API `snippet.publishedAt`（RFC3339）→ `song_videos.youtube_published_at` */
  youtubePublishedAtIso?: string | null;
  /** 原盤リリース日 `YYYY-MM-DD` → `songs.original_release_date`（既に値がある行は更新しない） */
  originalReleaseDateIso?: string | null;
  /** Music8 曲 JSON の軽量スナップショット → `songs.music8_song_data`（取得できたときのみ上書き更新） */
  music8SongData?: Record<string, unknown> | null;
}

type ParsedArtistInfo = {
  displayName: string | null;
  music8ArtistSlug: string | null;
  primaryArtistNameJa: string | null;
  spotifyArtistId: string | null;
  spotifyArtistImages: string | null;
  spotifyArtistPopularity: number | null;
  wikipediaPage: string | null;
  youtubeChannelId: string | null;
};

function normalizeYoutubePublishedAtForDb(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const t = iso.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function patchSongOriginalReleaseDateIfUnset(
  supabase: SupabaseClient,
  songId: string,
  isoDate: string | null | undefined,
): Promise<void> {
  const d = (isoDate ?? '').trim();
  if (!d) return;

  const { data, error } = await supabase
    .from('songs')
    .select('original_release_date')
    .eq('id', songId)
    .maybeSingle();

  if (error) {
    if (error.code === '42703' || error.code === '42P01') return;
    console.error('[song-entities] patchSongOriginalReleaseDateIfUnset select', error.code, error.message);
    return;
  }

  const cur = (data as { original_release_date?: string | null } | null)?.original_release_date;
  if (cur != null && String(cur).trim() !== '') return;

  const { error: u } = await supabase.from('songs').update({ original_release_date: d }).eq('id', songId);
  if (u?.code === '42703') return;
  if (u) {
    console.error('[song-entities] patchSongOriginalReleaseDateIfUnset update', u.code, u.message);
  }
}

async function patchSongMusic8SongData(
  supabase: SupabaseClient,
  songId: string,
  payload: Record<string, unknown> | null | undefined,
): Promise<void> {
  if (!payload || typeof payload !== 'object') return;

  const { error } = await supabase.from('songs').update({ music8_song_data: payload }).eq('id', songId);
  if (error?.code === '42703' || error?.code === '42P01') return;
  if (error) {
    console.error('[song-entities] patchSongMusic8SongData update', error.code, error.message);
  }
}

function pickSpotifyTrackIdFromSnapshot(payload: Record<string, unknown>): string | null {
  const direct = payload.spotify_track_id;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const identifiers = payload.identifiers;
  if (identifiers && typeof identifiers === 'object' && !Array.isArray(identifiers)) {
    const v = (identifiers as Record<string, unknown>).spotify_track_id;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function patchSongFutureColumnsFromMusic8(
  supabase: SupabaseClient,
  songId: string,
  ex: Music8SongExtract,
  payload: Record<string, unknown> | null | undefined,
): Promise<void> {
  const basePayload: Record<string, unknown> = {};
  if (ex.genres.length > 0) basePayload.genres = ex.genres;
  if (ex.primaryArtistNameJa.trim()) basePayload.primary_artist_name_ja = ex.primaryArtistNameJa.trim();
  if (ex.vocalLabel.trim()) basePayload.vocal = ex.vocalLabel.trim();
  if (ex.structuredStyleFromFacts.trim()) basePayload.structured_style = ex.structuredStyleFromFacts.trim();
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    const music8SongId = p.id;
    if (typeof music8SongId === 'number' && Number.isFinite(music8SongId) && music8SongId > 0) {
      basePayload.music8_song_id = Math.floor(music8SongId);
    }
    const stableKey = p.stable_key;
    if (stableKey && typeof stableKey === 'object' && !Array.isArray(stableKey)) {
      const sk = stableKey as Record<string, unknown>;
      if (typeof sk.artist_slug === 'string' && sk.artist_slug.trim()) {
        basePayload.music8_artist_slug = sk.artist_slug.trim();
      }
      if (typeof sk.song_slug === 'string' && sk.song_slug.trim()) {
        basePayload.music8_song_slug = sk.song_slug.trim();
      }
    }
    // music8_wp_song: slug / main_artists[0].slug から補完
    if (!basePayload.music8_song_slug && typeof p.slug === 'string' && p.slug.trim()) {
      basePayload.music8_song_slug = p.slug.trim();
    }
    if (!basePayload.music8_artist_slug && Array.isArray(p.main_artists)) {
      const firstSlug = (p.main_artists as unknown[]).map((a) => {
        const o = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
        return o && typeof o.slug === 'string' ? o.slug.trim() : '';
      }).find(Boolean);
      if (firstSlug) basePayload.music8_artist_slug = firstSlug;
    }
    // Music8 canonical YouTube video ID
    if (typeof p.videoId === 'string' && p.videoId.trim()) {
      basePayload.music8_video_id = p.videoId.trim();
    }
    const spotifyTrackId = pickSpotifyTrackIdFromSnapshot(p);
    if (spotifyTrackId) basePayload.spotify_track_id = spotifyTrackId;
    // Spotify 曲レベルメタ
    if (typeof p.spotify_release_date === 'string' && p.spotify_release_date.trim()) {
      basePayload.spotify_release_date = p.spotify_release_date.trim();
    }
    if (typeof p.spotify_name === 'string' && p.spotify_name.trim()) {
      basePayload.spotify_name = p.spotify_name.trim();
    }
    if (typeof p.spotify_artists === 'string' && p.spotify_artists.trim()) {
      basePayload.spotify_artists = p.spotify_artists.trim();
    }
    if (typeof p.spotify_images === 'string' && p.spotify_images.trim()) {
      basePayload.spotify_images = p.spotify_images.trim();
    }
    const spotifyPop = p.spotify_popularity;
    if (typeof spotifyPop === 'number' && Number.isFinite(spotifyPop)) {
      basePayload.spotify_popularity = Math.round(spotifyPop);
    }
  }
  if (Object.keys(basePayload).length === 0) return;

  const { error } = await supabase.from('songs').update(basePayload).eq('id', songId);
  if (error?.code === '42703' || error?.code === '42P01') return;
  if (error) {
    console.error('[song-entities] patchSongFutureColumnsFromMusic8 update', error.code, error.message);
  }
}

function buildDisplayTitle(mainArtist?: string | null, songTitle?: string | null): string | null {
  const artist = (mainArtist ?? '').trim();
  const title = (songTitle ?? '').trim();
  if (!artist && !title) return null;
  if (!artist) return title || null;
  if (!title) return artist || null;
  return `${artist} - ${title}`;
}

function parseArtistInfoFromMusic8Payload(
  mainArtist: string | null | undefined,
  payload: Record<string, unknown> | null | undefined,
): ParsedArtistInfo {
  const displayName = (mainArtist ?? '').trim() || null;
  let music8ArtistSlug: string | null = null;
  let primaryArtistNameJa: string | null = null;
  let spotifyArtistId: string | null = null;
  let spotifyArtistImages: string | null = null;
  let spotifyArtistPopularity: number | null = null;
  let wikipediaPage: string | null = null;
  let youtubeChannelId: string | null = null;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    // musicaichat_v1: stable_key.artist_slug
    const sk = payload.stable_key;
    if (sk && typeof sk === 'object' && !Array.isArray(sk)) {
      const slug = (sk as Record<string, unknown>).artist_slug;
      if (typeof slug === 'string' && slug.trim()) music8ArtistSlug = slug.trim();
    }
    // music8_wp_song: main_artists[0].slug
    if (!music8ArtistSlug && Array.isArray(payload.main_artists)) {
      const firstSlug = (payload.main_artists as unknown[]).map((a) => {
        const o = a && typeof a === 'object' && !Array.isArray(a) ? (a as Record<string, unknown>) : null;
        return o && typeof o.slug === 'string' ? o.slug.trim() : '';
      }).find(Boolean);
      if (firstSlug) music8ArtistSlug = firstSlug;
    }
    // primaryArtistNameJa
    const p = payload.primary_artist_name_ja;
    if (typeof p === 'string' && p.trim()) {
      primaryArtistNameJa = p.trim();
    } else {
      const display = payload.display;
      if (display && typeof display === 'object' && !Array.isArray(display)) {
        const p2 = (display as Record<string, unknown>).primary_artist_name_ja;
        if (typeof p2 === 'string' && p2.trim()) primaryArtistNameJa = p2.trim();
      }
    }
    // Spotify アーティストレベル（music8_wp_song スナップショットに保存済み）
    const aid = payload.artist_spotify_id;
    if (typeof aid === 'string' && aid.trim()) spotifyArtistId = aid.trim();
    const aimg = payload.artist_spotify_images;
    if (typeof aimg === 'string' && aimg.trim()) spotifyArtistImages = aimg.trim();
    const apopRaw = payload.artist_spotify_popularity;
    if (typeof apopRaw === 'number' && Number.isFinite(apopRaw)) spotifyArtistPopularity = Math.round(apopRaw);
    const wiki = payload.artist_wikipedia_page;
    if (typeof wiki === 'string' && wiki.trim()) wikipediaPage = wiki.trim();
    const ytch = payload.artist_youtube_channel_id;
    if (typeof ytch === 'string' && ytch.trim()) youtubeChannelId = ytch.trim();
  }
  return {
    displayName,
    music8ArtistSlug,
    primaryArtistNameJa,
    spotifyArtistId,
    spotifyArtistImages,
    spotifyArtistPopularity,
    wikipediaPage,
    youtubeChannelId,
  };
}

async function ensureArtistAndLinkSong(
  supabase: SupabaseClient,
  songId: string,
  info: ParsedArtistInfo,
): Promise<void> {
  const name = (info.displayName ?? '').trim();
  const slug = (info.music8ArtistSlug ?? '').trim();
  const nameJa = (info.primaryArtistNameJa ?? '').trim();
  if (!name && !slug) return;

  const artistPayload: Record<string, unknown> = {
    name: name || (slug ? slug.replace(/[-_]+/g, ' ') : 'Unknown Artist'),
  };
  if (slug) artistPayload.music8_artist_slug = slug;
  if (nameJa) artistPayload.name_ja = nameJa;
  // Spotify アーティスト情報（snapshot から取得できた場合のみ補完）
  if ((info.spotifyArtistId ?? '').trim()) artistPayload.spotify_artist_id = info.spotifyArtistId!.trim();
  if ((info.spotifyArtistImages ?? '').trim()) artistPayload.spotify_artist_images = info.spotifyArtistImages!.trim();
  if (info.spotifyArtistPopularity !== null) artistPayload.spotify_artist_popularity = info.spotifyArtistPopularity;
  if ((info.wikipediaPage ?? '').trim()) artistPayload.wikipedia_page = info.wikipediaPage!.trim();
  // youtube_channel_id → URL に変換して保存（既存 youtube_channel_url が空の場合のみ書き込まない方が安全なため upsert 後に patch）
  const ytChannelId = (info.youtubeChannelId ?? '').trim();
  const ytChannelUrl = ytChannelId ? `https://www.youtube.com/channel/${ytChannelId}` : '';

  let artistId: string | null = null;
  if (slug) {
    const { data, error } = await supabase
      .from('artists')
      .upsert(artistPayload, { onConflict: 'music8_artist_slug' })
      .select('id')
      .single();
    if (error?.code === '42P01' || error?.code === '42703') return;
    if (error) {
      console.error('[song-entities] ensureArtist upsert by music8_artist_slug', error.code, error.message);
      return;
    }
    artistId = (data as { id?: string } | null)?.id ?? null;
  } else {
    const { data, error } = await supabase
      .from('artists')
      .upsert(artistPayload, { onConflict: 'name' })
      .select('id')
      .single();
    if (error?.code === '42P01' || error?.code === '42703') return;
    if (error) {
      console.error('[song-entities] ensureArtist upsert by name', error.code, error.message);
      return;
    }
    artistId = (data as { id?: string } | null)?.id ?? null;
  }
  if (!artistId) return;

  // youtube_channel_url: 既存値が空のときのみ補完
  if (ytChannelUrl) {
    const { data: curArtist } = await supabase
      .from('artists')
      .select('youtube_channel_url')
      .eq('id', artistId)
      .maybeSingle();
    const existingUrl = ((curArtist as { youtube_channel_url?: string | null } | null)?.youtube_channel_url ?? '').trim();
    if (!existingUrl) {
      const { error: ytErr } = await supabase
        .from('artists')
        .update({ youtube_channel_url: ytChannelUrl })
        .eq('id', artistId);
      if (ytErr?.code !== '42703' && ytErr?.code !== '42P01' && ytErr) {
        console.error('[song-entities] update youtube_channel_url', ytErr.code, ytErr.message);
      }
    }
  }

  const { error: linkErr } = await supabase.from('songs').update({ artist_id: artistId }).eq('id', songId);
  if (linkErr?.code === '42703' || linkErr?.code === '42P01') return;
  if (linkErr) {
    console.error('[song-entities] link artist_id to songs', linkErr.code, linkErr.message);
  }
}

/**
 * 曲の正規化 display_title（1曲＝1行にまとめる用）
 * - 末尾の (2018 Mix), [Love Version] などのバージョン表記を除去
 * - "Artist - Artist - Title" を "Artist - Title" に畳む
 * - 末尾の ♪ などを除去
 */
function normalizeDisplayTitle(displayTitle: string): string {
  let s = displayTitle.trim();
  if (!s) return s;

  const sep = ' - ';
  const parts = s.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return s;

  // "Artist - Artist - Title" → "Artist - Title"
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped.length > 0 && deduped[0].toLowerCase() === p.toLowerCase()) continue;
    deduped.push(p);
  }
  if (deduped.length === 0) return s;
  const artist = deduped[0];
  let title = deduped.length > 1 ? deduped.slice(1).join(sep) : '';

  // 末尾の (...) や [...] を繰り返し除去（バージョン表記）
  while (true) {
    const m1 = title.match(/\s*\([^)]*\)\s*$/);
    const m2 = title.match(/\s*\[[^\]]*\]\s*$/);
    const m = m1 || m2;
    if (!m) break;
    title = title.slice(0, title.length - m[0].length).trim();
  }

  // 末尾の記号除去
  title = title.replace(/\s*[♪♫♬]+\s*$/g, '').trim();

  // 大文字小文字を揃えて同一曲とみなす（タイトル部分をタイトルケースに）
  const toTitleCase = (t: string) =>
    t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  title = toTitleCase(title);
  const artistNorm = toTitleCase(artist);

  if (!title) return artistNorm;
  return `${artistNorm} - ${title}`;
}

/**
 * songs / song_videos に upsert し、song_id を返す。
 * - songs は display_title（正規化済み）で検索して、なければ insert。
 * - song_videos は video_id 主キーで upsert。
 */
export async function upsertSongAndVideo(params: UpsertSongAndVideoParams): Promise<string | null> {
  const {
    supabase,
    videoId,
    mainArtist,
    songTitle,
    variant,
    performanceId,
    youtubePublishedAtIso,
    originalReleaseDateIso,
    music8SongData,
  } = params;
  if (!supabase || !videoId || !videoId.trim()) return null;

  const displayTitle = buildDisplayTitle(mainArtist, songTitle);
  if (!displayTitle) return null;

  const trimmedVideoId = videoId.trim();
  const canonicalTitle = normalizeDisplayTitle(displayTitle);

  // 1) まず既存の song_videos から song_id を再利用（同じ videoId で songs の重複作成を防ぐ）
  let songId: string | null = null;
  const { data: existingVideoRow, error: videoSelectError } = await supabase
    .from('song_videos')
    .select('song_id')
    .eq('video_id', trimmedVideoId)
    .limit(1)
    .maybeSingle();

  if (videoSelectError && videoSelectError.code !== '42P01') {
    console.error(
      '[song-entities] select song_videos failed',
      videoSelectError.code,
      videoSelectError.message,
    );
  }

  if (existingVideoRow && 'song_id' in existingVideoRow && existingVideoRow.song_id) {
    songId = existingVideoRow.song_id as string;
  }

  // 2) videoId に紐づく song_id が無い場合のみ、songs を正規化 display_title で検索
  if (!songId) {
    const { data: existingSong, error: songSelectError } = await supabase
      .from('songs')
      .select('id')
      .ilike('display_title', canonicalTitle)
      .limit(1)
      .maybeSingle();

    if (songSelectError && songSelectError.code !== '42P01') {
      console.error(
        '[song-entities] select songs failed',
        songSelectError.code,
        songSelectError.message,
      );
    }

    if (existingSong && 'id' in existingSong && existingSong.id) {
      songId = existingSong.id as string;
    }
  }

  if (!songId) {
    // 3) どちらにも無ければ insert（正規化したタイトルで1曲1行）
    const [canonArtist, ...canonTitleParts] = canonicalTitle.split(' - ');
    const canonSongTitle = canonTitleParts.join(' - ').trim() || (songTitle ?? '').trim();
    const { data: insertedSong, error: songInsertError } = await supabase
      .from('songs')
      .insert({
        main_artist: (canonArtist ?? mainArtist ?? '').trim() || null,
        song_title: canonSongTitle || null,
        display_title: canonicalTitle,
      })
      .select('id')
      .single();

    if (songInsertError) {
      // 既に別トランザクションで作られていた場合は再取得
      if (songInsertError.code === '23505') {
        const { data: dupSong } = await supabase
          .from('songs')
          .select('id')
          .ilike('display_title', canonicalTitle)
          .limit(1)
          .maybeSingle();
        songId = (dupSong as { id?: string } | null)?.id ?? null;
      } else if (songInsertError.code !== '42P01') {
        console.error('[song-entities] insert songs failed', songInsertError.code, songInsertError.message);
      }
    } else {
      songId = (insertedSong as { id?: string } | null)?.id ?? null;
    }
  }

  if (!songId) return null;

  // 3) song_videos に videoId を紐づけ（YouTube クリップ公開日は任意列）
  const ytPub = normalizeYoutubePublishedAtForDb(youtubePublishedAtIso);
  const videoBase = {
    song_id: songId,
    video_id: trimmedVideoId,
    variant: variant ?? null,
    performance_id: performanceId ?? null,
  };
  let videoPayload: typeof videoBase & { youtube_published_at?: string } = videoBase;
  if (ytPub) {
    videoPayload = { ...videoBase, youtube_published_at: ytPub };
  }

  let { error: videoError } = await supabase.from('song_videos').upsert(videoPayload, { onConflict: 'video_id' });

  if (videoError?.code === '42703') {
    const r = await supabase.from('song_videos').upsert(videoBase, { onConflict: 'video_id' });
    videoError = r.error;
  }

  if (videoError && videoError.code !== '42P01') {
    console.error('[song-entities] upsert song_videos failed', videoError.code, videoError.message);
  }

  await patchSongOriginalReleaseDateIfUnset(supabase, songId, originalReleaseDateIso);
  await patchSongMusic8SongData(supabase, songId, music8SongData ?? null);
  if (music8SongData && typeof music8SongData === 'object') {
    const ex = extractMusic8SongFieldsFromPersistedSnapshot(music8SongData);
    if (ex) {
      try {
        await syncSongLibraryColumnsFromMusic8Extract(supabase, songId, ex);
        await patchSongFutureColumnsFromMusic8(supabase, songId, ex, music8SongData);
      } catch (e) {
        console.warn('[song-entities] syncSongLibraryColumnsFromMusic8Extract (upsert)', e);
      }
    }
  }
  try {
    await syncArtistMasterFromMusic8(supabase, songId, mainArtist, music8SongData ?? null);
  } catch (e) {
    console.warn('[song-entities] syncArtistMasterFromMusic8 (upsert)', e);
  }

  return songId;
}

/**
 * `resolveMusic8ContextForCommentPack` 等で取れた生 JSON から `songs.music8_song_data` を上書き更新。
 * comment-pack / commentary は upsert が Music8 より先に走るため、取得後に別途呼ぶ。
 */
export async function attachMusic8SongDataIfFetched(
  supabase: SupabaseClient | null,
  songId: string | null,
  music8RootJson: unknown,
): Promise<void> {
  if (!supabase || !songId?.trim()) return;
  if (music8RootJson == null || typeof music8RootJson !== 'object' || Array.isArray(music8RootJson)) {
    return;
  }
  const snap = buildPersistableMusic8SongSnapshot(music8RootJson);
  if (!snap) return;
  await patchSongMusic8SongData(supabase, songId.trim(), snap);
  const ex = extractMusic8SongFields(music8RootJson);
  try {
    await syncSongLibraryColumnsFromMusic8Extract(supabase, songId.trim(), ex);
    await patchSongFutureColumnsFromMusic8(supabase, songId.trim(), ex, snap);
    await syncArtistMasterFromMusic8(supabase, songId.trim(), null, snap);
  } catch (e) {
    console.warn('[song-entities] syncSongLibraryColumnsFromMusic8Extract (attach)', e);
  }
}

/**
 * 曲の代表スタイル（songs.style）を更新。
 * - 手動スタイル変更や AI 判定の結果を曲単位で持たせたいときに利用。
 */
export async function updateSongStyle(
  supabase: SupabaseClient | null,
  songId: string | null,
  style: string | null
): Promise<boolean> {
  if (!supabase || !songId || !style || !style.trim()) return false;

  const { error } = await supabase
    .from('songs')
    .update({ style: style.trim() })
    .eq('id', songId);

  if (error && error.code !== '42P01') {
    console.error('[song-entities] updateSongStyle failed', error.code, error.message);
    return false;
  }
  return !error;
}

/**
 * Music8 由来の `Music8SongExtract` で `songs.style` を上書きし、原盤日は空欄のときのみ補完。
 */
async function syncSongLibraryColumnsFromMusic8Extract(
  supabase: SupabaseClient | null,
  songId: string,
  ex: Music8SongExtract,
): Promise<void> {
  if (!supabase || !songId) return;
  const style = resolveSongStyleForOverwriteFromMusic8(ex);
  if (style) {
    await updateSongStyle(supabase, songId, style);
  }
  if (ex.releaseDate?.trim()) {
    const iso = music8ReleaseYearMonthToPostgresDate(ex.releaseDate);
    if (iso) {
      await patchSongOriginalReleaseDateIfUnset(supabase, songId, iso);
    }
  }
}

async function syncArtistMasterFromMusic8(
  supabase: SupabaseClient | null,
  songId: string,
  mainArtist: string | null | undefined,
  payload: Record<string, unknown> | null | undefined,
): Promise<void> {
  if (!supabase || !songId) return;
  const info = parseArtistInfoFromMusic8Payload(mainArtist, payload);
  if (!info.displayName && !info.music8ArtistSlug) return;
  await ensureArtistAndLinkSong(supabase, songId, info);
}

/**
 * 曲の視聴回数（このチャットで貼られた回数）を +1 する。
 * - PVのバージョン（video_id）に関係なく、曲（songs）単位で集約される。
 * - 視聴履歴に1件追加されるたびに呼ぶ。
 */
export async function incrementSongPlayCount(
  supabase: SupabaseClient | null,
  songId: string | null
): Promise<void> {
  if (!supabase || !songId) return;

  const { data } = await supabase
    .from('songs')
    .select('play_count')
    .eq('id', songId)
    .maybeSingle();

  const current = Math.max(0, Number((data as { play_count?: number } | null)?.play_count) || 0);
  const { error } = await supabase
    .from('songs')
    .update({ play_count: current + 1 })
    .eq('id', songId);

  if (error && error.code !== '42P01' && error.code !== '42703') {
    console.error('[song-entities] incrementSongPlayCount failed', error.code, error.message);
  }
}

