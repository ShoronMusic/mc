# 現在記録できる項目一覧

アプリが Supabase 等に**書き込める項目**の整理です。該当テーブルが未作成の環境では API がエラーになりますが、設計上の項目は以下のとおりです。

---

## ユーザー単位（マイページまわり）

### `user_song_history`（貼った曲の履歴）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー |
| `room_id` | 部屋 ID |
| `video_id` | YouTube 動画 ID |
| `url` | 動画 URL |
| `title` | タイトル（oEmbed 等） |
| `artist` | アーティスト（oEmbed 等） |
| `posted_at` | 貼った日時 |
| `selection_round` | 選曲ラウンド（同期部屋・列がある場合） |

詳細・SQL: `docs/supabase-song-history-table.md`

### `user_favorites`（お気に入り）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー |
| `video_id` | YouTube 動画 ID（ユーザー内で一意） |
| `display_name` | 選曲者の表示名 |
| `played_at` | その曲が流れた（とみなす）日時 |
| `title` | 表示用タイトル |
| `artist_name` | アーティスト名など |
| `created_at` | お気に入り登録日時 |

詳細・SQL: `docs/supabase-user-favorites-table.md`

### `user_my_list_items`（マイリスト／個人ライブラリ）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー |
| `video_id` | YouTube 動画 ID（ユーザー内で一意） |
| `url` | 正規化した視聴 URL |
| `title` | 表示用タイトル（編集可） |
| `artist` | 表示用アーティスト（編集可） |
| `note` | 任意メモ |
| `source` | 追加経路（`manual_url` / `song_history` / `favorites` / `extension` 等） |
| `music8_song_id` | Music8 参考紐づけ（任意・将来拡張） |
| `created_at` / `updated_at` | 作成・更新時刻 |

API: `src/app/api/my-list/route.ts`  
詳細・SQL: `docs/supabase-user-my-list-table.md`

### `user_my_library_artists`（マイリスト用・ユーザー別アーティストマスタ）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー |
| `display_name` | 表示名（ユーザー内 `display_name` で一意） |
| `artist_slug` | Music8 JSON 参照用のスラッグ（`police` など） |
| `created_at` / `updated_at` | 作成・更新時刻 |

詳細・SQL: `docs/supabase-user-my-library-artists-tables.md`

### `user_my_list_item_artists`（マイリスト曲とアーティストの紐づけ）

| 項目 | 説明 |
|------|------|
| `my_list_item_id` | `user_my_list_items.id` |
| `artist_id` | `user_my_library_artists.id` |
| `position` | 表示順（0＝メイン想定） |

詳細・SQL: `docs/supabase-user-my-library-artists-tables.md`

### `user_room_participation_history`（参加履歴）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー |
| `room_id` | 部屋 ID |
| `gathering_id` | 会（任意・外部キー） |
| `gathering_title` | 会タイトル |
| `display_name` | 入室時点の表示名 |
| `joined_at` | 入室時刻 |
| `left_at` | 退出時刻（取れない場合は null） |

記録 API: `POST /api/user-room-participation`  
SQL: `docs/supabase-setup.md` 第 10 章

### `user_ai_taste_summary`（AI向け趣向メモ・1 ユーザー 1 行）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー（主キー） |
| `summary_text` | マイページで編集する短文（最大約 4000 文字。AI プロンプトには先頭約 1200 文字まで） |
| `updated_at` | 最終更新 |

API: `GET` / `PUT` → `/api/user/ai-taste-summary`  
利用: 「@」付きチャット応答の参考（`src/app/api/ai/chat` → `generateChatReply`）  
SQL: `docs/supabase-setup.md` 第 14 章

### `user_ai_taste_auto_profile`（AI向け趣向・自動要約・1 ユーザー 1 行）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー（主キー） |
| `profile_text` | `room_chat_log`（当該ユーザーの `user_id` 付き user 発言）・`user_song_history`・`user_favorites`・`user_my_list_items` を集約し Gemini で生成した短文 |
| `updated_at` | 最終更新（`POST /api/user/ai-taste-auto-refresh`） |

API: `POST` → `/api/user/ai-taste-auto-refresh`（約45分に1回まで）・`GET` → `/api/user/ai-taste-auto-profile`（本人の `profile_text` 表示用）  
利用: `fetchUserTasteContextForChat` が手動メモと合算し `@` チャットに注入。マイページに自動要約の読み取り専用プレビューあり。  
SQL: `docs/supabase-setup.md` 第 15 章

### `user_public_profile`（他ユーザー向けプロフィール・オプトイン）

