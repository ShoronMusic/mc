# 曲スタイルキャッシュテーブル

貼られた曲のスタイル（Pop / Metal など）を video_id でキャッシュするテーブルです。

## SQL

```sql
create table if not exists public.song_style (
  video_id text primary key,
  style text not null,
  created_at timestamptz not null default now()
);

alter table public.song_style enable row level security;
create policy "Anyone can select song_style" on public.song_style for select using (true);
create policy "Anyone can insert song_style" on public.song_style for insert with check (true);
create policy "Anyone can update song_style" on public.song_style for update using (true);
```

## スタイル

Pop, Dance, Electronica, R&B, Hip-hop, Alternative rock, Metal, Rock, Jazz, Other
