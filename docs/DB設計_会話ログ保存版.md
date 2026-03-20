# Music8 Lounge データベース設計（会話ログ保存版）

管理者責任で会話ログを保存する前提。保存すべき情報を整理する。

---

## 1. エンティティ一覧

| エンティティ | 説明 |
|-------------|------|
| **users** | 正規登録ユーザー（Google / 簡易会員） |
| **guests** | ゲスト参加の一時識別（任意・匿名扱い） |
| **sessions** | 1回の「会」（ルームの1セッション） |
| **session_participants** | その会に誰が参加したか |
| **session_songs** | その会で流れた曲（誰がいつ貼ったか） |
| **chat_messages** | 会話ログ（発言・AIコメント） |
| **session_summaries** | 会終了時のAI要約（任意） |
| **user_public_profiles** | ユーザー館用の公開プロフィール設定 |
| **survey_responses** | 会の満足度アンケート回答（フィードバック・改善用） |
| **user_ai_context** | 登録ユーザーごとの発言・行動の分析・要約（AI 個人化用） |

---

## 2. テーブル定義（Supabase / PostgreSQL 想定）

### 2.1 users（正規登録ユーザー）

登録ユーザーの認証・プロフィール。ゲストはこのテーブルには入らない。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK, デフォルト gen_random_uuid() |
| auth_provider | text | ○ | 'google' \| 'email' |
| auth_uid | text | ○ | 認証基盤の一意ID（Google sub / 自前UID） |
| email | text | △ | 簡易登録時は必須。Google は取得できれば保存 |
| display_name | text | ○ | 表示名 |
| avatar_url | text | - | アイコンURL（Google の画像など） |
| profile_bio | text | - | 自己紹介（ユーザー館用） |
| profile_favorite_genres | text[] | - | 好きなジャンル（タグ） |
| is_public_profile | boolean | ○ | ユーザー館に公開するか。デフォルト false |
| created_at | timestamptz | ○ | 登録日時 |
| updated_at | timestamptz | ○ | 更新日時 |

- **一意制約**: (auth_provider, auth_uid)
- **インデックス**: auth_uid, email（ログイン検索用）

---

### 2.2 guests（ゲスト参加の識別）

ゲストを「その会」単位で識別する用。完全匿名でも可なら、このテーブルを廃止し session_participants の guest_display_name のみでも可。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| display_name | text | ○ | その回だけの表示名（Guest-xxxx またはユーザー入力） |
| session_id | UUID | ○ | どの会のゲストか |
| first_seen_at | timestamptz | ○ | 参加日時 |
| last_seen_at | timestamptz | ○ | 最終活動日時 |

- **インデックス**: session_id
- **方針**: 個人を特定しない。IP 等は保存しない前提で「誰が発言したか」の紐付けのみ。

---

### 2.3 sessions（会・ルームの1回分）

「その回」の会のメタ情報。1ルーム固定なら 1 日 1 セッションや、ルーム開始/終了で 1 行というイメージ。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| room_id | text | ○ | ルーム識別子（MVP は 'main' など固定1つ） |
| title | text | - | 会のタイトル（任意。例「金曜夜の洋楽会」） |
| started_at | timestamptz | ○ | 開始日時 |
| ended_at | timestamptz | - | 終了日時（未終了は NULL） |
| created_at | timestamptz | ○ | レコード作成日時 |

- **インデックス**: room_id, started_at（一覧・振り返り用）

---

### 2.4 session_participants（その会の参加者）

誰がいつからいつまでその会にいたか。正規ユーザーとゲストの両方に対応。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| session_id | UUID | ○ | FK → sessions.id |
| user_id | UUID | △ | 正規ユーザーの場合。FK → users.id |
| guest_id | UUID | △ | ゲストの場合。FK → guests.id |
| joined_at | timestamptz | ○ | 参加日時 |
| left_at | timestamptz | - | 退室日時（在室中は NULL） |

- **制約**: user_id と guest_id のどちらか一方のみ非NULL（CHECK またはアプリ側で保証）
- **インデックス**: session_id, user_id

---

### 2.5 session_songs（その会で流れた曲）

その回で貼られた曲の順序・誰が貼ったか・AI 解説。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| session_id | UUID | ○ | FK → sessions.id |
| order_index | integer | ○ | その会内の順番（1, 2, 3...） |
| youtube_video_id | text | ○ | YouTube videoId |
| youtube_title | text | - | 動画タイトル（oEmbed 等で取得） |
| artist_name | text | - | アーティスト名（任意・AI または手動） |
| track_title | text | - | 曲名（任意） |
| posted_by_user_id | UUID | △ | 貼った人（正規ユーザー）。FK → users.id |
| posted_by_guest_id | UUID | △ | 貼った人（ゲスト）。FK → guests.id |
| posted_at | timestamptz | ○ | 貼った日時 |
| ai_commentary | text | - | AI が生成した短い解説（140〜240文字） |

