import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  formatArtistTitle,
  shouldSkipAiCommentaryForUncertainArtistResolution,
} from '@/lib/format-song-display';
import { generateCommentary } from '@/lib/gemini';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '@/lib/song-tidbits';
import {
  resolveArtistSongForPackAsync,
  type ResolveArtistSongForPackOptions,
} from '@/lib/youtube-artist-song-for-pack';
import { fetchPlaybackDisplayOverride } from '@/lib/video-playback-display-override';
import { getVideoSnippet } from '@/lib/youtube-search';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { isRoomJpAiUnlockEnabled } from '@/lib/room-jp-ai-unlock-server';
import { buildSupergroupPromptBlock } from '@/lib/supergroup-artist';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const reader = createAdminClient() ?? supabase;
    const [oembed, snippet] = await Promise.all([fetchOEmbed(videoId), getVideoSnippet(videoId)]);
    const rawYouTubeTitle = oembed?.title ?? snippet?.title ?? videoId;
    const displayOverride = reader ? await fetchPlaybackDisplayOverride(reader, videoId) : null;
    const title = displayOverride?.title ?? rawYouTubeTitle;
    const authorName =
      displayOverride?.artist_name?.trim()
        ? displayOverride.artist_name.trim()
        : oembed?.author_name ?? snippet?.channelTitle ?? null;
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

    const isJpEconomy = await resolveJapaneseEconomyWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    const roomJpAiUnlock = roomId ? await isRoomJpAiUnlockEnabled(roomId) : false;
    const jpAiUnlockEnabled = roomJpAiUnlock;
    if (isJpEconomy && !isJpDomesticOfficialChannelAiException(snippet?.channelId) && !jpAiUnlockEnabled) {
      return NextResponse.json({ skipAiCommentary: true, videoId });
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
      return NextResponse.json({
        skipAiCommentary: true,
        videoId,
        skipReason: 'uncertain_artist',
      });
    }

    if (reader) {
      const { data } = await reader
        .from('song_tidbits')
        .select('id, body, song_id')
        .eq('video_id', videoId)
        .eq('source', 'ai_commentary')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const bodyText = typeof data?.body === 'string' ? data.body.trim() : '';
      if (bodyText) {
        return NextResponse.json({
          text: bodyText,
          source: 'library',
          songId: typeof data?.song_id === 'string' ? data.song_id : null,
          songTidbitId: typeof data?.id === 'string' ? data.id : null,
          artistTitle: formatArtistTitle(title, authorName, snippet?.description, snippet?.channelTitle ?? null),
        });
      }
    }

    let songId: string | null = null;
    if (supabase) {
      try {
        songId = await upsertSongAndVideo({
          supabase,
          videoId,
          mainArtist: artist ?? authorName ?? null,
          songTitle: song ?? title,
          variant: 'tidbit',
        });
      } catch (e) {
        console.error('[api/ai/commentary] upsertSongAndVideo', e);
      }
    }

    const artistLabel = artistDisplay ?? artist ?? authorName ?? undefined;
    const supergroupHint =
      artistLabel && artistLabel.trim().length > 0
        ? await buildSupergroupPromptBlock(artistLabel)
        : '';
    const text = await generateCommentary(song ?? title, artistLabel, {
      videoId,
      rawYouTubeTitle,
      supergroupHintText: supergroupHint || null,
    });
    if (!text) {
      return NextResponse.json({ error: 'AI is not configured or failed.' }, { status: 503 });
    }

    let songTidbitId: string | null = null;
    if (supabase && songId) {
      try {
        const row = await insertTidbit(supabase, {
          songId,
          videoId,
          body: text,
          source: 'ai_commentary',
        });
        songTidbitId = row?.id ?? null;
      } catch (e) {
        console.error('[api/ai/commentary] insertTidbit', e);
      }
    }

    return NextResponse.json({
      text,
      source: 'new',
      songId,
      songTidbitId,
      artistTitle:
        artistDisplay && song
          ? `${artistDisplay} - ${song}`
          : formatArtistTitle(title, authorName, snippet?.description, snippet?.channelTitle ?? null),
    });
  } catch (e) {
    console.error('[api/ai/commentary]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

