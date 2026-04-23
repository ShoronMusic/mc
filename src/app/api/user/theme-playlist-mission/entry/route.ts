import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { extractVideoId, normalizeToAbsoluteUrlIfStandalone } from '@/lib/youtube';
import { generateThemePlaylistAiBlurb } from '@/lib/theme-playlist-ai-blurb';
import {
  getThemePlaylistDefinition,
  THEME_PLAYLIST_SLOT_TARGET,
} from '@/lib/theme-playlist-definitions';

export const dynamic = 'force-dynamic';

function tableMissingResponse() {
  return NextResponse.json(
    {
      error:
        'テーマプレイリスト用テーブルがありません。docs/supabase-setup.md の「18. テーマプレイリスト・ミッション」を参照し SQL を実行してください。',
    },
    { status: 503 },
  );
}

function parseVideoId(urlRaw: string | undefined, videoIdRaw: string | undefined): string | null {
  const vid = typeof videoIdRaw === 'string' ? videoIdRaw.trim() : '';
  if (/^[a-zA-Z0-9_-]{11}$/.test(vid)) return vid;

  const url = typeof urlRaw === 'string' ? urlRaw.trim() : '';
  if (!url) return null;

  let fromUrl = extractVideoId(url);
  if (fromUrl) return fromUrl;

  const abs = normalizeToAbsoluteUrlIfStandalone(url);
  if (abs) {
    fromUrl = extractVideoId(abs);
    if (fromUrl) return fromUrl;
  }

  return null;
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * POST: 1曲追加 + AIコメント保存。10曲目でミッション完了。
 * Body: { missionId: string, url?: string, videoId?: string, selectorDisplayName?: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  let body: { missionId?: string; url?: string; videoId?: string; selectorDisplayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const missionId = typeof body?.missionId === 'string' ? body.missionId.trim() : '';
  if (!missionId) {
    return NextResponse.json({ error: 'missionId が必要です。' }, { status: 400 });
  }

  const videoId = parseVideoId(body?.url, body?.videoId);
  if (!videoId) {
    return NextResponse.json(
      { error: '有効な YouTube の URL または 11 文字の videoId を指定してください。' },
      { status: 400 },
    );
  }

  const { data: mission, error: mErr } = await supabase
    .from('user_theme_playlist_missions')
    .select('id, theme_id, status, user_id')
    .eq('id', missionId)
    .maybeSingle();

  if (mErr) {
    if (mErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-entry] mission', mErr);
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  if (!mission || mission.user_id !== user.id) {
    return NextResponse.json({ error: 'ミッションが見つかりません。' }, { status: 404 });
  }

  if (mission.status !== 'active') {
    if (mission.status === 'paused') {
      return NextResponse.json(
        { error: 'このミッションは一旦解除中です。開始/再開で再開してから追加してください。' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'このミッションはすでに完了しています。' }, { status: 409 });
  }

  const { count, error: cErr } = await supabase
    .from('user_theme_playlist_entries')
    .select('*', { count: 'exact', head: true })
    .eq('mission_id', missionId);

  if (cErr) {
    if (cErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-entry] count', cErr);
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const current = count ?? 0;
  if (current >= THEME_PLAYLIST_SLOT_TARGET) {
    return NextResponse.json({ error: 'すでに10曲そろっています。' }, { status: 409 });
  }

  const theme = getThemePlaylistDefinition(mission.theme_id as string);
  if (!theme) {
    return NextResponse.json({ error: 'テーマ定義がありません。' }, { status: 500 });
  }

  let title: string | null = null;
  let artist: string | null = null;
  const oembed = await fetchOEmbed(videoId);
  if (oembed?.title) title = oembed.title.slice(0, 500);
  if (oembed?.author_name) artist = oembed.author_name.slice(0, 500);

  const aiComment = await generateThemePlaylistAiBlurb(theme, artist ?? '', title ?? '', {
    videoId,
  });

  const slotIndex = current + 1;
  const url = watchUrl(videoId);
  const selectorDisplayNameRaw =
    typeof body?.selectorDisplayName === 'string' ? body.selectorDisplayName.trim() : '';
  const selectorDisplayName =
    selectorDisplayNameRaw.length > 0
      ? selectorDisplayNameRaw.slice(0, 80)
      : 'マイページ（自分）';

  let insErr: { code?: string; message: string } | null = null;
  {
    const withOverall = await supabase.from('user_theme_playlist_entries').insert({
      mission_id: missionId,
      slot_index: slotIndex,
      video_id: videoId,
      url: url.length > 2000 ? url.slice(0, 2000) : url,
      title,
      artist,
      ai_comment: aiComment,
      ai_overall_comment: aiComment,
      selector_display_name: selectorDisplayName,
    });
    insErr = withOverall.error as { code?: string; message: string } | null;
    if (insErr?.code === '42703') {
      const fallback = await supabase.from('user_theme_playlist_entries').insert({
        mission_id: missionId,
        slot_index: slotIndex,
        video_id: videoId,
        url: url.length > 2000 ? url.slice(0, 2000) : url,
        title,
        artist,
        ai_comment: aiComment,
        selector_display_name: selectorDisplayName,
      });
      insErr = fallback.error as { code?: string; message: string } | null;
    }
  }

  if (insErr) {
    if (insErr.code === '42P01') return tableMissingResponse();
    if (insErr.code === '42703') {
      return NextResponse.json(
        {
          error:
            'selector_display_name 列がありません。docs/supabase-setup.md 第18章の追補SQL（ALTER TABLE）を実行してください。',
        },
        { status: 503 },
      );
    }
    if (insErr.code === '23505') {
      return NextResponse.json(
        { error: 'この動画はすでにこのミッションに含まれています。' },
        { status: 409 },
      );
    }
    console.error('[theme-playlist-entry] insert', insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const completed = slotIndex >= THEME_PLAYLIST_SLOT_TARGET;
  if (completed) {
    const { error: upErr } = await supabase
      .from('user_theme_playlist_missions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', missionId)
      .eq('user_id', user.id);

    if (upErr) {
      console.error('[theme-playlist-entry] complete mission', upErr);
    }
  } else {
    const { error: upErr } = await supabase
      .from('user_theme_playlist_missions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', missionId)
      .eq('user_id', user.id);
    if (upErr) {
      console.error('[theme-playlist-entry] touch mission', upErr);
    }
  }

  const { data: entries } = await supabase
    .from('user_theme_playlist_entries')
    .select(
      'id, mission_id, slot_index, video_id, url, title, artist, ai_comment, selector_display_name, created_at',
    )
    .eq('mission_id', missionId)
    .order('slot_index', { ascending: true });

  return NextResponse.json({
    ok: true,
    completed,
    slot_index: slotIndex,
    entries: entries ?? [],
  });
}

/**
 * DELETE: 収録曲1件を削除（ミッション所有者のみ）。完了済みで曲数が減った場合はミッションを再び進行可能に戻す。
 * Query: entryId=<uuid>
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: '認証が利用できません。' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: 'ログインしていません。' }, { status: 401 });
  }

  const entryId = new URL(request.url).searchParams.get('entryId')?.trim() ?? '';
  if (!entryId) {
    return NextResponse.json({ error: 'entryId が必要です。' }, { status: 400 });
  }

  const { data: entry, error: entErr } = await supabase
    .from('user_theme_playlist_entries')
    .select('id, mission_id')
    .eq('id', entryId)
    .maybeSingle();

  if (entErr) {
    if (entErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-entry DELETE] entry', entErr);
    return NextResponse.json({ error: entErr.message }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ error: 'エントリが見つかりません。' }, { status: 404 });
  }

  const missionId = typeof entry.mission_id === 'string' ? entry.mission_id.trim() : '';
  if (!missionId) {
    return NextResponse.json({ error: 'ミッションが不正です。' }, { status: 400 });
  }

  const { data: mission, error: mErr } = await supabase
    .from('user_theme_playlist_missions')
    .select('id, status, completed_at, user_id')
    .eq('id', missionId)
    .maybeSingle();

  if (mErr) {
    if (mErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-entry DELETE] mission', mErr);
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }
  if (!mission || mission.user_id !== user.id) {
    return NextResponse.json({ error: 'ミッションが見つかりません。' }, { status: 404 });
  }

  const { error: delErr } = await supabase.from('user_theme_playlist_entries').delete().eq('id', entryId);
  if (delErr) {
    if (delErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-entry DELETE]', delErr);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const { count: remaining, error: cErr } = await supabase
    .from('user_theme_playlist_entries')
    .select('*', { count: 'exact', head: true })
    .eq('mission_id', missionId);

  if (cErr) {
    if (cErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-entry DELETE] recount', cErr);
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const n = remaining ?? 0;
  const nowIso = new Date().toISOString();
  if (mission.status === 'completed' && n < THEME_PLAYLIST_SLOT_TARGET) {
    const { error: upErr } = await supabase
      .from('user_theme_playlist_missions')
      .update({
        status: 'active',
        completed_at: null,
        updated_at: nowIso,
      })
      .eq('id', missionId)
      .eq('user_id', user.id);
    if (upErr) {
      console.error('[theme-playlist-entry DELETE] reopen mission', upErr);
    }
  } else {
    const { error: upErr } = await supabase
      .from('user_theme_playlist_missions')
      .update({ updated_at: nowIso })
      .eq('id', missionId)
      .eq('user_id', user.id);
    if (upErr) {
      console.error('[theme-playlist-entry DELETE] touch mission', upErr);
    }
  }

  const { data: entries } = await supabase
    .from('user_theme_playlist_entries')
    .select(
      'id, mission_id, slot_index, video_id, url, title, artist, ai_comment, selector_display_name, created_at',
    )
    .eq('mission_id', missionId)
    .order('slot_index', { ascending: true });

  return NextResponse.json({
    ok: true,
    entries: entries ?? [],
    remaining_count: n,
  });
}
