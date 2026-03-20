# 管理者専用 曲ダッシュボード 仕様書

## 概要

Supabase 上の `songs` / `song_videos` / `song_commentary` / `song_tidbits` / `comment_feedback` / `room_playback_history` などを、
管理者がブラウザから一覧・検索・確認できるようにするための管理画面。

主な入口は次の 3 つとする。

1. **日別の曲一覧 → 曲詳細**
2. **アーティスト INDEX（アルファベット順） → アーティストページ（曲一覧） → 曲詳細**
3. **検索窓（曲名 / アーティスト名検索） → 曲詳細**

---

## 共通仕様

- URL パスはすべて `/admin/**` 配下。
- Supabase Auth によるログイン必須。
  - 認証されていない場合は `/` にリダイレクト。
  - 将来、ユーザーの `role = 'admin'` などで管理者限定に絞る余地を残す。
- 画面レイアウトは PC 前提（1 カラム〜2 カラム）。モバイル最適化は後回し。

### 曲詳細ページ（共通で遷移するゴール）

- URL: `/admin/songs/[songId]`
- 表示内容:

#### 1. 曲メイン情報（`songs`）

- `display_title`（例: Culture Club - Karma Chameleon）
- `main_artist`
- `song_title`
- `style`
- `play_count`
- 予約カラム（将来追加想定）:
  - `music8_artist_slug` / `music8_title_slug`
  - `music8_song_url`

#### 2. 動画情報（`song_videos`）

- テーブル形式で複数行表示:
  - `video_id`
  - `variant`（official / live など）
  - `performance_id`（あれば）
  - 初回 `created_at`

#### 3. AI コメント / 豆知識

- **基本コメント（`song_commentary`）**
  - `video_id`
  - `body`（先頭 1〜2 行＋「全文を見る」）
  - `created_at`
- **豆知識ライブラリ（`song_tidbits`）**
  - `video_id`
  - `body`（先頭 1〜2 行）
  - `source`（ai / ai_commentary / manual）
  - `created_at`
- 将来: Good / no good のスコアを横に表示（`comment_feedback` 集計結果）

#### 4. コメント評価（`comment_feedback` 集計）

- 「AI コメントごと」の集計:
  - キー: `song_id` / `video_id` / `ai_message_id`
  - カラム:
    - Good 件数（`is_upvote = true`）
    - no good 件数（`is_upvote = false`）
- 曲詳細ページでは:
  - `video_id` ＞ `ai_message_id` 単位でリスト表示し、
  - 横に Good / no good カウントをバッジ表示する。

#### 5. 視聴履歴（`room_playback_history`）

- 対象: この `songId` と紐づく `song_videos.video_id` に一致する履歴。
- 表示項目:
  - `played_at`（日時）
  - `room_id`
  - `display_name`（そのとき曲を貼った参加者＝投稿者）
  - （将来）その時点の参加人数（別テーブルに持つ場合）
- 集計表示:
  - **投入回数**: `room_playback_history` の行数
  - **延べ投稿者数**: `display_name` のユニーク数
  - （将来）**延べ参加人数合計**・**平均人数**

---

## 1. 日別の曲一覧 → 曲詳細

### 1-1. 日付一覧ページ

- URL: `/admin/days`
- 機能:
  - 直近 N 日分（例: 30 日）の日付リストを表示。
  - 各日付横に、その日の曲数・投稿者数などの簡易サマリを表示してもよい。
- 操作:
  - 日付をクリックすると `/admin/days/[yyyy-mm-dd]` へ遷移。

### 1-2. 日別曲一覧ページ

- URL: `/admin/days/[date]`（例: `/admin/days/2026-03-17`）
- バックエンド:
  - `room_playback_history` から `played_at` がその日の行を取得。
  - `songs` / `song_videos` と JOIN して曲タイトルを解決。
- 表示項目（一行ごと）:
  - 時刻: `played_at`（例: 21:48）
  - 参加者（投稿者）: `display_name`
  - 曲: `display_title`（例: Culture Club - Karma Chameleon）
  - `video_id`
  - ルームID: `room_id`
- 操作:
  - 曲名（`display_title`）または行全体をクリックすると `/admin/songs/[songId]` へ。

---

## 2. アーティスト INDEX → アーティストページ → 曲詳細

### 2-1. アーティスト INDEX

- URL: `/admin/artists`
- ソース: `songs.main_artist` のユニーク値一覧。
- UI:
  - A〜Z, 0–9, その他（記号・日本語）などのタブ or セクション見出し。
  - 各アーティスト名をアルファベット順で並べる。
- 操作:
  - アーティスト名クリックで `/admin/artists/[artistSlug]` へ。
  - `artistSlug` は簡易に
    - `encodeURIComponent(artistName.toLowerCase().replace(/\s+/g, '-'))`
    などで作る。

### 2-2. アーティストページ（曲一覧）

- URL: `/admin/artists/[artistSlug]`
- バックエンド:
  - `songs.main_artist ilike <復元した artistName>` で該当曲を取得。
- 表示項目:
  - `display_title`
  - `song_title`
  - `style`
  - `play_count`
  - 最終再生日（`room_playback_history` から MAX(played_at)）
- 操作:
  - 行クリックで `/admin/songs/[songId]` へ。

---

## 3. 検索窓 → 曲詳細

### 3-1. 検索ページ

- URL: `/admin/songs`
- 機能:
  - 検索フォーム:
    - 入力例: `Culture Club - Karma Chameleon` / `Culture Club` / `Karma`
  - バックエンド:
    - API: `/api/admin/songs-search?query=...`
    - 検索条件例:
      - `display_title ilike '%query%'`
      - または `main_artist ilike '%query%' OR song_title ilike '%query%'`
- 検索結果一覧:
  - `display_title`
  - `main_artist`
  - `song_title`
  - `play_count`
- 操作:
  - 行クリックで `/admin/songs/[songId]` へ。

---

## 認証・権限

- すべての `/admin/**` ページと `/api/admin/**` は Supabase Auth でのログイン必須。
- 将来的に、
  - ユーザーのメタデータに `role: 'admin'` などを持たせ、
  - `role !== 'admin'` の場合は 403 / `/` へリダイレクト  
  とする実装に拡張できるようにしておく。

