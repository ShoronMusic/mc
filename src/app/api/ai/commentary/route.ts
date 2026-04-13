import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  buildAiCommentaryPromptLabels,
  formatArtistTitle,
  shouldSkipAiCommentaryForPromotionalOrProseMetadata,
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
import {
  buildMusicaichatFactsForAiPromptBlock,
  resolveMusic8ContextForCommentPack,
  shouldRegenerateLibraryWhenMusicaichatSong,
  skipMusic8FactInjectEnv,
} from '@/lib/music8-musicaichat';

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
      return NextResponse.json({ skipAiCommentary: true, videoId, skipReason: 'jp_economy' });
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

    const hasTrustedDisplayTitle = Boolean(displayOverride?.title?.trim());
    if (
      !hasTrustedDisplayTitle &&
      shouldSkipAiCommentaryForPromotionalOrProseMetadata({
        rawYouTubeTitle,
        song,
        snippetDescription: snippet?.description ?? null,
      })
    ) {
      return NextResponse.json({
        skipAiCommentary: true,
        videoId,
        skipReason: 'promotional_metadata',
      });
    }

    const artistLookupForMusic8 =
      (artistDisplay && artistDisplay.trim()) ||
      (artist && artist.trim()) ||
      (authorName && authorName.trim()) ||
      '';
    const music8Ctx = await resolveMusic8ContextForCommentPack(videoId, artistLookupForMusic8);
    const { musicaichatSong } = music8Ctx;
    const skipMusic8FactInject = skipMusic8FactInjectEnv();
    const music8FactsBlock =
      !skipMusic8FactInject && musicaichatSong != null
        ? buildMusicaichatFactsForAiPromptBlock(musicaichatSong).trim()
        : '';

    let cachedCommentaryBody: string | null = null;
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
        if (
          !shouldRegenerateLibraryWhenMusicaichatSong(musicaichatSong, skipMusic8FactInject)
        ) {
          return NextResponse.json({
            text: bodyText,
            source: 'library',
            songId: typeof data?.song_id === 'string' ? data.song_id : null,
            songTidbitId: typeof data?.id === 'string' ? data.id : null,
            artistTitle: formatArtistTitle(
              title,
              authorName,
              snippet?.description,
              snippet?.channelTitle ?? null,
            ),
          });
        }
        cachedCommentaryBody = bodyText;
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

    const aiPromptLabels = buildAiCommentaryPromptLabels({
      artistDisplay,
      artist,
      authorName,
      song,
      titleFallback: title,
    });
    const artistLabel =
      aiPromptLabels.artistLabel.trim() ||
      (artistDisplay ?? artist ?? authorName ?? undefined);
    const commentarySongLabel = aiPromptLabels.songLabel.trim() || song || title;
    const supergroupHint =
      artistLabel && artistLabel.trim().length > 0
        ? await buildSupergroupPromptBlock(artistLabel)
        : '';
    const text = await generateCommentary(commentarySongLabel, artistLabel, {
      videoId,
      rawYouTubeTitle,
      supergroupHintText: supergroupHint || null,
      music8FactsBlock: music8FactsBlock.length > 0 ? music8FactsBlock : null,
    });
    if (!text) {
      return NextResponse.json({ error: 'AI is not configured or failed.' }, { status: 503 });
    }

    let songTidbitId: string | null = null;
    if (supabase && songId) {
      try {
        const dbWrite = createAdminClient() ?? supabase;
        if (cachedCommentaryBody) {
          const { error: delErr } = await dbWrite
            .from('song_tidbits')
            .delete()
            .eq('video_id', videoId)
            .eq('source', 'ai_commentary');
          if (delErr) {
            console.warn('[api/ai/commentary] delete old ai_commentary', delErr.message);
          }
        }
        const row = await insertTidbit(dbWrite, {
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

