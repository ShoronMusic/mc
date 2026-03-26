# 曲の基本情報ライブラリテーブル

選曲アナウンス直後に表示する「曲の基本情報」（アーティスト・リリース年など）を video_id で保存し、同じ曲のときは再利用するためのテーブルです。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- 曲の基本情報ライブラリ（選曲ごとの基本情報を1曲1件で蓄積）
create table if not exists public.song_commentary (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  video_id text not null,
  artist_name text,
  song_title text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_song_commentary_video_id
  on public.song_commentary (video_id);

create index if not exists idx_song_commentary_created
  on public.song_commentary (created_at desc);

alter table public.song_commentary enable row level security;

create policy "Anyone can select song_commentary"
  on public.song_commentary for select using (true);

create policy "Anyone can insert song_commentary"
  on public.song_commentary for insert with check (true);
```

## カラム説明

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| body | text | 曲の基本情報の本文 |
| video_id | text | YouTube の video_id（1曲1件のため UNIQUE） |
| artist_name | text | アーティスト名 |
| song_title | text | 曲名・タイトル |
| created_at | timestamptz | 登録日時 |
