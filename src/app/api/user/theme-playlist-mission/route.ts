import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getThemePlaylistDefinition,
  THEME_PLAYLIST_MISSIONS,
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

type MissionRow = {
  id: string;
  theme_id: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EntryRow = {
  id: string;
  mission_id: string;
  slot_index: number;
  video_id: string;
  url: string;
  title: string | null;
  artist: string | null;
  ai_comment: string;
  selector_display_name: string | null;
  created_at: string;
};

type CustomThemeRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

function toCustomThemeId(rawId: string): string {
  return `custom:${rawId}`;
}

function fromCustomThemeId(themeId: string): string | null {
  const t = themeId.trim();
  if (!t.startsWith('custom:')) return null;
  const id = t.slice('custom:'.length).trim();
  if (!id) return null;
  return id;
}

async function fetchMissionEntries(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  missionId: string,
): Promise<EntryRow[]> {
  const { data: ent, error: eErr } = await supabase
    .from('user_theme_playlist_entries')
    .select(
      'id, mission_id, slot_index, video_id, url, title, artist, ai_comment, selector_display_name, created_at',
    )
    .eq('mission_id', missionId)
    .order('slot_index', { ascending: true });
  if (eErr && eErr.code !== '42P01' && eErr.code !== '42703') {
    console.error('[theme-playlist-mission entries]', eErr);
  }
  return (eErr ? [] : ent) ?? [];
}

/**
 * GET: 固定テーマ一覧 + 自分のミッション（直近）とエントリ
 */
export async function GET() {
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

  const presetThemes = THEME_PLAYLIST_MISSIONS.map((t) => ({
    id: t.id,
    label: t.labelJa,
    description: t.descriptionJa,
  }));
  const { data: customRaw, error: customErr } = await supabase
    .from('user_theme_playlist_custom_themes')
    .select('id, user_id, title, description, is_active, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (customErr && customErr.code !== '42P01') {
    console.error('[theme-playlist-mission GET custom themes]', customErr);
    return NextResponse.json({ error: customErr.message }, { status: 500 });
  }
  const customThemes = ((customErr ? [] : customRaw) ?? []).map((row) => {
    const r = row as CustomThemeRow;
    return {
      id: toCustomThemeId(r.id),
      label: r.title,
      description: r.description ?? '',
      is_custom: true,
      base_id: r.id,
    };
  });
  const themes = [...presetThemes, ...customThemes];

  const { data: missionsRaw, error: mErr } = await supabase
    .from('user_theme_playlist_missions')
    .select('id, theme_id, status, completed_at, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (mErr) {
    if (mErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-mission GET]', mErr);
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const missions = (missionsRaw ?? []) as MissionRow[];
  const missionIds = missions.map((m) => m.id);
  let entriesByMission = new Map<string, EntryRow[]>();

  if (missionIds.length > 0) {
    const { data: entriesRaw, error: eErr } = await supabase
      .from('user_theme_playlist_entries')
      .select(
        'id, mission_id, slot_index, video_id, url, title, artist, ai_comment, selector_display_name, created_at',
      )
      .in('mission_id', missionIds)
      .order('slot_index', { ascending: true });

    if (eErr) {
      if (eErr.code === '42P01') return tableMissingResponse();
      if (eErr.code === '42703') {
        return NextResponse.json(
          {
            error:
              'selector_display_name 列がありません。docs/supabase-setup.md 第18章の追補SQL（ALTER TABLE）を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[theme-playlist-mission GET entries]', eErr);
      return NextResponse.json({ error: eErr.message }, { status: 500 });
    }

    entriesByMission = new Map();
    for (const row of (entriesRaw ?? []) as EntryRow[]) {
      const list = entriesByMission.get(row.mission_id) ?? [];
      list.push(row);
      entriesByMission.set(row.mission_id, list);
    }
  }

  const customLabelByThemeId = new Map<string, string>();
  for (const t of customThemes) customLabelByThemeId.set(t.id, t.label);
  const missionsOut = missions.map((m) => {
    const def = getThemePlaylistDefinition(m.theme_id);
    const customLabel = customLabelByThemeId.get(m.theme_id);
    return {
      id: m.id,
      theme_id: m.theme_id,
      theme_label: def?.labelJa ?? customLabel ?? m.theme_id,
      status: m.status,
      completed_at: m.completed_at,
      created_at: m.created_at,
      updated_at: m.updated_at,
      entries: entriesByMission.get(m.id) ?? [],
      entry_count: (entriesByMission.get(m.id) ?? []).length,
    };
  });

  return NextResponse.json({ themes, presetThemes, customThemes, missions: missionsOut });
}

/**
 * POST:
 * - action=pause: 進行中ミッションを一時解除（途中データは保持）
 * - それ以外: お題でミッション開始/再開
 * Body:
 * - pause: { action: 'pause', missionId: string }
 * - start/resume: { themeId: string }
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

  let body: {
    themeId?: string;
    action?: string;
    missionId?: string;
    title?: string;
    description?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body?.action === 'pause') {
    const missionId = typeof body?.missionId === 'string' ? body.missionId.trim() : '';
    if (!missionId) {
      return NextResponse.json({ error: 'missionId が必要です。' }, { status: 400 });
    }
    const nowIso = new Date().toISOString();
    const { data: updated, error: upErr } = await supabase
      .from('user_theme_playlist_missions')
      .update({ status: 'paused', updated_at: nowIso })
      .eq('id', missionId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .select('id, theme_id, status, completed_at, created_at, updated_at')
      .maybeSingle();
    if (upErr) {
      if (upErr.code === '42P01') return tableMissingResponse();
      if (upErr.code === '23514') {
        return NextResponse.json(
          {
            error:
              'status=paused が未対応です。docs/supabase-setup.md 第18章の追補SQL（CHECK制約更新）を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[theme-playlist-mission POST pause]', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: '進行中のミッションが見つかりません。' }, { status: 404 });
    }
    const entries = await fetchMissionEntries(supabase, missionId);
    return NextResponse.json({
      mission: updated,
      entries,
      paused: true,
    });
  }

  if (body?.action === 'create_theme') {
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 80) : '';
    const description = typeof body?.description === 'string' ? body.description.trim().slice(0, 200) : '';
    if (!title) {
      return NextResponse.json({ error: 'タイトルを入力してください。' }, { status: 400 });
    }
    const { data: inserted, error: insCustomErr } = await supabase
      .from('user_theme_playlist_custom_themes')
      .insert({
        user_id: user.id,
        title,
        description: description || null,
        is_active: true,
      })
      .select('id, title, description')
      .single();
    if (insCustomErr) {
      if (insCustomErr.code === '42P01') {
        return NextResponse.json(
          {
            error:
              'オリジナルお題テーブルがありません。docs/supabase-setup.md 第18章の追補SQL（user_theme_playlist_custom_themes）を実行してください。',
          },
          { status: 503 },
        );
      }
      if (insCustomErr.code === '42501') {
        return NextResponse.json(
          {
            error:
              'オリジナルお題の作成権限がありません。docs/supabase-setup.md 第18章の追補SQL（user_theme_playlist_custom_themes の RLS policy）を実行してください。',
          },
          { status: 503 },
        );
      }
      console.error('[theme-playlist-mission POST create_theme]', insCustomErr);
      return NextResponse.json({ error: insCustomErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      customTheme: {
        id: toCustomThemeId((inserted as { id: string }).id),
        label: (inserted as { title: string }).title,
        description: ((inserted as { description?: string | null }).description ?? '').trim(),
      },
    });
  }

  const themeId = typeof body?.themeId === 'string' ? body.themeId.trim() : '';
  const fixedDef = themeId ? getThemePlaylistDefinition(themeId) : null;
  const customBaseId = themeId ? fromCustomThemeId(themeId) : null;
  let customTheme: CustomThemeRow | null = null;
  if (!fixedDef && customBaseId) {
    const { data: customData, error: customThemeErr } = await supabase
      .from('user_theme_playlist_custom_themes')
      .select('id, user_id, title, description, is_active, created_at, updated_at')
      .eq('id', customBaseId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (customThemeErr && customThemeErr.code !== '42P01') {
      console.error('[theme-playlist-mission POST custom theme]', customThemeErr);
      return NextResponse.json({ error: customThemeErr.message }, { status: 500 });
    }
    customTheme = customData ? (customData as CustomThemeRow) : null;
  }
  if (!themeId || (!fixedDef && !customTheme)) {
    return NextResponse.json({ error: 'themeId が不正です。' }, { status: 400 });
  }

  const { data: active, error: selErr } = await supabase
    .from('user_theme_playlist_missions')
    .select('id, theme_id, status, completed_at, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('theme_id', themeId)
    .eq('status', 'active')
    .maybeSingle();

  if (selErr) {
    if (selErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-mission POST select]', selErr);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  if (active) {
    const ent = await fetchMissionEntries(supabase, (active as MissionRow).id);
    return NextResponse.json({
      mission: active,
      entries: ent,
      resumed: true,
    });
  }

  const { data: pausedRows, error: pausedErr } = await supabase
    .from('user_theme_playlist_missions')
    .select('id, theme_id, status, completed_at, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('theme_id', themeId)
    .eq('status', 'paused')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (pausedErr) {
    if (pausedErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-mission POST paused]', pausedErr);
    return NextResponse.json({ error: pausedErr.message }, { status: 500 });
  }
  const paused = Array.isArray(pausedRows) && pausedRows.length > 0 ? (pausedRows[0] as MissionRow) : null;
  if (paused?.id) {
    const nowIso = new Date().toISOString();
    const { data: reactivated, error: reacErr } = await supabase
      .from('user_theme_playlist_missions')
      .update({ status: 'active', updated_at: nowIso })
      .eq('id', paused.id)
      .eq('user_id', user.id)
      .select('id, theme_id, status, completed_at, created_at, updated_at')
      .single();
    if (reacErr) {
      if (reacErr.code === '42P01') return tableMissingResponse();
      console.error('[theme-playlist-mission POST reactivate]', reacErr);
      return NextResponse.json({ error: reacErr.message }, { status: 500 });
    }
    const ent = await fetchMissionEntries(supabase, paused.id);
    return NextResponse.json({
      mission: reactivated,
      entries: ent,
      resumed: true,
      resumedFromPaused: true,
    });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('user_theme_playlist_missions')
    .insert({
      user_id: user.id,
      theme_id: themeId,
      status: 'active',
    })
    .select('id, theme_id, status, completed_at, created_at, updated_at')
    .single();

  if (insErr) {
    if (insErr.code === '42P01') return tableMissingResponse();
    console.error('[theme-playlist-mission POST insert]', insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    mission: inserted,
    entries: [] as EntryRow[],
    resumed: false,
  });
}
