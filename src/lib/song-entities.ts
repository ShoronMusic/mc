/**
 * 曲マスタと song_videos への登録・更新ヘルパー
 * - 既存API（room-playback-history / commentary）から呼び出して、
 *   video_id ごとに「曲（songs）」をひとつに集約する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsertSongAndVideoParams {
  supabase: SupabaseClient | null;
  videoId: string;
  mainArtist?: string | null;
  songTitle?: string | null;
  variant?: string | null;
  performanceId?: string | null;
}

function buildDisplayTitle(mainArtist?: string | null, songTitle?: string | null): string | null {
  const artist = (mainArtist ?? '').trim();
  const title = (songTitle ?? '').trim();
  if (!artist && !title) return null;
  if (!artist) return title || null;
  if (!title) return artist || null;
  return `${artist} - ${title}`;
}

/**
 * 曲の正規化 display_title（1曲＝1行にまとめる用）
 * - 末尾の (2018 Mix), [Love Version] などのバージョン表記を除去
 * - "Artist - Artist - Title" を "Artist - Title" に畳む
 * - 末尾の ♪ などを除去
 */
function normalizeDisplayTitle(displayTitle: string): string {
  let s = displayTitle.trim();
  if (!s) return s;

  const sep = ' - ';
  const parts = s.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return s;

  // "Artist - Artist - Title" → "Artist - Title"
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped.length > 0 && deduped[0].toLowerCase() === p.toLowerCase()) continue;
    deduped.push(p);
  }
  if (deduped.length === 0) return s;
  const artist = deduped[0];
  let title = deduped.length > 1 ? deduped.slice(1).join(sep) : '';

  // 末尾の (...) や [...] を繰り返し除去（バージョン表記）
  while (true) {
    const m1 = title.match(/\s*\([^)]*\)\s*$/);
    const m2 = title.match(/\s*\[[^\]]*\]\s*$/);
    const m = m1 || m2;
    if (!m) break;
    title = title.slice(0, title.length - m[0].length).trim();
  }

  // 末尾の記号除去
  title = title.replace(/\s*[♪♫♬]+\s*$/g, '').trim();

  // 大文字小文字を揃えて同一曲とみなす（タイトル部分をタイトルケースに）
  const toTitleCase = (t: string) =>
    t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  title = toTitleCase(title);
  const artistNorm = toTitleCase(artist);

  if (!title) return artistNorm;
  return `${artistNorm} - ${title}`;
}

/**
 * songs / song_videos に upsert し、song_id を返す。
 * - songs は display_title（正規化済み）で検索して、なければ insert。
 * - song_videos は video_id 主キーで upsert。
 */
export async function upsertSongAndVideo(params: UpsertSongAndVideoParams): Promise<string | null> {
  const { supabase, videoId, mainArtist, songTitle, variant, performanceId } = params;
  if (!supabase || !videoId || !videoId.trim()) return null;

  const displayTitle = buildDisplayTitle(mainArtist, songTitle);
  if (!displayTitle) return null;

  const trimmedVideoId = videoId.trim();
  const canonicalTitle = normalizeDisplayTitle(displayTitle);

  // 1) まず既存の song_videos から song_id を再利用（同じ videoId で songs の重複作成を防ぐ）
  let songId: string | null = null;
  const { data: existingVideoRow, error: videoSelectError } = await supabase
    .from('song_videos')
    .select('song_id')
    .eq('video_id', trimmedVideoId)
    .limit(1)
    .maybeSingle();

  if (videoSelectError && videoSelectError.code !== '42P01') {
    console.error(
      '[song-entities] select song_videos failed',
      videoSelectError.code,
      videoSelectError.message,
    );
  }

  if (existingVideoRow && 'song_id' in existingVideoRow && existingVideoRow.song_id) {
    songId = existingVideoRow.song_id as string;
  }

  // 2) videoId に紐づく song_id が無い場合のみ、songs を正規化 display_title で検索
  if (!songId) {
    const { data: existingSong, error: songSelectError } = await supabase
      .from('songs')
      .select('id')
      .ilike('display_title', canonicalTitle)
      .limit(1)
      .maybeSingle();

    if (songSelectError && songSelectError.code !== '42P01') {
      console.error(
        '[song-entities] select songs failed',
        songSelectError.code,
        songSelectError.message,
      );
    }

    if (existingSong && 'id' in existingSong && existingSong.id) {
      songId = existingSong.id as string;
    }
  }

  if (!songId) {
    // 3) どちらにも無ければ insert（正規化したタイトルで1曲1行）
    const [canonArtist, ...canonTitleParts] = canonicalTitle.split(' - ');
    const canonSongTitle = canonTitleParts.join(' - ').trim() || (songTitle ?? '').trim();
    const { data: insertedSong, error: songInsertError } = await supabase
      .from('songs')
      .insert({
        main_artist: (canonArtist ?? mainArtist ?? '').trim() || null,
        song_title: canonSongTitle || null,
        display_title: canonicalTitle,
      })
      .select('id')
      .single();

    if (songInsertError) {
      // 既に別トランザクションで作られていた場合は再取得
      if (songInsertError.code === '23505') {
        const { data: dupSong } = await supabase
          .from('songs')
          .select('id')
          .ilike('display_title', canonicalTitle)
          .limit(1)
          .maybeSingle();
        songId = (dupSong as { id?: string } | null)?.id ?? null;
      } else if (songInsertError.code !== '42P01') {
        console.error('[song-entities] insert songs failed', songInsertError.code, songInsertError.message);
      }
    } else {
      songId = (insertedSong as { id?: string } | null)?.id ?? null;
    }
  }

  if (!songId) return null;

  // 3) song_videos に videoId を紐づけ
  const { error: videoError } = await supabase
    .from('song_videos')
    .upsert(
      {
        song_id: songId,
        video_id: trimmedVideoId,
        variant: variant ?? null,
        performance_id: performanceId ?? null,
      },
      { onConflict: 'video_id' }
    );

  if (videoError && videoError.code !== '42P01') {
    console.error('[song-entities] upsert song_videos failed', videoError.code, videoError.message);
  }

  return songId;
}

/**
 * 曲の代表スタイル（songs.style）を更新。
 * - 手動スタイル変更や AI 判定の結果を曲単位で持たせたいときに利用。
 */
export async function updateSongStyle(
  supabase: SupabaseClient | null,
  songId: string | null,
  style: string | null
): Promise<boolean> {
  if (!supabase || !songId || !style || !style.trim()) return false;

  const { error } = await supabase
    .from('songs')
    .update({ style: style.trim() })
    .eq('id', songId);

  if (error && error.code !== '42P01') {
    console.error('[song-entities] updateSongStyle failed', error.code, error.message);
    return false;
  }
  return !error;
}

/**
 * 曲の視聴回数（このチャットで貼られた回数）を +1 する。
 * - PVのバージョン（video_id）に関係なく、曲（songs）単位で集約される。
 * - 視聴履歴に1件追加されるたびに呼ぶ。
 */
export async function incrementSongPlayCount(
  supabase: SupabaseClient | null,
  songId: string | null
): Promise<void> {
  if (!supabase || !songId) return;

  const { data } = await supabase
    .from('songs')
    .select('play_count')
    .eq('id', songId)
    .maybeSingle();

  const current = Math.max(0, Number((data as { play_count?: number } | null)?.play_count) || 0);
  const { error } = await supabase
    .from('songs')
    .update({ play_count: current + 1 })
    .eq('id', songId);

  if (error && error.code !== '42P01' && error.code !== '42703') {
    console.error('[song-entities] incrementSongPlayCount failed', error.code, error.message);
  }
}

