import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCommentary } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoSnippet } from '@/lib/youtube-search';
import {
  deleteCommentaryByVideoId,
  getCommentaryByVideoId,
  insertCommentaryToLibrary,
  reapplyCommentaryLibraryBodyPrefix,
} from '@/lib/commentary-library';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '../../../../lib/song-tidbits';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import { fetchMusicBrainzCommentaryFactsBlock } from '@/lib/musicbrainz-commentary-facts';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { shouldSkipAiCommentaryForUncertainArtistResolution } from '@/lib/format-song-display';

export const dynamic = 'force-dynamic';

function normArtistSongToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 保存時のメタと今回の解決が食い違うライブラリ行は本文が誤生成のままなので使わない */
function commentaryLibraryMetadataMatchesResolution(
  row: { artist_name: string | null; song_title: string | null },
  artist: string | null,
  artistDisplay: string | null,
  song: string | null,
): boolean {
  const sa = row.artist_name?.trim() ?? '';
  const ss = row.song_title?.trim() ?? '';
  if (!sa || !ss) return true;
  const ws = song?.trim() ?? '';
  if (!ws) return true;
  const wa = artist?.trim() ?? '';
  const wd = artistDisplay?.trim() ?? '';
  const nArtistOk =
    normArtistSongToken(sa) === normArtistSongToken(wa) ||
    (wd.length > 0 && normArtistSongToken(sa) === normArtistSongToken(wd));
  const nSongOk = normArtistSongToken(ss) === normArtistSongToken(ws);
  return nArtistOk && nSongOk;
}

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
      const metaOk = commentaryLibraryMetadataMatchesResolution(
        fromLibrary,
        artist,
        artistDisplay,
        song,
      );
      if (!metaOk) {
        if (process.env.DEBUG_YT_ARTIST === '1') {
          console.info('[api/ai/commentary] library skipped (stale metadata)', {
            videoId,
            storedArtist: fromLibrary.artist_name,
            storedSong: fromLibrary.song_title,
            resolvedArtist: artist,
            resolvedDisplay: artistDisplay,
            resolvedSong: song,
          });
        }
        await deleteCommentaryByVideoId(supabase, videoId);
      } else {
        const text = reapplyCommentaryLibraryBodyPrefix(
          fromLibrary.body,
          artistDisplay,
          song,
          artist ?? authorName ?? null,
        );
        if (process.env.DEBUG_YT_ARTIST === '1') {
          console.info('[api/ai/commentary] library hit', {
            videoId,
            artistDisplay,
            song,
            prefixRewritten: text.slice(0, 80),
          });
        }
        return NextResponse.json({ text, source: 'library' });
      }
    }

    let groundedFactsBlock: string | null = null;
    if (artist?.trim() && song?.trim()) {
      try {
        groundedFactsBlock = await fetchMusicBrainzCommentaryFactsBlock(artist.trim(), song.trim());
      } catch (e) {
        console.warn('[api/ai/commentary] MusicBrainz commentary facts', e);
      }
    }

    const text = await generateCommentary(song, artist ?? undefined, {
      videoId,
      rawYouTubeTitle: title,
      groundedFactsBlock,
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
