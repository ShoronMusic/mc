import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { deleteSongMasterCascade } from '@/lib/admin-delete-song-master';
import { normalizeSongDeleteConfirmText } from '@/lib/admin-song-delete-confirm';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST: 曲マスタ `songs` を削除（誤登録・テレコ修正用）。
 * Body: { songId: string, confirmText: string }
 * - confirmText は DB の display_title と実質一致（trim・大文字小文字・スマートクォート・ダッシュ正規化後）。display_title が空なら songId（UUID）。
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { songId?: string; confirmText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  const confirmText = typeof body.confirmText === 'string' ? body.confirmText.trim() : '';

  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }
  if (!confirmText) {
    return NextResponse.json({ error: 'confirmText が必要です。' }, { status: 400 });
  }

  const { data: song, error: selErr } = await admin
    .from('songs')
    .select('id, display_title')
    .eq('id', songId)
    .maybeSingle();

  if (selErr) {
    console.error('[admin/song-master-delete] select', selErr);
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }
  if (!song) {
    return NextResponse.json({ error: '曲が見つかりません。' }, { status: 404 });
  }

  const displayTitle = typeof song.display_title === 'string' ? song.display_title.trim() : '';
  const expectedRaw = displayTitle || songId;
  const ok =
    normalizeSongDeleteConfirmText(confirmText) === normalizeSongDeleteConfirmText(expectedRaw);
  if (!ok) {
    return NextResponse.json(
      {
        error:
          '確認テキストが一致しません。表示されている display_title（または ID）に近い内容か確認してください（英字の大文字小文字の違いは無視されます）。',
      },
      { status: 400 },
    );
  }

  const result = await deleteSongMasterCascade(admin, songId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, songId });
}
