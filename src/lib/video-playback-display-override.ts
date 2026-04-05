/**
 * YouTube video_id ごとの「視聴履歴アーティスト - タイトル」表示上書き。
 * STYLE_ADMIN が PATCH した表記を、次回以降の room_playback_history POST で優先する。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'video_playback_display_override';

export type PlaybackDisplayOverrideRow = {
  title: string;
  artist_name: string | null;
};

/** POST body 用。認可済みリクエストでのみマージすること（クライアントからの任意偽装を防ぐ） */
export function parseAdminPlaybackDisplayHint(raw: unknown): PlaybackDisplayOverrideRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  if (!title) return null;
  if (!('artist_name' in o)) return { title, artist_name: null };
  const an = o.artist_name;
  if (an === null || an === undefined) return { title, artist_name: null };
  if (typeof an === 'string' && an.trim()) return { title, artist_name: an.trim() };
  return { title, artist_name: null };
}

/** DB に上書き行が無いときだけヒントを採用（永続上書きを優先） */
export function applyPlaybackDisplayHintWhenDbMissing(
  fromDb: PlaybackDisplayOverrideRow | null,
  hint: PlaybackDisplayOverrideRow | null,
): PlaybackDisplayOverrideRow | null {
  if (fromDb) return fromDb;
  return hint;
}

export async function fetchPlaybackDisplayOverride(
  client: SupabaseClient,
  videoId: string,
): Promise<PlaybackDisplayOverrideRow | null> {
  const vid = videoId.trim();
  if (!vid) return null;
  const { data, error } = await client.from(TABLE).select('title, artist_name').eq('video_id', vid).maybeSingle();
  if (error) {
    if (error.code === '42P01') return null;
    console.error('[video-playback-display-override] select', error.code, error.message);
    return null;
  }
  const row = data as { title?: unknown; artist_name?: unknown } | null;
  const title = typeof row?.title === 'string' ? row.title.trim() : '';
  if (!title) return null;
  const an = row?.artist_name;
  const artist_name =
    typeof an === 'string' && an.trim() ? an.trim() : null;
  return { title, artist_name };
}

/**
 * 上書きの保存は RLS で JWT からの書き込みを閉じ、サービスロールのみ想定。
 * @returns 成功時 true（テーブル無し等で失敗したら false）
 */
export async function upsertPlaybackDisplayOverride(
  serviceClient: SupabaseClient,
  videoId: string,
  title: string,
  artistName: string | null,
): Promise<boolean> {
  const vid = videoId.trim();
  const t = title.trim();
  if (!vid || !t) return false;
  const { error } = await serviceClient.from(TABLE).upsert(
    {
      video_id: vid,
      title: t,
      artist_name: artistName?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'video_id' },
  );
  if (error) {
    if (error.code === '42P01') {
      console.warn('[video-playback-display-override] table missing; skip upsert');
      return false;
    }
    console.error('[video-playback-display-override] upsert', error.code, error.message);
    return false;
  }
  return true;
}
