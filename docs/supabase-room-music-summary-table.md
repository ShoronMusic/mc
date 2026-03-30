# ルーム音楽サマリーテーブル（管理画面用）

直近 1〜2 時間の再生履歴と会話ログから作る「音楽的な流れサマリー」を保存し、`/admin/room-music-summary` で確認するためのテーブルです。

## SQL（Supabase SQL Editor で実行）

```sql
create table if not exists public.room_music_summary (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  window_hours integer not null check (window_hours in (1, 2)),
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  total_plays integer not null default 0,
  total_messages integer not null default 0,
  top_styles text[] not null default '{}',
  top_eras text[] not null default '{}',
  top_artists text[] not null default '{}',
  top_tracks jsonb not null default '[]'::jsonb,
  summary_text text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_music_summary_room_created
  on public.room_music_summary (room_id, created_at desc);

create index if not exists idx_room_music_summary_created
  on public.room_music_summary (created_at desc);

alter table public.room_music_summary enable row level security;
```

## 運用メモ

- 読み書きは `/api/admin/room-music-summary`（管理者 + service role）経由です。
- 管理画面: `/admin/room-music-summary`
- テーブル未作成時は API が `docs/supabase-room-music-summary-table.md` を参照するヒントを返します。

