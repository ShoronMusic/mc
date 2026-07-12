# room_gatherings · room_lobby_message — product 列（ma / mc 分離）

> **案2 実装 Step 1** — ma（`musicaichat`）と mc（`musicchat`）で **同じ room_id でも別の会**として扱う。  
> 正本: `docs/00-music-chat-product-plan.md` §3.2

## 目的

| 問題（案1） | 解決 |
|-------------|------|
| ma / mc で同じ 02 → 追い出し | **product ごとに live 可** |
| 部屋名が連動 | **集会・ロビー名を product スコープ** |
| Ably が同一 `room:02` | チャンネル `musicaichat:room:02` / `musicchat:room:02` |

## SQL（Supabase SQL Editor で実行）

```sql
-- 1) room_gatherings
alter table public.room_gatherings
  add column if not exists product text not null default 'musicaichat';

alter table public.room_gatherings
  drop constraint if exists room_gatherings_product_check;

alter table public.room_gatherings
  add constraint room_gatherings_product_check
  check (product in ('musicaichat', 'musicchat'));

-- 既存行は ma 扱い
update public.room_gatherings
  set product = 'musicaichat'
  where product is null or product = '';

-- live は (room_id, product) あたり最大 1（従来は room_id のみ）
drop index if exists room_gatherings_room_status_idx;
create index if not exists room_gatherings_room_product_status_idx
  on public.room_gatherings (room_id, product, status);

create unique index if not exists room_gatherings_one_live_per_room_product
  on public.room_gatherings (room_id, product)
  where status = 'live';

-- 2) room_lobby_message（部屋表示名・PR）
alter table public.room_lobby_message
  add column if not exists product text not null default 'musicaichat';

alter table public.room_lobby_message
  drop constraint if exists room_lobby_message_product_check;

alter table public.room_lobby_message
  add constraint room_lobby_message_product_check
  check (product in ('musicaichat', 'musicchat'));

update public.room_lobby_message
  set product = 'musicaichat'
  where product is null or product = '';

-- PK が room_id のみの環境: 複合ユニークへ（既存 PK は残しつつ product 付き行を許可）
create unique index if not exists room_lobby_message_room_product_uidx
  on public.room_lobby_message (room_id, product);
```

## 実行後の確認

```sql
select product, status, count(*) from public.room_gatherings group by 1, 2;
select room_id, product, display_title from public.room_lobby_message limit 20;
```

## アプリ側（実装順）

| Step | 内容 | 状態 |
|------|------|------|
| **1** | `room-product-scope.ts` · `room-gatherings` API · `room-live-status` API · Ably チャンネル接頭 | 完了 |
| **2** | サーバー Ably（presence・auth-session・jp unlock）· `room-lobby-message` API · セッション奪取ストレージ | 完了 |
| **3** | `room-session-takeover` · 入室復元ストレージ · `SessionReplacedNotice` を product 内に限定 | 完了 |
| **4** | mc 部屋 UI（AI 非表示・白テーマ・ma 誘導）· 邦楽視聴履歴スキップ緩和 | 完了 |

**product 列未実行時**: ma は従来どおり動作（API が product フィルタ失敗時にフォールバック）。**mc 分離は SQL 実行後に有効**。
