# gemini_usage_logs · youtube_api_usage_logs · user_room_participation_history — product 列

> 課金ログ・API ログ・参加履歴を **product ごとに厳密分離**する。  
> 正本: `docs/00-music-chat-product-plan.md` §3.2

## SQL（Supabase SQL Editor で実行）

```sql
-- 1) Gemini 利用ログ
alter table public.gemini_usage_logs
  add column if not exists product text not null default 'musicaichat';

alter table public.gemini_usage_logs
  drop constraint if exists gemini_usage_logs_product_check;

alter table public.gemini_usage_logs
  add constraint gemini_usage_logs_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.gemini_usage_logs
  set product = 'musicaichat'
  where product is null or product = '';

create index if not exists gemini_usage_logs_room_product_created_idx
  on public.gemini_usage_logs (room_id, product, created_at desc)
  where room_id is not null;

-- 2) YouTube Data API ログ
alter table public.youtube_api_usage_logs
  add column if not exists product text not null default 'musicaichat';

alter table public.youtube_api_usage_logs
  drop constraint if exists youtube_api_usage_logs_product_check;

alter table public.youtube_api_usage_logs
  add constraint youtube_api_usage_logs_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.youtube_api_usage_logs
  set product = 'musicaichat'
  where product is null or product = '';

create index if not exists youtube_api_usage_logs_room_product_created_idx
  on public.youtube_api_usage_logs (room_id, product, created_at desc)
  where room_id is not null;

-- 3) 参加履歴（マイページ）
alter table public.user_room_participation_history
  add column if not exists product text not null default 'musicaichat';

alter table public.user_room_participation_history
  drop constraint if exists user_room_participation_history_product_check;

alter table public.user_room_participation_history
  add constraint user_room_participation_history_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.user_room_participation_history
  set product = 'musicaichat'
  where product is null or product = '';

create index if not exists user_room_participation_user_product_joined_idx
  on public.user_room_participation_history (user_id, product, joined_at desc);
```

## アプリ

| 領域 | 挙動 |
|------|------|
| Gemini / YouTube ログ INSERT | `product = getRoomHistoryProductId()`（`room_id` あり時） |
| 参加履歴 POST/GET | 現在 product のみ |
| 管理 API | `?product=all\|musicaichat\|musicchat`（既定 all） |

**product 列未実行時**: 従来どおり `room_id` のみ（ma 後方互換）。
