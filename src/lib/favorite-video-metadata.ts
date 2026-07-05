import type { SupabaseClient } from '@supabase/supabase-js';
import { getArtistAndSong } from '@/lib/format-song-display';
import { fetchOEmbed } from '@/lib/youtube-oembed';

export type FavoriteVideoMetadata = {
  title: string | null;
  artistName: string | null;
};

function normalizeMeta(title: string | null, artistName: string | null): FavoriteVideoMetadata {
  const t = (title ?? '').trim();
  const a = (artistName ?? '').trim();
  return {
    title: t || null,
    artistName: a || null,
  };
}

function looksLikeVideoId(s: string): boolean {
  return /^[\w-]{11}$/.test(s.trim());
}

function metadataIsUsable(meta: FavoriteVideoMetadata): boolean {
  const t = (meta.title ?? '').trim();
  return Boolean(t) && !looksLikeVideoId(t);
}

/** お気に入り保存・表示向けに video_id から曲名・アーティストを補完 */
export async function resolveFavoriteVideoMetadata(
  admin: SupabaseClient | null,
  videoId: string,
): Promise<FavoriteVideoMetadata> {
  const vid = videoId.trim();
  if (!vid || !admin) return { title: null, artistName: null };

  const { data: pbRows, error: pbErr } = await admin
    .from('room_playback_history')
    .select('title, artist_name')
    .eq('video_id', vid)
    .order('played_at', { ascending: false })
    .limit(8);

  if (!pbErr || pbErr.code === '42P01') {
    for (const row of pbRows ?? []) {
      const rawTitle = typeof row.title === 'string' ? row.title.trim() : '';
      const rawArtist = typeof row.artist_name === 'string' ? row.artist_name.trim() : '';
      if (rawArtist && rawTitle && !looksLikeVideoId(rawTitle)) {
        const meta = normalizeMeta(rawTitle, rawArtist);
        if (metadataIsUsable(meta)) return meta;
      }
      if (rawTitle && !looksLikeVideoId(rawTitle)) {
        const parsed = getArtistAndSong(rawTitle, rawArtist || null);
        if (parsed.song) {
          const meta = normalizeMeta(
            parsed.song,
            (parsed.artistDisplay ?? parsed.artist ?? rawArtist) || null,
          );
          if (metadataIsUsable(meta)) return meta;
        }
        if (rawArtist) {
          const meta = normalizeMeta(rawTitle, rawArtist);
          if (metadataIsUsable(meta)) return meta;
        }
      }
    }
  }

  const { data: svHit } = await admin
    .from('song_videos')
    .select('song_id')
    .eq('video_id', vid)
    .limit(1)
    .maybeSingle();

  const songId = typeof svHit?.song_id === 'string' ? svHit.song_id.trim() : '';
  if (songId) {
    const { data: songRow } = await admin
      .from('songs')
      .select('song_title, display_title, main_artist')
      .eq('id', songId)
      .maybeSingle();

    if (songRow) {
      const songTitle =
        (typeof songRow.song_title === 'string' ? songRow.song_title.trim() : '') ||
        (typeof songRow.display_title === 'string' ? songRow.display_title.trim() : '');
      const mainArtist = typeof songRow.main_artist === 'string' ? songRow.main_artist.trim() : '';
      const meta = normalizeMeta(songTitle, mainArtist);
      if (metadataIsUsable(meta)) return meta;
    }
  }

  const oembed = await fetchOEmbed(vid);
  const ytTitle = oembed?.title?.trim() ?? '';
  if (ytTitle) {
    const parsed = getArtistAndSong(ytTitle, oembed?.author_name ?? null);
    if (parsed.song) {
      const meta = normalizeMeta(parsed.song, (parsed.artistDisplay ?? parsed.artist) || null);
      if (metadataIsUsable(meta)) return meta;
    }
    const meta = normalizeMeta(ytTitle, oembed?.author_name ?? null);
    if (metadataIsUsable(meta)) return meta;
  }

  return { title: null, artistName: null };
}

export function favoriteRowNeedsMetadata(title: string | null | undefined, artistName?: string | null): boolean {
  const t = (title ?? '').trim();
  const a = (artistName ?? '').trim();
  if (!t) return true;
  if (looksLikeVideoId(t)) return true;
  return !a && t.includes(' - ');
}

export function formatFavoriteArtistTitle(
  title: string | null | undefined,
  artistName: string | null | undefined,
  videoId: string,
): string {
  const t = (title ?? '').trim();
  const a = (artistName ?? '').trim();
  if (a && t && !looksLikeVideoId(t)) return `${a} - ${t}`;
  if (t && !looksLikeVideoId(t)) return t;
  return videoId;
}
