import { NextResponse } from 'next/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import {
  isJpDomesticOfficialChannelAiException,
  suppressJpDomesticAnnounceTagForArtist,
} from '@/lib/jp-official-channel-exception';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoDurationSeconds, getVideoSnippet } from '@/lib/youtube-search';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() || 'ゲスト' : 'ゲスト';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const [oembed, durationSeconds, snippet] = await Promise.all([
      fetchOEmbed(videoId),
      getVideoDurationSeconds(videoId, { roomId: roomId || undefined, source: 'api/ai/announce-song' }),
      getVideoSnippet(videoId, { roomId: roomId || undefined, source: 'api/ai/announce-song' }),
    ]);
    const title = oembed?.title ?? videoId;
    const authorName = oembed?.author_name;

    // タイトル・チャンネル名から「明らかに音楽コンテンツではなさそう」なものを簡易判定
    const lowerTitle = title.toLowerCase();
    const lowerAuthor = (authorName ?? '').toLowerCase();
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
      // 明らかにプレイリスト／BGM系だけのタイトルも弾く
      /作業用|bgm|睡眠用|relax/i.test(title);

    if (isNonMusic) {
      return NextResponse.json({
        nonMusic: true,
        title,
      });
    }

    const { artist, artistDisplay, song } = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
    );
    const artistTitleBase =
      artistDisplay && song
        ? `${artistDisplay} - ${song}`
        : formatArtistTitle(title, authorName, snippet?.description);
    const isJapaneseDomestic = await resolveJapaneseEconomyWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    const jpOfficialChannelException = isJpDomesticOfficialChannelAiException(snippet?.channelId);
    /** （邦楽）表記は維持しつつ、公式チャンネル例外時は AI サイレンスだけ解除 */
    const jpDomesticSilence = isJapaneseDomestic && !jpOfficialChannelException;
    const showJpDomesticTag =
      isJapaneseDomestic && !suppressJpDomesticAnnounceTagForArtist({ artist, artistDisplay });
    const artistTitle = showJpDomesticTag ? `${artistTitleBase}（邦楽）` : artistTitleBase;
    const text = `${displayName}さんの選曲です！\n${artistTitle}`;

    return NextResponse.json({
      text,
      durationSeconds: durationSeconds ?? undefined,
      japaneseDomestic: isJapaneseDomestic,
      jpDomesticSilence,
    });
  } catch (e) {
    console.error('[api/ai/announce-song]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
