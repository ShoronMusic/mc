import { NextResponse } from 'next/server';
import {
  fetchMusicLibraryWeeklyChartIndex,
  fetchMusicLibraryWeeklyChartPage,
  getMusicLibraryAdmin,
  musicLibraryCatalogFilter,
} from '@/lib/music-library-query';
import { isWeeklyChartRegion } from '@/lib/weekly-charts';

export const dynamic = 'force-dynamic';

/** GET: 公開中の週間チャート。region なしは US/UK 索引、us|uk は Top 10 の曲カード。 */
export async function GET(request: Request) {
  const admin = getMusicLibraryAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'チャートを取得できません。' }, { status: 503 });
  }

  const regionRaw = new URL(request.url).searchParams.get('region')?.trim().toLowerCase() ?? '';
  const catalog = musicLibraryCatalogFilter();

  try {
    if (!regionRaw) {
      const { items, tableMissing } = await fetchMusicLibraryWeeklyChartIndex(admin, catalog);
      if (tableMissing) {
        return NextResponse.json({ error: '週間チャートはまだ公開されていません。' }, { status: 503 });
      }
      return NextResponse.json({ items });
    }

    if (!isWeeklyChartRegion(regionRaw)) {
      return NextResponse.json({ error: 'region は us または uk です。' }, { status: 400 });
    }

    const { page, tableMissing } = await fetchMusicLibraryWeeklyChartPage(admin, regionRaw, catalog);
    if (tableMissing) {
      return NextResponse.json({ error: '週間チャートはまだ公開されていません。' }, { status: 503 });
    }
    if (!page) {
      return NextResponse.json({ error: '公開中のチャートがありません。' }, { status: 404 });
    }
    return NextResponse.json({ page });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'チャートの取得に失敗しました。';
    console.error('[library/weekly-charts] GET', message);
    return NextResponse.json({ error: 'チャートの取得に失敗しました。' }, { status: 500 });
  }
}
