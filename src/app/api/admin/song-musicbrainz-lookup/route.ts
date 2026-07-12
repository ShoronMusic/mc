import { NextResponse } from 'next/server';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { lookupMusicBrainzReleaseDate } from '@/lib/admin-songs-batch-musicbrainz-dates';

export const dynamic = 'force-dynamic';

type ReqBody = {
  artistName?: unknown;
  songTitle?: unknown;
};

export async function POST(request: Request) {
  const gate = await requireStyleAdminApi();
  if (!gate.ok) return gate.response;

  if (process.env.MUSICBRAINZ_LOOKUP === '0') {
    return NextResponse.json({ error: 'MUSICBRAINZ_LOOKUP=0 のため無効です。' }, { status: 503 });
  }
  if (!process.env.MUSICBRAINZ_USER_AGENT?.trim()) {
    return NextResponse.json(
      { error: 'MUSICBRAINZ_USER_AGENT が未設定です。' },
      { status: 503 },
    );
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : '';
  const songTitle = typeof body.songTitle === 'string' ? body.songTitle.trim() : '';
  if (!artistName || !songTitle) {
    return NextResponse.json({ error: 'artistName と songTitle が必要です。' }, { status: 400 });
  }

  try {
    const lookup = await lookupMusicBrainzReleaseDate(artistName, songTitle);
    if (!lookup) {
      return NextResponse.json(
        { error: 'MusicBrainz に該当 recording が見つかりませんでした。' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      originalReleaseDate: lookup.originalReleaseDate,
      songTitleJa: lookup.songTitleJa,
      mbArtist: lookup.mbArtist,
      mbSongTitle: lookup.mbSongTitle,
      recordingScore: lookup.recordingScore,
      lookupArtist: artistName,
      lookupSongTitle: lookup.lookupSongTitle,
      foundReleaseDate: Boolean(lookup.originalReleaseDate),
      foundSongTitleJa: Boolean(lookup.songTitleJa),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'MusicBrainz 取得に失敗しました。';
    console.error('[admin/song-musicbrainz-lookup]', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
