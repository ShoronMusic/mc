/**
 * YouTube 1 回登録: songs/song_videos upsert → カタログ同期 → 増分 JSON。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { buildSongDbRegistrationInput } from '@/lib/song-db-registration-gate';
import { syncMusic8CatalogTaxonomyFromSongJson } from '@/lib/music8-catalog-sync';
import { exportOneSongToDisk } from '@/lib/music8-catalog-json-write';
import { youtubeVideoIdFromUnknown } from '@/lib/music8-catalog-slugs';

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
};

export async function registerWesternSongFromYoutube(
  admin: SupabaseClient,
  input: RegisterWesternSongInput,
): Promise<RegisterWesternSongResult | { error: string }> {
  const videoId = youtubeVideoIdFromUnknown(input.youtubeId);
  if (!videoId) return { error: 'YouTube ID が不正です。' };
  const artist = input.artist.trim();
  const title = input.title.trim();
  if (!artist || !title) return { error: 'アーティストと曲名が必要です。' };

  const songId = await upsertSongAndVideo({
    supabase: admin,
    videoId,
    mainArtist: artist,
    songTitle: title,
    variant: 'official',
    catalogScope: input.catalogScope ?? 'western',
    registrationCheck: buildSongDbRegistrationInput({
      videoId,
      rawTitle: `${artist} - ${title}`,
      mainArtist: artist,
      songTitle: title,
      forceAllow: true,
    }),
  });
  if (!songId) return { error: '曲マスタへの登録に失敗しました。' };

  const pseudoJson = {
    styles: input.styleSlug ? [input.styleSlug] : [],
    artists: [{ name: artist, slug: '' }],
  };
  await syncMusic8CatalogTaxonomyFromSongJson(admin, songId, {
    ...pseudoJson,
    title,
    videoId,
  });

  let exportPath: string | null = null;
  let exportSkipped = input.exportJson === false;
  if (input.exportJson !== false) {
    const exported = await exportOneSongToDisk(admin, songId, input.exportDir);
    if (exported.ok) exportPath = exported.songPath;
    else exportSkipped = true;
  }

  return { songId, videoId, exportPath, exportSkipped };
}
