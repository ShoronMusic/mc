/** マイページ未設定・行なし時: 曲解説 ON、クイズ・おすすめ OFF（初回は AI解説1 のみ想定） */
export const DEFAULT_USER_ROOM_AI_COMMENTARY_ENABLED = true;
export const DEFAULT_USER_ROOM_AI_SONG_QUIZ_ENABLED = false;
export const DEFAULT_USER_ROOM_AI_NEXT_SONG_RECOMMEND_ENABLED = false;

export const USER_ROOM_AI_FEATURES_PERSIST_HINT =
  '部屋AI設定の保存用テーブル（user_room_ai_features）がありません。下の SQL を Supabase の SQL Editor で実行すると保存できます。';

/** テーブルはあるが列だけ足りないとき（policy already exists で止まった場合など） */
export const USER_ROOM_AI_FEATURES_ADD_COLUMN_SQL = `alter table public.user_room_ai_features
  add column if not exists ai_next_song_recommend_enabled boolean not null default false;`;

/** 初回セットアップ・再実行可（docs/supabase-setup.md 第 17 章と同期） */
export const USER_ROOM_AI_FEATURES_FULL_SETUP_SQL = `create table if not exists public.user_room_ai_features (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ai_commentary_enabled boolean not null default true,
  ai_song_quiz_enabled boolean not null default false,
  ai_next_song_recommend_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_room_ai_features
  add column if not exists ai_next_song_recommend_enabled boolean not null default false;

create index if not exists user_room_ai_features_updated_idx
  on public.user_room_ai_features (updated_at desc);

alter table public.user_room_ai_features enable row level security;

drop policy if exists "user_room_ai_features_select_own" on public.user_room_ai_features;
drop policy if exists "user_room_ai_features_insert_own" on public.user_room_ai_features;
drop policy if exists "user_room_ai_features_update_own" on public.user_room_ai_features;
drop policy if exists "user_room_ai_features_delete_own" on public.user_room_ai_features;

create policy "user_room_ai_features_select_own"
  on public.user_room_ai_features for select
  using (auth.uid() = user_id);

create policy "user_room_ai_features_insert_own"
  on public.user_room_ai_features for insert
  with check (auth.uid() = user_id);

create policy "user_room_ai_features_update_own"
  on public.user_room_ai_features for update
  using (auth.uid() = user_id);

create policy "user_room_ai_features_delete_own"
  on public.user_room_ai_features for delete
  using (auth.uid() = user_id);`;

export function isUserRoomAiFeaturesSetupMessage(message: string | null | undefined): boolean {
  if (!message || typeof message !== 'string') return false;
  if (message.startsWith('保存しました')) return false;
  return message.includes('user_room_ai_features') || message.includes('部屋AI設定の保存用テーブル');
}

export type UserRoomAiFeaturesBody = {
  commentaryEnabled: boolean;
  songQuizEnabled: boolean;
  nextSongRecommendEnabled: boolean;
};

export function parseUserRoomAiFeaturesPutBody(body: unknown):
  | { ok: true; value: UserRoomAiFeaturesBody }
  | { ok: false; error: string } {
  if (body == null || typeof body !== 'object') {
    return { ok: false, error: 'JSON オブジェクトで送ってください。' };
  }
  const o = body as Record<string, unknown>;
  if (
    typeof o.commentaryEnabled !== 'boolean' ||
    typeof o.songQuizEnabled !== 'boolean' ||
    typeof o.nextSongRecommendEnabled !== 'boolean'
  ) {
    return {
      ok: false,
      error:
        'commentaryEnabled / songQuizEnabled / nextSongRecommendEnabled は真偽値で指定してください。',
    };
  }
  return {
    ok: true,
    value: {
      commentaryEnabled: o.commentaryEnabled,
      songQuizEnabled: o.songQuizEnabled,
      nextSongRecommendEnabled: o.nextSongRecommendEnabled,
    },
  };
}
