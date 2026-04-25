# AIエンジン段階設計 実装ガイド

このドキュメントは、`ChatGPT→ハイブリッド→独自LLM` の段階計画を、実装・運用で使える形に固定したものです。  
計画本文は別管理とし、ここでは「実装済みの基準」を扱います。

## 1. フェーズ1（外部LLM）MVP要件

実装定義: `src/lib/ai-engine-phases.ts` の `PHASE1_MVP_SPEC`

- 1キャラ固定（`hype_companion_v1`）
- 役割は「盛り上げ役」
- 会話参加と選曲提案を有効
- 90秒クールダウン + 10分あたり最大4回の自動発話
- URL直生成は禁止（検索結果由来のみ）
- 評価シグナル（役立った/うるさい）を利用
- モデレーションガード有効

## 2. KPI と Go/No-Go 閾値

実装定義:
- 閾値: `PHASE1_DEFAULT_GATES`
- 判定: `evaluatePhase1GoNoGo()`

初期閾値（暫定）:

- 会話継続率: 0.60 以上
- 選曲提案採用率: 0.18 以上
- ネガティブ評価率: 0.20 以下
- アクティブルーム当たり推論コスト: 45円 以下

運用ルール:

- 週次で観測値を集計し、`evaluatePhase1GoNoGo()` で判定
- fail 項目があれば、モデル切替の前にプロンプト・頻度制御・検索再ランクを優先改善

## 3. フェーズ2（ハイブリッド）優先順位

実装定義: `PHASE2_HYBRID_PRIORITIES`

優先順:

1. `persona_memory`  
   短期文脈 + 長期要約の一貫制御
2. `song_suggestion_orchestration`  
   検索候補の再ランク + 理由生成
3. `room_context_rules`  
   ターン順/沈黙介入/空気読みのルール化

## 4. フェーズ3（独自LLM）開始判定

実装定義: `evaluateCustomLlmReadiness()`

トリガー条件（どちらか）:

- 月間推論コスト 250,000円以上
- 外部モデル人格再現スコア 0.70 未満

開始の必須要件（すべて）:

- 学習データガバナンス準備完了
- 評価パイプライン準備完了
- フェイルオーバー準備完了

判定式:

- トリガー成立 `AND` 運用準備完了 → フェーズ3開始
- それ以外 → フェーズ2継続

## 5. 使い方（開発者向け）

- 日次/週次の集計ジョブで観測値を作る
- `evaluatePhase1GoNoGo()` でフェーズ1継続可否を判定
- 月次レビューで `evaluateCustomLlmReadiness()` を評価
- `reasons` をそのまま運用メモに転記し、次アクションを決める

## 6. 管理API（実装済み）

- エンドポイント: `GET /api/admin/ai-engine-phase-readiness?days=7`
- 月次判定期間: `monthlyDays`（既定30日。例: `?days=7&monthlyDays=30`）
- 権限: `STYLE_ADMIN_USER_IDS` + ログイン必須（他 admin API と同等）
- 返却内容:
  - `observed`: フェーズ1の観測値
  - `phase1Gate`: 閾値付きの pass/fail 判定
  - `phase3Readiness`: 独自LLM開始可否（準備不足理由を含む）
  - `sampleSize`: 集計に使った件数

注記:

- `suggestionAdoptionRate` は `next_song_recommend` への upvote 比率を代理指標として算出
- `externalModelPersonaFitScore` は `chat_reply` の upvote 比率を代理指標として算出
- `monthlyInferenceCostJpy` は `gemini_usage_logs` の `monthlyDays` 期間集計から概算算出
