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
| 曲解説パック API | `src/app/api/ai/comment-pack/route.ts` | 基本1本＋自由3本。上記ポリシーを利用。開発で基本1本のみ＋選曲直後の announce 非表示は `.env.local` に `NEXT_PUBLIC_DEV_MINIMAL_SONG_AI=1` |
| 「@」音楽関連の二次判定 | `src/app/api/ai/question-guard-classify/route.ts` ＋ `src/lib/ai-question-guard-prompt.ts` | クライアントでキーワード落ちしたときだけ Gemini。無効化は `AI_QUESTION_GUARD_GEMINI=0`。異議データの活用手順は `docs/supabase-setup.md` 11.1 |
| AI 質問ガード（退場のみ免除） | `src/lib/ai-question-guard-exempt-user-ids.ts` | 指定した登録ユーザーは警告・カードは通常どおり。累積後の自動退場・入室禁止だけスキップ（`RoomWithSync` / `RoomWithoutSync`） |

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
