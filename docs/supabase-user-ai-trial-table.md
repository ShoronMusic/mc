# AI お試し 10 曲（`user_ai_trial`）

登録ユーザー向けの **生涯 10 曲** AI 付き選曲お試しと **@ 質問 5 回** 枠を保持します。  
仕様: `docs/00-ai-trial-and-billing-implementation.md` · Phase B。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する（**再実行しても安全** — 既存テーブル・ポリシーはスキップ）。
3. アプリ側で `AI_TRIAL_ENFORCEMENT_ENABLED=1` を設定すると消費・API ガードが有効になります（未設定時は preview のまま）。

> **ポリシーだけ `already exists` で止まった場合** — テーブルと RLS は**すでに作成済み**です。エラーは無視して 3 へ進んでください。

```sql
-- 1 ユーザー 1 行: AI お試し 10 曲 + @ 5 回
create table if not exists public.user_ai_trial (
  user_id uuid primary key references auth.users (id) on delete cascade,
  songs_granted int not null default 10 check (songs_granted >= 0),
  songs_remaining int not null default 10 check (songs_remaining >= 0),
  at_questions_granted int not null default 5 check (at_questions_granted >= 0),
  at_questions_remaining int not null default 5 check (at_questions_remaining >= 0),
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
```

## カラム説明

| 列 | 型 | 説明 |
|----|-----|------|
| user_id | uuid | auth.users（PK） |
| songs_granted | int | 付与曲数（既定 10） |
| songs_remaining | int | 残曲数 |
| at_questions_granted | int | 付与 @ 回数（既定 5） |
| at_questions_remaining | int | @ 残 |
| first_ip | text | 初回付与時 IP（監査・Phase C） |
| last_ip | text | 直近消費時 IP |
| email_verified_at_grant | timestamptz | 付与時点のメール確認 |
| created_at | timestamptz | 作成 |
| updated_at | timestamptz | 更新 |

## 付与タイミング

- **メール確認済み**の登録ユーザーが `GET /api/user/ai-trial` を初めて呼んだとき、行がなければ **10 曲 + @ 5 回** を service_role で INSERT。
- Google OAuth 等、確認済みで入ったユーザーは初回 GET で即付与。
- **既存ユーザー**も初回 GET 時に同様（一括バッチは別途任意）。

## 消費

| kind | タイミング | 備考 |
|------|------------|------|
| `song_full` | `POST /api/ai/comment-pack` · `packPhase=base` · `aiMode=full` | 1 選曲 1 回のみ |
| `at_question` | `POST /api/ai/chat` · AI メンション時 | 10 曲枠とは別 |

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
