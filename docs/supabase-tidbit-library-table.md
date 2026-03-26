# 豆知識ライブラリテーブル

30秒無発言時に披露する豆知識を保存し、キーワードで検索して再利用するためのテーブルです。

## 検索方針（videoId より アーティスト・曲名を優先）

YouTube は同一曲でも複数バージョン（公式・ライブ・Topic 等）があるため、**video_id で引かず**に次の順で検索します。

1. **同一曲**: `artist_name` ＋ `song_title` で「アーティスト - 曲名」が同じ曲とみなす。曲名は完全一致でなく相互に含む場合も同一曲とする（例: "Cream" と "Cream (Without Rap Monologue)"）。
2. **同一アーティスト**: `artist_name` が一致する豆知識（この曲に限らない、そのアーティストのトピック・受賞歴・ゴシップ等）を再利用。

これにより、別の video_id で同じ曲や同じアーティストが流れたときにもライブラリの豆知識を再利用できます。登録時の `artist_name` は `cleanAuthor` 済み（例: "Prince - Topic" → "Prince"）で保存し、検索時も同様に正規化して比較します。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- 豆知識ライブラリ（その場生成した豆知識を蓄積）
create table if not exists public.tidbit_library (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  video_id text,
  artist_name text,
  song_title text,
  keywords text,
  room_id text,
  style text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tidbit_library_video_id
  on public.tidbit_library (video_id) where video_id is not null;

create index if not exists idx_tidbit_library_artist
  on public.tidbit_library (artist_name) where artist_name is not null;

create index if not exists idx_tidbit_library_created
  on public.tidbit_library (created_at desc);

create index if not exists idx_tidbit_library_style
  on public.tidbit_library (style) where style is not null;

alter table public.tidbit_library enable row level security;

-- 誰でも参照可（豆知識の検索）
create policy "Anyone can select tidbit_library"
  on public.tidbit_library for select
  using (true);

-- 挿入はサーバー側（Service Role または API 経由で行う想定）。anon からは insert させない場合はコメントアウト。
-- ここでは API Route が Supabase クライアント（anon）で呼ぶ場合を想定し、insert を許可する。
create policy "Anyone can insert tidbit_library"
  on public.tidbit_library for insert
  with check (true);
```

既存のテーブルに `style` を追加する場合（既にテーブルがある環境）:

```sql
alter table public.tidbit_library add column if not exists style text;
create index if not exists idx_tidbit_library_style on public.tidbit_library (style) where style is not null;
```

## カラム説明

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| body | text | 豆知識の本文 |
| video_id | text | 披露時点の曲の YouTube video_id |
| artist_name | text | 披露時点のアーティスト名 |
| song_title | text | 披露時点の曲名・タイトル |
| keywords | text | 検索用キーワード（カンマ区切りなど） |
| room_id | text | 登録時に披露したルームID（任意） |
| style | text | 披露時点の曲のスタイル（Pop, Dance, Hip-hop など）。再生中曲と同ジャンルの [DB] のみ返すために使用 |
| created_at | timestamptz | 登録日時 |
