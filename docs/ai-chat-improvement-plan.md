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

## 2026-03-30 実施メモ（今回の改善）

### 1) チャット運用の静音化（参加者同士の会話を優先）

- 目的: 参加者同士の短い雑談（「いいね」「私も」など）に AI が割り込んでログが散らかる問題を抑える。
- 実装:
  - `src/app/api/ai/chat/route.ts` で `chat_reply` の発火条件を厳格化。
  - 通常雑談・短文リアクションは AI 無応答（`skipped: true`）にする。
  - 質問・情報要求系のみ応答対象にする。
  - `AI` / `@ai` / `AIに質問...` など、AI への明示呼びかけは優先して応答する。
  - `src/components/room/RoomWithSync.tsx` / `src/components/room/RoomWithoutSync.tsx` で `skipped: true` をエラー扱いしないよう変更（「AIが応答できませんでした」を出さない）。
- 効果:
  - 雑談時の AI ノイズが減り、会話ログの可読性が向上。
  - 「必要なときだけ AI を呼ぶ」運用に近づいた。

### 2) 曲紹介の選曲者名誤り修正（skip 後の次曲アナウンス）

- 目的: `skip` で次曲へ進んだ際、紹介文の「〇〇さんの選曲です」の名前がずれる問題を解消。
- 実装:
  - `src/components/room/RoomWithSync.tsx` のアナウンス生成処理で、次曲の `publisherClientId` から表示名を解決して `announce-song` API に渡すよう修正。
  - `queueSong` 受信時に `publisherClientId` 欠落ケースを `message.clientId` でフォールバック。
- 効果:
  - `skip` 後の次曲アナウンスで、実際の選曲者名が表示されるようになった。

### 3) 管理画面のコスト可視化強化（テスト運用向け）

- 目的: テスト運用段階で、AI 利用料の概算を「期間」「1曲」「機能別」で見える化する。
- 実装:
  - `src/app/api/admin/gemini-usage/route.ts` で `byModel` 集計を追加。
  - `src/app/admin/gemini-usage/page.tsx` で以下を追加:
    - 期間内の概算料金（USD / 円）
    - 1曲あたり概算（`comment_pack_base` 回数で換算）
    - 種別ごとの概算料金（USD / 円）
    - モデル列表示（直近ログ）
    - テスト運用向け試算ツール（想定月間曲数 / MAU / 安全係数）
  - 円換算レートを `1 USD = 160 JPY` に更新、円表示を見やすく強調。
- 効果:
  - 「現状の運用でどれくらいコストがかかるか」を画面内で即把握可能。
  - 500曲・30人など、運用シナリオの試算がしやすくなった。

### 4) 現時点の運用方針（合意事項）

- AI の主な役割は「進行補助 + 曲紹介 + コメントパック + AI 宛て質問への回答」。
- 参加者同士の通常会話には原則介入しない。
- 必要時は `AI` / `AIに質問` を明示して呼ぶ。

---

*初版: フェーズ A 実装時に作成*
