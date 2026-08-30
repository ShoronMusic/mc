import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { registerWesternSongFromYoutube } from '@/lib/music8-catalog-register';
import { MUSIC8_NAV_STYLE_SLUGS } from '@/lib/music8-catalog-slugs';

export const dynamic = 'force-dynamic';

export type AdminSongsRegisterResponse = {
  error?: string;
  songId?: string;
  videoId?: string;
  exportPath?: string | null;
  exportSkipped?: boolean;
};

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: '管理者 DB クライアントを作成できません。' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON が必要です。' }, { status: 400 });
  }

  const youtubeId = typeof body.youtube_id === 'string' ? body.youtube_id : typeof body.youtubeId === 'string' ? body.youtubeId : '';
  const artist = typeof body.artist === 'string' ? body.artist : '';
  const title = typeof body.title === 'string' ? body.title : '';
  const styleSlug = typeof body.style === 'string' ? body.style.trim().toLowerCase() : '';
  const skipExport = body.export_json === false || body.exportJson === false;

  const result = await registerWesternSongFromYoutube(admin, {
    youtubeId,
    artist,
    title,
    styleSlug: styleSlug && (MUSIC8_NAV_STYLE_SLUGS as readonly string[]).includes(styleSlug) ? styleSlug : null,
    catalogScope: 'western',
    exportJson: !skipExport,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    songId: result.songId,
    videoId: result.videoId,
    exportPath: result.exportPath,
    exportSkipped: result.exportSkipped,
  } satisfies AdminSongsRegisterResponse);
}
