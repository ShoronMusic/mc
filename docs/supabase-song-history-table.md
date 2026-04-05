# 貼った曲の履歴テーブル（マイページ用）

マイページで「貼った曲の履歴」を表示するには、Supabase に次のテーブルを作成してください。

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- ユーザーがチャットで貼った曲の履歴（マイページ表示用）
create table if not exists public.user_song_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id text not null,
  video_id text not null,
  url text not null,
  title text,
  artist text,
  posted_at timestamptz not null default now(),
  selection_round integer null
);

alter table public.user_song_history enable row level security;

-- 自分の行だけ挿入可能
create policy "Users can insert own song history"
  on public.user_song_history for insert
  with check (auth.uid() = user_id);

-- 自分の行だけ参照可能
create policy "Users can select own song history"
  on public.user_song_history for select
  using (auth.uid() = user_id);
```

3. 実行後、マイページの「貼った曲の履歴」が利用できます。

## 既存テーブルへの追加（選曲ラウンド・視聴履歴との整合）

すでに `user_song_history` がある場合は、次を **SQL Editor** で実行してください（部屋の視聴履歴 `room_playback_history` にも同名列を追加します）。

```sql
alter table public.user_song_history
  add column if not exists selection_round integer null;

alter table public.room_playback_history
  add column if not exists selection_round integer null;
```

- **重複行の抑止**: `/api/song-history` は、同一ユーザー・同一部屋・同一 `video_id` で **2分以内**の再投稿を挿入しません（大人数・二重送信時の履歴ずれ対策）。
- **ラウンド表示**: 同期部屋で貼曲時の選曲ラウンドが保存され、マイページの履歴・部屋の視聴履歴の「時間」欄に併記されます（列未追加時は API がエラーになるため、上記 ALTER を先に実行してください）。

## 視聴履歴の「アーティスト - タイトル」上書き（`video_id` 単位・次回再生にも反映）

`STYLE_ADMIN` が部屋の視聴履歴でタイトル行を修正した表記を、**同じ YouTube の `video_id` が再度選曲されたとき**も使い回すには、次のテーブルを作成し、サーバーに **`SUPABASE_SERVICE_ROLE_KEY`** を設定してください（上書きの **保存** はサービスロール経由のみ。読み取りは通常の API 用クライアントで可）。

```sql
-- YouTube video_id ごとの表示用文字列（管理者 PATCH で upsert）
create table if not exists public.video_playback_display_override (
  video_id text primary key,
  title text not null,
  artist_name text null,
  updated_at timestamptz not null default now(),
  constraint video_playback_display_override_title_len check (char_length(title) <= 500)
);

alter table public.video_playback_display_override enable row level security;

-- 読み取り: 視聴履歴 POST がセッション付きクライアントで参照する
create policy "video_playback_display_override_select"
  on public.video_playback_display_override
  for select
  using (true);

-- 書き込み: JWT 向けポリシーは付けない（サービスロールのみ upsert）
```

- **未作成時**: 従来どおり、履歴のその行だけ更新され、次回再生では自動タイトルに戻ります。
- **テーブルあり・サービスロールなし**: PATCH は履歴行は更新されますが `displayOverrideSaved` は false になり、コンソールに警告が出ます。
- **AI 解説**: `video_playback_display_override` に行があるとき、`/api/ai/comment-pack`・`/api/ai/announce-song`・`/api/ai/commentary`（新規生成時）はその表記をアーティスト／曲名の正として解決し、Gemini プロンプトと `upsertSongAndVideo` に反映します（既に `song_tidbits` にキャッシュがある場合は従来どおりライブラリ返却のため本文は変わりません。差し替えたいときは `COMMENT_PACK_SKIP_CACHE=1` や該当 tidbit の無効化などで再生成してください）。
- **再生中に履歴表記を直した直後**: 同期部屋（`RoomWithSync`）では、**いま流れている `video_id` と同じ行**を保存したクライアントが、チャットの選曲アナウンス＋解説パックを取り直します（`skipCommentPackCache`・STYLE_ADMIN 条件は PATCH と同じ。DB に上書き行が無い場合はリクエストに同梱した保存済み表記をその場だけヒントとして使います）。
