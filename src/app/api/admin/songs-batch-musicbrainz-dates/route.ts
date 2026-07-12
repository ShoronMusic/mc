import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  applyBatchMusicBrainzReleaseDates,
  dryRunBatchMusicBrainzReleaseDates,
} from '@/lib/admin-songs-batch-musicbrainz-dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ReqBody = {
  songIds?: unknown;
  dryRun?: unknown;
  updates?: unknown;
};

function mbDisabledResponse(): NextResponse | null {
  if (process.env.MUSICBRAINZ_LOOKUP === '0') {
    return NextResponse.json({ error: 'MUSICBRAINZ_LOOKUP=0 のため無効です。' }, { status: 503 });
  }
  if (!process.env.MUSICBRAINZ_USER_AGENT?.trim()) {
    return NextResponse.json(
      { error: 'MUSICBRAINZ_USER_AGENT が未設定です。' },
      { status: 503 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const mbGate = mbDisabledResponse();
  if (mbGate) return mbGate;

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

  const dryRun = body.dryRun !== false && body.dryRun !== '0';

  try {
    if (!dryRun) {
      const result = await applyBatchMusicBrainzReleaseDates(admin, body.updates);
      return NextResponse.json({ ok: true, dryRun: false, ...result });
    }

    const songIds = body.songIds;
    if (!Array.isArray(songIds) || songIds.length === 0) {
      return NextResponse.json({ error: 'songIds が必要です。' }, { status: 400 });
    }

    const result = await dryRunBatchMusicBrainzReleaseDates(admin, songIds);
    return NextResponse.json({ ok: true, dryRun: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '一括取得に失敗しました。';
    console.error('[admin/songs-batch-musicbrainz-dates]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
