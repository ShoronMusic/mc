# 曲・動画・パフォーマンス・スタイル用テーブル（提案）

曲を「メインアーティスト - 曲名」で1つの単位とし、YouTube の複数 video_id やライブ情報をそこに紐づけるためのテーブル案です。

## 1. 曲マスタと動画対応

まずは **曲（songs）** と **曲と動画の対応（song_videos）** だけ用意すれば、既存機能に影響を与えずに徐々に移行できます。

```sql
-- 曲マスタ（正規化された「メインアーティスト - 曲名」）
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  main_artist text not null,         -- メインアーティスト
  song_title text not null,          -- 曲名
  display_title text not null,       -- 表示用: "Artist - Song"（正規化済み）
  style text,                        -- 曲のメインスタイル（Pop, Rock など）※任意
  play_count integer not null default 0,  -- このチャットで貼られた回数（曲単位で集約）
  original_release_date date null,        -- 原盤リリース日（Music8 等・日不明時は月の1日）
  music8_song_data jsonb null,            -- Music8 由来の軽量スナップショット（視聴履歴 POST で更新）
  created_at timestamptz not null default now()
);

create unique index if not exists idx_songs_display_title
  on public.songs (lower(display_title));

-- 曲と YouTube 動画の対応（オフィシャル / ライブ / リリックなど）
create table if not exists public.song_videos (
  song_id uuid references public.songs(id) on delete cascade,
  video_id text primary key,
  variant text,                      -- 'official' | 'live' | 'lyric' | 'topic' | 'other'
  performance_id uuid null,          -- ライブ情報があれば performances.id を紐づけ
  youtube_published_at timestamptz null, -- YouTube Data API snippet.publishedAt（クリップ公開）
  created_at timestamptz not null default now()
);
```

### 既存 DB への列追加（2026-04 以降・視聴履歴 POST で自動投入）

`create table` 済みの環境では **SQL Editor** で次を実行する。

```sql
alter table public.songs add column if not exists original_release_date date null;
alter table public.songs add column if not exists music8_song_data jsonb null;
alter table public.song_videos add column if not exists youtube_published_at timestamptz null;
-- 将来拡張（Music8由来メタを専用列で保持）
alter table public.songs add column if not exists genres text[] null;
alter table public.songs add column if not exists spotify_track_id text null;
alter table public.songs add column if not exists music8_song_id bigint null;
alter table public.songs add column if not exists music8_artist_slug text null;
alter table public.songs add column if not exists music8_song_slug text null;
alter table public.songs add column if not exists primary_artist_name_ja text null;
alter table public.songs add column if not exists vocal text null;
alter table public.songs add column if not exists structured_style text null;
-- アーティスト基本マスタ（Music8ベースで将来拡張）
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  music8_artist_slug text null,
  name_ja text null,
  kind text null,                    -- band / solo など
  origin_country text null,          -- 例: UK
  active_period text null,           -- 例: 1977-1986
  members text null,                 -- 例: Andy Summers, Sting, Stewart Copeland
  youtube_channel_title text null,   -- 例: ポリス YouTube Channel
  youtube_channel_url text null,     -- 公式チャンネルURL
  image_url text null,               -- 代表画像URL
  image_credit text null,            -- 画像クレジット（任意）
  profile_text text null,            -- チャット読み込み用の説明文（長文）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_artists_name on public.artists (lower(name));
create unique index if not exists idx_artists_music8_artist_slug
  on public.artists (music8_artist_slug)
  where music8_artist_slug is not null;
alter table public.songs add column if not exists artist_id uuid null references public.artists(id);
-- Music8 曲JSON由来メタ（2026-04 追加）
alter table public.songs add column if not exists music8_video_id text null;            -- Music8 canonical YouTube video_id
alter table public.songs add column if not exists spotify_release_date text null;       -- 例: "1983/6/17"
alter table public.songs add column if not exists spotify_name text null;               -- Spotify 曲名
alter table public.songs add column if not exists spotify_artists text null;            -- Spotify アーティスト名（文字列）
alter table public.songs add column if not exists spotify_images text null;             -- Spotify アルバムアート URL
alter table public.songs add column if not exists spotify_popularity smallint null;     -- 0–100
-- 既存 artists テーブルがある環境向け（不足列の後付け）
alter table public.artists add column if not exists kind text null;
alter table public.artists add column if not exists origin_country text null;
alter table public.artists add column if not exists active_period text null;
alter table public.artists add column if not exists members text null;
alter table public.artists add column if not exists youtube_channel_title text null;
alter table public.artists add column if not exists youtube_channel_url text null;
alter table public.artists add column if not exists image_url text null;
alter table public.artists add column if not exists image_credit text null;
alter table public.artists add column if not exists profile_text text null;
alter table public.artists add column if not exists spotify_artist_id text null;        -- Spotify アーティスト ID
alter table public.artists add column if not exists spotify_artist_images text null;    -- Spotify アーティスト画像 URL
alter table public.artists add column if not exists spotify_artist_popularity smallint null; -- 0–100
alter table public.artists add column if not exists wikipedia_page text null;           -- Wikipedia スラッグ（例: "The_Police"）
```

