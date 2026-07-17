import { NextResponse } from 'next/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import {
  isJpDomesticOfficialChannelAiException,
  suppressJpDomesticAnnounceTagForArtist,
} from '@/lib/jp-official-channel-exception';
import { isMcProduct } from '@/lib/product-mode';
import { resolveJapaneseDomesticWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { sessionMayEditRoomPlaybackHistoryFields } from '@/lib/admin-access';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchPlaybackDisplayOverride,
  parseAdminPlaybackDisplayHint,
} from '@/lib/video-playback-display-override';
import {
  appendOriginalReleaseYearSuffix,
  yearFromOriginalReleaseDate,
} from '@/lib/announce-original-release-year';
import {
  buildLibrarySongAnnounceTitle,
  fetchLibrarySongDisplayByVideoId,
  preferPlaybackDisplaySources,
} from '@/lib/library-song-display-by-video';
import { fetchMusicaichatSongJsonForVideoId } from '@/lib/music8-musicaichat';
import { resolveOriginalReleaseDateFromMusic8Json } from '@/lib/music8-song-fields';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoDurationSeconds, getVideoSnippet } from '@/lib/youtube-search';
import {
  resolveArtistSongForPackAsync,
  type ResolveArtistSongForPackOptions,
} from '@/lib/youtube-artist-song-for-pack';
import {
  isNonMusicYoutubeForRoomAnnounce,
} from '@/lib/song-db-registration-gate';
import { isRoomJpAiUnlockEnabled } from '@/lib/room-jp-ai-unlock-server';
import { resolveDomesticSongMetadataForRegistration } from '@/lib/domestic-song-registration';

export async function handleAnnounceSongPost(
  request: Request,
  logTag: string,
): Promise<NextResponse> {
  try {
    const body = await request.json();
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const displayName =
      typeof body?.displayName === 'string' ? body.displayName.trim() || 'ゲスト' : 'ゲスト';
    const themePlaylistThemeLabel =
      typeof body?.themePlaylistThemeLabel === 'string' ? body.themePlaylistThemeLabel.trim() : '';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const ytSource = `api/${logTag}`;
    const [oembed, durationSeconds, snippet] = await Promise.all([
      fetchOEmbed(videoId),
      getVideoDurationSeconds(videoId, { roomId: roomId || undefined, source: ytSource }),
      getVideoSnippet(videoId, { roomId: roomId || undefined, source: ytSource }),
    ]);
    const rawYouTubeTitle = oembed?.title ?? videoId;
    const authorNameOembed = oembed?.author_name;

    const isNonMusic = isNonMusicYoutubeForRoomAnnounce({
      rawTitle: rawYouTubeTitle,
      authorName: authorNameOembed,
      channelTitle: snippet?.channelTitle ?? null,
      categoryId: snippet?.categoryId ?? null,
      description: snippet?.description ?? null,
    });

    if (isNonMusic) {
      return NextResponse.json({
        nonMusic: true,
        title: rawYouTubeTitle,
      });
    }

    const supabase = await createClient();
    const reader = createAdminClient() ?? supabase;
    const [adminOverride, librarySong, musicaichatSong] = await Promise.all([
      reader ? fetchPlaybackDisplayOverride(reader, videoId) : Promise.resolve(null),
      reader ? fetchLibrarySongDisplayByVideoId(reader, videoId) : Promise.resolve(null),
      fetchMusicaichatSongJsonForVideoId(videoId).catch((e) => {
        console.warn(`[api/${logTag}] musicaichat for announce year`, e);
        return null;
      }),
    ]);
    const hintParsed = parseAdminPlaybackDisplayHint(body?.adminPlaybackDisplayHint);
    const hintAllowed =
      hintParsed && (await sessionMayEditRoomPlaybackHistoryFields(supabase)) ? hintParsed : null;
    const displayOverride = preferPlaybackDisplaySources({
      adminOverride,
      library: librarySong,
      hint: hintAllowed,
    });
    const libraryAnnounceTitle = librarySong ? buildLibrarySongAnnounceTitle(librarySong) : '';
    const title = displayOverride?.title ?? rawYouTubeTitle;
    const authorName =
      displayOverride?.artist_name?.trim() ? displayOverride.artist_name.trim() : authorNameOembed;
    const resolvePackOpts: ResolveArtistSongForPackOptions | undefined = displayOverride
      ? { trustProvidedTitleOverFamousPv: true }
      : undefined;
    const { artist, artistDisplay, song } = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
      videoId,
      resolvePackOpts,
    );
    let artistTitleBase =
      artistDisplay && song
        ? `${artistDisplay} - ${song}`
        : formatArtistTitle(title, authorName, snippet?.description, snippet?.channelTitle ?? null);
    /** ライブラリ整備済み表記を正とする（管理者上書きが無いとき） */
    if (!adminOverride && libraryAnnounceTitle) {
      artistTitleBase = libraryAnnounceTitle;
    }
    const isJapaneseDomestic = await resolveJapaneseDomesticWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    if (isJapaneseDomestic && !adminOverride && !libraryAnnounceTitle) {
      try {
        const domesticMeta = await resolveDomesticSongMetadataForRegistration({
          rawTitle: title,
          channelTitle: snippet?.channelTitle ?? null,
          channelAuthor: authorName,
          resolvedArtist: artist,
          resolvedSong: song,
          preferJapaneseScriptDisplay: isMcProduct(),
        });
        if (domesticMeta?.displayTitle) {
          artistTitleBase = domesticMeta.displayTitle;
        }
      } catch (e) {
        console.warn(`[api/${logTag}] domestic metadata for announce`, e);
      }
    }
    const jpOfficialChannelException = isJpDomesticOfficialChannelAiException(snippet?.channelId);
    const roomJpAiUnlock = roomId ? await isRoomJpAiUnlockEnabled(roomId) : false;
    const mcProduct = isMcProduct();
    /** mc は邦楽も通常選曲 — AI サイレンス・（邦楽）タグは付けない */
    const jpDomesticSilence =
      !mcProduct && isJapaneseDomestic && !jpOfficialChannelException && !roomJpAiUnlock;
    const showJpDomesticTag =
      !mcProduct &&
      isJapaneseDomestic &&
      !suppressJpDomesticAnnounceTagForArtist({ artist, artistDisplay });
    const originalReleaseIso =
      librarySong?.originalReleaseDate ??
      (musicaichatSong ? resolveOriginalReleaseDateFromMusic8Json(musicaichatSong) : null);
    const releaseYear = yearFromOriginalReleaseDate(originalReleaseIso);
    const artistTitleBaseWithYear = appendOriginalReleaseYearSuffix(artistTitleBase, releaseYear);
    const artistTitle = showJpDomesticTag
      ? appendOriginalReleaseYearSuffix(`${artistTitleBase}（邦楽）`, releaseYear)
      : artistTitleBaseWithYear;
    const announceHead = themePlaylistThemeLabel
      ? `${displayName}さんの選曲 お題（${themePlaylistThemeLabel}）チャレンジです！`
      : `${displayName}さんの選曲です！`;
    const text = `${announceHead}\n${artistTitle}`;

    return NextResponse.json({
      text,
      artistTitle,
      durationSeconds: durationSeconds ?? undefined,
      japaneseDomestic: isJapaneseDomestic,
      jpDomesticSilence,
      originalReleaseYear: releaseYear ?? undefined,
    });
  } catch (e) {
    console.error(`[api/${logTag}]`, e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
