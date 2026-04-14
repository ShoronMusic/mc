# Gemini vs Gemma 比較検証レポート（2026-04-14）

## 対象ログ
- `log/gemini__解説_テスト.txt`
- `log/Gemma_解説_テスト.txt`
- `log/gemini__質問_テスト.txt`
- `log/Gemma_質問_テスト.txt`

## 結論
- 本検証では、ユーザー向けの本文品質・応答速度ともに `gemini-2.5-flash` が優位。
- `gemma-4-26b-a4b-it` は思考/自己チェック文の混入が多く、手動除外や後処理の運用負荷が高い。
- @質問（`chat_reply`）の応答時間は Gemma が 1〜3 分台で、リアルタイム会話には不利。

## 1. 曲解説（comment-pack）比較

### 1-1. 応答時間
- Gemini
  - `comment_pack_base`: `12094ms`
  - `comment_pack_frees`: `8517ms / 8941ms / 8943ms`
- Gemma
  - `comment_pack_base`: `52704ms`
  - `comment_pack_frees`: `54126ms / 77936ms / 117770ms`

所見:
- Gemma は free 枠で最大 117 秒超。体感遅延が大きい。

### 1-2. 出力品質
- Gemini: 4本とも自然な日本語本文として成立（メタ混入なし）。
- Gemma: 以下の混入を複数確認。
  - `* *Wait, let's ...*`
  - `Character count: ...`
  - `*Option 1* / *Refined Version*`
  - 自己評価・禁止事項チェック文（英語）

所見:
- Gemma は「チャット表示用本文だけを返す」遵守率が低く、`NG（DBから外す）` が多発。

## 2. @質問（chat_reply）比較

### 2-1. 応答時間
- Gemini (`/api/ai/chat`): `8641ms / 11397ms / 18371ms`
- Gemma (`/api/ai/chat`): `119113ms / 186763ms / 93987ms`

所見:
- Gemini は 8〜18 秒帯、Gemma は 94〜186 秒帯。

### 2-2. 回答品質
- Gemini
  - 「デビュー曲」「ライバル」「人気曲」に自然な回答。
  - 思考メモ混入なし。
- Gemma
  - `ready.` 接頭、`*Wait, let's refine...*` などが混入。
  - 引用符・重複を含む崩れた回答あり。
  - `question_guard_classify` でタイムアウト表示（`判定がタイムアウトしました`）を確認。

## 3. 補助判定（extract_song_search）
- Gemma 側で不自然な intent 抽出を確認。
  - 例: `query: '* Input:'`
- Gemini 側は同種質問で `no intent` が多く、@チャット回答へ自然にフォールバック。

## 4. 総合評価
- **本番主系統**: `gemini-2.5-flash` 推奨。
- **Gemma の推奨用途**: 限定的な検証枠、または後処理強化を前提にした内部用途。

## 5. 運用提案
1. 本番は `GEMINI_GENERATION_MODEL=gemini-2.5-flash` を維持。
2. Gemma は `GEMINI_MODEL_SECONDARY` + `GEMINI_USE_SECONDARY_FOR` で限定導入（例: 検証系コンテキストのみ）。
3. Gemma 継続検証時は、`src/lib/gemini-gemma-host.ts` の `polishGemmaModelVisibleText` で漏れパターンを都度追加。
4. 評価軸を固定して再計測（平均/95p レイテンシ、メタ混入率、手動NG率、再試行率）。

## 6. 参考実装メモ
- Gemma 後処理パイプラインは `src/lib/gemini-gemma-host.ts` の `polishGemmaModelVisibleText` を中心に実装済み。
- `extractTextFromGenerateContentResponse` で Gemma モデル時に同パイプラインを通す構成。
