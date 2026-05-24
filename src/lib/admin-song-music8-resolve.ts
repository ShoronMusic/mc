import { createAdminClient } from '@/lib/supabase/admin';
import { cleanTitle, getMainArtist, parseArtistTitle } from '@/lib/format-song-display';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminSongMusic8Context = {
  songId: string;
  lookup: { artistLookup: string; songLookupTitle: string };
  videoId: string;
  music8SongId: number | null;
};

type SongLookupRow = {
  id: string;
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
  music8_song_id?: number | null;
};

export function isValidAdminSongId(songId: string): boolean {
  return Boolean(songId && UUID_RE.test(songId));
}

export function resolveArtistSongLookupForAdmin(row: {
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
}): { artistLookup: string; songLookupTitle: string } | null {
  const ma = (row.main_artist ?? '').trim();
  const st = (row.song_title ?? '').trim();
  const disp = (row.display_title ?? '').trim();

  if (ma && st) {
    return { artistLookup: ma, songLookupTitle: st };
  }
  if (disp) {
    const parsed = parseArtistTitle(disp);
    if (!parsed) return null;
    const artistLookup = ma || getMainArtist(parsed.artist).trim();
    const songPart = st || cleanTitle(parsed.song).trim();
    if (!artistLookup || !songPart) return null;
    return { artistLookup, songLookupTitle: songPart };
  }
  return null;
}

export async function loadAdminSongMusic8Context(
  songId: string,
): Promise<{ ok: true; ctx: AdminSongMusic8Context } | { ok: false; status: number; error: string }> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, status: 503, error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' };
  }

  const primary = await admin
    .from('songs')
    .select('id, main_artist, song_title, display_title, music8_song_id')
    .eq('id', songId)
    .maybeSingle();

  let song: SongLookupRow | null = (primary.data as SongLookupRow | null) ?? null;
  let selErr = primary.error;

  if (primary.error?.code === '42703') {
    const fallback = await admin
      .from('songs')
      .select('id, main_artist, song_title, display_title')
      .eq('id', songId)
      .maybeSingle();
    song = (fallback.data as SongLookupRow | null) ?? null;
    selErr = fallback.error;
  }

  if (selErr) {
    console.error('[admin/song-music8] select songs', selErr);
    return { ok: false, status: 500, error: selErr.message };
  }
  if (!song) {
    return { ok: false, status: 404, error: '曲が見つかりません。' };
  }

  const lookup = resolveArtistSongLookupForAdmin(song);
  if (!lookup) {
    return {
      ok: false,
      status: 400,
      error:
        'メインアーティストと曲タイトルの両方、または display_title が必要です。マスタのメタを修正してから再試行してください。',
    };
  }

  let videoId = '';
  const { data: firstVideo, error: vErr } = await admin
    .from('song_videos')
    .select('video_id')
    .eq('song_id', songId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (vErr && vErr.code !== '42P01') {
    console.warn('[admin/song-music8] song_videos', vErr.code, vErr.message);
  }
  if (typeof firstVideo?.video_id === 'string') {
    videoId = firstVideo.video_id.trim();
  }

  const rawM8Id = song.music8_song_id;
  const music8SongId =
    typeof rawM8Id === 'number' && Number.isFinite(rawM8Id) && rawM8Id > 0 ? Math.floor(rawM8Id) : null;

  return {
    ok: true,
    ctx: {
      songId,
      lookup,
      videoId,
      music8SongId,
    },
  };
}

export async function attachMusic8JsonToSongMaster(
  songId: string,
  music8Json: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, status: 503, error: 'SUPABASE_SERVICE_ROLE_KEY が必要です。' };
  }

  const { attachMusic8SongDataIfFetched } = await import('@/lib/song-entities');
  const { buildPersistableMusic8SongSnapshot } = await import('@/lib/music8-song-persist');

  const snap = buildPersistableMusic8SongSnapshot(music8Json);
  if (!snap) {
    return {
      ok: false,
      status: 422,
      error: 'Music8 の応答から保存用スナップショットを組み立てられませんでした。',
    };
  }

  try {
    await attachMusic8SongDataIfFetched(admin, songId, music8Json);
  } catch (e) {
    console.error('[admin/song-music8] attachMusic8SongDataIfFetched', e);
    return { ok: false, status: 500, error: 'DB の更新に失敗しました。' };
  }

  const { data: after, error: afterErr } = await admin
    .from('songs')
    .select('music8_song_data')
    .eq('id', songId)
    .maybeSingle();

  if (afterErr) {
    console.warn('[admin/song-music8] post-update select', afterErr);
  }
  if (!after?.music8_song_data) {
    return {
      ok: false,
      status: 500,
      error: '更新後の確認で music8_song_data が空のままです。権限または列の有無を確認してください。',
    };
  }

  return { ok: true };
}
