# AI お試し 20 曲（`user_ai_trial`）

登録ユーザー向けの **生涯 20 曲** AI 付き選曲お試しと **@ 質問 10 回** 枠を保持します。  
仕様: `docs/00-ai-trial-and-billing-implementation.md` · Phase B。  
付与曲数のアプリ正本: `AI_TRIAL_SONGS_GRANTED`（`src/lib/ai-trial-status.ts`）＝ **20**。  
@ 回数のアプリ正本: `AI_TRIAL_AT_QUESTIONS_GRANTED` ＝ **10**。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する（**再実行しても安全** — 既存テーブル・ポリシーはスキップ）。
3. 既に `default 10` で作済みの場合は、末尾の **ALTER DEFAULT** も実行（新規行の DB 既定用。アプリ INSERT は定数 20 を使う）。
4. アプリ側で `AI_TRIAL_ENFORCEMENT_ENABLED=1` を設定すると消費・API ガードが有効になります（未設定時は preview のまま）。

> **ポリシーだけ `already exists` で止まった場合** — テーブルと RLS は**すでに作成済み**です。エラーは無視して 4 へ進んでください。

```sql
-- 1 ユーザー 1 行: AI お試し 20 曲 + @ 10 回（アプリ定数が正本。既存 DB の default 5 はそのままでも可）
create table if not exists public.user_ai_trial (
  user_id uuid primary key references auth.users (id) on delete cascade,
  songs_granted int not null default 20 check (songs_granted >= 0),
  songs_remaining int not null default 20 check (songs_remaining >= 0),
  at_questions_granted int not null default 10 check (at_questions_granted >= 0),
  at_questions_remaining int not null default 10 check (at_questions_remaining >= 0),
  first_ip text,
  last_ip text,
  email_verified_at_grant timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_ai_trial_songs_remaining
  on public.user_ai_trial (songs_remaining);

alter table public.user_ai_trial enable row level security;

drop policy if exists "Users can select own ai trial" on public.user_ai_trial;
create policy "Users can select own ai trial"
  on public.user_ai_trial for select
  using (auth.uid() = user_id);

-- INSERT / UPDATE / decrement は service_role 経由（GET 付与・消費 API）

-- 既存テーブルの列既定を 20 に揃える（未実行なら実行）
alter table public.user_ai_trial
  alter column songs_granted set default 20,
  alter column songs_remaining set default 20;
```

## カラム説明

| 列 | 型 | 説明 |
|----|-----|------|
| user_id | uuid | auth.users（PK） |
| songs_granted | int | 付与曲数（既定 **20**） |
| songs_remaining | int | 残曲数 |
| at_questions_granted | int | 付与 @ 回数（アプリ既定 **10**。CREATE の SQL default は旧 5 のままでも可） |
| at_questions_remaining | int | @ 残 |
| first_ip | text | 初回付与時 IP（監査・Phase C） |
| last_ip | text | 直近消費時 IP |
| email_verified_at_grant | timestamptz | 付与時点のメール確認 |
| created_at | timestamptz | 作成 |
| updated_at | timestamptz | 更新 |

## 付与タイミング

- **メール確認済み**の登録ユーザーが **初回の AI 実利用**（AI 付き選曲の成功課金、または @ 質問の消費）時に、行がなければ **20 曲 + @ 10 回** を service_role で INSERT。
- `GET /api/user/ai-trial` は **付与しない**（既存行の参照、または未付与なら `trial_eligible` / 上限・待機ステータスのみ）。
- Google OAuth 等、確認済みで入ったユーザーも同様（ログイン直後の自動付与はしない）。
- **既存で `songs_granted < 20` の行**は、次回 bump（GET / 選曲ガード）時に **差分を `songs_remaining` に加算**して 20 に揃える（使用済み曲数は維持）。
- **既存で `at_questions_granted < 10` の行**も同様に、差分を `at_questions_remaining` に加算して 10 に揃える。

### 不正抑制（Phase C）

| 手段 | 既定 | env |
|------|------|-----|
| 同一 IP（IPv4 は /24）の 24h 新規付与ソフト上限 | OAuth 等 **3** / メール専用 **1** | `AI_TRIAL_IP_SOFT_CAP_PER_DAY` · `AI_TRIAL_IP_SOFT_CAP_EMAIL_PER_DAY`（0 で無効） |
| メール確認後の最低待機 | **15 分**（メール＋パスワードのみ） | `AI_TRIAL_EMAIL_GRANT_MIN_AGE_MINUTES`（0 で無効） |
| 付与拒否の管理通知 | `user_ai_trial_abuse_event` + サーバーログ `[ai-trial-abuse]` + `/admin/user-ai-trial` | テーブル SQL は下記 |

付与拒否時は選曲のみ（AI なし）は継続可能。家族・学校回線の誤爆時はお問い合わせ対応。

### 一括更新（任意・SQL Editor）

アプリ側の自動補正と同等。本番・ローカルで一度実行してよい。

```sql
-- 付与が 20 未満の既存行を 20 に揃える（残数 += 差分）
update public.user_ai_trial
set
  songs_remaining = songs_remaining + (20 - songs_granted),
  songs_granted = 20,
  updated_at = now()
where songs_granted < 20;
```

## 消費

| kind | タイミング | 備考 |
|------|------------|------|
| `song_full` | `POST /api/ai/comment-pack` · `packPhase=base` · `aiMode=full` | 1 選曲 1 回のみ |
| `at_question` | `POST /api/ai/chat` · AI メンション時 | 選曲枠とは別 |

監査ログ `user_ai_trial_consumption_log` は消費成功時に service_role で INSERT（テーブル未作成時はアプリは継続、サーバーログのみ）。

## `user_ai_trial_consumption_log`（Phase C · 監査）

`user_ai_trial` 作成後、任意で次も実行する。

```sql
create table if not exists public.user_ai_trial_consumption_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('song_full', 'at_question')),
  room_id text,
  video_id text,
  client_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_ai_trial_consumption_log_user_created
  on public.user_ai_trial_consumption_log (user_id, created_at desc);

create index if not exists idx_user_ai_trial_consumption_log_ip_created
  on public.user_ai_trial_consumption_log (client_ip, created_at desc);

alter table public.user_ai_trial_consumption_log enable row level security;

-- 参照は service_role / 将来の管理画面のみ（一般ユーザーは自分の行を見ない）
```

| 列 | 説明 |
|----|------|
| kind | `song_full`（AI 付き選曲 1 回）/ `at_question`（@ 1 回） |
| room_id | 任意（将来 API から渡す） |
| video_id | 任意 |
| client_ip | 消費時 IP |

## `user_ai_trial_abuse_event`（Phase C · 付与拒否・管理通知）

`user_ai_trial` 作成後、任意で次も実行する。

```sql
create table if not exists public.user_ai_trial_abuse_event (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ip_soft_cap', 'email_min_age')),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_ip text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_ai_trial_abuse_event_created
  on public.user_ai_trial_abuse_event (created_at desc);

create index if not exists idx_user_ai_trial_abuse_event_ip_created
  on public.user_ai_trial_abuse_event (client_ip, created_at desc);

alter table public.user_ai_trial_abuse_event enable row level security;

-- 参照・INSERT は service_role / 管理画面のみ
```

| 列 | 説明 |
|----|------|
| kind | `ip_soft_cap` / `email_min_age` |
| user_id | 付与を試みたユーザー |
| client_ip | リクエスト IP |
| detail | softCap・ipKey・件数等の JSON |

