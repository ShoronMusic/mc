# プリペイド AI クレジット（`user_ai_credits`）

お試し10曲枯渇後の **有料クレジット残高** と取引ログ。  
仕様: `docs/00-prepaid-pricing-summary.md` · Phase D 段階1（Stripe なし）。

## 作成手順

1. Supabase **SQL Editor** で下記を実行（**再実行しても安全**）。
2. アプリ `.env.local` に **`AI_CREDITS_ENABLED=1`**（コミット禁止）。
3. ローカル検証: 管理画面 `/admin/user-ai-trial` から手動付与 → ハチ等で AI 付き選曲。

```sql
-- 1 ユーザー 1 行: クレジット残高
create table if not exists public.user_ai_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  credits_remaining int not null default 0 check (credits_remaining >= 0),
  credits_lifetime_granted int not null default 0 check (credits_lifetime_granted >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_ai_credits_remaining
  on public.user_ai_credits (credits_remaining);

alter table public.user_ai_credits enable row level security;

drop policy if exists "Users can select own ai credits" on public.user_ai_credits;
create policy "Users can select own ai credits"
  on public.user_ai_credits for select
  using (auth.uid() = user_id);

-- 取引ログ（付与・消費）
create table if not exists public.user_ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'grant_admin',
    'grant_purchase',
    'consume_song',
    'consume_at_question'
  )),
  delta int not null,
  balance_after int not null check (balance_after >= 0),
  note text,
  granted_by uuid references auth.users (id) on delete set null,
  room_id text,
  video_id text,
  client_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_ai_credit_tx_user_created
  on public.user_ai_credit_transactions (user_id, created_at desc);

alter table public.user_ai_credit_transactions enable row level security;

-- INSERT/UPDATE は service_role のみ
```

## カラム（`user_ai_credits`）

| 列 | 説明 |
|----|------|
| credits_remaining | 残クレジット（1＝AI付き選曲 or @ 1回） |
| credits_lifetime_granted | 累計付与（監査用） |

## 取引 kind

| kind | delta | 説明 |
|------|-------|------|
| grant_admin | +N | 管理画面手動付与（段階1） |
| grant_purchase | +N | Stripe 購入（段階2・未実装） |
| consume_song | -1 | AI 付き選曲 |
| consume_at_question | -1 | @ 質問 |

## テストアカウント

| 用途 | user_id |
|------|---------|
| 一般ユーザー・枯渇済み | `87381344-b9ec-4fd8-9f42-3123e3ad5b7b`（ハチ） |
