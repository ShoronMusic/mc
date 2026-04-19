# ルーム会話ログテーブル（軽量保存用）

ルーム内のチャット発言・AI・システムメッセージをできるだけ軽い形で保存します。

## 保存できる参加者情報

| 情報 | 保存 | 説明 |
|------|------|------|
| **表示名（display_name）** | ○ | 発言時点の表示名。誰の発言か識別するために必須で保存します。 |
| **ユーザーID（user_id）** | △ | ログインしている参加者のみ。Supabase Auth の user id。ゲストは null。 |
| **メッセージ種別（message_type）** | ○ | user / ai / system のいずれか。 |
| **clientId（Ably）** | × | 接続ごとに変わるため保存しません。 |

ゲストは表示名のみで紐付き、同一人物の複数回の発言は表示名が同じであれば同じ人とみなせます。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- ルーム会話ログ（1発言1行・軽量）
create table if not exists public.room_chat_log (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  gathering_id uuid null references public.room_gatherings(id) on delete set null,
  client_message_id text unique not null,
  created_at timestamptz not null,
  message_type text not null check (message_type in ('user', 'ai', 'system')),
  display_name text not null,
  body text not null,
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_room_chat_log_room_created
  on public.room_chat_log (room_id, created_at asc);
create index if not exists idx_room_chat_log_room_gathering_created
  on public.room_chat_log (room_id, gathering_id, created_at asc);

alter table public.room_chat_log enable row level security;

create policy "Anyone can insert room chat log"
  on public.room_chat_log for insert
  with check (true);

create policy "Anyone can select room chat log"
  on public.room_chat_log for select
  using (true);
```

## カラム説明

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー（DB側で採番） |
| room_id | text | ルームID |
| gathering_id | uuid \| null | 開催中の会ID。会単位で分離して閲覧するためのキー |
| client_message_id | text | クライアント発行のメッセージID。重複挿入防止に使用（unique） |
| created_at | timestamptz | 発言日時（クライアントから送るISO文字列をそのまま保存） |
| message_type | text | 'user' \| 'ai' \| 'system' |
| display_name | text | 発言者表示名（AIは「AI」、システムは「システム」） |
| body | text | 本文（最大500文字想定） |
| user_id | uuid | ログイン参加者の場合のみ。ゲストは null |

## 1日分をテキストで見る・保存する

アプリの API で、**日本時間（JST）の1日分**をプレーンテキストにまとめて取得できます。

- **ブラウザで表示（コピー用）**  
  `https://あなたのドメイン/api/room-chat-log?roomId=ルームID`  
  - `date` を省略すると **今日（JST）**  
  - 例: `?roomId=my-room&date=2025-03-21`

- **ファイルとしてダウンロード**  
  上記に `&download=1` を付ける（例: `...&date=2025-03-21&download=1`）

1日あたり最大 **8000 件**まで（超える場合は先頭 8000 件のみでヘッダに注記）。

Supabase の **SQL Editor** で同様の範囲を絞る場合は、`created_at` を UTC で比較するか、上記 API と同じく JST の日付境界を計算してください。

### 既存テーブルに `gathering_id` を後付けする場合

```sql
alter table public.room_chat_log
  add column if not exists gathering_id uuid null references public.room_gatherings(id) on delete set null;

create index if not exists idx_room_chat_log_room_gathering_created
  on public.room_chat_log (room_id, gathering_id, created_at asc);
```

## 管理画面（日付・ルーム別一覧）

**`/admin`** ダッシュボードのメニューから **ルーム会話ログ** を開くか、直接 **`/admin/room-chat-log`** にアクセスします。**直近 N 日**を対象に **JST の日付 × ルームID** ごとの件数と、テキスト表示・ダウンロード・**＠Q&A**（`@`／`＠` で始まるユーザー行と直後の AI 行をペア表示。同日・同部屋の **質問ガード異議** が会話スナップショットと一致すれば付記）・ルームへのリンクが一覧できます。

- 利用条件は **Gemini 利用ログ管理** と同じ（`.env.local` の `STYLE_ADMIN_USER_IDS` と `SUPABASE_SERVICE_ROLE_KEY`、管理者アカウントでログイン）。
