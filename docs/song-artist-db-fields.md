# 曲・アーティスト DB — 基本項目と拡張項目

アプリ内の**正規マスタ**（Supabase 等）を想定した項目リストです。**作品（曲）**と**音源／YouTube クリップ**は別エンティティに分けると、Remix・別 MV が説明しやすくなります。既存案は `docs/supabase-songs-and-performances-tables.md`、Music8 JSON の形は `docs/music8-song-json-schema.md` を参照。

ユーザーのマイリスト行（`user_my_list_items` 等）は **表示用のコピー**が中心で、ここに書くマスタより薄くてよい。`docs/my-list-spec.md`。

---

## 1. 曲（作品 / Work・`songs` 相当）

「同じ作曲・同じ曲名の単位」。**どの YouTube を流すか**は別テーブル（`song_videos`）へ。

### 1.1 基本項目（必須に近い）

| 項目 | 型の例 | 説明 |
|------|--------|------|
| `id` | uuid | 内部主キー |
| `song_title` | text | 曲名（正規化した表記） |
| `main_artist` | text または `artist_id` FK | **この作品のメイン表記**（Remix 作品ではリミキサーをメインにするかは運用ルールで決める） |
| `display_title` | text | 一覧・検索用の「Artist - Song」等（一意制約のキーになりやすい） |
| `created_at` / `updated_at` | timestamptz | 監査用 |

### 1.2 拡張項目（任意・段階導入）

| 項目 | 型の例 | 説明 |
|------|--------|------|
| `spotify_track_id` | text | **Spotify のトラック ID**（API・ディープリンク・他サービス連携の第一キー）。**同一作品に複数トラック**（Remix / 別録）がある場合は、代表盤だけここに持ち、個別は `song_videos.spotify_track_id` に分ける運用を推奨。`unique` は方針次第（グローバル一意なら `(spotify_track_id)` に部分インデックス）。 |
| `music8_song_id` | int | WordPress / Music8 曲投稿 ID（固定キー） |
| `style` | text | アプリの `SongStyle` 相当の**主スタイル1つ**（集計用） |
| `genres` | text[] / jsonb | 複数ジャンル・タグ（RYM や Music8 の genre を参考にしてもよい） |
| `original_release_date` | date | **作品としての**原盤リリース日（Remix 単体の日付とは別） |
| `language` | text | 歌の言語コード等 |
| `explicit` | boolean | 露骨表現フラグ |
| `isrc` | text | ISRC（取れる場合） |
| `external_ids` | jsonb | **Spotify 以外**（Apple Music、TIDAL 等）を将来寄せる。主要 ID は**検索・結合で使うものは専用列**（`spotify_track_id` 等）に寄せ、jsonb は補助的にすると拡張しやすい。 |
| `wikipedia_title` / `wikipedia_url` | text | 作品・シングルページへの参照 |
| `rym_url` / `source_note` | text | 内部運用・出典メモ（ユーザー公開しないなら管理用） |
| `play_count` | int | アプリ内集計（既存 `songs` 案と同様） |

**クレジットの序列**（feat. / remixer / 原作者）が複雑な場合は、別テーブル `song_credits`（`song_id`, `artist_id`, `role`, `display_order`, `is_display_main` 等）を検討。

---

## 2. 音源・YouTube クリップ（`song_videos` 相当）

「この `video_id` はどの曲か」。**公開日**は作品日付と分ける。

### 2.1 基本項目

| 項目 | 型の例 | 説明 |
|------|--------|------|
| `video_id` | text PK | YouTube video id |
| `song_id` | uuid FK | 紐づく曲 |
| `variant` | text | `official` / `live` / `lyric` / `remix` / `topic` / `other` 等 |
| `created_at` | timestamptz | 行作成 |

### 2.2 拡張項目

