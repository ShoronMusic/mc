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
npm run validate     # lint + 型チェック + test
```

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
