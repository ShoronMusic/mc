# お気に入りテーブル（マイページお気に入りリスト用）

視聴履歴から「いいね」した曲を登録ユーザーごとに保存します。同じ video_id は1ユーザーあたり1件です。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- ユーザーお気に入り（視聴履歴の行から追加。同じ曲は1件）
create table if not exists public.user_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  display_name text not null,
  played_at timestamptz not null,
  title text,
  artist_name text,
  created_at timestamptz not null default now(),
  unique (user_id, video_id)
);

create index if not exists idx_user_favorites_user_played
  on public.user_favorites (user_id, played_at desc);

alter table public.user_favorites enable row level security;

create policy "Users can insert own favorites"
  on public.user_favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can select own favorites"
  on public.user_favorites for select
  using (auth.uid() = user_id);

create policy "Users can delete own favorites"
  on public.user_favorites for delete
  using (auth.uid() = user_id);
```

## カラム説明

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| user_id | uuid | ユーザーID |
| video_id | text | YouTube 動画ID |
| display_name | text | 選曲者の表示名（視聴履歴行の `display_name`＝その曲を貼った人。再生中ハートは現在の選曲者） |
| played_at | timestamptz | その曲が流れた日時 |
| title | text | 動画タイトル |
| artist_name | text | アーティスト名等 |
| created_at | timestamptz | お気に入り登録日時 |
