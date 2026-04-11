import { formatArtistTitle } from '@/lib/format-song-display';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { fetchPlaybackDisplayOverride } from '@/lib/video-playback-display-override';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoSnippet } from '@/lib/youtube-search';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';

export type ArtistTitleParseReportSnapshot = {
  collectedAt: string;
  videoId: string;
  roomId: string | null;
  oembed: {
    title: string | null;
    author_name: string | null;
  } | null;
  snippet: {
    title: string | null;
    channelTitle: string | null;
    channelId: string | null;
    defaultAudioLanguage: string | null;
    descriptionPreview: string | null;
  } | null;
  playbackDisplayOverride: { title: string; artist_name: string | null } | null;
  resolvedPack: {
    artist: string | null;
    artistDisplay: string | null;
    song: string;
  };
  /** announce-song と同系の1行表記（邦楽タグなし・簡易） */
  artistTitleLineFromPack: string;
  formattedFallbackLine: string;
  /** 当時の切替フラグ（再現用） */
  envYtArtistTitleMode: string | null;
};

function previewDescription(desc: string | null | undefined, max = 2000): string | null {
  if (!desc?.trim()) return null;
  const t = desc.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * 報告保存用: oEmbed・snippet・DB 上書き・resolveArtistSongForPackAsync をまとめて取得。
 */
export async function buildArtistTitleParseReportSnapshot(
  videoId: string,
  roomId: string | null | undefined,
): Promise<ArtistTitleParseReportSnapshot> {
  const sourceBase = 'artist-title-parse-report';
  const [oembed, snippet] = await Promise.all([
    fetchOEmbed(videoId),
    getVideoSnippet(videoId, {
      roomId: roomId?.trim() || undefined,
      source: sourceBase,
    }),
  ]);

  const supabase = await createClient();
  const reader = createAdminClient() ?? supabase;
  if (!reader) {
    throw new Error('Supabase client unavailable');
  }
  const displayOverride = await fetchPlaybackDisplayOverride(reader, videoId);

  const rawYouTubeTitle = oembed?.title ?? videoId;
  const authorNameOembed = oembed?.author_name ?? null;
  const title = displayOverride?.title ?? rawYouTubeTitle;
  const authorName =
    displayOverride?.artist_name?.trim() ? displayOverride.artist_name.trim() : authorNameOembed;

  const resolvePackOpts =
    displayOverride != null ? { trustProvidedTitleOverFamousPv: true as const } : undefined;
  const resolvedPack = await resolveArtistSongForPackAsync(
    title,
    authorName,
    snippet,
    videoId,
    resolvePackOpts,
  );

  const artistTitleLineFromPack =
    resolvedPack.artistDisplay && resolvedPack.song
      ? `${resolvedPack.artistDisplay} - ${resolvedPack.song}`
      : formatArtistTitle(title, authorName, snippet?.description ?? null, snippet?.channelTitle ?? null);

  const formattedFallbackLine = formatArtistTitle(
    title,
    authorName,
    snippet?.description ?? null,
    snippet?.channelTitle ?? null,
  );

  return {
    collectedAt: new Date().toISOString(),
    videoId,
    roomId: roomId?.trim() || null,
    oembed: oembed
      ? {
          title: oembed.title ?? null,
          author_name: oembed.author_name ?? null,
        }
      : null,
    snippet: snippet
      ? {
          title: snippet.title ?? null,
          channelTitle: snippet.channelTitle ?? null,
          channelId: snippet.channelId ?? null,
          defaultAudioLanguage: snippet.defaultAudioLanguage ?? null,
          descriptionPreview: previewDescription(snippet.description),
        }
      : null,
    playbackDisplayOverride: displayOverride,
    resolvedPack: {
      artist: resolvedPack.artist,
      artistDisplay: resolvedPack.artistDisplay,
      song: resolvedPack.song,
    },
    artistTitleLineFromPack,
    formattedFallbackLine,
    envYtArtistTitleMode: process.env.YT_ARTIST_TITLE_MODE?.trim() || null,
  };
}
