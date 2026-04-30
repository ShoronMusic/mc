import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReqBody = {
  songIds?: unknown;
  mainArtist?: unknown;
};

type SongRow = {
  id?: string;
  song_title?: string | null;
  display_title?: string | null;
  play_count?: number | null;
  style?: string | null;
};

function toUniqueSongIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const id = v.trim();
    if (!UUID_RE.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function toTrimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function mergeDuplicateSongIntoCanonical(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  params: {
    duplicateSongId: string;
    canonicalSongId: string;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const duplicateId = params.duplicateSongId;
  const canonicalId = params.canonicalSongId;
  if (!duplicateId || !canonicalId || duplicateId === canonicalId) return { ok: true };

  const { data: pairRows, error: pairErr } = await admin
    .from('songs')
    .select('id, play_count, style')
    .in('id', [duplicateId, canonicalId]);
  if (pairErr) return { ok: false, message: pairErr.message };
  const dup = (pairRows ?? []).find((x) => toTrimmed((x as { id?: unknown }).id) === duplicateId) as
    | { id?: string; play_count?: number | null; style?: string | null }
    | undefined;
  const can = (pairRows ?? []).find((x) => toTrimmed((x as { id?: unknown }).id) === canonicalId) as
    | { id?: string; play_count?: number | null; style?: string | null }
    | undefined;

  const dupCount = typeof dup?.play_count === 'number' && Number.isFinite(dup.play_count) ? dup.play_count : 0;
  const canCount = typeof can?.play_count === 'number' && Number.isFinite(can.play_count) ? can.play_count : 0;
  const canStyle = toTrimmed(can?.style);
  const dupStyle = toTrimmed(dup?.style);
  const patch: Record<string, unknown> = { play_count: canCount + dupCount };
  if (!canStyle && dupStyle) patch.style = dupStyle;

  const { error: patchErr } = await admin.from('songs').update(patch).eq('id', canonicalId);
  if (patchErr) return { ok: false, message: patchErr.message };

  const { error: vidErr } = await admin.from('song_videos').update({ song_id: canonicalId }).eq('song_id', duplicateId);
  if (vidErr && vidErr.code !== '42P01') return { ok: false, message: vidErr.message };

  const { error: extErr } = await admin
    .from('song_external_metrics')
    .update({ song_id: canonicalId })
    .eq('song_id', duplicateId);
  if (extErr && extErr.code !== '42P01') return { ok: false, message: extErr.message };

  const { error: delErr } = await admin.from('songs').delete().eq('id', duplicateId);
  if (delErr) return { ok: false, message: delErr.message };
  return { ok: true };
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' }, { status: 503 });
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const songIds = toUniqueSongIds(body.songIds);
  const mainArtist = toTrimmed(body.mainArtist);
  if (songIds.length === 0) {
    return NextResponse.json({ error: 'songIds が空です。' }, { status: 400 });
  }
  if (!mainArtist) {
    return NextResponse.json({ error: 'mainArtist が空です。' }, { status: 400 });
  }

  const { data: rows, error: selectErr } = await admin
    .from('songs')
    .select('id, song_title, display_title, play_count, style')
    .in('id', songIds);
  if (selectErr) {
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  let updatedCount = 0;
  let mergedCount = 0;
  for (const row of (rows ?? []) as SongRow[]) {
    const id = toTrimmed(row.id);
    if (!id) continue;
    const songTitle = toTrimmed(row.song_title);
    const displayTitle = songTitle ? `${mainArtist} - ${songTitle}` : toTrimmed(row.display_title);
    const payload = {
      main_artist: mainArtist,
      display_title: displayTitle || `${mainArtist} - Unknown Title`,
    };
    const { error } = await admin.from('songs').update(payload).eq('id', id);
    if (error) {
      if (error.code === '23505') {
        const targetDisplay = toTrimmed(payload.display_title);
        if (!targetDisplay) return NextResponse.json({ error: error.message }, { status: 500 });
        const { data: canonical, error: canonicalErr } = await admin
          .from('songs')
          .select('id')
          .ilike('display_title', targetDisplay)
          .neq('id', id)
          .limit(1)
          .maybeSingle();
        if (canonicalErr) return NextResponse.json({ error: canonicalErr.message }, { status: 500 });
        const canonicalId = toTrimmed((canonical as { id?: unknown } | null)?.id);
        if (!canonicalId) return NextResponse.json({ error: error.message }, { status: 500 });
        const merged = await mergeDuplicateSongIntoCanonical(admin, {
          duplicateSongId: id,
          canonicalSongId: canonicalId,
        });
        if (!merged.ok) return NextResponse.json({ error: merged.message }, { status: 500 });
        mergedCount += 1;
        continue;
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    updatedCount += 1;
  }

  return NextResponse.json({ ok: true, updatedCount, mergedCount, mainArtist });
}
