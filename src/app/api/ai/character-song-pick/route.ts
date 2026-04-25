import { NextResponse } from 'next/server';
import { checkCharacterSongPickRateLimit } from '@/lib/character-song-pick-rate-limit';
import { getChatAiClientIp } from '@/lib/chat-ai-rate-limit';
import { checkYouTubeSearchRateLimit } from '@/lib/youtube-search-rate-limit';
import { formatArtistTitle } from '@/lib/format-song-display';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { createClient } from '@/lib/supabase/server';
import { getStyleFromDb } from '@/lib/song-style';
import { generateCharacterSongPick } from '@/lib/gemini';
import { resolveYoutubeQueryForPaste } from '@/lib/resolve-youtube-query-for-paste';
import { isYouTubeConfigured } from '@/lib/youtube-search';
import { persistAiCharacterSongPickLog } from '@/lib/ai-character-song-pick-log';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages)
      ? body.messages.map((m: { displayName?: string; body?: string; messageType?: string }) => ({
          displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
          body: typeof m.body === 'string' ? m.body : '',
          messageType: typeof m.messageType === 'string' ? m.messageType : undefined,
        }))
      : [];

    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const roomTitle = typeof body?.roomTitle === 'string' ? body.roomTitle.trim() : '';
    const isGuest = body?.isGuest === true;
    const inputComment =
      [...messages]
        .reverse()
        .find((m) => m.messageType !== 'ai' && typeof m.body === 'string' && m.body.trim())?.body ?? '';

    const rl = checkCharacterSongPickRateLimit(roomId);
    if (!rl.ok) {
      console.log('[ai/character-song-pick] throttled', {
        roomId: roomId || '',
        retryAfterSec: rl.retryAfterSec,
      });
      return NextResponse.json(
        { ok: false, throttled: true, retryAfterSec: rl.retryAfterSec },
        { status: 200 },
      );
    }

    let currentSong: string | null = null;
    let currentSongStyle: string | null = null;
    if (videoId) {
      const oembed = await fetchOEmbed(videoId);
      const title = oembed?.title ?? videoId;
      currentSong = formatArtistTitle(title, oembed?.author_name) || null;
      const supabase = await createClient();
      if (supabase) {
        currentSongStyle = (await getStyleFromDb(supabase, videoId)) ?? null;
      }
    }

    const pick = await generateCharacterSongPick(messages, currentSong, currentSongStyle, {
      roomId: roomId || undefined,
      videoId: videoId || undefined,
    });
    if (!pick) {
      console.log('[ai/character-song-pick] no_pick', {
        roomId: roomId || '',
        nowPlayingVideoId_contextOnly: videoId || null,
        note: 'nowPlaying… はプロンプト用の再生中ID。次曲のvideoIdは未確定（paste-by-query 後のログ参照）。',
      });
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    type YoutubeResolved =
      | {
          ok: true;
          videoId: string;
          watchUrl: string;
          artistTitle: string;
          title: string;
          channelTitle: string;
        }
      | {
          ok: false;
          reason:
            | 'youtube_ai_resolve_disabled'
            | 'youtube_not_configured'
            | 'no_hit'
            | 'rate_limit';
          retryAfterSec?: number;
        };

    let youtube: YoutubeResolved = { ok: false, reason: 'youtube_not_configured' };
    if (process.env.YOUTUBE_AI_CHARACTER_RESOLVE_DISABLED === '1') {
      youtube = { ok: false, reason: 'youtube_ai_resolve_disabled' };
    } else if (!isYouTubeConfigured()) {
      youtube = { ok: false, reason: 'youtube_not_configured' };
    } else {
      const ytRl = checkYouTubeSearchRateLimit(getChatAiClientIp(request), isGuest);
      if (!ytRl.ok) {
        youtube = { ok: false, reason: 'rate_limit', retryAfterSec: ytRl.retryAfterSec };
      } else {
        const exclude = videoId ? [videoId] : [];
        const resolved = await resolveYoutubeQueryForPaste({
          query: pick.query,
          roomId: roomId || undefined,
          apiSource: 'api/ai/character-song-pick',
          excludeVideoIds: exclude,
        });
        if (resolved.ok) {
          youtube = {
            ok: true,
            videoId: resolved.videoId,
            watchUrl: resolved.watchUrl,
            artistTitle: resolved.artistTitle,
            title: resolved.title,
            channelTitle: resolved.channelTitle,
          };
          console.log(
            `[ai/character-song-pick] AI_CHAR_RESOLVED_URL room=${roomId || ''} videoId=${resolved.videoId} url=${resolved.watchUrl} artistTitle=${JSON.stringify(resolved.artistTitle)} query=${JSON.stringify(pick.query)}`,
          );
          console.log('[ai/character-song-pick] youtube_resolved_same_request', {
            roomId: roomId || '',
            nowPlayingVideoId_contextOnly: videoId || null,
            characterPickQuery: pick.query,
            characterPickConfirmationText: pick.confirmationText,
            resolvedYoutubeTitle: resolved.title,
            resolvedArtistTitle: resolved.artistTitle,
            resolvedVideoId: resolved.videoId,
            watchUrl: resolved.watchUrl,
            excludedVideoIds: exclude.length > 0 ? exclude : undefined,
          });
        } else {
          youtube = { ok: false, reason: 'no_hit' };
          console.log('[ai/character-song-pick] youtube_no_hit', {
            roomId: roomId || '',
            characterPickQuery: pick.query,
            nowPlayingVideoId_contextOnly: videoId || null,
          });
        }
      }
    }

    console.log('[ai/character-song-pick] character_pick_text', {
      roomId: roomId || '',
      nowPlayingVideoId_contextOnly_NOT_theAiPick: videoId || null,
      characterPickQuery: pick.query,
      characterPickConfirmationText: pick.confirmationText,
      reason: pick.reason,
      youtubeResolutionOk: youtube.ok === true,
      resolvedVideoId: youtube.ok ? youtube.videoId : null,
      watchUrl: youtube.ok ? youtube.watchUrl : null,
      youtubeFailureReason: youtube.ok ? null : youtube.reason,
    });

    const bodyOut: Record<string, unknown> = {
      ok: true,
      query: pick.query,
      confirmationText: pick.confirmationText,
      reason: pick.reason,
      youtube,
    };
    if (youtube.ok === true) {
      await persistAiCharacterSongPickLog({
        roomId: roomId || null,
        roomTitle: roomTitle || null,
        pickedVideoId: youtube.videoId,
        pickedArtistTitle: youtube.artistTitle,
        pickedYoutubeTitle: youtube.title,
        pickQuery: pick.query,
        pickReason: pick.reason,
        confirmationText: pick.confirmationText,
        inputComment: inputComment || null,
      });
      bodyOut.resolvedVideoId = youtube.videoId;
      bodyOut.resolvedWatchUrl = youtube.watchUrl;
      bodyOut.resolvedArtistTitle = youtube.artistTitle;
      bodyOut.resolvedYoutubeTitle = youtube.title;
    }
    return NextResponse.json(bodyOut);
  } catch (e) {
    console.error('[api/ai/character-song-pick]', e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
