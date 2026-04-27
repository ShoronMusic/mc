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
import { fetchMusicBrainzCommentaryFactsBlock } from '@/lib/musicbrainz-commentary-facts';
import {
  buildMusicaichatFactsForAiPromptBlock,
  resolveMusic8ContextForCommentPack,
  shouldRegenerateLibraryWhenMusicaichatSong,
  skipMusic8FactInjectEnv,
} from '@/lib/music8-musicaichat';
import {
  buildSongIntroOnlyArtistFocusComment,
  shouldUseSongIntroOnlyDiscographyMode,
} from '@/lib/commentary-song-intro-only-mode';
import { insertAiCommentaryUnavailableEntry } from '@/lib/ai-commentary-unavailable-log';
import { buildSongQuizApiExtension } from '@/lib/song-quiz-after-commentary';

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
    let selectorUserId: string | null = null;
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      selectorUserId = authData.user?.id ?? null;
    }
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

    const songQuizExtension = buildSongQuizApiExtension({
      channelId: snippet?.channelId ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      videoTitle: rawYouTubeTitle,
      channelAuthorName: authorName ?? null,
      viewCount: snippet?.viewCount ?? null,
    });

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
      return NextResponse.json({
        skipAiCommentary: true,
        videoId,
        skipReason: 'jp_economy',
        ...songQuizExtension,
      });
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
        ...songQuizExtension,
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
        ...songQuizExtension,
      });
    }

    const artistLookupForMusic8 =
      (artistDisplay && artistDisplay.trim()) ||
      (artist && artist.trim()) ||
      (authorName && authorName.trim()) ||
      '';
    const music8Ctx = await resolveMusic8ContextForCommentPack(
      videoId,
      artistLookupForMusic8,
      song || title,
    );
    const { musicaichatSong, fallbackMusic8Song } = music8Ctx;
    const skipMusic8FactInject = skipMusic8FactInjectEnv();
    const music8FactsBlock =
      !skipMusic8FactInject && musicaichatSong != null
        ? buildMusicaichatFactsForAiPromptBlock(musicaichatSong).trim()
        : '';
    const mbFactsBlock =
      (await fetchMusicBrainzCommentaryFactsBlock(
        (artistDisplay ?? artist ?? authorName ?? '').trim(),
        (song ?? title).trim(),
      )) ?? '';
    const songIntroOnlyDiscography = shouldUseSongIntroOnlyDiscographyMode({
      music8Song: musicaichatSong ?? fallbackMusic8Song,
      combinedFactsText: [music8FactsBlock, mbFactsBlock].filter(Boolean).join('\n'),
    });
    const songQuizExtensionFinal = songIntroOnlyDiscography
      ? { songQuiz: { enabled: false as const } }
      : songQuizExtension;
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
    const introOnlyText = buildSongIntroOnlyArtistFocusComment({
      artistLabel: String(artistLabel ?? '').trim() || 'このアーティスト',
      songLabel: String(commentarySongLabel ?? '').trim() || 'この曲',
      music8Song: musicaichatSong ?? fallbackMusic8Song,
    });

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
        const bodyForReturn = songIntroOnlyDiscography ? introOnlyText : bodyText;
        if (
          !shouldRegenerateLibraryWhenMusicaichatSong(musicaichatSong, skipMusic8FactInject)
        ) {
          return NextResponse.json({
            text: bodyForReturn,
            source: 'library',
            songId: typeof data?.song_id === 'string' ? data.song_id : null,
            songTidbitId: typeof data?.id === 'string' ? data.id : null,
            artistTitle: formatArtistTitle(
              title,
              authorName,
              snippet?.description,
              snippet?.channelTitle ?? null,
            ),
            ...songQuizExtensionFinal,
            ...(songIntroOnlyDiscography ? { songIntroOnlyDiscography: true } : {}),
          });
        }
        cachedCommentaryBody = bodyForReturn;
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

    const supergroupHint =
      artistLabel && artistLabel.trim().length > 0
        ? await buildSupergroupPromptBlock(artistLabel)
        : '';
    const text = songIntroOnlyDiscography
      ? introOnlyText
      : await generateCommentary(commentarySongLabel, artistLabel, {
          videoId,
          rawYouTubeTitle,
          supergroupHintText: supergroupHint || null,
          music8FactsBlock: music8FactsBlock.length > 0 ? music8FactsBlock : null,
          groundedFactsBlock: mbFactsBlock.length > 0 ? mbFactsBlock : null,
          songIntroOnlyDiscography,
        });
    if (!text) {
      return NextResponse.json(
        { error: 'AI is not configured or failed.', ...songQuizExtensionFinal },
        { status: 503 },
      );
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

    if (songIntroOnlyDiscography && text) {
      const logClient = createAdminClient();
      if (logClient) {
        void insertAiCommentaryUnavailableEntry(logClient, {
          userId: selectorUserId,
          roomId: roomId || null,
          videoId,
          artistLabel: String(artistLabel ?? '').trim() || '（不明）',
          songLabel: String(commentarySongLabel ?? '').trim() || '（不明）',
          source: 'commentary',
        });
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
      ...songQuizExtensionFinal,
      ...(songIntroOnlyDiscography ? { songIntroOnlyDiscography: true } : {}),
    });
  } catch (e) {
    console.error('[api/ai/commentary]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

