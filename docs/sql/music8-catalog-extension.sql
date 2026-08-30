-- Music8 公開サイト向けカタログ拡張（既存 songs / artists / song_credits / song_videos の上に載せる）
-- 実行: Supabase SQL Editor。再実行しても安全（IF NOT EXISTS）。
-- 正本は MusicAiChat の既存プロジェクト。新規 Supabase プロジェクトは作らない。
-- 詳細: docs/supabase-music8-catalog-tables.md

-- ---------------------------------------------------------------------------
-- 1. 既存テーブルへの列追加
-- ---------------------------------------------------------------------------

alter table public.songs add column if not exists is_liked boolean not null default false;
alter table public.songs add column if not exists wp_post_modified timestamptz null;
alter table public.songs add column if not exists catalog_published_at timestamptz null;

create index if not exists idx_songs_is_liked on public.songs (is_liked) where is_liked = true;

-- 重複解消済み。索引が既にあればそのまま（DROP しない）。
create unique index if not exists idx_songs_music8_song_id
  on public.songs (music8_song_id)
  where music8_song_id is not null;

alter table public.artists add column if not exists wp_term_id integer null;
alter table public.artists add column if not exists occupations text[] null;
alter table public.artists add column if not exists related_artists_raw text null;

-- artists.wp_term_id も既存重複があり得るため、当面は非一意
create index if not exists idx_artists_wp_term_id
  on public.artists (wp_term_id)
  where wp_term_id is not null;

-- ---------------------------------------------------------------------------
-- 2. スタイル（WP taxonomy `style`・公開ナビ 9 種が正）
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_styles (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  wp_term_id integer null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint catalog_styles_slug_unique unique (slug)
);

create unique index if not exists idx_catalog_styles_wp_term_id
  on public.catalog_styles (wp_term_id)
  where wp_term_id is not null;

insert into public.catalog_styles (slug, name, wp_term_id, sort_order) values
  ('pop', 'Pop', 2844, 1),
  ('dance', 'Dance', 4686, 2),
  ('alternative', 'Alternative', 2845, 3),
  ('electronica', 'Electronica', 2846, 4),
  ('rb', 'R&B', 2847, 5),
  ('hip-hop', 'Hip-hop', 2848, 6),
  ('rock', 'Rock', 2849, 7),
  ('metal', 'Metal', 6409, 8),
  ('others', 'Others', 2873, 9)
on conflict (slug) do update set
  name = excluded.name,
  wp_term_id = coalesce(public.catalog_styles.wp_term_id, excluded.wp_term_id),
  sort_order = excluded.sort_order;

