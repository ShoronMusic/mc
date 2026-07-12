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
  applyPlaybackDisplayHintWhenDbMissing,
  fetchPlaybackDisplayOverride,
  parseAdminPlaybackDisplayHint,
} from '@/lib/video-playback-display-override';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoDurationSeconds, getVideoSnippet } from '@/lib/youtube-search';
import {
  resolveArtistSongForPackAsync,
  type ResolveArtistSongForPackOptions,
} from '@/lib/youtube-artist-song-for-pack';
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

    const lowerTitle = rawYouTubeTitle.toLowerCase();
    const lowerAuthor = (authorNameOembed ?? '').toLowerCase();
    const nonMusicKeywords = [
      'アニメ',
      'anime',
      '切り抜き',
      '切り抜き集',
      '実況',
      '解説',
      'ランキング',
      'top10',
      'top 10',
      'top30',
      'top 30',
      'おすすめアニメ',
      'reaction',
      'リアクション',
      '生配信',
      '雑談',
      'vtuber',
    ];
    const isNonMusic =
      nonMusicKeywords.some((kw) => lowerTitle.includes(kw) || lowerAuthor.includes(kw)) ||
      /作業用|bgm|睡眠用|relax/i.test(rawYouTubeTitle);

    if (isNonMusic) {
      return NextResponse.json({
        nonMusic: true,
        title: rawYouTubeTitle,
      });
    }

    const supabase = await createClient();
    const reader = createAdminClient() ?? supabase;
    let displayOverride = reader ? await fetchPlaybackDisplayOverride(reader, videoId) : null;
    const hintParsed = parseAdminPlaybackDisplayHint(body?.adminPlaybackDisplayHint);
    if (hintParsed && (await sessionMayEditRoomPlaybackHistoryFields(supabase))) {
      displayOverride = applyPlaybackDisplayHintWhenDbMissing(displayOverride, hintParsed);
    }
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
    const isJapaneseDomestic = await resolveJapaneseDomesticWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    if (isJapaneseDomestic) {
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
    const artistTitle = showJpDomesticTag ? `${artistTitleBase}（邦楽）` : artistTitleBase;
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
    });
  } catch (e) {
    console.error(`[api/${logTag}]`, e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
