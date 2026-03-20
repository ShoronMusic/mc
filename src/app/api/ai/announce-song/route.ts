import { NextResponse } from 'next/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoDurationSeconds } from '@/lib/youtube-search';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() || 'ゲスト' : 'ゲスト';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const [oembed, durationSeconds] = await Promise.all([
      fetchOEmbed(videoId),
      getVideoDurationSeconds(videoId),
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

    const artistTitle = formatArtistTitle(title, authorName);
    const text = `${displayName}さんの選曲です！\n${artistTitle}`;

    return NextResponse.json({
      text,
      durationSeconds: durationSeconds ?? undefined,
    });
  } catch (e) {
    console.error('[api/ai/announce-song]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
