import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCommentary } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoSnippet } from '@/lib/youtube-search';
import { getCommentaryByVideoId, insertCommentaryToLibrary } from '@/lib/commentary-library';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '../../../../lib/song-tidbits';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { shouldSkipAiCommentaryForUncertainArtistResolution } from '@/lib/format-song-display';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    const [oembed, snippet] = await Promise.all([fetchOEmbed(videoId), getVideoSnippet(videoId)]);
    const title = oembed?.title ?? snippet?.title ?? videoId;
    const authorName = oembed?.author_name;
    const { artist, artistDisplay, song } = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
    );

    const isJpEconomy = await resolveJapaneseEconomyWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });

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

    if (isJpEconomy && !isJpDomesticOfficialChannelAiException(snippet?.channelId)) {
      return NextResponse.json({ skipAiCommentary: true, songId });
    }

    if (
      shouldSkipAiCommentaryForUncertainArtistResolution({
        artist,
        artistDisplay,
        song,
        authorName,
        title,
      })
    ) {
      return NextResponse.json({ skipAiCommentary: true, songId, skipReason: 'uncertain_artist' });
    }

    const fromLibrary = supabase ? await getCommentaryByVideoId(supabase, videoId) : null;
    if (fromLibrary) {
      return NextResponse.json({ text: fromLibrary.body, source: 'library' });
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
    let songTidbitRow = null;
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

      if (songId) {
        try {
          songTidbitRow = await insertTidbit(supabase, {
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
    return NextResponse.json({
      text: displayText,
      source: 'generated',
      saved,
      songId,
      songTidbitId: songTidbitRow?.id ?? null,
    });
  } catch (e) {
    console.error('[api/ai/commentary]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
