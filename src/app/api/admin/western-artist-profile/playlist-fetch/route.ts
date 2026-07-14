import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import {
  fetchWesternArtistPlaylist,
  type DomesticArtistPlaylistHints,
} from '@/lib/admin-domestic-artist-playlist';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Body = {
  playlistUrl?: unknown;
  playlistId?: unknown;
  maxItems?: unknown;
  artistName?: unknown;
  nameEn?: unknown;
  youtubeChannelId?: unknown;
};

function parseMaxItems(raw: unknown): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return 30;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(n, 100);
}

/**
 * POST: 洋楽アーティスト用 — YouTube プレイリストから未登録曲メタを取得。
 */
export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const playlistUrl = typeof body.playlistUrl === 'string' ? body.playlistUrl.trim() : '';
  const playlistId = typeof body.playlistId === 'string' ? body.playlistId.trim() : '';
  if (!playlistUrl && !playlistId) {
    return NextResponse.json({ error: 'playlistUrl または playlistId が必要です。' }, { status: 400 });
  }

  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
  const hints: DomesticArtistPlaylistHints | null = artistName
    ? {
        name: artistName,
        nameEn: typeof body.nameEn === 'string' ? body.nameEn.trim() : null,
        youtubeChannelId:
          typeof body.youtubeChannelId === 'string' ? body.youtubeChannelId.trim() : null,
      }
    : null;

  try {
    delete process.env.YT_ARTIST_TITLE_MODE;

    const result = await fetchWesternArtistPlaylist({
      playlistUrl,
      playlistId,
      maxItems: parseMaxItems(body.maxItems),
      artistHints: hints,
      admin: createAdminClient(),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'プレイリスト取得に失敗しました。';
    console.error('[admin/western-artist-profile/playlist-fetch]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
