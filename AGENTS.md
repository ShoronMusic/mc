# AGENTS.md — musicaichat（洋楽チャット）

コーディング AI・新メンバー向けのプロジェクト取扱説明書です。

## 概要

- **Next.js 14**（App Router）、**TypeScript**、ルーム同期チャット＋YouTube 選曲＋曲解説（Gemini）。
- 本番・開発の秘密情報は **`.env.local`**（コミット禁止）。

## 心臓部（触るときはここを読む）

| 領域 | パス | 説明 |
|------|------|------|
| Gemini プロンプト | `src/lib/gemini.ts` | チャット返答、tidbit、選曲クエリ抽出、曲解説、スタイル分類 |
| 生成文ポリシー | `src/lib/ai-output-policy.ts` | 根拠なしチャート/バズ等の**再生成判定**（変更時は単体テスト必須） |
| 曲解説パック API | `src/app/api/ai/comment-pack/route.ts` | 基本1本＋自由3本。上記ポリシーを利用 |

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
- ポリシー（正規表現）を変えたら **`src/lib/ai-output-policy.unit-test.ts` にケースを追加**し、`npm run validate` を通すこと。
