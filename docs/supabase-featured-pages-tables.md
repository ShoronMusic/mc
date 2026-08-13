# 特集ページ（`featured_pages` / `featured_page_artists`）

管理画面でフェス等の特集を作り、ライブラリのアーティストをスタイル別に載せ、部屋チャットからライブラリ同様に全曲選曲できるようにする。

関連実装: `src/lib/featured-pages.ts` · `src/lib/featured-page-styles.ts` · `/admin/featured-pages` · `/api/featured-pages`

## SQL（Supabase SQL Editor）

```sql
-- 特集ページ
create table if not exists public.featured_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  description text null,
  published boolean not null default false,
  ai_usage_free boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint featured_pages_slug_unique unique (slug)
);

create index if not exists featured_pages_published_sort_idx
  on public.featured_pages (published, sort_order, created_at desc);

-- 特集内アーティスト（スタイルは Music8 系 9 種）
create table if not exists public.featured_page_artists (
  id uuid primary key default gen_random_uuid(),
  featured_page_id uuid not null references public.featured_pages (id) on delete cascade,
  artist_name text not null,
  artist_id uuid null,
  style text not null,
  -- 自由入力メモ。部屋では artist_name (label_note) と表示。例: Talking Heads
  label_note text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint featured_page_artists_page_name_unique unique (featured_page_id, artist_name),
  constraint featured_page_artists_style_check check (
    style in (
      'Pop',
      'Dance',
      'Alternative',
      'Electronica',
      'R&B',
      'Hip-hop',
      'Rock',
      'Metal',
      'Other'
    )
  )
);

create index if not exists featured_page_artists_page_sort_idx
  on public.featured_page_artists (featured_page_id, style, sort_order);

alter table public.featured_pages enable row level security;
alter table public.featured_page_artists enable row level security;

-- 公開読取は API（service role）経由。anon 直読みはしない。

-- 既存テーブル向け追補（既に create 済みの場合）
alter table public.featured_page_artists
  add column if not exists label_note text null;
```

`ai_usage_free = true` のとき、部屋の特集モーダル経由で登録アーティストを選曲した場合の AI 付き選曲（comment-pack / commentary）はお試し枠・クレジットを消費しない（サーバーでページ公開・フラグ・アーティスト所属を検証）。

`label_note` は管理の自由入力。部屋では `DAVID BYRNE (Talking Heads)` のように括弧付きで表示する（選曲キーは `artist_name` のまま）。
