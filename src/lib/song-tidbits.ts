import type { SupabaseClient } from '@supabase/supabase-js';

/** 基本コメントに続けて出す自由コメントの本数（最大） */
export const COMMENT_PACK_MAX_FREE_COMMENTS = 4;

/** comment-pack 保存時の source（この5件が揃えば DB から再利用可） */
export const COMMENT_PACK_SOURCES = [
  'ai_commentary',
  'ai_chat_1',
  'ai_chat_2',
  'ai_chat_3',
  'ai_chat_4',
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
  freeComments: [string, string, string, string];
  /** ai_commentary → ai_chat_1..4 の順の song_tidbits.id（NG削除API用） */
  tidbitIds?: string[];
}

/** 新曲モードで基本コメント末尾に付与する注釈（キャッシュ判定にも使う先頭フレーズ） */
export const COMMENT_PACK_NEW_RELEASE_DISCLAIMER =
  '\n\n【注釈】YouTube動画の公開が最近のため、周辺情報が十分でない場合もあり、AIコメントの真偽の精度が低い可能性があります。';

/** 注釈キャッシュ判定用（旧文言も DB ヒットさせる） */
export const COMMENT_PACK_NEW_RELEASE_CACHE_MARKERS = [
  '【注釈】YouTube動画の公開が最近のため',
  '【注釈】新曲と判断したため',
] as const;

function bodyHasNewReleaseCacheMarker(body: string): boolean {
  return COMMENT_PACK_NEW_RELEASE_CACHE_MARKERS.some((m) => body.includes(m));
}

/**
 * 新曲モードで保存された基本コメントのみキャッシュヒット（自由4本は使わない）
 */
export async function getStoredNewReleaseCommentPack(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<{ baseComment: string; freeComments: []; tidbitIds?: string[] } | null> {
  if (!supabase || !videoId.trim()) return null;
  const vid = videoId.trim();

  const { data, error } = await supabase
    .from('song_tidbits')
    .select('id, body')
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
  if (!b || !bodyHasNewReleaseCacheMarker(b)) return null;
  const tid = typeof (data as { id?: string })?.id === 'string' ? (data as { id: string }).id : '';

  return { baseComment: b, freeComments: [], tidbitIds: tid ? [tid] : undefined };
}

/**
 * 邦楽節約モード: ai_commentary のみがあり ai_chat_1 が無いときキャッシュヒット（自由4本なし）
 */
export async function getStoredBaseOnlyCommentPackByVideoId(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<{ baseComment: string; freeComments: []; tidbitIds?: string[] } | null> {
  if (!supabase || !videoId.trim()) return null;
  const vid = videoId.trim();

  const { data: baseRow, error: e1 } = await supabase
    .from('song_tidbits')
    .select('id, body')
    .eq('video_id', vid)
    .eq('source', 'ai_commentary')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (e1) {
    if ((e1 as { code?: string }).code === '42P01') return null;
    return null;
  }
  const body = typeof baseRow?.body === 'string' ? baseRow.body.trim() : '';
  if (!body || bodyHasNewReleaseCacheMarker(body)) return null;

  const { data: chat1, error: e2 } = await supabase
    .from('song_tidbits')
    .select('id')
    .eq('video_id', vid)
    .eq('source', 'ai_chat_1')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (e2) {
    if ((e2 as { code?: string }).code === '42P01') return null;
    return null;
  }
  if (chat1) return null;

  const tid = typeof baseRow?.id === 'string' ? baseRow.id : '';
  return { baseComment: body, freeComments: [], tidbitIds: tid ? [tid] : undefined };
}

/**
 * 同一 video_id で comment-pack 相当の5本（基本＋自由4）が既にあれば最新セットを返す。
 * service_role または RLS で読めるクライアントが必要（未設定だと他ユーザーの蓄積が読めない場合あり）。
 */
export async function getStoredCommentPackByVideoId(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<StoredCommentPack | null> {
  if (!supabase || !videoId.trim()) return null;
  const vid = videoId.trim();
  const base: Partial<Record<(typeof COMMENT_PACK_SOURCES)[number], string>> = {};
  const tidbitIds: string[] = [];

  for (const src of COMMENT_PACK_SOURCES) {
    const { data, error } = await supabase
      .from('song_tidbits')
      .select('id, body')
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
    const row = data as { id?: string; body?: string } | null;
    const b = typeof row?.body === 'string' ? row.body.trim() : '';
    const tid = typeof row?.id === 'string' ? row.id : '';
    if (!b || !tid) return null;
    base[src] = b;
    tidbitIds.push(tid);
  }

  return {
    baseComment: base.ai_commentary!,
    freeComments: [base.ai_chat_1!, base.ai_chat_2!, base.ai_chat_3!, base.ai_chat_4!],
    tidbitIds,
  };
}

/** 後から閲覧用: 基本があれば返し、自由コメントは揃っていなくてもある分だけ付ける（生成・課金なし） */
export async function getStoredAiCommentaryForRead(
  supabase: SupabaseClient | null,
  videoId: string,
): Promise<{ baseComment: string; freeComments: string[] } | null> {
  if (!supabase || !videoId.trim()) return null;
  const vid = videoId.trim();

  const full = await getStoredCommentPackByVideoId(supabase, vid);
  if (full) {
    return {
      baseComment: full.baseComment,
      freeComments: [...full.freeComments],
    };
  }

  const { data: baseRow, error: baseErr } = await supabase
    .from('song_tidbits')
    .select('body')
    .eq('video_id', vid)
    .eq('source', 'ai_commentary')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baseErr) {
    if ((baseErr as { code?: string }).code === '42P01') return null;
    return null;
  }
  const baseComment = typeof baseRow?.body === 'string' ? baseRow.body.trim() : '';
  if (!baseComment) return null;

  const freeComments: string[] = [];
  for (const src of ['ai_chat_1', 'ai_chat_2', 'ai_chat_3', 'ai_chat_4'] as const) {
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
      if ((error as { code?: string }).code === '42P01') break;
      break;
    }
    const body = typeof data?.body === 'string' ? data.body.trim() : '';
    if (body) freeComments.push(body);
  }

  return { baseComment, freeComments };
}

