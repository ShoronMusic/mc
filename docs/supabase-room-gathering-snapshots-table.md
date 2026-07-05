# チャット開催履歴スナップショット（Phase 2）

会（`room_gatherings`）が `ended` になったタイミングで 1 回だけ集計行を保存する。  
設計の全体像: `docs/room-gathering-history-and-ai-billing-project.md`

**実装状況（2026-06-29）**: 集計・INSERT は `src/lib/room-gathering-snapshot.ts` で完了。会終了は `POST /api/room-gatherings`（`action=end`）と在室0 Cron から呼ばれる。管理 UI は `/admin/gathering-history`。  
**運用**: 下記 SQL を Supabase で実行後、**これから終了する会**からスナップショットが保存される（過去会は遡及しない）。

## SQL（Supabase SQL Editor で実行）
```sql
-- 会サマリー（1 gathering = 1 行）
create table if not exists public.room_gathering_snapshots (
  gathering_id uuid primary key references public.room_gatherings(id) on delete cascade,
  room_id text not null,
  room_display_title text,
  gathering_title text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_display_name text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint,
  end_reason text,
  song_count_total integer not null default 0,
  chat_user_messages integer not null default 0,
  chat_ai_messages integer not null default 0,
  participant_count integer not null default 0,
  gemini_calls integer not null default 0,
  gemini_prompt_tokens bigint not null default 0,
  gemini_output_tokens bigint not null default 0,
  gemini_cost_usd numeric(12, 6),
  gemini_cost_jpy_approx numeric(12, 2),
  gemini_by_billing_kind jsonb not null default '{}'::jsonb,
  youtube_api_calls integer not null default 0,
  ably_messages_estimated integer not null default 0,
  ai_character_pick_count integer not null default 0,
  snapshot_version smallint not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_gathering_snapshots_room_ended
  on public.room_gathering_snapshots (room_id, ended_at desc nulls last);

-- 参加者（+ AI エージェント仮想行）
create table if not exists public.room_gathering_participant_snapshots (
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.room_gathering_snapshots(gathering_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  is_guest boolean not null default false,
  is_ai_agent boolean not null default false,
  stay_ms bigint not null default 0,
  song_count integer not null default 0,
  gemini_calls integer not null default 0,
  gemini_prompt_tokens bigint not null default 0,
  gemini_output_tokens bigint not null default 0,
  gemini_cost_jpy_approx numeric(12, 2),
  unique (gathering_id, display_name, is_ai_agent)
);

create index if not exists idx_room_gathering_participant_snapshots_gathering
  on public.room_gathering_participant_snapshots (gathering_id);

alter table public.room_gathering_snapshots enable row level security;
alter table public.room_gathering_participant_snapshots enable row level security;
-- 読み書きは service_role（管理 API）のみ

-- 会終了時の視聴履歴スナップショット（主催者がマイページで閲覧）
create table if not exists public.room_gathering_playback_snapshots (
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.room_gatherings(id) on delete cascade,
  room_id text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  video_id text not null,
  display_name text not null,
  is_guest boolean not null default false,
  played_at timestamptz not null,
  title text,
  artist_name text,
  style text,
  selection_round integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_gathering_playback_snapshots_gathering
  on public.room_gathering_playback_snapshots (gathering_id, sort_order);

create index if not exists idx_room_gathering_playback_snapshots_owner_ended
  on public.room_gathering_playback_snapshots (owner_user_id, played_at desc);

alter table public.room_gathering_playback_snapshots enable row level security;
-- 読み書きは service_role（会終了処理）のみ。マイページ閲覧は API 経由
```

## 集計元（実装済み）

| 項目 | 主なデータ源 |
|------|----------------|
| 選曲数 | `room_playback_history`（`started_at`〜`ended_at` + `room_id`） |
| **視聴履歴（曲リスト）** | 会終了時に `room_gathering_playback_snapshots` へコピー（`src/lib/room-gathering-playback-snapshot.ts`）· マイページ `GET /api/user/hosted-gathering-playback` |
| 参加者・滞在 | `user_room_participation_history`（`gathering_id` 優先、なければ時刻窓） |
| Gemini | `gemini_usage_logs`（`gathering_id` 優先、なければ時刻 + `room_id`） |
| AI エージェント | `ai_character_song_pick_logs` + `billing_kind = ai_agent` |
| チャット / Ably 推定 | `room_chat_log` 件数（`gathering_id` または時刻窓） |