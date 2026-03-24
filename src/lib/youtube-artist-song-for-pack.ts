import type { VideoSnippet } from '@/lib/youtube-search';
import {
  buildArtistSongFromTitleSegments,
  cleanAuthor,
  getAmbiguousTitleSegmentsForMusicBrainz,
  getArtistAndSong,
  getArtistDisplayString,
  getMainArtist,
  parseArtistTitleFromDescription,
  swapIfCompoundArtistStuckInSongSlot,
} from '@/lib/format-song-display';
import { resolveTitleOrderWithMusicBrainz } from '@/lib/musicbrainz-title-order';

function enrichArtistSongFromSnippet(
  result: { artist: string | null; artistDisplay: string | null; song: string },
  snippet: VideoSnippet | null,
): { artist: string | null; artistDisplay: string | null; song: string } {
  let { artist, artistDisplay, song } = result;
  if (!artistDisplay || !artist) {
    if (snippet?.description) {
      const fromDesc = parseArtistTitleFromDescription(snippet.description);
      if (fromDesc) {
        artist = getMainArtist(fromDesc.artist);
        artistDisplay = getArtistDisplayString(fromDesc.artist);
        song = fromDesc.song;
      } else {
        if (!artist && snippet.channelTitle) {
          const ch = cleanAuthor(snippet.channelTitle.trim());
          if (ch) {
            artist = getMainArtist(ch);
            artistDisplay = getArtistDisplayString(ch);
          }
        }
        if (!song && snippet.title) song = snippet.title.trim();
      }
    }
  }

  return { artist, artistDisplay, song };
}

function finalizePackArtistSong(
  r: { artist: string | null; artistDisplay: string | null; song: string },
  description: string | null | undefined,
): { artist: string | null; artistDisplay: string | null; song: string } {
  return swapIfCompoundArtistStuckInSongSlot(r.artist, r.artistDisplay, r.song, description ?? null);
}

/**
 * comment-pack / announce-song 共通: oEmbed タイトル・作者・snippet からアーティスト・曲名を解決。
 */
export function resolveArtistSongForPack(
  title: string,
  authorName: string | null | undefined,
  snippet: VideoSnippet | null,
): { artist: string | null; artistDisplay: string | null; song: string } {
  const base = getArtistAndSong(title, authorName, {
    videoDescription: snippet?.description ?? null,
  });
  return finalizePackArtistSong(enrichArtistSongFromSnippet(base, snippet), snippet?.description);
}

/**
 * 上記に加え、タイトルが曖昧なときだけ MusicBrainz 録音検索でアーティスト／曲名の順を補正（サーバー専用）。
 */
type ResolvedArtistSong = {
  artist: string | null;
  artistDisplay: string | null;
  song: string;
};

function logArtistPackResolution(
  trace: string,
  title: string,
  authorName: string | null | undefined,
  r: ResolvedArtistSong,
): ResolvedArtistSong {
  if (process.env.DEBUG_YT_ARTIST === '1') {
    console.info(`[resolveArtistSongForPackAsync] ${trace}`, {
      title: title.slice(0, 120),
      authorName: authorName?.slice(0, 80),
      artistDisplay: r.artistDisplay,
      song: r.song,
    });
  }
  return r;
}

export async function resolveArtistSongForPackAsync(
  title: string,
  authorName: string | null | undefined,
  snippet: VideoSnippet | null,
): Promise<ResolvedArtistSong> {
  const desc = snippet?.description ?? null;
  const amb = getAmbiguousTitleSegmentsForMusicBrainz(title, authorName, desc);
  if (amb) {
    const hint = await resolveTitleOrderWithMusicBrainz(amb.left, amb.right);
    if (hint === 'left_is_artist') {
      const base = buildArtistSongFromTitleSegments(amb.left, amb.right, desc);
      return logArtistPackResolution(
        'musicbrainz:left_is_artist',
        title,
        authorName,
        finalizePackArtistSong(enrichArtistSongFromSnippet(base, snippet), snippet?.description),
      );
    }
    if (hint === 'right_is_artist') {
      const base = buildArtistSongFromTitleSegments(amb.right, amb.left, desc);
      return logArtistPackResolution(
        'musicbrainz:right_is_artist',
        title,
        authorName,
        finalizePackArtistSong(enrichArtistSongFromSnippet(base, snippet), snippet?.description),
      );
    }
  }
  return logArtistPackResolution(
    'heuristic',
    title,
    authorName,
    resolveArtistSongForPack(title, authorName, snippet),
  );
}
