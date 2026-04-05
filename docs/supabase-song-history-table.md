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
