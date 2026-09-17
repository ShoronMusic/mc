-- 週間チャート（US / UK トップ10）管理デスク。再実行可。
-- 公開直読みはしない。service role / 管理 API 経由。
-- 既存の catalog_charts / song_chart_entries（曲ごとの過去ピーク）とは別物。

create table if not exists public.weekly_chart_issues (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region in ('us', 'uk')),
  chart_week date not null,
  source text not null default 'spotify',
  source_playlist_id text not null,
  playlist_name text null,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint weekly_chart_issues_region_week unique (region, chart_week)
);

create table if not exists public.weekly_chart_entries (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.weekly_chart_issues(id) on delete cascade,
  position integer not null check (position >= 1 and position <= 10),
  spotify_track_id text not null,
  title text not null,
  artist_name text not null,
  spotify_artists text null,
  song_id uuid null references public.songs(id) on delete set null,
  match_kind text not null check (match_kind in ('spotify_id', 'artist_title', 'none')),
  created_at timestamptz not null default now(),
  constraint weekly_chart_entries_issue_position unique (issue_id, position)
);

create index if not exists idx_weekly_chart_entries_song
  on public.weekly_chart_entries (song_id)
  where song_id is not null;

alter table public.weekly_chart_issues enable row level security;
alter table public.weekly_chart_entries enable row level security;
