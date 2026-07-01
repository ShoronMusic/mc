# Gemini 利用ログテーブル（管理画面用）

各 Gemini 呼び出しのトークン数を蓄積し、`/admin/gemini-usage` で集計・一覧表示します。

## SQL（Supabase SQL Editor で実行）

```sql
create table if not exists public.gemini_usage_logs (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  model text not null default 'gemini-2.5-flash',
  prompt_token_count integer,
  output_token_count integer,
  total_token_count integer,
  cached_token_count integer,
  room_id text,
  video_id text,
  user_id uuid references auth.users(id) on delete set null,
  gathering_id uuid references public.room_gatherings(id) on delete set null,
  billing_kind text,
  billing_user_id uuid references auth.users(id) on delete set null,
  trigger_user_id uuid references auth.users(id) on delete set null,
  is_guest_trigger boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_gemini_usage_logs_created
  on public.gemini_usage_logs (created_at desc);

create index if not exists idx_gemini_usage_logs_context
  on public.gemini_usage_logs (context);

create index if not exists idx_gemini_usage_logs_user_created
  on public.gemini_usage_logs (user_id, created_at desc);

create index if not exists idx_gemini_usage_logs_gathering
  on public.gemini_usage_logs (gathering_id, created_at desc);

create index if not exists idx_gemini_usage_logs_billing_user
  on public.gemini_usage_logs (billing_user_id, created_at desc);

-- クライアントからは読まない（API が service_role で読む）
alter table public.gemini_usage_logs enable row level security;

-- ポリシーなし = anon からはアクセス不可（service_role のみ）
```

## 既存テーブルへの追記

### マイページ・ユーザー別集計（user_id）

```sql
alter table public.gemini_usage_logs
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_gemini_usage_logs_user_created
  on public.gemini_usage_logs (user_id, created_at desc);
```

### 開催履歴・課金帰属（Phase 1）

`docs/room-gathering-history-and-ai-billing-project.md` 参照。

```sql
alter table public.gemini_usage_logs
  add column if not exists gathering_id uuid references public.room_gatherings(id) on delete set null,
  add column if not exists billing_kind text,
  add column if not exists billing_user_id uuid references auth.users(id) on delete set null,
  add column if not exists trigger_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_guest_trigger boolean not null default false;

create index if not exists idx_gemini_usage_logs_gathering
  on public.gemini_usage_logs (gathering_id, created_at desc);

create index if not exists idx_gemini_usage_logs_billing_user
  on public.gemini_usage_logs (billing_user_id, created_at desc);
```

| 列 | 意味 |
|----|------|
| `user_id` | 操作者（選曲者・質問者）。ゲストは null |
| `gathering_id` | 開催中会 ID（room_id から live を解決して付与） |
| `billing_kind` | `participant_user` / `guest_enjoy_owner_paid` / `room_owner` / `ai_agent` |
| `billing_user_id` | 試算上の請求先ユーザー（参加者本人 or 主催者） |
| `trigger_user_id` | 操作者（`user_id` と同値のことが多い） |
| `is_guest_trigger` | ゲスト操作で AI が走ったとき true |

- マイページ「参加履歴」は `billing_user_id = 自分`（未設定行は `user_id = 自分`）で集計。`personal` / `roomCommon` に分割。

## 保存の条件

- `.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`** があるとき、各 API 呼び出し後に 1 行 INSERT されます。
- `GEMINI_USAGE_PERSIST=0` のときは DB 保存を止められます（コンソールログのみのときと同様）。

## context（種別）の意味

| context | 用途 |
|---------|------|
| `chat_reply` | チャットへの AI 返答 |
| `tidbit` | 30秒無発言の豆知識 |
| `commentary` | 曲解説（[NEW]/[DB] の基本コメント） |
| `get_song_style` | 曲スタイル分類 |
| `extract_song_search` | 「曲を貼って」系のクエリ抽出 |
| `comment_pack_base` | comment-pack API の基本コメント |
| `comment_pack_free_1`〜`3` | comment-pack の自由コメント |
| `theme_playlist_comment` | マイページ「お題プレイリスト」1曲あたりの短い AI コメント |

**料金の目安**: 公式料金ページの **入力トークン単価 × prompt_token_count 合計**、**出力単価 × output_token_count 合計** で概算できます。
