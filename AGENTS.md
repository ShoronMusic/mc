# AGENTS.md — musicaichat（洋楽チャット）

コーディング AI・新メンバー向けのプロジェクト取扱説明書です。

## 概要

- **Next.js 14**（App Router）、**TypeScript**、部屋同期チャット＋YouTube 選曲＋曲解説（Gemini）。
- 本番・開発の秘密情報は **`.env.local`**（コミット禁止）。

## 心臓部（触るときはここを読む）

| 領域 | パス | 説明 |
|------|------|------|
| Gemini プロンプト | `src/lib/gemini.ts` | チャット返答、tidbit、選曲クエリ抽出、曲解説、スタイル分類 |
| 生成文ポリシー | `src/lib/ai-output-policy.ts` | 根拠なしチャート/バズ等の**再生成判定**（変更時は単体テスト必須） |
| 曲解説パック API | `src/app/api/ai/comment-pack/route.ts` | 基本1本＋自由3本。上記ポリシーを利用。クライアントは `recentMessages`（直近 user/ai）を送れる。`COMMENT_PACK_SESSION_CONTEXT=0` で会話文脈注入オフ。開発で基本1本のみ＋選曲直後の announce 非表示は `.env.local` に `NEXT_PUBLIC_DEV_MINIMAL_SONG_AI=1` |
| ユーザー趣向（パーソナライズ） | 手動: `user_ai_taste_summary`・`/api/user/ai-taste-summary`。自動: `user_ai_taste_auto_profile`・`POST /api/user/ai-taste-auto-refresh`・`gather-user-taste-signals.ts`・`gemini.generateUserTasteAutoProfile`。合成: `fetchUserTasteContextForChat`（`src/lib/user-ai-taste-context.ts`）→ `@` の `/api/ai/chat` | マイページで手動メモ保存＋「履歴から自動要約を更新」。SQL は `docs/supabase-setup.md` 第 14・15 章 |
| 入室挨拶（参加履歴） | `GET /api/user/join-greeting`・`src/lib/join-greeting-logic.ts` | `user_room_participation_history` で初回／頻回／◯日ぶりを判定。`RoomWithSync` / `RoomWithoutSync` が「おかえり」以外のログイン時に1行目を上書き。SQL は `docs/supabase-setup.md` 参加履歴 |
| 公開用プロフィール | `user_public_profile`・`/api/user/public-profile`・`src/lib/user-public-profile.ts` | マイページで編集。`visible_in_rooms` 時は他ログインユーザーが SELECT 可（部屋 UI 表示は未接続なら別途）。SQL は第 16 章 |
| アーティスト／曲名スナップショット（STYLE_ADMIN） | `POST /api/admin/artist-title-parse-report`・`/admin/artist-title-parse-reports` | チャットの曲紹介・`[NEW]`/`[DB]` 曲解説に「表記メタを記録」ボタン（`STYLE_ADMIN_USER_IDS` かつ `SUPABASE_SERVICE_ROLE_KEY`）。テーブル SQL は `docs/supabase-setup.md` セクション 13 |
| 選曲時のアーティスト／曲名（検証用切替） | `src/lib/youtube-artist-song-for-pack.ts` | 既定は `resolveArtistSongForPackAsync`（概要欄・MusicBrainz 等）。**マイリスト編集と同系の oEmbed 簡易分割だけ**に一時切替するには `.env.local` に `YT_ARTIST_TITLE_MODE=mylist_oembed`（視聴履歴 POST・announce-song・comment-pack・commentary）。比較検証時は `DEBUG_YT_ARTIST=1` でサーバーログに解決結果が出る。宣伝文っぽい長い YouTube タイトルは `shouldSkipAiCommentaryForPromotionalOrProseMetadata`（`format-song-display.ts`）で **曲解説・comment-pack・tidbit 生成をスキップ**（オフは `AI_COMMENTARY_SKIP_PROMO_METADATA=0`） |
| YouTube キーワード検索（UI・`search.list`） | `src/lib/youtube-keyword-search-ui.ts`・`ChatInput`・`RoomWithSync` / `RoomWithoutSync`・`/api/ai/search-youtube`・`/api/ai/paste-by-query` | `NEXT_PUBLIC_YOUTUBE_KEYWORD_SEARCH_DISABLED=1` で検索ボタン・結果モーダル・候補リスト・AI メッセージからの検索導線を非表示。API も `search.list` を返さない。**URL 貼り付け選曲は継続**（`videos.list` 等）。オフ時は削除せず env を外すだけで復帰 |
| Music8 musicaichat JSON（選曲連携用） | `src/lib/music8-musicaichat.ts` | `docs/music8-musicaichat-json-spec.md`。既定で本番ベース URL を使用。オフは `MUSIC8_MUSICAICHAT_BASE_URL=0`。`youtube_to_song.json` はメモリ TTL キャッシュ（`MUSIC8_MUSICAICHAT_INDEX_TTL_MS`、既定 1 時間）。comment-pack・`/api/ai/commentary` で musicaichat 曲 JSON が取れたとき **Gemini プロンプトに `facts_for_ai` ブロックを注入**（`COMMENT_PACK_INJECT_MUSIC8_FACTS=0` で無効化）。**既存 [DB] キャッシュ**は、曲 JSON 取得かつ注入オン時は既定でスキップして再生成（`COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8=0` で再利用のまま）。レスポンスに `music8ModeratorHints`。**AI_TIDBIT_MODERATOR** のみ先頭に `[Music8 …]` 行（`formatMusic8ModeratorIntroPrefix`） |
| 「@」音楽関連の二次判定 | `src/app/api/ai/question-guard-classify/route.ts` ＋ `src/lib/ai-question-guard-prompt.ts` | クライアントでキーワード落ちしたときだけ Gemini。全体オフは `NEXT_PUBLIC_AI_QUESTION_GUARD_DISABLED=1`（警告・退場なし）。分類 API だけ止めるなら `AI_QUESTION_GUARD_GEMINI=0`。異議・チューニング報告は `docs/supabase-setup.md` 11.1 / 11.2 |
| AI 質問ガード（退場のみ免除） | `src/lib/ai-question-guard-exempt-user-ids.ts` | 指定した登録ユーザーは警告・カードは通常どおり。累積後の自動退場・入室禁止だけスキップ（`RoomWithSync` / `RoomWithoutSync`） |
| 会 live の在室 0 自動終了 | `src/lib/empty-live-gathering-cron.ts`・`GET /api/cron/end-empty-live-gatherings`・`vercel.json` | Ably presence と `room_live_presence_watch`（SQL は `docs/supabase-setup.md` 9.1）。Vercel では **`CRON_SECRET`**（`Authorization: Bearer`）必須。任意 **`EMPTY_LIVE_GATHERING_END_MS`**（ミリ秒、最小 60000） |

