# 部屋入室アクセスログ（日次集計・ゲスト含む）

部屋画面を開いたときに **1 日（日本時間）あたり・同一ブラウザ（ゲストは sessionStorage の visitorKey）またはログインユーザーにつき 1 行** を記録します。発言の有無に関係なく「入室した」ことを管理画面で日付×部屋別に集計できます。

## 保存される情報

| 情報 | 保存 | 説明 |
|------|------|------|
| **room_id** | ○ | 部屋 ID |
| **accessed_at** | ○ | サーバー受信時刻（UTC） |
| **display_name** | ○ | 入室時点の表示名（最大 200 文字） |
| **is_guest** | ○ | ゲスト入室か |
| **user_id** | △ | ログイン時のみ（Supabase Auth の UUID） |
| **dedupe_key** | ○ | 重複防止用（クライアントには返さない） |
| **gathering_id** | △ | 開催中会が取れたときのみ（`room_live_status` と同様） |

ゲストは `user_id` が null です。同一人物の追跡は **同一ブラウザ・同一部屋の sessionStorage** に保存した visitorKey により、**同一暦日内の再入室は 1 行にまとめます**（別ブラウザ・シークレットは別カウント）。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- 部屋入室ログ（1 暦日あたり同一主体 1 行想定・dedupe_key で一意）
create table if not exists public.room_access_log (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  gathering_id uuid null,
  dedupe_key text not null unique,
  accessed_at timestamptz not null default now(),
  display_name text not null,
  is_guest boolean not null default false,
  user_id uuid null references auth.users(id) on delete set null
);

create index if not exists idx_room_access_log_room_accessed
  on public.room_access_log (room_id, accessed_at desc);

create index if not exists idx_room_access_log_accessed
  on public.room_access_log (accessed_at desc);

alter table public.room_access_log enable row level security;

-- クライアントからの記録用（読み取りは管理 API のサービスロールのみ想定）
create policy "room_access_log_insert_anon"
  on public.room_access_log for insert
  with check (true);
```

任意で `gathering_id` に `references public.room_gatherings(id) on delete set null` を付けてもよい（`room_gatherings` 作成済みの場合）。

## 管理画面

- **集計**: `/admin/room-access-log`（`STYLE_ADMIN_USER_IDS` + `SUPABASE_SERVICE_ROLE_KEY`）
- **明細**: 同ページから日付・部屋を選ぶと `/admin/room-access-log/detail` へ

記録 API: `POST /api/room-access-log`（部屋マウント時にクライアントが自動送信）
