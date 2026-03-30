# ルーム日次サマリーテーブル（管理画面用）

日付 × ルーム単位で、チャット運用のサマリー（利用時間、参加者、選曲数、時代/スタイル分布、Gemini使用量、内容要約）を保存するテーブルです。

## SQL（Supabase SQL Editor で実行）

```sql
create table if not exists public.room_daily_summary (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  date_jst date not null,
  session_part text not null check (session_part in ('part1', 'part2')),
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  active_from_at timestamptz not null,
  active_to_at timestamptz not null,
  participants text[] not null default '{}',
  participant_song_counts jsonb not null default '[]'::jsonb,
  era_distribution jsonb not null default '[]'::jsonb,
  style_distribution jsonb not null default '[]'::jsonb,
  gemini_usage jsonb not null default '{}'::jsonb,
  summary_text text not null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (room_id, date_jst, session_part)
);

create index if not exists idx_room_daily_summary_room_date
  on public.room_daily_summary (room_id, date_jst desc);

create index if not exists idx_room_daily_summary_created
  on public.room_daily_summary (created_at desc);

alter table public.room_daily_summary enable row level security;
```

## 画面・API

- 管理画面: `/admin/room-daily-summary`
- API: `/api/admin/room-daily-summary`
  - `POST`: `{ roomId, dateJst }` で生成して保存（upsert）
  - `GET`: 保存済み一覧取得

## 集計ウィンドウ（現在仕様）

- 日付 `dateJst` は「開催の開始日」を意味します。
- 1日を次の2枠に分けて保存します（`session_part`）:
  - `part1`: **06:00〜18:00（JST）**
  - `part2`: **18:00〜翌06:00（JST）**
- 日付またぎの深夜運用でも、`part2` で1回として傾向観察しやすくするための仕様です。

## 既存テーブルを更新する場合（ALTER）

すでに `room_daily_summary` を作成済みの環境では、以下を追加実行してください。

```sql
alter table public.room_daily_summary
  add column if not exists session_part text;

update public.room_daily_summary
set session_part = coalesce(session_part, 'part2');

alter table public.room_daily_summary
  alter column session_part set not null;

alter table public.room_daily_summary
  add constraint room_daily_summary_session_part_check
  check (session_part in ('part1', 'part2'));

alter table public.room_daily_summary
  drop constraint if exists room_daily_summary_room_id_date_jst_key;

alter table public.room_daily_summary
  add constraint room_daily_summary_room_date_part_key
  unique (room_id, date_jst, session_part);
```