### 設計メモ（拡張予定）

- **視聴履歴**: スタイル・時代・アーティスト抽出の整理と今後の DB/API 展開 → `docs/room-playback-history-style-era-artist-design.md`
- **DB に記録できる項目一覧**（テーブル別） → `docs/recorded-data-fields.md`
- **Music8 曲 JSON**（WP 固定 `id`・URL 規則・マスタ連携メモ） → `docs/music8-song-json-schema.md`
- **マイリスト**（チャット非依存・拡張連携・企画） → `docs/my-list-spec.md`。**実装**: `src/app/api/my-list/route.ts`、DB `docs/supabase-user-my-list-table.md`、アーティスト参照（正規化）用 `docs/supabase-user-my-library-artists-tables.md`
- **曲・アーティスト DB 項目**（基本／拡張） → `docs/song-artist-db-fields.md`

### Chrome 拡張（YouTube → 発言欄・任意）

- **概要・ロードマップ**: `docs/chrome-extension-musicaichat.md`
- **拡張本体**: `extensions/musicaichat-youtube-helper/`（読み込み手順は同梱の `INSTALL.txt`）
- **アプリ側の受け口**: `src/lib/musicai-extension-events.ts` のイベント名と `ChatInput` のリスナー（イベント名は拡張の `service-worker.js` と一致させる）

## コマンド

```bash
npm install
npm run dev          # http://localhost:3002
npm run lint
npm run test         # 単体テスト（MusicBrainz + ai-output-policy）
npm run validate     # UTF-8 検証 + lint + 型チェック + test
npm run verify:utf8  # src 以下のソースが UTF-8 かだけ確認（ビルド前の早期検知）
npm run verify:utf8:fix  # 破損ファイルを git HEAD から復元（未コミット変更は失われる）
```

- **ビルドが「stream did not contain valid UTF-8」で落ちる**ときは、多くの場合ディスク／同期ツール由来の**ソース破損**です。
  - まず **`npm run verify:utf8:fix`**（`git checkout` で追跡分を戻し、NUL 混入のみのファイルは除去を試みる）。
  - それでも失敗する場合は **ファイルがランダムバイナイ化**している可能性が高い。バックアップから戻すか、**リモートの正常なツリーで上書き**（例: `git fetch` のうえ `git checkout origin/main -- path/to/file`）または **リポジトリをクリーンに再クローン**。
  - **再発防止**: 対象ドライブで **`chkdsk /f`**、プロジェクトを **OneDrive 等の同期フォルダ外**に置く、ウイルス対策の除外設定を検討。

- MusicBrainz のネットワークスモーク: `MUSICBRAINZ_SMOKE=1` 時のみ `test:mb` 内で実行（`MUSICBRAINZ_USER_AGENT` 必須）。

## コーディング規約（要点）

- 既存の命名・import スタイルに合わせる。**依頼範囲外のリファクタはしない。**
- ユーザーが明示しない限り **新規のドキュメント MD を増やさない**（既存 `docs/` の更新はタスクに応じて可）。

## NEVER（無断でやらないこと）

- **`.env*` の編集・コミット**、API キー・Service Role の貼り付け。
- **`node_modules/` の手編集**。
- **既存テストの削除**（置き換えが明確な場合のみ可）。
- **プロンプトと無関係な本番 DB・CI の無承認変更**。

## 品質改善の流れ

- AI コメントの誤りパターンは `docs/feedback-and-ai-improvement-todo.md` と `docs/ai-chat-improvement-plan.md` を参照。
- 荒らし対策・モデレーションの今後の課題は `docs/abuse-moderation-future-tasks.md` を参照。
- ポリシー（正規表現）を変えたら **`src/lib/ai-output-policy.unit-test.ts` にケースを追加**し、`npm run validate` を通すこと。
