import type { VideoSnippet } from '@/lib/youtube-search';
import {
  buildArtistSongFromTitleSegments,
  cleanAuthor,
  getAmbiguousTitleSegmentsForMusicBrainz,
  getArtistAndSong,
  getArtistDisplayString,
  getMainArtist,
  isGarbageArtistSongParse,
  isYoutubeTopicChannelAuthor,
  looksLikeProseOrBloatedDisplayTitle,
  parseArtistTitleFromDescription,
  parsePerformerPlaysSongFromDescription,
  parsePerformerPlaysSongTitle,
  swapIfCompoundArtistStuckInSongSlot,
} from '@/lib/format-song-display';
import { resolveTitleOrderWithMusicBrainz } from '@/lib/musicbrainz-title-order';
import { resolveFamousPvArtistSongPack } from '@/lib/youtube-famous-pv-override';
import { resolveOEmbedToMyListStylePack } from '@/lib/my-list-youtube-title-suggest';

/** 開発・検証用: 選曲まわりを oEmbed + マイリスト系の簡易分割だけにする（MusicBrainz / getArtistAndSong は使わない） */
function isMyListOembedArtistTitleModeEnv(): boolean {
  return process.env.YT_ARTIST_TITLE_MODE === 'mylist_oembed';
}

function packFromPerformerPlays(
  title: string,
  snippet: VideoSnippet | null,
): { artist: string | null; artistDisplay: string | null; song: string } | null {
  const plays =
    parsePerformerPlaysSongTitle(title) ??
    parsePerformerPlaysSongFromDescription(snippet?.description);
  if (!plays) return null;
  const artistPart = plays.artist;
  return {
    artist: getMainArtist(artistPart) || artistPart,
    artistDisplay: getArtistDisplayString(artistPart) || artistPart,
    song: plays.song,
  };
}

function mylistPackLooksUnusable(r: {
  artist: string | null;
  artistDisplay: string | null;
  song: string;
}): boolean {
  const a = (r.artistDisplay || r.artist || '').trim();
  const s = (r.song || '').trim();
  if (!s) return true;
  if (looksLikeProseOrBloatedDisplayTitle(s) || looksLikeProseOrBloatedDisplayTitle(a)) return true;
  if (a && isGarbageArtistSongParse({ artist: a, song: s })) return true;
  return false;
}

function enrichArtistSongFromSnippet(
  result: { artist: string | null; artistDisplay: string | null; song: string },
  snippet: VideoSnippet | null,
  authorName?: string | null,
): { artist: string | null; artistDisplay: string | null; song: string } {
  let { artist, artistDisplay, song } = result;
  if (!artistDisplay || !artist) {
    const channelRaw = (authorName ?? snippet?.channelTitle ?? '').trim();
    if (isYoutubeTopicChannelAuthor(channelRaw)) {
      const ch = cleanAuthor(channelRaw);
      if (ch) {
        artist = getMainArtist(ch) || ch;
        artistDisplay = getArtistDisplayString(ch) || ch;
        if (!song.trim() && snippet?.title?.trim()) song = snippet.title.trim();
        return { artist, artistDisplay, song };
      }
    }
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

export type ResolveArtistSongForPackOptions = {
  /**
   * video_playback_display_override 等で渡す「正しいアーティスト - タイトル」があるとき true。
   * 有名PVの videoId 固定をスキップし、渡された title / authorName を正として解決する。
   */
  trustProvidedTitleOverFamousPv?: boolean;
};

/**
 * comment-pack / announce-song 共通: oEmbed タイトル・作者・snippet からアーティスト・曲名を解決。
 */
export function resolveArtistSongForPack(
  title: string,
  authorName: string | null | undefined,
  snippet: VideoSnippet | null,
  videoId?: string | null,
  options?: ResolveArtistSongForPackOptions,
): { artist: string | null; artistDisplay: string | null; song: string } {
  const famous =
    !options?.trustProvidedTitleOverFamousPv && resolveFamousPvArtistSongPack(videoId);
  if (famous) {
    return finalizePackArtistSong(
      {
        artist: famous.artist,
        artistDisplay: famous.artistDisplay,
        song: famous.song,
      },
      snippet?.description,
    );
  }
  if (isMyListOembedArtistTitleModeEnv()) {
    const playsPack = packFromPerformerPlays(title, snippet);
    if (playsPack) {
      return finalizePackArtistSong(playsPack, snippet?.description);
    }
    const r = resolveOEmbedToMyListStylePack(title, authorName);
    if (!mylistPackLooksUnusable(r)) {
      return finalizePackArtistSong(r, snippet?.description);
    }
    // 散文タイトルを mylist が誤分割したときは通常経路へフォールバック
  }
  const base = getArtistAndSong(title, authorName, {
    videoDescription: snippet?.description ?? null,
    youtubeChannelTitle: snippet?.channelTitle ?? null,
  });
  return finalizePackArtistSong(enrichArtistSongFromSnippet(base, snippet, authorName), snippet?.description);
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
  videoId?: string | null,
  options?: ResolveArtistSongForPackOptions,
): Promise<ResolvedArtistSong> {
  const famous =
    !options?.trustProvidedTitleOverFamousPv && resolveFamousPvArtistSongPack(videoId);
  if (famous) {
    return logArtistPackResolution(
      'famous-pv-override',
      title,
      authorName,
      finalizePackArtistSong(
        {
          artist: famous.artist,
          artistDisplay: famous.artistDisplay,
          song: famous.song,
        },
        snippet?.description,
      ),
    );
  }

  if (isMyListOembedArtistTitleModeEnv()) {
    const playsPack = packFromPerformerPlays(title, snippet);
    if (playsPack) {
      return logArtistPackResolution(
        'mylist_oembed:performer_plays',
        title,
        authorName,
        finalizePackArtistSong(playsPack, snippet?.description),
      );
    }
    const r = resolveOEmbedToMyListStylePack(title, authorName);
    if (!mylistPackLooksUnusable(r)) {
      return logArtistPackResolution(
        'mylist_oembed',
        title,
        authorName,
        finalizePackArtistSong(r, snippet?.description),
      );
    }
    // 誤分割時は通常経路（MusicBrainz / getArtistAndSong）へ
  }

  const desc = snippet?.description ?? null;
  const amb = getAmbiguousTitleSegmentsForMusicBrainz(
    title,
    authorName,
    desc,
    snippet?.channelTitle ?? null,
  );
  if (amb) {
    const hint = await resolveTitleOrderWithMusicBrainz(amb.left, amb.right);
    if (hint === 'left_is_artist') {
      const base = buildArtistSongFromTitleSegments(amb.left, amb.right, desc);
      return logArtistPackResolution(
        'musicbrainz:left_is_artist',
        title,
        authorName,
        finalizePackArtistSong(enrichArtistSongFromSnippet(base, snippet, authorName), snippet?.description),
      );
    }
    if (hint === 'right_is_artist') {
      const base = buildArtistSongFromTitleSegments(amb.right, amb.left, desc);
      return logArtistPackResolution(
        'musicbrainz:right_is_artist',
        title,
        authorName,
        finalizePackArtistSong(enrichArtistSongFromSnippet(base, snippet, authorName), snippet?.description),
      );
    }
  }
  return logArtistPackResolution(
    'heuristic',
    title,
    authorName,
    resolveArtistSongForPack(title, authorName, snippet, videoId, options),
  );
}
