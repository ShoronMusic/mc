import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { attachMusic8SongDataIfFetched } from '@/lib/song-entities';
import { buildPersistableMusic8SongSnapshot } from '@/lib/music8-song-persist';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST: 指定 URL から Music8 曲 JSON を直接取得し songs に保存（管理者用）。
 * Body: { songId: string; jsonUrl: string }
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { songId?: string; jsonUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }
  const jsonUrl = typeof body.jsonUrl === 'string' ? body.jsonUrl.trim() : '';
  if (!jsonUrl || !/^https?:\/\/.+/i.test(jsonUrl)) {
    return NextResponse.json({ error: 'jsonUrl が無効です。' }, { status: 400 });
  }

  // 曲の存在確認
  const { data: song, error: selErr } = await admin
    .from('songs')
    .select('id')
    .eq('id', songId)
    .maybeSingle();
  if (selErr) {
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!song) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }

  // URL から JSON を取得
  let music8Json: Record<string, unknown>;
  try {
    const res = await fetch(jsonUrl, {
      headers: { 'User-Agent': 'musicaichat-admin/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `JSON 取得に失敗しました (HTTP ${res.status})。URL を確認してください。` },
        { status: 502 },
      );
    }
    const raw = await res.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return NextResponse.json({ error: '取得した内容が有効な曲 JSON ではありません。' }, { status: 422 });
    }
    music8Json = raw as Record<string, unknown>;
  } catch (e) {
    console.error('[admin/song-music8-json-import] fetch', e);
    return NextResponse.json({ error: 'JSON の取得中にエラーが発生しました。' }, { status: 502 });
  }

  // スナップショット生成可否チェック
  const snap = buildPersistableMusic8SongSnapshot(music8Json);
  if (!snap) {
    return NextResponse.json(
      { error: '取得した JSON から保存用スナップショットを生成できませんでした（Music8 曲 JSON の形式でない可能性があります）。' },
      { status: 422 },
    );
  }

  // DB に保存（songs + artists + song_videos slug 等）
  try {
    await attachMusic8SongDataIfFetched(admin, songId, music8Json);
  } catch (e) {
    console.error('[admin/song-music8-json-import] attachMusic8SongDataIfFetched', e);
    return NextResponse.json({ error: 'DB の更新に失敗しました。' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, songId, snapKind: snap.kind });
}