- **制約**: posted_by_user_id と posted_by_guest_id のどちらか一方のみ非NULL
- **インデックス**: session_id, posted_at

---

### 2.6 chat_messages（会話ログ）

発言と AI コメントを同一テーブルで管理。管理者が責任を持って管理する対象。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| session_id | UUID | ○ | FK → sessions.id |
| message_type | text | ○ | 'user' \| 'ai' \| 'system'（入退室通知など） |
| user_id | UUID | △ | 発言者（正規ユーザー）。FK → users.id |
| guest_id | UUID | △ | 発言者（ゲスト）。FK → guests.id |
| body | text | ○ | 発言本文（AI の場合は解説テキスト） |
| created_at | timestamptz | ○ | 発言日時 |

- **制約**: message_type='user' のとき user_id または guest_id のどちらか必須。'ai'/'system' のときは両方 NULL 可
- **インデックス**: session_id, created_at（会ごとの時系列取得）

---

### 2.7 session_summaries（会の要約・任意）

その回の終了時や定時に AI が作成する要約。コンテンツ資産・デイリーレポ用。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| session_id | UUID | ○ | FK → sessions.id, UNIQUE（1会1要約） |
| summary_text | text | ○ | AI が生成した要約文 |
| highlighted_track_ids | UUID[] | - | 盛り上がった曲の session_songs.id（任意） |
| created_at | timestamptz | ○ | 作成日時 |

---

### 2.8 user_public_profiles（ユーザー館用・任意）

users の is_public_profile と重複するが、「何を公開するか」を細かく切りたい場合用。users だけで足りれば省略可。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| user_id | UUID | ○ | PK, FK → users.id |
| show_participated_sessions | boolean | ○ | 参加した会を公開するか |
| show_posted_songs | boolean | ○ | 貼った曲を公開するか |
| show_recent_activity | boolean | ○ | 直近の活動を表示するか |
| updated_at | timestamptz | ○ | 更新日時 |

---

### 2.9 survey_responses（会の満足度アンケート回答）

フィードバック・サービス改善・AI の振る舞いの振り返り用。詳細は `docs/フィードバックとサービス改善.md` を参照。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| id | UUID | ○ | PK |
| session_id | UUID | ○ | どの会についての回答か。FK → sessions.id |
| user_id | UUID | △ | 回答者（正規ユーザー）。FK → users.id |
| guest_id | UUID | △ | 回答者（ゲスト）。FK → guests.id |
| satisfaction_rating | integer | - | 会全体の満足度（1〜5） |
| would_join_again | integer | - | また参加したいか（1〜5 など） |
| ai_fit_rating | integer | - | AI の参加のちょうどよさ（1: 少なすぎ 〜 5: 多すぎ） |
| ai_commentary_rating | integer | - | AI の解説の役立ち（1〜5） |
| ai_feedback_text | text | - | AI への自由記述 |
| general_feedback_text | text | - | 良かった点・改善してほしい点 |
| responded_at | timestamptz | ○ | 回答日時 |

- **制約**: user_id と guest_id のどちらか一方のみ非 NULL
- **インデックス**: session_id, responded_at

---

### 2.10 user_ai_context（登録ユーザーごとの発言・分析・AI 用文脈）

参加者一人の発言の情報と分析を、**登録ユーザーの基本情報・参加したチャットの記録・その会で紹介した曲**とセットで扱うため、ユーザーごとの「AI 用文脈」をここに保存する。詳細は `docs/AIの個人化と成長_差別化.md` を参照。

| カラム名 | 型 | 必須 | 説明 |
|----------|-----|------|------|
| user_id | UUID | ○ | PK, FK → users.id。1ユーザー1行（または履歴で複数行）。 |
| context_summary | text | ○ | 発言・行動の傾向・性格・癖の要約（AI が生成）。プロンプトに渡す短文。 |
| preferences_summary | text | - | 好みの曲・ジャンル・話題の傾向の要約。 |
| last_session_summary | text | - | 直近のセッションでのやり取りの短い要約（継続会話用）。 |
| updated_at | timestamptz | ○ | 要約の最終更新日時。 |

