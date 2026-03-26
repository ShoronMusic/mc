# 曲解説チャット AI — 精度・信用度向上の実践プラン

[Qiita: AIエージェントが「最初から戦力になる」リポジトリ設計](https://qiita.com/akira_papa_AI/items/0385b6d1468e6d564b50) の考え方（**文脈の質**・**NEVER の明示**・**検証可能**・**テストを仕様にする**）を、本プロダクト向けに落とし込んだ改善計画です。

---

## 記事の要点と対応関係

| 記事の柱 | 本プロダクトでの意味 |
|---------|---------------------|
| AGENTS.md / ルート文書 | 人間・コーディングAIが「プロンプトの正」「禁止事項」「コマンド」を共有する |
| NEVER | 生成文の**根拠なしチャート/受賞/バズ表現**などをコードで弾く（`ai-output-policy`） |
| ワンコマンド検証 | `npm run validate` で lint・型・単体テストを一括実行 |
| テスト＝仕様 | ポリシー関数に**通過/却下の例**を固定し、変更時の退行を防ぐ |

---

## フェーズ A（短期）— **実施済み**

| # | 内容 | 状態 |
|---|------|------|
| A1 | ルートに `AGENTS.md` を置き、プロジェクトの心臓・禁止事項・コマンドを記載 | 実施済み |
| A2 | `src/lib/ai-output-policy.ts` にチャット/tidbit 用と comment-pack 自由コメント用の判定を集約 | 実施済み |
| A3 | `src/lib/ai-output-policy.unit-test.ts` で単体テスト | 実施済み |
| A4 | `package.json` の `test`（既存 MB テストと連結）と `validate` を追加 | 実施済み |
| A5 | フィードバックループは `docs/feedback-and-ai-improvement-todo.md` の F3 と連携（運用で NEVER/正規表現を育てる） | ドキュメント参照 |

**関連ファイル**

- `AGENTS.md`
- `src/lib/ai-output-policy.ts`
- `src/lib/ai-output-policy.unit-test.ts`
- `src/lib/gemini.ts`（上記モジュールを import）
- `src/app/api/ai/comment-pack/route.ts`（上記モジュールを import）

---

## フェーズ B（中期）

| # | 内容 |
|---|------|
| B1 | チャート年・受賞など**検証済み事実**を API/DB から渡し、モデルは文体化に寄せる |
| B2 | ユーザー向けに「事実（DB/外部）」「AI補足」の見える化や短い出典枠の設計 |
| B3 | comment-pack の `metaLockBlock` 連鎖を、**要約した禁止重複リスト**などに圧縮してノイズ削減 |

---

## フェーズ C（継続）

| # | 内容 |
|---|------|
| C1 | 代表曲・禁止パターンのゴールデンセットで回帰テスト（CI 任意） |
| C2 | `src/lib/` や `src/app/api/ai/` に短い README（責務の境界） |

---

## すぐできる運用（全フェーズ共通）

1. 誤生成パターンが出たら `comment_feedback` やログを確認する（`docs/feedback-and-ai-improvement-todo.md`）
2. `ai-output-policy.ts` の正規表現またはプロンプトを更新し、**必ず `npm run validate` を通す**
3. 新しい禁止パターンには **単体テストのケースを1件追加**する

---

*初版: フェーズ A 実装時に作成*
