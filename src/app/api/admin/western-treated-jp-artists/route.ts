import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { clearLibraryArtistIndexCache } from '@/lib/build-library-artist-index';
import {
  ensureWesternTreatedJpArtistCache,
  invalidateWesternTreatedJpArtistCache,
  listWesternTreatedJpArtists,
  normalizeWesternTreatedJpArtistKey,
  validateWesternTreatedJpArtistNameInput,
  validateWesternTreatedJpArtistNoteInput,
} from '@/lib/western-treated-jp-artists';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TABLE_HINT =
  'docs/supabase-setup.md の「24. 洋楽扱い日本人アーティスト」SQL を Supabase SQL Editor で実行してください。';

function tableMissingResponse() {
  return NextResponse.json(
    {
      error: 'western_treated_jp_artists テーブルがありません。',
      hint: TABLE_HINT,
      rows: [],
    },
    { status: 503 },
  );
}

export async function GET() {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  try {
    const { rows, tableMissing } = await listWesternTreatedJpArtists(admin);
    if (tableMissing) return tableMissingResponse();
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : '読み込みに失敗しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { artist_name?: string; note?: string | null };
  try {
    body = (await request.json()) as { artist_name?: string; note?: string | null };
  } catch {
    return NextResponse.json({ error: 'JSON が不正です。' }, { status: 400 });
  }

  const artistName = validateWesternTreatedJpArtistNameInput(body.artist_name);
  if (!artistName) {
    return NextResponse.json(
      { error: 'アーティスト名は 1〜120 文字で入力してください。' },
      { status: 400 },
    );
  }
  const note = validateWesternTreatedJpArtistNoteInput(body.note);
  if (body.note != null && body.note !== '' && note === null && typeof body.note === 'string') {
    return NextResponse.json({ error: 'メモは 500 文字以内にしてください。' }, { status: 400 });
  }

  const nameKey = normalizeWesternTreatedJpArtistKey(artistName);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('western_treated_jp_artists')
    .insert({
      artist_name: artistName,
      name_key: nameKey,
      note,
      updated_at: now,
    })
    .select('id, artist_name, name_key, note, created_at, updated_at')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return tableMissingResponse();
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '同じアーティスト名（正規化後）が既に登録されています。' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '登録に失敗しました。' }, { status: 500 });
  }

  invalidateWesternTreatedJpArtistCache();
  clearLibraryArtistIndexCache();
  await ensureWesternTreatedJpArtistCache(admin);
  return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: { id?: string; artist_name?: string; note?: string | null };
  try {
    body = (await request.json()) as { id?: string; artist_name?: string; note?: string | null };
  } catch {
    return NextResponse.json({ error: 'JSON が不正です。' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.artist_name !== undefined) {
    const artistName = validateWesternTreatedJpArtistNameInput(body.artist_name);
    if (!artistName) {
      return NextResponse.json(
        { error: 'アーティスト名は 1〜120 文字で入力してください。' },
        { status: 400 },
      );
    }
    patch.artist_name = artistName;
    patch.name_key = normalizeWesternTreatedJpArtistKey(artistName);
  }

  if (body.note !== undefined) {
    const note = validateWesternTreatedJpArtistNoteInput(body.note);
    if (body.note != null && body.note !== '' && note === null && typeof body.note === 'string') {
      return NextResponse.json({ error: 'メモは 500 文字以内にしてください。' }, { status: 400 });
    }
    patch.note = note;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: 'artist_name または note を指定してください。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('western_treated_jp_artists')
    .update(patch)
    .eq('id', id)
    .select('id, artist_name, name_key, note, created_at, updated_at')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return tableMissingResponse();
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '同じアーティスト名（正規化後）が既に登録されています。' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '対象が見つかりません。' }, { status: 404 });
  }

  invalidateWesternTreatedJpArtistCache();
  clearLibraryArtistIndexCache();
  await ensureWesternTreatedJpArtistCache(admin);
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id が無効です。' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('western_treated_jp_artists')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return tableMissingResponse();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: '対象が見つかりません。' }, { status: 404 });
  }

  invalidateWesternTreatedJpArtistCache();
  clearLibraryArtistIndexCache();
  await ensureWesternTreatedJpArtistCache(admin);
  return NextResponse.json({ ok: true, id });
}