- **元データ**: 発言は `chat_messages`（user_id で紐づく）、参加した会は `session_participants`、紹介した曲は `session_songs`（posted_by_user_id）。これらを集約・分析して `context_summary` 等を更新する。
- **インデックス**: user_id（1ユーザー1行なら PK のみで可）

---

## 3. リレーション図（簡略）

```
users 1 ----< session_participants >---- * sessions
guests 1 ----< session_participants
users 1 ----< chat_messages
guests 1 ----< chat_messages
sessions 1 ----< chat_messages
sessions 1 ----< session_songs
users 1 ----< session_songs (posted_by)
guests 1 ----< session_songs (posted_by)
sessions 1 ---- 1 session_summaries
users 1 ---- 1 user_public_profiles
sessions 1 ----< survey_responses
users 1 ----< survey_responses (回答者)
guests 1 ----< survey_responses (回答者・ゲストの場合)
users 1 ---- 1 user_ai_context (発言・分析の要約、AI 個人化用)
```

---

## 4. 保存すべき情報の整理（管理者視点）

| 目的 | 保存する情報 | 主なテーブル |
|------|----------------|-------------|
| その回のユーザー・曲 | 参加者・貼った曲・順序・時刻 | session_participants, session_songs |
| 会話ログ | 発言者（user/guest）・本文・時刻 | chat_messages |
| 登録ユーザー情報 | 表示名・認証・プロフィール・公開設定 | users, user_public_profiles |
| ゲスト | その会内の表示名のみ（個人特定しない） | guests |
| 会のメタ | 開始/終了・ルーム | sessions |
| 振り返り・コンテンツ | 会の要約・盛り上がり曲 | session_summaries |
| 満足度・改善 | アンケート回答（満足度・AI 評価・自由記述） | survey_responses |
| 参加者ごとの発言・分析 | 登録ユーザーの言動・好み・癖の要約（AI 個人化） | user_ai_context（元データは chat_messages, session_songs 等） |

### 4.1 参加者一人分のデータの「セット」で保存されるもの

**登録ユーザー**について、次の情報は **user_id で紐づき、セットで扱われる**。

| 種類 | 保存先 | 内容 |
|------|--------|------|
| **基本情報** | users | 表示名・認証・プロフィール・公開設定など。 |
| **参加したチャットの記録** | session_participants ＋ sessions | どの会にいつ参加・退室したか。 |
| **その会での発言** | chat_messages | 発言本文・時刻。user_id と session_id で紐づく。 |
| **その会で紹介した曲** | session_songs | 貼った曲・時刻。posted_by_user_id と session_id で紐づく。 |
| **発言の情報と分析** | user_ai_context | 上記の発言・参加・紹介した曲などを元に AI が生成した「傾向・性格・癖・好み」の要約。 |

→ **参加者一人の発言の情報と分析は、登録ユーザーの基本情報・参加したチャットの記録・その会で紹介した曲などと、user_id を軸にセットで保存・参照される。**

ゲストは user_id を持たないため、発言・紹介した曲は session 単位では残るが、**個人をまたいだ分析・個人化**の対象にはしない（user_ai_context は登録ユーザーのみ）。

---

## 5. よく使うクエリ例

- **ある会の会話ログ（時系列）**: `chat_messages` を `session_id` + `created_at` で取得
- **あるユーザーが参加した会一覧**: `session_participants` で `user_id` 指定 → `sessions` 結合
- **あるユーザーが貼った曲一覧**: `session_songs` で `posted_by_user_id` 指定
- **ある会で流れた曲の順序**: `session_songs` を `session_id` + `order_index` で取得
- **ユーザー館用「この人の公開情報」**: `users` + `user_public_profiles` と、公開許可された session_songs / session_participants の集計
- **ある会のアンケート集計**: `survey_responses` を `session_id` で取得し、満足度・AI 評価の平均・分布を算出
- **あるユーザーの発言・分析（AI 個人化用）**: `user_ai_context` を `user_id` で取得。同一ユーザーの発言・紹介曲は `chat_messages`, `session_songs` で user_id 指定して集約

---

## 6. 運用上の注意（管理者責任）

- **保持期間**: 会話本文の保存期間を規約で明示（例: 〇年）。期限経過後の削除バッチを検討。
- **バックアップ**: ログは改ざん・消失に備え定期バックアップとリストア手順を用意。
- **アクセス制限**: 会話ログへのアクセスは管理者・運用に限定。本番DBはアプリ経由のみとし、直接参照は権限管理された環境のみに。
- **削除要請**: 利用者からの削除要請手順と、対応した場合の user_id/guest_id や session 単位でのマスキング・削除方針を決めておく。

以上を「保存すべき情報」とデータベース設計の整理とする。
