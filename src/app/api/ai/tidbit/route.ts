import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cleanAuthor, cleanTitle, formatArtistTitle, getArtistAndSong } from '@/lib/format-song-display';
import { generateTidbit } from '@/lib/gemini';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getStyleFromDb } from '@/lib/song-style';
import {
  searchTidbitFromLibrary,
  insertTidbitToLibrary,
} from '@/lib/tidbit-library';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { insertTidbit } from '../../../../lib/song-tidbits';

export const dynamic = 'force-dynamic';
/**
 * テスト運用中のトークン節約用。
 * - NEXT_PUBLIC_DISABLE_TIDBIT_AI=1（デフォルト）で豆知識APIを停止
 * - 再開したい場合は NEXT_PUBLIC_DISABLE_TIDBIT_AI=0
 */
const DISABLE_TIDBIT_AI = process.env.NEXT_PUBLIC_DISABLE_TIDBIT_AI !== '0';

/**
 * POST: 豆知識を 1 件返す。
 * ① ライブラリを検索: まず「アーティスト - 曲名」で同一曲を検索、次にアーティストのみで検索（videoId は補助）。excludeIds・スタイルで絞る。
 * ② ヒットしなければ AI で生成し、ライブラリに登録してから返す。アーティスト名は cleanAuthor 済みで保存。
 * Body: { videoId?: string, currentVideoIdForStyle?: string, recentlyUsedTidbitIds?: string[], roomId?: string, preferGeneralTidbit?: boolean, preferMainArtistTidbit?: boolean }
 */
export async function POST(request: Request) {
  try {
    if (DISABLE_TIDBIT_AI) {
      return NextResponse.json({ disabled: true, reason: 'tidbit_disabled_for_testing' });
    }

    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const currentVideoIdForStyle =
      typeof body?.currentVideoIdForStyle === 'string' ? body.currentVideoIdForStyle.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : undefined;
    const recentlyUsedTidbitIds = Array.isArray(body?.recentlyUsedTidbitIds)
      ? body.recentlyUsedTidbitIds.filter((id: unknown) => typeof id === 'string')
      : [];
    const preferGeneralTidbit = Boolean(body?.preferGeneralTidbit);
    const preferMainArtistTidbit = Boolean(body?.preferMainArtistTidbit);

    let artistName: string | null = null;
    let songTitle: string | null = null;
    let currentSong: string | null = null;

    if (videoId && !preferGeneralTidbit) {
      const oembed = await fetchOEmbed(videoId);
      const title = oembed?.title ?? videoId;
      const rawAuthor = oembed?.author_name ?? null;
      artistName = rawAuthor ? (cleanAuthor(rawAuthor) || null) : null;
      songTitle = title;
      const authorForParse = rawAuthor ? cleanAuthor(rawAuthor) : null;
      const cleaned = cleanTitle(title);
      const parsed = getArtistAndSong(cleaned, authorForParse);
      currentSong =
        parsed.artistDisplay && parsed.song
          ? `${parsed.artistDisplay} - ${parsed.song}`
          : formatArtistTitle(title, rawAuthor ?? undefined) || null;
    }

    const supabase = await createClient();

    const styleVideoId = videoId || currentVideoIdForStyle || '';
    const currentSongStyle =
      supabase && styleVideoId ? await getStyleFromDb(supabase, styleVideoId) : null;

    // 曲マスタへの登録（曲単位の集約用）と song_id の取得
    let songId: string | null = null;
    if (supabase && videoId) {
      try {
        const mainArtist = artistName ?? null;
        const songTitleForMaster = songTitle ?? null;
        songId = await upsertSongAndVideo({
          supabase,
          videoId,
          mainArtist,
          songTitle: songTitleForMaster ?? undefined,
          variant: 'tidbit',
        });
      } catch (e) {
        console.error('[api/ai/tidbit] upsertSongAndVideo', e);
      }
    }

    const fromLibrary = supabase
      ? await searchTidbitFromLibrary(supabase, {
          videoId: videoId || undefined,
          artistName: artistName ?? undefined,
          songTitle: songTitle ?? undefined,
          excludeIds: recentlyUsedTidbitIds,
          currentSongStyle: currentSongStyle ?? undefined,
        })
      : null;

    if (fromLibrary) {
      // 既存ライブラリからの豆知識も曲ごとの song_tidbits に記録する（NG API は song_tidbits.id を要する）
      let songTidbitRow = null;
      if (supabase && songId && videoId) {
        try {
          songTidbitRow = await insertTidbit(supabase, {
            songId,
            videoId,
            body: fromLibrary.body,
            source: 'tidbit_library',
          });
        } catch (e) {
          console.error('[api/ai/tidbit] insertTidbit (library)', e);
        }
      }
      return NextResponse.json({
        text: fromLibrary.body,
        /** tidbit_library.id（クライアントの recentlyUsed 除外用） */
        tidbitId: fromLibrary.id,
        /** song_tidbits.id（NG「DBから外す」API 用） */
        songTidbitId: songTidbitRow?.id ?? null,
        source: 'library',
      });
    }

    const text = await generateTidbit(
      preferGeneralTidbit ? null : currentSong,
      preferGeneralTidbit,
      preferMainArtistTidbit,
      { roomId: roomId || undefined, videoId: videoId || undefined }
    );
    if (text == null) {
      return NextResponse.json(
        { error: 'AI is not configured or failed to generate tidbit.' },
        { status: 503 }
      );
    }

    // 生成した豆知識（メインアーティスト話題含む）はライブラリに保存し、同曲・同アーティストで再利用する
    const inserted = supabase
      ? await insertTidbitToLibrary(supabase, {
          body: text,
          videoId: videoId || undefined,
          artistName: artistName ?? undefined,
          songTitle: songTitle ?? undefined,
          roomId: roomId ?? undefined,
          style: currentSongStyle ?? undefined,
        })
      : null;

    if (supabase && !inserted) {
      console.error(
        '[api/ai/tidbit] insertTidbitToLibrary returned null (save failed or duplicate body)',
      );
    }

    // 曲ごとの豆知識テーブルにも保存（song_tidbits）
    let songTidbitRow = null;
    if (supabase && songId && videoId) {
      try {
        songTidbitRow = await insertTidbit(supabase, {
          songId,
          videoId,
          body: text,
          source: 'ai_tidbit',
        });
      } catch (e) {
        console.error('[api/ai/tidbit] insertTidbit (generated)', e);
      }
    }

    return NextResponse.json({
      text,
      tidbitId: inserted?.id ?? null,
      songTidbitId: songTidbitRow?.id ?? null,
      source: 'generated',
      saved: Boolean(inserted),
    });
  } catch (e) {
    console.error('[api/ai/tidbit]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
