import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  buildAiCommentaryPromptLabels,
  formatArtistTitle,
  looksLikeGarbageArtistSongMetadataForCommentary,
  looksLikeProseOrBloatedDisplayTitle,
  shouldSkipAiCommentaryForPromotionalOrProseMetadata,
  shouldSkipAiCommentaryForUncertainArtistResolution,
  storedCommentaryLooksLikeProductionCreditHallucination,
} from '@/lib/format-song-display';
import { generateCommentary } from '@/lib/gemini';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { copyeditGemmaCommentaryText } from '@/lib/gemma-commentary-copyedit';
import { buildGeminiUsagePersistMeta } from '@/lib/gemini-usage-log';
import { attachMusic8SongDataIfFetched, upsertSongAndVideo } from '@/lib/song-entities';
import { buildSongDbRegistrationInput } from '@/lib/song-db-registration-gate';
import { insertTidbit } from '@/lib/song-tidbits';
import {
  resolveArtistSongForPackAsync,
  type ResolveArtistSongForPackOptions,
} from '@/lib/youtube-artist-song-for-pack';
import { fetchPlaybackDisplayOverride } from '@/lib/video-playback-display-override';
import {
  fetchLibrarySongDisplayByVideoId,
  preferPlaybackDisplaySources,
} from '@/lib/library-song-display-by-video';
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
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { guardAiTrialSongSelection, commitAiTrialSongSelection } from '@/lib/user-ai-trial-server';
import { resolvePromoAiFreeFromRequestBody } from '@/lib/featured-page-ai-free';
import { checkAiCostRateLimit } from '@/lib/ai-cost-rate-limit';
import { aiCostRateLimitResponse } from '@/lib/ai-cost-rate-limit-response';
import { isAiUnlimitedUserId } from '@/lib/ai-unlimited-user-ids';

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
    let authUser = null;
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      authUser = authData.user ?? null;
      selectorUserId = authUser?.id ?? null;
    }
    const requestIsGuest = !authUser?.id;

    if (!(authUser?.id && isAiUnlimitedUserId(authUser.id))) {
      const rate = checkAiCostRateLimit({
        bucket: 'commentary',
        clientIp: getChatAiClientIp(request),
        userId: authUser?.id,
        isGuest: requestIsGuest,
      });
      const limited = aiCostRateLimitResponse(rate);
      if (limited) return limited;
    }

    const promoAiFree = await resolvePromoAiFreeFromRequestBody(body);

    const trialGuard = await guardAiTrialSongSelection({
      user: authUser,
      isGuest: requestIsGuest,
      aiModeRaw: body?.aiMode,
      clientIp: getChatAiClientIp(request),
      consume: false,
      roomId: roomId || undefined,
      videoId,
      promoAiFree,
    });
    if (!trialGuard.ok) {
      return NextResponse.json(trialGuard.body, { status: trialGuard.status });
    }

    const clientIpForBilling = getChatAiClientIp(request);
    const respondCommentarySuccess = async (payload: Record<string, unknown>) => {
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      const shouldBill =
        payload.skipAiCommentary !== true && text.length > 0 && Boolean(authUser?.id);
      if (shouldBill) {
        const charged = await commitAiTrialSongSelection({
          user: authUser,
          clientIp: clientIpForBilling,
          roomId: roomId || undefined,
          videoId,
          promoAiFree,
        });
        if (!charged.ok) {
          return NextResponse.json(charged.body, { status: charged.status });
        }
      }
      return NextResponse.json({
        ...payload,
        generationModel: resolveGenerationModelId('commentary'),
      });
    };

    const reader = createAdminClient() ?? supabase;
    const [oembed, snippet] = await Promise.all([fetchOEmbed(videoId), getVideoSnippet(videoId)]);
    const rawYouTubeTitle = oembed?.title ?? snippet?.title ?? videoId;
    const [adminOverride, librarySong] = reader
      ? await Promise.all([
          fetchPlaybackDisplayOverride(reader, videoId),
          fetchLibrarySongDisplayByVideoId(reader, videoId),
        ])
      : [null, null];
    const displayOverride = preferPlaybackDisplaySources({
      adminOverride,
      library: librarySong,
    });
    const overrideTitle = displayOverride?.title?.trim() ?? '';
    const title =
      overrideTitle && !looksLikeProseOrBloatedDisplayTitle(overrideTitle)
        ? overrideTitle
        : rawYouTubeTitle;
    const authorName =
      displayOverride?.artist_name?.trim() && !looksLikeProseOrBloatedDisplayTitle(overrideTitle)
        ? displayOverride.artist_name.trim()
        : oembed?.author_name ?? snippet?.channelTitle ?? null;
    const resolvePackOpts: ResolveArtistSongForPackOptions | undefined =
      displayOverride && overrideTitle && !looksLikeProseOrBloatedDisplayTitle(overrideTitle)
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

    const hasTrustedDisplayTitle = Boolean(
      overrideTitle && !looksLikeProseOrBloatedDisplayTitle(overrideTitle),
    );
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
    if (
      looksLikeGarbageArtistSongMetadataForCommentary({
        artist,
        artistDisplay,
        song,
        artistLabel: String(artistLabel ?? ''),
        songLabel: commentarySongLabel,
      })
    ) {
      return NextResponse.json({
        skipAiCommentary: true,
        videoId,
        skipReason: 'unreliable_metadata',
        ...songQuizExtensionFinal,
      });
    }
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
      if (bodyText && !storedCommentaryLooksLikeProductionCreditHallucination(bodyText)) {
        let bodyForReturn = songIntroOnlyDiscography ? introOnlyText : bodyText;
        if (!songIntroOnlyDiscography) {
          bodyForReturn = await copyeditGemmaCommentaryText(bodyForReturn, {
            draftModelId: resolveGenerationModelId('commentary'),
            persistMeta: buildGeminiUsagePersistMeta({
              roomId: roomId || null,
              videoId,
              userId: selectorUserId,
              isGuest: requestIsGuest,
            }),
          });
        }
        if (
          !shouldRegenerateLibraryWhenMusicaichatSong(musicaichatSong, skipMusic8FactInject)
        ) {
          return respondCommentarySuccess({
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
          registrationCheck: buildSongDbRegistrationInput({
            videoId,
            rawTitle: title,
            channelTitle: snippet?.channelTitle ?? null,
            channelId: snippet?.channelId ?? null,
            categoryId: snippet?.categoryId ?? null,
            description: snippet?.description ?? null,
            mainArtist: artist ?? authorName ?? null,
            songTitle: song ?? title,
            hasMusic8Match: Boolean(musicaichatSong ?? fallbackMusic8Song),
            isJapaneseDomestic: isJpEconomy,
            channelAuthorName: authorName ?? null,
            viewCount: snippet?.viewCount ?? null,
          }),
        });
      } catch (e) {
        console.error('[api/ai/commentary] upsertSongAndVideo', e);
      }
    }
    if (songId) {
      const writer = createAdminClient() ?? supabase;
      try {
        await attachMusic8SongDataIfFetched(writer, songId, musicaichatSong ?? fallbackMusic8Song ?? null);
      } catch (e) {
        console.warn('[api/ai/commentary] attachMusic8SongDataIfFetched', e);
      }
    }

    const supergroupHint =
      artistLabel && artistLabel.trim().length > 0
        ? await buildSupergroupPromptBlock(artistLabel)
        : '';
    let text = songIntroOnlyDiscography
      ? introOnlyText
      : await generateCommentary(commentarySongLabel, artistLabel, {
          videoId,
          roomId: roomId || null,
          userId: selectorUserId,
          rawYouTubeTitle,
          supergroupHintText: supergroupHint || null,
          music8FactsBlock: music8FactsBlock.length > 0 ? music8FactsBlock : null,
          groundedFactsBlock: mbFactsBlock.length > 0 ? mbFactsBlock : null,
          songIntroOnlyDiscography,
        });
    if (!songIntroOnlyDiscography && text) {
      text = await copyeditGemmaCommentaryText(text, {
        draftModelId: resolveGenerationModelId('commentary'),
        persistMeta: buildGeminiUsagePersistMeta({
          roomId: roomId || null,
          videoId,
          userId: selectorUserId,
          isGuest: requestIsGuest,
        }),
      });
    }
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

    return respondCommentarySuccess({
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

