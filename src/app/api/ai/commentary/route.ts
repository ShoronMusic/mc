import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCommentary } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  getArtistAndSong,
  getMainArtist,
  getArtistDisplayString,
  parseArtistTitleFromDescription,
  refineSongTitleWithDescription,
} from '@/lib/format-song-display';
import { getVideoSnippet } from '@/lib/youtube-search';
import { getCommentaryByVideoId, insertCommentaryToLibrary } from '@/lib/commentary-library';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '../../../../lib/song-tidbits';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const fromLibrary = supabase ? await getCommentaryByVideoId(supabase, videoId) : null;
    if (fromLibrary) {
      // 既存ライブラリからの取得時は song_id はレスポンスに含めない
      return NextResponse.json({ text: fromLibrary.body, source: 'library' });
    }

    const [oembed, snippet] = await Promise.all([fetchOEmbed(videoId), getVideoSnippet(videoId)]);
    let title = oembed?.title ?? snippet?.title ?? videoId;
    let authorName = oembed?.author_name;
    let { artist, artistDisplay, song } = getArtistAndSong(title, authorName, {
      videoDescription: snippet?.description ?? null,
    });

    if (!artistDisplay || !artist) {
      if (snippet?.description) {
        const fromDesc = parseArtistTitleFromDescription(snippet.description);
        if (fromDesc) {
          artist = getMainArtist(fromDesc.artist);
          artistDisplay = getArtistDisplayString(fromDesc.artist);
          song = refineSongTitleWithDescription(fromDesc.song, snippet.description);
        } else {
          if (!artist && snippet.channelTitle) {
            artist = snippet.channelTitle.trim();
            artistDisplay = artist;
          }
          if (!song && snippet.title) song = snippet.title.trim();
        }
      }
    }

    // 曲マスタに登録（曲単位の集約用）し、song_id を取得
    let songId: string | null = null;
    try {
      songId = await upsertSongAndVideo({
        supabase,
        videoId,
        mainArtist: artist ?? authorName ?? null,
        songTitle: song ?? title,
        variant: 'official',
      });
    } catch (e) {
      console.error('[api/ai/commentary] upsertSongAndVideo', e);
    }

    const text = await generateCommentary(song, artist ?? undefined, {
      videoId,
      rawYouTubeTitle: title,
    });
    if (text == null) {
      return NextResponse.json(
        { error: 'AI is not configured or failed to generate commentary.' },
        { status: 503 }
      );
    }

    const prefix =
      artistDisplay && song ? `${artistDisplay} - ${song}` : artist && song ? `${artist} - ${song}` : '';
    const displayText = prefix ? `${prefix}\n\n${text}` : text;

    let saved = false;
    if (supabase) {
      const inserted = await insertCommentaryToLibrary(supabase, {
        body: displayText,
        videoId,
        artistName: artist ?? authorName ?? null,
        songTitle: song,
      });
      saved = Boolean(inserted);
      if (!inserted) {
        console.error('[api/ai/commentary] insertCommentaryToLibrary returned null (save failed)');
      }

      // 曲ごとの豆知識テーブルにも保存（song_tidbits）
      if (songId) {
        try {
          await insertTidbit(supabase, {
            songId,
            videoId,
            body: displayText,
            source: 'ai_commentary',
          });
        } catch (e) {
          console.error('[api/ai/commentary] insertTidbit', e);
        }
      }
    }
    return NextResponse.json({ text: displayText, source: 'generated', saved, songId });
  } catch (e) {
    console.error('[api/ai/commentary]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
