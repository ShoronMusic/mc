import { NextResponse } from 'next/server';
import { MUSIC8_NAV_STYLE_LABELS, type Music8NavStyleSlug } from '@/lib/music8-catalog-slugs';
import {
  fetchMusicLibraryStylePage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { isMusicLibraryNavStyleSlug, parseMusicLibraryPageParam } from '@/lib/music-library-urls';

export const dynamic = 'force-dynamic';

/** チャット特集のスタイル別一覧。Other を除き 10 曲ずつ。 */
const CHAT_STYLE_SONG_PAGE_SIZE = 10;

export async function GET(request: Request) {
  const admin = getMusicLibraryAdmin();
  if (!admin) {
    return NextResponse.json({ error: '曲一覧を取得できません。' }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const slugRaw = params.get('slug')?.trim().toLowerCase() ?? '';
  if (!isMusicLibraryNavStyleSlug(slugRaw) || slugRaw === 'others') {
    return NextResponse.json({ error: 'スタイルが不正です。' }, { status: 400 });
  }
  const page = parseMusicLibraryPageParam(params.get('page')) ?? 1;

  try {
    const result = await fetchMusicLibraryStylePage(
      admin,
      slugRaw,
      page,
      musicLibraryCatalogFilter(),
      CHAT_STYLE_SONG_PAGE_SIZE,
    );
    return NextResponse.json({
      page: {
        slug: result.slug,
        name: MUSIC8_NAV_STYLE_LABELS[result.slug as Music8NavStyleSlug] ?? result.name,
        cards: result.cards,
        page: result.page,
        totalPages: result.totalPages,
        totalItems: result.totalItems,
        pageSize: CHAT_STYLE_SONG_PAGE_SIZE,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '曲一覧の取得に失敗しました。';
    console.error('[library/style-songs] GET', message);
    return NextResponse.json({ error: '曲一覧の取得に失敗しました。' }, { status: 500 });
  }
}
