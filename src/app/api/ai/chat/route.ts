import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatArtistTitle } from '@/lib/format-song-display';
import { generateChatReply } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getStyleFromDb } from '@/lib/song-style';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '../../../../lib/song-tidbits';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const list = messages.map((m: { displayName?: string; body?: string; messageType?: string }) => ({
      displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
      body: typeof m.body === 'string' ? m.body : '',
      messageType: typeof m.messageType === 'string' ? m.messageType : undefined,
    }));

    let currentSong: string | null = null;
    let currentSongStyle: string | null = null;
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    let songId: string | null = null;
    if (videoId) {
      const supabase = await createClient();
      const oembed = await fetchOEmbed(videoId);
      const title = oembed?.title ?? videoId;
      currentSong = formatArtistTitle(title, oembed?.author_name) || null;
      if (supabase) {
        const style = await getStyleFromDb(supabase, videoId);
        currentSongStyle = style ?? null;

        // 曲マスタに登録（簡易版）し、song_id を取得
        try {
          const mainArtist = oembed?.author_name ?? null;
          const songTitle = title;
          songId = await upsertSongAndVideo({
            supabase,
            videoId,
            mainArtist,
            songTitle,
            variant: 'chat',
          });
        } catch (e) {
          console.error('[api/ai/chat] upsertSongAndVideo', e);
        }
      }
    }

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const text = await generateChatReply(list, currentSong, currentSongStyle, {
      roomId: roomId || undefined,
      videoId: videoId || undefined,
    });
    if (text == null) {
      return NextResponse.json(
        { error: 'AI is not configured or failed to generate a reply.' },
        { status: 503 }
      );
    }

    // 曲に紐づく豆知識として保存（videoId があり、songId が取れている場合）
    if (videoId && songId) {
      try {
        const supabase = await createClient();
        if (supabase) {
          await insertTidbit(supabase, {
            songId,
            videoId,
            body: text,
            source: 'ai_chat',
          });
        }
      } catch (e) {
        console.error('[api/ai/chat] insertTidbit', e);
      }
    }

    return NextResponse.json({ text, songId });
  } catch (e) {
    console.error('[api/ai/chat]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
