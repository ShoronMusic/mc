# YouTube API 利用ログテーブル（運用集計用）

YouTube Data API の呼び出し回数・失敗率・検索語を集計するためのテーブルです。  
`/admin` 系の集計画面や日次サマリーの拡張で使えます。

## SQL（Supabase SQL Editor で実行）

```sql
create table if not exists public.youtube_api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  query_text text,
  video_id text,
  max_results integer,
  response_status integer,
  ok boolean,
  error_code text,
  error_message text,
  result_count integer,
  room_id text,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_youtube_api_usage_logs_created
  on public.youtube_api_usage_logs (created_at desc);

create index if not exists idx_youtube_api_usage_logs_endpoint
  on public.youtube_api_usage_logs (endpoint);

create index if not exists idx_youtube_api_usage_logs_room_created
  on public.youtube_api_usage_logs (room_id, created_at desc);

-- クライアントから直接は読まない（API が service_role で読む）
alter table public.youtube_api_usage_logs enable row level security;
```

## 保存条件

- `.env.local` に `SUPABASE_SERVICE_ROLE_KEY` があるとき INSERT されます。
- `YOUTUBE_API_USAGE_PERSIST=0` のとき保存を停止します。

## 主な値

- `endpoint`: `search.list` / `videos.list`
- `source`: どの処理経由か（例: `searchYouTubeMany`, `getVideoSnippet`）
- `ok`: 呼び出し成功可否
- `result_count`: 返却件数（検索結果件数など）

