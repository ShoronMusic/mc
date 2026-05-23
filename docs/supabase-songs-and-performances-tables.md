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
-- music8_artist_slug: **部分ユニーク**は Supabase JS の upsert(onConflict: 'music8_artist_slug') と
-- PostgreSQL の ON CONFLICT 推論が一致せず **42P10** になる。非部分の unique index にする（NULL は複数行可）。
create unique index if not exists idx_artists_music8_artist_slug
  on public.artists (music8_artist_slug);
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

### 曲クレジット（共演・複数アーティスト・2026-05）

`spotify_artists` / Music8 `main_artists` / `main_artist` から **1曲に複数 `artists` を紐づけ**る。  
`songs.artist_id` は互換用の**代表1人**（`display_order = 0`）。バックフィル: `npx tsx scripts/backfill-song-credits-from-metadata.ts --apply`

```sql
create table if not exists public.song_credits (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  role text not null default 'main',       -- main | featured
  display_order smallint not null default 0,
  is_display_main boolean not null default false,
  source text null,                        -- spotify_artists | music8_main_artists | main_artist
  created_at timestamptz not null default now()
);

create unique index if not exists idx_song_credits_song_artist
  on public.song_credits (song_id, artist_id);

create index if not exists idx_song_credits_artist_id
  on public.song_credits (artist_id);

create index if not exists idx_song_credits_song_order
  on public.song_credits (song_id, display_order);
```

#### バックフィル引継ぎ（2026-05-22・別 PC 用）

**目的**: `spotify_artists`（なければ Music8 `main_artists` → `main_artist`）から `song_credits` を埋め、`songs.artist_id` を先頭クレジットに合わせる。

**前提（別 PC）**

- リポジトリ `e:\mc`（または clone）を同じコミット／変更一式で用意
- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- Supabase で上記 **`song_credits` の SQL は実行済み**（未実行なら先に SQL Editor で実行）

**実装ファイル（この作業で追加・変更）**

| パス | 内容 |
|------|------|
| `src/lib/song-credits-resolve.ts` | 名前分解・`artists` 解決 |
| `src/lib/song-credits-sync.ts` | 1曲同期・バッチ用 `planSongCreditDbRows` |
| `scripts/backfill-song-credits-from-metadata.ts` | 全曲バックフィル（**PAGE=100** 推奨） |
| `src/lib/song-entities.ts` | 選曲登録後に `syncSongCreditsFromSongId` |
| `src/lib/library-search-query.ts` | ライブラリ共演絞り込み（別件） |
| `scripts/fix-die-with-a-smile-gaga-mars-title-once.ts` | タイトル修正済み（1回限り） |

**本 PC で実行したバックフィル（2026-05-22）**

| 区間 | コマンド | 結果（ログ要約） |
|------|----------|------------------|
| `offset=0` `limit=3000` | `--apply` | processed 3000 / credits 行 3575 / 失敗 18 件 → `tmp/song-credits-backfill-failures-2026-05-22T08-26-09-249Z.jsonl` |
| `offset=3000` 以降〜末尾 | `--apply` | processed 17897 / credits 行 21432 / 失敗 112 件 → `tmp/song-credits-backfill-failures-2026-05-22T08-25-17-168Z.jsonl` |

※ 初回 `PAGE=500` は **statement timeout**（`57014`）で 3000 曲付近で中断。**`PAGE=100` に変更後**に上記 2 区間で再実行済み。

**別 PC でやること（残作業）**

1. **未コミット変更を持っていく**（git pull またはパッチ／USB）。`tmp/*.jsonl` は **コミットしない**（手元にコピーするか再生成）。
2. **全体の再実行（安全・冪等）** — タイムアウトしにくい設定で全件やり直してもよい（曲ごと delete→insert）:
   ```bash
   npm install
   npx tsx scripts/backfill-song-credits-from-metadata.ts          # dry-run
   npx tsx scripts/backfill-song-credits-from-metadata.ts --apply  # 全件（PAGE=100 既定）
   ```
3. **失敗分だけ** — 上記 JSONL の `song_id` を見て `artists` 追加 or 表記修正後、該当曲だけ再同期:
   ```bash
   # 例: 1曲だけ（要 song-entities 経由か、小スクリプトで songId 指定）
   npx tsx tmp/verify-die-with-a-smile-credits-once.ts
   ```
4. **手作業リスト** — `tmp/song-credits-backfill-failures-*.jsonl`（合計 **約 130 行**）。`unresolved` に名前、`credit_names` に分解結果。`artists` に無い名前はマスタ追加が必要。
5. **確認クエリ（SQL Editor）**
   ```sql
   select count(*) from song_credits;
   select count(distinct song_id) from song_credits;
   select count(*) from songs s where not exists (
     select 1 from song_credits c where c.song_id = s.id
   );
   ```