- **`original_release_date`**: 新規再生時、`Music8` 曲 JSON のリリース年月が取れたときだけ埋める（既に値がある行は上書きしない）。
- **`music8_song_data`**: Music8 取得成功時に **`buildPersistableMusic8SongSnapshot`** の結果を `songs` に保存（同一曲で再取得したときは **上書き**）。`kind` は `musicaichat_v1` または `music8_wp_song`。巨大 HTML は含めない。musicaichat では `genres` / `styleNames` / `releaseDate_normalized` / `display` / `identifiers`（例: `spotify_track_id`）に加え、拡張用フラット列として **`primary_artist_name_ja`** / **`vocal`**（facts の「ボーカル：」行）/ **`structured_style`**（facts の「スタイル：」行）を持つ。あわせて **`attachMusic8SongDataIfFetched` または `upsertSongAndVideo`（スナップショット保存後）** で `songs.style` を Music8 由来に **上書き**し、`original_release_date` は **空欄のときのみ** Music8 の年月から補完する。
- **`youtube_published_at`**: 同一 POST で取得済みの `videos.list` / `videos` の **snippet.publishedAt** を `song_videos` に upsert（列が無い古い DB では API が該当フィールドなしで upsert し、42703 は握りつぶす）。
- **将来拡張列**: `attachMusic8SongDataIfFetched` / `upsertSongAndVideo` から、Music8 スナップショット取得時に次を自動補完（列がない環境は 42703 でスキップ）。
  - `genres`（複数ジャンル）
  - `spotify_track_id`（`identifiers.spotify_track_id` があれば）
  - `music8_song_id`（WP 曲 ID）
  - `music8_artist_slug` / `music8_song_slug`（musicaichat stable_key）
  - `primary_artist_name_ja` / `vocal` / `structured_style`
- **artists 基本マスタ**: `upsertSongAndVideo` / `attachMusic8SongDataIfFetched` が `artists` へ upsert し、`songs.artist_id` を自動更新（`artists` が未作成でも既存動作は維持）。

### 利用イメージ

- 既存フローで `video_id` と「アーティスト - 曲名」が分かった時点で：
  1. `display_title` を正規化して `songs` を検索（なければ insert）
  2. `song_videos` に `(song_id, video_id, variant, youtube_published_at 任意)` を upsert
  3. 視聴履歴 POST 時は Music8 が取れたら `songs.original_release_date` を **空欄のときだけ** 補完し、`songs.music8_song_data` にスナップショットを保存（再取得時は上書き）
- 曲解説や豆知識、視聴回数などは将来的に `song_id` をキーに集約できる。

### 曲単位の視聴回数（play_count）

「このチャットで貼られた回数」を曲単位で集約して持たせます。PVのバージョン（video_id）が YFDg-pgE0Hk でも VJDJs9dumZI でも、同じ曲（例: The Beatles - While My Guitar Gently Weeps）なら 1 つのカウンタを増やします。

```sql
-- 既存の songs テーブルに play_count を追加
alter table public.songs add column if not exists play_count integer not null default 0;
```

