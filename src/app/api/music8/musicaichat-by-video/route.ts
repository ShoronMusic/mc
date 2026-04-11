import { NextResponse } from 'next/server';
import { fetchMusicaichatSongJsonForVideoId } from '@/lib/music8-musicaichat';

export const dynamic = 'force-dynamic';

/**
 * 視聴履歴の「ソングデータ」タブ用: YouTube ID で musicaichat/v1 曲 JSON を解決（従来 songs/ スラッグ失敗時のフォールバック）
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId')?.trim() ?? '';
  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }
  const song = await fetchMusicaichatSongJsonForVideoId(videoId);
  return NextResponse.json({ song });
}
