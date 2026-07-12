# room_playback_history · room_access_log — product 列（ma / mc 分離）

> 選曲履歴・入室ログ・管理集計を **product ごとに厳密分離**する。  
> 曲 DB・ユーザーは共用のまま。正本: `docs/00-music-chat-product-plan.md` §3.2

## SQL（Supabase SQL Editor で実行）

```sql
-- 1) 選曲履歴
alter table public.room_playback_history
  add column if not exists product text not null default 'musicaichat';

alter table public.room_playback_history
  drop constraint if exists room_playback_history_product_check;

alter table public.room_playback_history
  add constraint room_playback_history_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.room_playback_history
  set product = 'musicaichat'
  where product is null or product = '';

create index if not exists room_playback_history_room_product_played_idx
  on public.room_playback_history (room_id, product, played_at desc);

-- 2) 入室ログ
alter table public.room_access_log
  add column if not exists product text not null default 'musicaichat';

alter table public.room_access_log
  drop constraint if exists room_access_log_product_check;

alter table public.room_access_log
  add constraint room_access_log_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.room_access_log
  set product = 'musicaichat'
  where product is null or product = '';

create index if not exists room_access_log_room_product_accessed_idx
  on public.room_access_log (room_id, product, accessed_at desc);
```

## 既存 dedupe_key について

product 列追加後、**新規 INSERT** は `musicaichat|01|u:{userId}|2026-07-08` 形式。  
旧形式 `01|u:...` の行はそのまま残る（同一ユーザーが ma/mc 両方に同日入室した記録は別行になる）。

## アプリ

| 領域 | 挙動 |
|------|------|
| 部屋 UI 視聴履歴 GET | 現在 product のみ |
| 選曲 POST | `product = getRoomHistoryProductId()` |
| 入室 POST | 同上 + dedupe_key に product |
| 管理 API | `?product=all\|musicaichat\|musicchat`（既定 all） |

**product 列未実行時**: 従来どおり `room_id` のみ（ma 後方互換）。