- **記録タイミング**: 視聴履歴に1件追加されるたび（POST /api/room-playback-history 成功後）に、その video_id に紐づく `song_id` の `play_count` を +1 します。
- **video_id 単位の視聴回数**: 集計するだけなら `room_playback_history` で足ります。`SELECT video_id, COUNT(*) FROM room_playback_history GROUP BY video_id` で各動画の貼られた回数が出ます。
- **曲単位の視聴回数**: `songs.play_count` を参照するか、集計する場合は `SELECT s.display_title, s.play_count FROM songs s ORDER BY s.play_count DESC` などで取得できます。

---

## 2. ライブ・パフォーマンス情報（任意で段階的に導入）

特別なライブ版（Rock & Roll Hall of Fame など）の情報を整理したい場合は、以下のテーブルを追加します。

```sql
-- ライブ・イベント（パフォーマンス単位）
create table if not exists public.performances (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- 例: Rock & Roll Hall of Fame 2004 Induction
  date date,                         -- 開催日
  venue text,                        -- 会場・都市
  description text,                  -- 企画趣旨・メモ
  created_at timestamptz not null default now()
);

-- 参加アーティスト（ライブごと）
create table if not exists public.performance_artists (
  performance_id uuid references public.performances(id) on delete cascade,
  artist_name text not null,
  role text,                         -- guitar / vocal / band / guest など
  primary key (performance_id, artist_name)
);
```

`song_videos.performance_id` に `performances.id` を入れることで、

- 「While My Guitar Gently Weeps（曲）」→ `songs`
- 「Rock & Roll Hall of Fame 2004 でのトリビュート演奏（ライブ）」→ `performances`
- 「そのライブの YouTube 動画（6SFNW5F8K9Y）」→ `song_videos`

という 3 層構造で扱えるようになります。

---

## 3. スタイルの定義とひも付け

### 3-1. スタイルマスタ（任意）

`src/lib/song-styles.ts` の `SONG_STYLES` と揃えるため、DB 側にもマスタを用意しておくと管理しやすくなります。

```sql
create table if not exists public.song_style_master (
  style_id text primary key,       -- 'Pop', 'Dance', 'Alternative rock' など
  display_name text not null,      -- 表示名（同じでもよい）
  color text,                      -- UI 用カラーコード（#f25042 など、任意）
  description text                 -- 説明（任意）
);

insert into public.song_style_master (style_id, display_name) values
  ('Pop', 'Pop'),
  ('Dance', 'Dance'),
  ('Electronica', 'Electronica'),
  ('R&B', 'R&B'),
  ('Hip-hop', 'Hip-hop'),
  ('Alternative rock', 'Alternative rock'),
  ('Metal', 'Metal'),
  ('Rock', 'Rock'),
  ('Jazz', 'Jazz'),
  ('Other', 'Other')
on conflict (style_id) do nothing;
```

### 3-2. 既存の `song_style` との関係

現在の `song_style` は「**video_id ごとのスタイルキャッシュ**」として使われています。

```sql
create table if not exists public.song_style (
  video_id text primary key,
  style text not null,
  created_at timestamptz not null default now()
);
```

このままでも問題ありませんが、曲マスタと組み合わせると：

- `room_playback_history` のスタイル手動変更 →  
  - `song_style`（video_id 単位のキャッシュ）を更新しつつ、必要に応じて `songs.style` も更新する。
- 新しい動画（別バージョン）が貼られたとき →  
  - 既に `songs.style` が決まっていれば、その値を初期値として `song_style` に入れる。

といった使い方ができます。

---

## 4. 導入のステップ案

1. **Supabase にテーブルを追加**  
   - このドキュメントの SQL を SQL Editor で実行し、`songs` / `song_videos` / `song_style_master`（任意）を作成。
2. **新規再生から曲を登録**  
   - `/api/room-playback-history` や `/api/ai/commentary` などで `video_id` と「アーティスト - 曲名」が分かった時点で、`songs` / `song_videos` に upsert する処理を追加。
3. **スタイルとの連携**  
   - 代表スタイルを `songs.style` に持たせつつ、既存の `song_style`（video_id 単位）も維持する。
4. **余裕があればパフォーマンス情報を追加**  
   - 特別なライブだけ、`performances` / `performance_artists` に手入力 or 後から登録し、UI に「ライブ情報タブ」を追加する。

まずは `songs` / `song_videos` とスタイル周りから導入しておけば、後からライブ情報や視聴回数集計を拡張しやすくなります。

