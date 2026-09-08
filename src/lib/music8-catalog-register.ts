/**
 * YouTube 1 回登録: songs/song_videos upsert → カタログ同期 → 増分 JSON。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { buildSongDbRegistrationInput } from '@/lib/song-db-registration-gate';
import { syncMusic8CatalogTaxonomyFromSongJson } from '@/lib/music8-catalog-sync';
import { exportOneSongToDisk } from '@/lib/music8-catalog-json-write';
import { youtubeVideoIdFromUnknown } from '@/lib/music8-catalog-slugs';
import { mapMusic8NavSlugToAppSongStyle } from '@/lib/music8-genre-style-map';
import { getArtistDisplayString } from '@/lib/format-song-display';
import { getVideoSnippet } from '@/lib/youtube-search';
import { dateOnlyFromYoutubePublishedAt } from '@/lib/youtube-published-at-date';
import { fetchArtistSongDefaultsForAdmin } from '@/lib/admin-song-artist-defaults';
import { inferSongVideoVariantFromTitle } from '@/lib/song-alternate-pv-match';

export type RegisterWesternSongInput = {
  youtubeId: string;
  artist: string;
  title: string;
  styleSlug?: string | null;
  catalogScope?: 'western' | 'domestic' | 'unknown';
  exportJson?: boolean;
  exportDir?: string | null;
};

export type RegisterWesternSongResult = {
  songId: string;
  videoId: string;
  exportPath: string | null;
  exportSkipped: boolean;
  /** YouTube `snippet.publishedAt` の YYYY-MM-DD（取れなければ null） */
  youtubePublishedAt: string | null;
};

export async function registerWesternSongFromYoutube(
  admin: SupabaseClient,
  input: RegisterWesternSongInput,
): Promise<RegisterWesternSongResult | { error: string }> {
  const videoId = youtubeVideoIdFromUnknown(input.youtubeId);
  if (!videoId) return { error: 'YouTube ID が不正です。' };
  const artistRaw = input.artist.trim();
  const artist = getArtistDisplayString(artistRaw) || artistRaw;
  const title = input.title.trim();
  if (!artist || !title) return { error: 'アーティストと曲名が必要です。' };

  let youtubePublishedAtIso: string | null = null;
  let youtubeTitleForVariant: string | null = null;
  try {
    const snippet = await getVideoSnippet(videoId, { source: 'admin-songs-register' });
    const raw = typeof snippet?.publishedAt === 'string' ? snippet.publishedAt.trim() : '';
    youtubePublishedAtIso = raw || null;
    youtubeTitleForVariant = typeof snippet?.title === 'string' ? snippet.title.trim() || null : null;
  } catch (e) {
    console.warn('[music8-catalog-register] getVideoSnippet', e);
  }
  const youtubePublishedAt = dateOnlyFromYoutubePublishedAt(youtubePublishedAtIso);
  const variant = inferSongVideoVariantFromTitle(youtubeTitleForVariant) || 'official';

  const songId = await upsertSongAndVideo({
    supabase: admin,
    videoId,
    mainArtist: artist,
    songTitle: title,
    variant,
    catalogScope: input.catalogScope ?? 'western',
    youtubePublishedAtIso,
    originalReleaseDateIso: youtubePublishedAt,
    registrationCheck: buildSongDbRegistrationInput({
      videoId,
      rawTitle: `${artist} - ${title}`,
      mainArtist: artist,
      songTitle: title,
      forceAllow: true,
    }),
  });
  if (!songId) return { error: '曲マスタへの登録に失敗しました。' };

  try {
    const { data: videoCol } = await admin
      .from('songs')
      .select('music8_video_id')
      .eq('id', songId)
      .maybeSingle();
    const existingVideoId =
      videoCol && typeof (videoCol as { music8_video_id?: string | null }).music8_video_id === 'string'
        ? (videoCol as { music8_video_id: string }).music8_video_id.trim()
        : '';
    if (!existingVideoId) {
      const { error: videoColErr } = await admin
        .from('songs')
        .update({ music8_video_id: videoId })
        .eq('id', songId);
      if (videoColErr && videoColErr.code !== '42703' && videoColErr.code !== '42P01') {
        console.warn('[music8-catalog-register] songs.music8_video_id', videoColErr.message);
      }
    }
  } catch (e) {
    console.warn('[music8-catalog-register] songs.music8_video_id', e);
  }

  try {
    const { data: vocalRow } = await admin
      .from('songs')
      .select('vocal, artist_id')
      .eq('id', songId)
      .maybeSingle();
    const currentVocal =
      vocalRow && typeof (vocalRow as { vocal?: string | null }).vocal === 'string'
        ? (vocalRow as { vocal: string }).vocal.trim()
        : '';
    if (!currentVocal) {
      const defaults = await fetchArtistSongDefaultsForAdmin(admin, {
        songId,
        artistId: (vocalRow as { artist_id?: string | null } | null)?.artist_id ?? null,
        mainArtist: artist,
        creditCount: 1,
      });
      if (defaults.suggestedVocal) {
        const { error: vocalErr } = await admin
          .from('songs')
          .update({ vocal: defaults.suggestedVocal })
          .eq('id', songId);
        if (vocalErr && vocalErr.code !== '42703' && vocalErr.code !== '42P01') {
          console.warn('[music8-catalog-register] songs.vocal', vocalErr.message);
        }
      }
    }
  } catch (e) {
    console.warn('[music8-catalog-register] vocal from artist history', e);
  }

  const pseudoJson = {
    styles: input.styleSlug ? [input.styleSlug] : [],
    artists: [{ name: artist, slug: '' }],
  };
  await syncMusic8CatalogTaxonomyFromSongJson(admin, songId, {
    ...pseudoJson,
    title,
    videoId,
  });

  const appStyle = mapMusic8NavSlugToAppSongStyle(input.styleSlug);
  if (appStyle) {
    const { data: styleRow } = await admin.from('songs').select('style').eq('id', songId).maybeSingle();
    const currentStyle =
      styleRow && typeof (styleRow as { style?: unknown }).style === 'string'
        ? (styleRow as { style: string }).style.trim()
        : '';
    if (!currentStyle) {
      const { error: styleErr } = await admin.from('songs').update({ style: appStyle }).eq('id', songId);
      if (styleErr && styleErr.code !== '42703' && styleErr.code !== '42P01') {
        console.warn('[music8-catalog-register] songs.style', styleErr.message);
      }
    }
  }

  let exportPath: string | null = null;
  let exportSkipped = input.exportJson === false;
  if (input.exportJson !== false) {
    const exported = await exportOneSongToDisk(admin, songId, input.exportDir);
    if (exported.ok) exportPath = exported.songPath;
    else exportSkipped = true;
  }

  return { songId, videoId, exportPath, exportSkipped, youtubePublishedAt };
}