6. **代表例（Die With A Smile）** — `music8_song_slug = 'die-with-a-smile'` で `song_credits` 2 行（Lady Gaga order 0、Bruno Mars order 1）、`songs.artist_id` = Lady Gaga。

**注意**

- `--limit` 未指定で全件。`--offset` / `--limit` で分割可（例: `--offset=0 --limit=5000`）。
- 同一アーティストが `spotify_artists` に重複している曲は **artist_id 重複を除去**して insert（`23505` 対策済み）。
- `spotify_artists` が無い **約 53 曲**は Music8 / `main_artist` フォールバック。それでも無い曲は JSONL に載る。
- 単体テスト: `npm run test:song-credits`

### アーティスト m8 整合（2026-05・SQL Editor で実行）

Music8 アーティスト JSON 一括取り込み用。詳細は `docs/music8-artist-import-and-integration-plan.md`。

```sql
-- m8 準拠列（未適用 DB では import が存在列だけ書き込む）
alter table public.artists add column if not exists name_base text null;
alter table public.artists add column if not exists the_prefix text null;
alter table public.artists add column if not exists name_sort text null;
alter table public.artists add column if not exists music8_artist_id integer null;
alter table public.artists add column if not exists active_year_start text null;
alter table public.artists add column if not exists description_en text null;
alter table public.artists add column if not exists music8_members jsonb null;
alter table public.artists add column if not exists music8_synced_at timestamptz null;

create unique index if not exists idx_artists_music8_artist_id
  on public.artists (music8_artist_id)
  where music8_artist_id is not null;

create index if not exists idx_artists_name_sort on public.artists (name_sort);
```

- **`name`**: 表示名（`The Strokes`）。既存ライブラリ `ilike` 互換。
- **`name_base` + `the_prefix`**: m8 の `name` / `thePrefix` と同義。
- **`music8_artist_id`**: m8 WP `id`（例: 4834）。統合時の固定キー。

### `artists.music8_artist_slug` が部分ユニーク index のままの DB（42P10）

`upsert(..., onConflict: 'music8_artist_slug')` は **部分 unique index** と一致せず PostgreSQL **42P10** になる。アプリ側は `song-entities.ts` で **slug 一致の SELECT → UPDATE / INSERT** に変更済み（index 形態に依存しない）。

PostgREST の upsert や将来の raw SQL 用に index を直す場合（SQL Editor）:

```sql
drop index if exists public.idx_artists_music8_artist_slug;
create unique index idx_artists_music8_artist_slug on public.artists (music8_artist_slug);
```

（PostgreSQL では `UNIQUE` 列に **複数行 NULL** を許す。slug 非 null の重複だけ禁止される。）

- **`original_release_date`**: 新規再生時、`Music8` 曲 JSON のリリース年月が取れたときだけ埋める（既に値がある行は上書きしない）。
- **`music8_song_data`**: Music8 取得成功時に **`buildPersistableMusic8SongSnapshot`** の結果を `songs` に保存（同一曲で再取得したときは **上書き**）。`kind` は `musicaichat_v1` または `music8_wp_song`。巨大 HTML は含めない。musicaichat では `genres` / `styleNames` / `releaseDate_normalized` / `display` / `identifiers`（例: `spotify_track_id`）に加え、拡張用フラット列として **`primary_artist_name_ja`** / **`vocal`**（facts の「ボーカル：」行）/ **`structured_style`**（facts の「スタイル：」行）を持つ。あわせて **`attachMusic8SongDataIfFetched` または `upsertSongAndVideo`（スナップショット保存後）** で `songs.style` を Music8 由来に **上書き**し、`original_release_date` は **空欄のときのみ** Music8 の年月から補完する。
- **`youtube_published_at`**: 同一 POST で取得済みの `videos.list` / `videos` の **snippet.publishedAt** を `song_videos` に upsert（列が無い古い DB では API が該当フィールドなしで upsert し、42703 は握りつぶす）。
- **将来拡張列**: `attachMusic8SongDataIfFetched` / `upsertSongAndVideo` から、Music8 スナップショット取得時に次を自動補完（列がない環境は 42703 でスキップ）。
  - `genres`（複数ジャンル）
  - `spotify_track_id`（`identifiers.spotify_track_id` があれば）
  - `music8_song_id`（WP 曲 ID）
  - `music8_artist_slug` / `music8_song_slug`（musicaichat stable_key）
  - `primary_artist_name_ja` / `vocal` / `structured_style`
- **artists 基本マスタ**: `upsertSongAndVideo` / `attachMusic8SongDataIfFetched` が `artists` を **slug で検索して更新または挿入**し、`songs.artist_id` を自動更新（`artists` が未作成でも既存動作は維持）。

### 選曲時の新規登録（項目・ロジックの全体像）

部屋選曲・視聴履歴 POST 時に `songs` / `song_videos` / `artists` へ何をどう書くか（表記解決・一意キー・Music8 後追い）→ **`docs/song-registration-on-selection-spec.md`**

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

