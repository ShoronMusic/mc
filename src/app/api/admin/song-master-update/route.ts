import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireStyleAdminApi } from '@/lib/admin-access';
import { normalizeSongCatalogScope, type SongCatalogScope } from '@/lib/song-catalog-scope';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VOCAL_ALLOWED = new Set(['F', 'M', 'F,M']);

type ReqBody = {
  songId?: unknown;
  displayTitle?: unknown;
  mainArtist?: unknown;
  songTitle?: unknown;
  songTitleJa?: unknown;
  style?: unknown;
  originalReleaseDate?: unknown;
  catalogScope?: unknown;
  vocal?: unknown;
  genres?: unknown;
};

function toNullableTrimmed(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseCatalogScope(v: unknown): SongCatalogScope {
  if (typeof v !== 'string') return 'unknown';
  return normalizeSongCatalogScope(v);
}

function parseVocal(v: unknown): string | null {
  const t = toNullableTrimmed(v);
  if (!t) return null;
  if (VOCAL_ALLOWED.has(t)) return t;
  return t;
}

function parseGenres(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    const parts = v
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : null;
  }
  const t = toNullableTrimmed(v);
  if (!t) return null;
  const parts = t
    .split(/[,、]/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
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

  const songId = typeof body.songId === 'string' ? body.songId.trim() : '';
  if (!songId || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId が無効です。' }, { status: 400 });
  }

  const displayTitle = toNullableTrimmed(body.displayTitle);
  const mainArtist = toNullableTrimmed(body.mainArtist);
  const songTitle = toNullableTrimmed(body.songTitle);
  const songTitleJa = toNullableTrimmed(body.songTitleJa);
  const style = toNullableTrimmed(body.style);
  const originalReleaseDate = toNullableTrimmed(body.originalReleaseDate);
  const catalogScope = parseCatalogScope(body.catalogScope);
  const vocal = parseVocal(body.vocal);
  const genres = parseGenres(body.genres);

  if (originalReleaseDate && !ISO_DATE_RE.test(originalReleaseDate)) {
    return NextResponse.json(
      { error: 'original_release_date は YYYY-MM-DD 形式で入力してください。' },
      { status: 400 },
    );
  }

  const patch = {
    display_title: displayTitle,
    main_artist: mainArtist,
    song_title: songTitle,
    song_title_ja: songTitleJa,
    style,
    original_release_date: originalReleaseDate,
    catalog_scope: catalogScope,
    vocal,
    genres,
  };

  const { error } = await admin.from('songs').update(patch).eq('id', songId);
  if (error) {
    if (error.code === '42703') {
      const { error: retryErr } = await admin
        .from('songs')
        .update({
          display_title: displayTitle,
          main_artist: mainArtist,
          song_title: songTitle,
          style,
          original_release_date: originalReleaseDate,
        })
        .eq('id', songId);
      if (retryErr) {
        console.error('[admin/song-master-update] update songs failed', retryErr);
        return NextResponse.json(
          {
            error:
              retryErr.message +
              '（song_title_ja 列が未作成の可能性があります。docs の ALTER を実行してください）',
          },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        songId,
        warning:
          '一部の列（song_title_ja / catalog_scope / vocal / genres）が無いため、基本項目のみ保存しました。',
      });
    }
    console.error('[admin/song-master-update] update songs failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, songId });
}