create table if not exists public.song_styles (
  song_id uuid not null references public.songs(id) on delete cascade,
  style_id uuid not null references public.catalog_styles(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (song_id, style_id)
);

create index if not exists idx_song_styles_style_id on public.song_styles (style_id);

-- ---------------------------------------------------------------------------
-- 3. ジャンル（WP taxonomy `genre`。parent_genre は style と一致しない）
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_genres (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  name_ja text null,
  description_ja text null,
  parent_genre text null,
  wp_term_id integer null,
  created_at timestamptz not null default now(),
  constraint catalog_genres_slug_unique unique (slug)
);

create unique index if not exists idx_catalog_genres_wp_term_id
  on public.catalog_genres (wp_term_id)
  where wp_term_id is not null;

create table if not exists public.song_genres (
  song_id uuid not null references public.songs(id) on delete cascade,
  genre_id uuid not null references public.catalog_genres(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (song_id, genre_id)
);

create index if not exists idx_song_genres_genre_id on public.song_genres (genre_id);

create table if not exists public.genre_related (
  genre_id uuid not null references public.catalog_genres(id) on delete cascade,
  related_genre_id uuid not null references public.catalog_genres(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (genre_id, related_genre_id),
  constraint genre_related_no_self check (genre_id <> related_genre_id)
);

-- ---------------------------------------------------------------------------
-- 4. ボーカル / タグ
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_vocals (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  wp_term_id integer null,
  created_at timestamptz not null default now(),
  constraint catalog_vocals_slug_unique unique (slug)
);

insert into public.catalog_vocals (slug, name) values
  ('f', 'F'),
  ('m', 'M')
on conflict (slug) do nothing;

create table if not exists public.song_vocals (
  song_id uuid not null references public.songs(id) on delete cascade,
  vocal_id uuid not null references public.catalog_vocals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (song_id, vocal_id)
);

create table if not exists public.catalog_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  wp_term_id integer null,
  created_at timestamptz not null default now(),
  constraint catalog_tags_slug_unique unique (slug)
);

create unique index if not exists idx_catalog_tags_wp_term_id
  on public.catalog_tags (wp_term_id)
  where wp_term_id is not null;

create table if not exists public.song_tags (
  song_id uuid not null references public.songs(id) on delete cascade,
  tag_id uuid not null references public.catalog_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (song_id, tag_id)
);

create index if not exists idx_song_tags_tag_id on public.song_tags (tag_id);

-- ---------------------------------------------------------------------------
-- 5. アーティスト関係（バンドメンバー）
-- ---------------------------------------------------------------------------

create table if not exists public.artist_members (
  artist_id uuid not null references public.artists(id) on delete cascade,
  member_artist_id uuid not null references public.artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (artist_id, member_artist_id),
  constraint artist_members_no_self check (artist_id <> member_artist_id)
);

create index if not exists idx_artist_members_member on public.artist_members (member_artist_id);

-- ---------------------------------------------------------------------------
-- 6. 編集プレイリスト（WP CPT playlist。曲集合は playlist_songs が正）
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_playlists (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text null,
  wp_post_id bigint null,
  publish_year_type text null,
  publish_year_single text null,
  publish_year_range_start text null,
  publish_year_range_end text null,
  show_on_top boolean not null default false,
  last_song_updated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_playlists_slug_unique unique (slug)
);

create unique index if not exists idx_catalog_playlists_wp_post_id
  on public.catalog_playlists (wp_post_id)
  where wp_post_id is not null;

create table if not exists public.catalog_playlist_songs (
  playlist_id uuid not null references public.catalog_playlists(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (playlist_id, song_id)
);

create index if not exists idx_catalog_playlist_songs_song on public.catalog_playlist_songs (song_id);

create table if not exists public.catalog_playlist_styles (
  playlist_id uuid not null references public.catalog_playlists(id) on delete cascade,
  style_id uuid not null references public.catalog_styles(id) on delete cascade,
  primary key (playlist_id, style_id)
);

create table if not exists public.catalog_playlist_genres (
  playlist_id uuid not null references public.catalog_playlists(id) on delete cascade,
  genre_id uuid not null references public.catalog_genres(id) on delete cascade,
  primary key (playlist_id, genre_id)
);

-- ---------------------------------------------------------------------------
-- 7. チャート（WP CPT charts。曲側 6 枠は正規化）
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_charts (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  wp_post_id bigint null,
  country text null,
  year_label text null,
  created_at timestamptz not null default now(),
  constraint catalog_charts_slug_unique unique (slug)
);

create unique index if not exists idx_catalog_charts_wp_post_id
  on public.catalog_charts (wp_post_id)
  where wp_post_id is not null;

create table if not exists public.song_chart_entries (
  song_id uuid not null references public.songs(id) on delete cascade,
  chart_id uuid not null references public.catalog_charts(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  primary key (song_id, chart_id)
);

create index if not exists idx_song_chart_entries_chart_pos
  on public.song_chart_entries (chart_id, position);

-- ---------------------------------------------------------------------------
-- 8. RLS: 公開直読みはしない。service role / 管理 API 経由。
-- ---------------------------------------------------------------------------

alter table public.catalog_styles enable row level security;
alter table public.song_styles enable row level security;
alter table public.catalog_genres enable row level security;
alter table public.song_genres enable row level security;
alter table public.genre_related enable row level security;
alter table public.catalog_vocals enable row level security;
alter table public.song_vocals enable row level security;
alter table public.catalog_tags enable row level security;
alter table public.song_tags enable row level security;
alter table public.artist_members enable row level security;
alter table public.catalog_playlists enable row level security;
alter table public.catalog_playlist_songs enable row level security;
alter table public.catalog_playlist_styles enable row level security;
alter table public.catalog_playlist_genres enable row level security;
alter table public.catalog_charts enable row level security;
alter table public.song_chart_entries enable row level security;
