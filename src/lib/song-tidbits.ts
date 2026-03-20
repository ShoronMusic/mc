import type { SupabaseClient } from '@supabase/supabase-js';

/** 基本コメントに続けて出す自由コメントの本数（最大） */
export const COMMENT_PACK_MAX_FREE_COMMENTS = 3;

/** comment-pack 保存時の source（この4件が揃えば DB から再利用可） */
export const COMMENT_PACK_SOURCES = [
  'ai_commentary',
  'ai_chat_1',
  'ai_chat_2',
  'ai_chat_3',
] as const;

export interface SongTidbitRow {
  id: string;
  song_id: string | null;
  video_id: string | null;
  body: string;
  created_at: string;
  source: string;
  is_active: boolean;
}

export interface InsertSongTidbitParams {
  songId: string;
  videoId?: string | null;
  body: string;
  source: string;
  isActive?: boolean;
}

export async function insertTidbit(
  supabase: SupabaseClient | null,
  params: InsertSongTidbitParams,
): Promise<SongTidbitRow | null> {
  if (!supabase) return null;

  const { songId, videoId, body, source, isActive = true } = params;
  const trimmed = body.trim();
  if (!trimmed || !songId) return null;

  const { data, error } = await supabase
    .from('song_tidbits')
    .insert({
      song_id: songId,
      video_id: videoId ?? null,
      body: trimmed,
      source,
      is_active: isActive,
    })
    .select('id, song_id, video_id, body, created_at, source, is_active')
    .single();

  if (error) {
    // テーブル未作成などの場合は致命的エラーにしない
    if ((error as any).code === '42P01') {
      console.error('[song-tidbits] table song_tidbits does not exist yet');
      return null;
    }
    console.error('[song-tidbits] insert failed', (error as any).code, (error as any).message);
    return null;
  }

  return (data ?? null) as SongTidbitRow | null;
}

export interface StoredCommentPack {
  baseComment: string;
  freeComments: [string, string, string];
}

/** 新曲モードで基本コメント末尾に付与する注釈（キャッシュ判定にも使う先頭フレーズ） */
export const COMMENT_PACK_NEW_RELEASE_DISCLAIMER =
  '\n\n【注釈】新曲と判断したため、周辺情報が十分でない場合もあり、AIコメントの真偽の精度が低い可能性があります。';

const NEW_RELEASE_CACHE_MARKER = '【注釈】新曲と判断したため';

/**
 * 新曲モードで保存された基本コメントのみキャッシュヒット（自由3本は使わない）
 */
export async function getStoredNewReleaseCommentPack(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<{ baseComment: string; freeComments: [] } | null> {
  if (!supabase || !videoId.trim()) return null;
  const vid = videoId.trim();

  const { data, error } = await supabase
    .from('song_tidbits')
    .select('body')
    .eq('video_id', vid)
    .eq('source', 'ai_commentary')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === '42P01') return null;
    return null;
  }
  const b = typeof data?.body === 'string' ? data.body.trim() : '';
  if (!b || !b.includes(NEW_RELEASE_CACHE_MARKER)) return null;

  return { baseComment: b, freeComments: [] };
}

/**
 * 同一 video_id で comment-pack 相当の4本（基本＋自由3）が既にあれば最新セットを返す。
 * service_role または RLS で読めるクライアントが必要（未設定だと他ユーザーの蓄積が読めない場合あり）。
 */
export async function getStoredCommentPackByVideoId(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<StoredCommentPack | null> {
  if (!supabase || !videoId.trim()) return null;
  const vid = videoId.trim();
  const base: Partial<Record<(typeof COMMENT_PACK_SOURCES)[number], string>> = {};

  for (const src of COMMENT_PACK_SOURCES) {
    const { data, error } = await supabase
      .from('song_tidbits')
      .select('body')
      .eq('video_id', vid)
      .eq('source', src)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === '42P01') return null;
      return null;
    }
    const b = typeof data?.body === 'string' ? data.body.trim() : '';
    if (!b) return null;
    base[src] = b;
  }

  return {
    baseComment: base.ai_commentary!,
    freeComments: [base.ai_chat_1!, base.ai_chat_2!, base.ai_chat_3!],
  };
}