| 項目 | 型の例 | 説明 |
|------|--------|------|
| `youtube_published_at` | timestamptz | **このクリップの** YouTube 上公開日（原盤日と別） |
| `duration_seconds` | int | 尺 |
| `is_primary_promo` | boolean | サイト上の「代表 MV」にするか |
| `title_override` | text | oEmbed と異なる表記にしたい場合 |
| `remix_or_version_note` | text | 「某某 Remix」等のメモ |
| `performance_id` | uuid | ライブ会場パフォーマンスへ（`performances` 案） |
| `spotify_track_id` | text | **この音源／バージョン**に対応する Spotify トラック ID（公式 MV と Remix で ID が違うときはここ）。`songs.spotify_track_id` は代表、`song_videos` 側を優先して表示・リンクするルールでもよい。 |

---

## 3. アーティスト（`artists` マスタ想定）

Music8 ではアーティストがカテゴリ＋ JSON で表現されている。アプリ内で正規化するなら**1行1アーティスト**が扱いやすい。

### 3.1 基本項目

| 項目 | 型の例 | 説明 |
|------|--------|------|
| `id` | uuid | 内部主キー |
| `name` | text | 表示名（公式表記） |
| `slug` | text | URL・Music8 連携用（一意） |
| `kind` | text | `solo` / `band` / `ensemble` / `dj` / `other` 等 |
| `created_at` / `updated_at` | timestamptz | 監査用 |

### 3.2 拡張項目

| 項目 | 型の例 | 説明 |
|------|--------|------|
| `spotify_artist_id` | text | **Spotify のアーティスト ID**（プロフィール・トップトラック取得・トラックの `artists[]` 突合に使う）。Music8 JSON の `spotify_artist_id` 等と同期しやすい。値が入る行に `unique (spotify_artist_id) where spotify_artist_id is not null` などを検討。 |
| `music8_artist_id` | int | Music8 / WP 上の ID（取れるなら） |
| `name_sort` | text | ソート用（The 抜き等） |
| `name_ja` | text | 和名・通称 |
| `origin_country` | text | 出身・活動基盤 |
| `active_from` / `active_to` | text または date | 活動期間（文字列「1977–1986」も可） |
| `youtube_channel_id` | text | 公式チャンネル |
| `wikipedia_title` | text | Wikipedia 記事名 |
| `image_url` | text | 代表画像 |
| `bio_short` | text | 短い説明（一覧用） |
| `bio_long` | text | 長文（別ページ用） |
| `aliases` | text[] | 別名・表記ゆれ検索用 |

**バンドメンバー**は `band_members`（`band_artist_id`, `person_artist_id`, `role`, `from`, `to`）のような関連テーブルが拡張向き。

---

## 4. 既存コード・テーブルとの対応（メモ）

| ここでいう層 | 既存の近いもの |
|--------------|----------------|
| 曲＋動画の最小 | `songs` + `song_videos`（`supabase-songs-and-performances-tables.md`） |
| 年代（動画単位キャッシュ） | `song_era`（`video_id`） |
| スタイル（動画単位キャッシュ） | `song_style` / 履歴行の `style` |
| 視聴の事実 | `room_playback_history`（イベントログ） |
| ユーザー個人の棚 | `user_my_list_items`（案） |

---

## 5. 導入の優先度（目安）

1. **曲**: 基本＋ `music8_song_id` + `song_videos.video_id` の多対1  
2. **アーティスト**: 基本＋ `slug` + `music8_artist_id`  
3. **Spotify**: `artists.spotify_artist_id` → `songs.spotify_track_id`（代表）→ 必要に応じて `song_videos.spotify_track_id`（バージョン別）  
4. 拡張: ジャンル多値・クレジット表・`youtube_published_at`・`external_ids`（Spotify 以外）  

Music8 運用の**経験が要る部分**（メイン／サブ、ジャンル）は、DB に **role・source_note** を持たせておくと後から見返しやすいです。

### Spotify 以外を足すとき

Apple Music・TIDAL 等も**利用頻度が高い ID は専用列**、まれなものは `external_ids` に `{ "apple_music_track_id": "..." }` のように載せると、マイグレーションとクエリの両方が楽です。