| 項目 | 説明 |
|------|------|
| `user_id` | ログインユーザー（主キー） |
| `visible_in_rooms` | 他ユーザーに公開するか |
| `tagline` | 一言（最大約200文字） |
| `favorite_artists` | JSON 配列（最大5・各約80文字） |
| `listening_note` | 補足（最近の傾向など・最大約300文字） |
| `updated_at` | 最終更新 |

API: `GET`（`?forUserId=` で他ユーザー参照・RLS により公開中のみ） / `PUT` → `/api/user/public-profile`  
同期部屋では Ably presence に `authUserId`（ログイン時のみ）を載せ、参加者欄のプロフィールアイコンから照会できます。  
SQL: `docs/supabase-setup.md` 第 16 章

---

## 部屋単位（視聴履歴・プロフィール）

### `room_playback_history`（部屋の視聴履歴・1 再生 1 行）

| 項目 | 説明 |
|------|------|
| `room_id` | 部屋 ID |
| `video_id` | YouTube 動画 ID |
| `display_name` | 選曲者（貼った人）の表示名。ゲストは `(G)` 付き |
| `is_guest` | ゲストかどうか |
| `user_id` | ログイン時はユーザー ID、未ログインは null |
| `title` | 一覧用タイトル（多くは「アーティスト - 曲名」系） |
| `artist_name` | 抽出・正規化したアーティスト |
| `style` | 曲スタイル（自動付与＋ STYLE_ADMIN 等で更新可） |
| `played_at` | 履歴に載った日時 |
| `selection_round` | 選曲ラウンド（列がある場合） |

実装: `src/app/api/room-playback-history/route.ts`

**時代（era）**: 履歴**行**には無く、`song_era` の `video_id` と GET 時に結合して返す。

### `room_lobby_message`（部屋の名前・PR）

| 項目 | 説明 |
|------|------|
| `room_id` | 部屋 ID（主キー） |
| `message` | PR 文（入室前メッセージ） |
| `display_title` | 部屋の名前（表示用） |
| `updated_at` | 更新日時 |

SQL: `docs/supabase-setup.md` 第 9 章

---

## 動画・曲まわり（正規化・上書き）

### `video_playback_display_override`（管理者の表記上書き）

| 項目 | 説明 |
|------|------|
| `video_id` | YouTube 動画 ID |
| `title` | 上書きタイトル |
| `artist_name` | 上書きアーティスト |
| `updated_at` | 更新日時 |

詳細: `docs/supabase-song-history-table.md`（視聴履歴の表記上書き）

### `song_era`（動画ごとの年代ラベル）

| 項目 | 説明 |
|------|------|
| `video_id` | YouTube 動画 ID |
| `era` | 年代カテゴリ（アプリ定義の値） |

実装: `src/lib/song-era.ts`（テーブル作成手順は `docs/supabase-song-era-table.md` を参照）

### `songs` / `song_videos`（曲マスタ・採用時）

視聴履歴 POST で `upsertSongAndVideo` 等が動く環境では、概ね次が記録・更新されます。

- **songs**: `main_artist`, `song_title`, `display_title`, `style`, `play_count`, `original_release_date`（原盤・任意）, `music8_song_data`（Music8 軽量スナップショット jsonb・任意）, `created_at` など
- **song_videos**: `song_id`, `video_id`, `variant`, `youtube_published_at`（YouTube クリップ公開・任意）, …

詳細: `docs/supabase-songs-and-performances-tables.md`

（環境によって `song_style` 等の追加テーブルあり。）

---

## 認証ユーザー（Supabase Auth）

- メール・表示名（`user_metadata` 等）は `auth.users` / セッション経由で更新。

---

## その他（機能ごとにテーブル作成が必要）

| 内容 | 参照 |
|------|------|
| サイト評価・コメント | `site_feedback` — `docs/supabase-setup.md` |
| 質問ガードへの異議 | `ai_question_guard_objections` — 同 |
| AI チャットチューニング報告（モデレーター） | `ai_chat_conversation_tuning_reports` — `docs/supabase-setup.md` 11.2 |
| 部屋チャットログ（管理用） | `room_chat_log` — `docs/supabase-room-chat-log-table.md` |
| 会（ギャザリング） | `room_gatherings` 等 — `docs/room-live-session-spec.md` |
| YouTube / Gemini 利用ログ | `docs/supabase-youtube-api-usage-logs-table.md`, `docs/supabase-gemini-usage-logs-table.md` |

---

## 補足

- **貼った曲・お気に入り**には、現状 **スタイル・時代の列は無い**（視聴履歴・`song_era` 側）。
- **視聴履歴の行**には **スタイル・アーティスト名**がある。**時代**は **`song_era`**（履歴行のスナップショット列は未導入）。
- 将来の拡張案: `docs/room-playback-history-style-era-artist-design.md`
