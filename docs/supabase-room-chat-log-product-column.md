# room_chat_log — product 列（ma / mc 分離）

> 会話ログ・管理集計を **product ごとに厳密分離**する。  
> 曲 DB・ユーザーは共用のまま。正本: `docs/00-music-chat-product-plan.md` §3.2

## SQL（Supabase SQL Editor で実行）

```sql
alter table public.room_chat_log
  add column if not exists product text not null default 'musicaichat';

alter table public.room_chat_log
  drop constraint if exists room_chat_log_product_check;

alter table public.room_chat_log
  add constraint room_chat_log_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.room_chat_log
  set product = 'musicaichat'
  where product is null or product = '';

create index if not exists room_chat_log_room_product_created_idx
  on public.room_chat_log (room_id, product, created_at asc);

create index if not exists room_chat_log_gathering_product_created_idx
  on public.room_chat_log (gathering_id, product, created_at asc)
  where gathering_id is not null;
```

## アプリ

| 領域 | 挙動 |
|------|------|
| 部屋 UI POST | `product = getRoomHistoryProductId()` |
| 部屋 UI GET（日次・集会） | 現在 product のみ |
| 管理 API | `?product=all\|musicaichat\|musicchat`（既定 all） |

**product 列未実行時**: 従来どおり `room_id` のみ（ma 後方互換）。

`client_message_id` の unique はグローバルのまま（クライアント発行 ID は衝突しない想定）。
