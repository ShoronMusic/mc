/**
 * 部屋選曲後の「お題講評」: DB へのエントリ追加と AI 文面生成（API から利用）
 */

import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import {
  generateThemePlaylistAiBlurb,
  sanitizeCommentaryExcerptForThemePrompt,
} from '@/lib/theme-playlist-ai-blurb';
import {
  getThemePlaylistDefinition,
  type ThemePlaylistDefinition,
  THEME_PLAYLIST_SLOT_TARGET,
} from '@/lib/theme-playlist-definitions';
import {
  buildAiCommentaryPromptLabels,
  getArtistAndSong,
  isGarbageArtistSongParse,
} from '@/lib/format-song-display';

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export type RoomThemeBlurbResult =
  | {
      ok: true;
      ai_comment: string;
      ai_overall_comment: string;
      entry_count: number;
      completed: boolean;
      mission_id: string;
    }
  | { ok: false; error: string; status: number };

/**
 * アクティブなミッションを取得または作成し、1 エントリ追加。AI コメントを返す。
 */
export async function appendThemePlaylistRoomEntry(
  userId: string,
  themeId: string,
  videoId: string,
  commentaryContext?: string | null,
  selectorDisplayName?: string | null,
  roomId?: string | null,
): Promise<RoomThemeBlurbResult> {
  const vid = videoId.trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(vid)) {
    return { ok: false, error: 'videoId が不正です。', status: 400 };
  }

  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: '認証が利用できません。', status: 503 };
  }

  const customThemeId =
    typeof themeId === 'string' && themeId.trim().startsWith('custom:')
      ? themeId.trim().slice('custom:'.length).trim()
      : '';
  let theme: ThemePlaylistDefinition | null = getThemePlaylistDefinition(themeId);
  if (!theme && customThemeId) {
    const { data: customTheme } = await supabase
      .from('user_theme_playlist_custom_themes')
      .select('title, description')
      .eq('id', customThemeId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (customTheme && typeof customTheme.title === 'string' && customTheme.title.trim()) {
      const customLabel = customTheme.title.trim().slice(0, 80);
      const customDesc =
        typeof customTheme.description === 'string' ? customTheme.description.trim().slice(0, 240) : '';
      theme = {
        id: themeId,
        labelJa: customLabel,
        descriptionJa: customDesc || 'オリジナルお題',
        aiGuidanceJa: customDesc || `「${customLabel}」というお題に沿って、率直に講評する。`,
      };
    }
  }
  if (!theme) {
    return { ok: false, error: 'themeId が不正です。', status: 400 };
  }

  const { data: active, error: selErr } = await supabase
    .from('user_theme_playlist_missions')
    .select('id, theme_id, status')
    .eq('user_id', userId)
    .eq('theme_id', themeId)
    .eq('status', 'active')
    .maybeSingle();

  if (selErr) {
    if (selErr.code === '42P01') {
      return {
        ok: false,
        error:
          'テーマプレイリスト用テーブルがありません。docs/supabase-setup.md 第18章の SQL を実行してください。',
        status: 503,
      };
    }
    console.error('[room-theme-blurb] select mission', selErr);
    return { ok: false, error: selErr.message, status: 500 };
  }

  let missionId: string;
  const roomIdSafe =
    typeof roomId === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(roomId.trim())
      ? roomId.trim()
      : null;
  const resolveLiveRoomContext = async (): Promise<{ room_title: string | null; room_owner_user_id: string | null }> => {
    if (!roomIdSafe) return { room_title: null, room_owner_user_id: null };
    const { data } = await supabase
      .from('room_gatherings')
      .select('title, created_by')
      .eq('room_id', roomIdSafe)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const roomTitle =
      data && typeof (data as { title?: unknown }).title === 'string'
        ? ((data as { title: string }).title || '').trim().slice(0, 120)
        : '';
    const roomOwner =
      data && typeof (data as { created_by?: unknown }).created_by === 'string'
        ? ((data as { created_by: string }).created_by || '').trim()
        : '';
    return {
      room_title: roomTitle || null,
      room_owner_user_id: roomOwner || null,
    };
  };
  if (active?.id) {
    missionId = active.id as string;
  } else {
    const roomCtx = await resolveLiveRoomContext();
    const { data: ins, error: insErr } = await supabase
      .from('user_theme_playlist_missions')
      .insert({
        user_id: userId,
        theme_id: themeId,
        status: 'active',
        room_id: roomIdSafe,
        room_title: roomCtx.room_title,
        room_owner_user_id: roomCtx.room_owner_user_id,
      })
      .select('id')
      .single();
    if (insErr) {
      if (insErr.code === '42P01') {
        return {
          ok: false,
          error:
            'テーマプレイリスト用テーブルがありません。docs/supabase-setup.md 第18章の SQL を実行してください。',
          status: 503,
        };
      }
      console.error('[room-theme-blurb] insert mission', insErr);
      return { ok: false, error: insErr.message, status: 500 };
    }
    if (!ins?.id) {
      return { ok: false, error: 'ミッションの作成に失敗しました。', status: 500 };
    }
    missionId = ins.id as string;
  }
  if (roomIdSafe) {
    const roomCtx = await resolveLiveRoomContext();
    await supabase
      .from('user_theme_playlist_missions')
      .update({
        room_id: roomIdSafe,
        room_title: roomCtx.room_title,
        room_owner_user_id: roomCtx.room_owner_user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', missionId)
      .eq('user_id', userId);
  }

  const { count, error: cErr } = await supabase
    .from('user_theme_playlist_entries')
    .select('*', { count: 'exact', head: true })
    .eq('mission_id', missionId);

  if (cErr) {
    if (cErr.code === '42P01') {
      return {
        ok: false,
        error:
          'テーマプレイリスト用テーブルがありません。docs/supabase-setup.md 第18章の SQL を実行してください。',
        status: 503,
      };
    }
    return { ok: false, error: cErr.message, status: 500 };
  }

  const current = count ?? 0;
  if (current >= THEME_PLAYLIST_SLOT_TARGET) {
    return { ok: false, error: 'このお題はすでに10曲そろっています。', status: 409 };
  }

  let title: string | null = null;
  let artist: string | null = null;
  const oembed = await fetchOEmbed(vid);
  const titleRaw = oembed?.title ? oembed.title.trim().slice(0, 500) : '';
  const authorRaw = oembed?.author_name ? oembed.author_name.trim().slice(0, 500) : '';
  title = titleRaw || null;
  artist = authorRaw || null;
  if (titleRaw) {
    const resolved = getArtistAndSong(titleRaw, authorRaw || null);
    const songPart = (resolved.song ?? '').trim();
    const artistPart =
      (resolved.artistDisplay ?? resolved.artist ?? '').trim();
    if (
      songPart &&
      artistPart &&
      !isGarbageArtistSongParse({ artist: artistPart, song: songPart })
    ) {
      const labels = buildAiCommentaryPromptLabels({
        artistDisplay: resolved.artistDisplay,
        artist: resolved.artist,
        authorName: authorRaw || null,
        song: resolved.song,
        titleFallback: titleRaw,
      });
      const al = labels.artistLabel.trim();
      const sl = labels.songLabel.trim();
      if (al && sl) {
        artist = al.slice(0, 500);
        title = sl.slice(0, 500);
      }
    }
  }

  const rawCtx =
    typeof commentaryContext === 'string' && commentaryContext.trim()
      ? commentaryContext.trim()
      : '';
  const ctx = sanitizeCommentaryExcerptForThemePrompt(rawCtx).slice(0, 6000);
  const aiComment = await generateThemePlaylistAiBlurb(
    theme,
    artist ?? '',
    title ?? '',
    { videoId: vid },
    { commentaryExcerpt: ctx || null },
  );

  const slotIndex = current + 1;
  const url = watchUrl(vid);
  const selectorNameRaw =
    typeof selectorDisplayName === 'string' ? selectorDisplayName.trim() : '';
  const selectorName = selectorNameRaw.length > 0 ? selectorNameRaw.slice(0, 80) : '部屋選曲';

  let insE: { code?: string; message: string } | null = null;
  {
    const withOverall = await supabase.from('user_theme_playlist_entries').insert({
      mission_id: missionId,
      slot_index: slotIndex,
      video_id: vid,
      url: url.length > 2000 ? url.slice(0, 2000) : url,
      title,
      artist,
      ai_comment: aiComment,
      ai_overall_comment: aiComment,
      selector_display_name: selectorName,
    });
    insE = withOverall.error as { code?: string; message: string } | null;
    if (insE?.code === '42703') {
      const fallback = await supabase.from('user_theme_playlist_entries').insert({
        mission_id: missionId,
        slot_index: slotIndex,
        video_id: vid,
        url: url.length > 2000 ? url.slice(0, 2000) : url,
        title,
        artist,
        ai_comment: aiComment,
        selector_display_name: selectorName,
      });
      insE = fallback.error as { code?: string; message: string } | null;
    }
  }

  if (insE) {
    if (insE.code === '42703') {
      return {
        ok: false,
        error:
          'selector_display_name 列がありません。docs/supabase-setup.md 第18章の追補SQL（ALTER TABLE）を実行してください。',
        status: 503,
      };
    }
    if (insE.code === '23505') {
      return { ok: false, error: 'この動画はすでにこのお題のリストに含まれています。', status: 409 };
    }
    console.error('[room-theme-blurb] insert entry', insE);
    return { ok: false, error: insE.message, status: 500 };
  }

  const completed = slotIndex >= THEME_PLAYLIST_SLOT_TARGET;
  if (completed) {
    await supabase
      .from('user_theme_playlist_missions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', missionId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('user_theme_playlist_missions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', missionId)
      .eq('user_id', userId);
  }

  return {
    ok: true,
    ai_comment: aiComment,
    ai_overall_comment: aiComment,
    entry_count: slotIndex,
    completed,
    mission_id: missionId,
  };
}
