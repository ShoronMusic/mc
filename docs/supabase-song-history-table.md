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
  posted_at timestamptz not null default now()
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
