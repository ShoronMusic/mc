# OpenRouter 検討メモ（Gemini 代替・コスト／無料化）

洋楽AIチャット（musicaichat）は現状 **Google Gemini**（`@google/generative-ai`）を中核に利用している。運用コストを抑え、**できる限り無料**を目指す場合に **OpenRouter** が有効か整理したメモ。

## 結論（要約）

- **OpenRouter の Free プランだけで本番を賄うのは現実的ではない**（公式の日次リクエスト上限が小さい。チャット＋曲解説＋周辺AIで即枯れる）。
- **`openrouter/free` のような無料ルーター**はモデルが変わり品質・日本語・レイテンシがブレやすく、プロダクト品質の主軸には不向き。
- **技術的には OpenRouter（OpenAI 互換 API）への移行や併用は可能**だが、`gemini.ts` 集約の差し替え・ログ・後処理の見直しなど**中〜大規模の実装**が必要。
- **コスト最適化**（安価モデルへのピン留め、フェイルオーバー、開発環境のみ無料枠）として OpenRouter を検討するのは合理的。

## 現状実装の前提（コードベース）

- 生成は主に `src/lib/gemini.ts` の `GoogleGenerativeAI` → `getGenerativeModel` → `generateContent`。
- モデル ID は `src/lib/gemini-model-routing.ts`（例: 既定 `gemini-2.5-flash`、`GEMINI_GENERATION_MODEL` で上書き）。
- Gemma（hosted）向けのパラメータ・出力サニタイズは `src/lib/gemini-gemma-host.ts` 等。
- JSON 出力は多くが **プロンプト指示＋テキストからのパース**（Gemini 専用 `responseSchema` への強依存は限定的に見える）。一方、モデルごとのノイズ対策は Gemini／Gemma 前提のコードが存在する。

## OpenRouter の「無料」枠（公式情報の整理）

出典: [OpenRouter Pricing](https://openrouter.ai/pricing)（閲覧時点の表記に依存するため、導入前に再確認すること）。

| 項目 | 内容 |
|------|------|
| Free プランのレート | **50 リクエスト／日**（表記上のプラン比較表） |
| 無料モデル | **25+** の無料モデル、`openrouter/free` 等 |
| Pay-as-you-go | クレジット購入、モデルごとのトークン課金＋プラットフォーム手数料など |
| FAQ | 無料モデル利用の上限例（クレジット額と RPM 等）の記載あり。条件は変更され得る |

### Free Models Router（`openrouter/free`）

出典: [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router)

- リクエストに必要な能力（画像・ツール・structured outputs 等）に応じて**無料モデルからフィルタ**し、その中から**ランダム選択**。
- **コストゼロ**だが、**どのモデルが当たるか制御しにくい**、無料枠特有の混雑・不安定さの記載あり。

## 本プロダクトとの適合度

### トラフィック・呼び出し回数

チャット返答、曲解説、comment-pack、質問ガード分類、曲クイズ、お題講評、趣向自動要約など、**1 回のユーザー操作に対して複数の生成 API** が走り得る。日 50 回上限では**本番利用を想定できない**。

### 技術面

- OpenRouter は **OpenAI 互換 `POST /v1/chat/completions`**。現状の `@google/generative-ai` とは API 形が異なる。
- 移行・併用には例えば次が必要:
  - プロバイダ非依存の **テキスト生成レイヤ**（または OpenRouter 専用クライアント）の導入
  - `persistGeminiUsageLog` 等の **用途ログ・モデル名**の整理（名称はプロバイダ横断にするか併記するか）
  - 非 Gemini モデル向けに **プロンプト／出力後処理**（現状の Gemma 向け対策の置き換え・追加）
- JSON 系はプロンプト＋パースが中心なら**移植しやすい**一方、**品質とパース成功率**はモデル依存で再検証が必要。

## 推奨する検討の進め方

1. **「完全無料の本番」**をゴールにする場合: OpenRouter Free のみでは足りず、**別のクォータ・契約・収益モデル**の前提が必要。
2. **「コスト削減」**をゴールにする場合: OpenRouter で **安価モデルを明示的に指定**する、または **開発／ステージングのみ無料枠**を使う、が現実的。
3. **リスク低減**: 本番は Gemini のまま、**特定経路だけ** OpenRouter で試す（A/B やシャドウ）など段階導入。

## 参考リンク

- [OpenRouter Pricing](https://openrouter.ai/pricing)
- [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router)
- プロジェクト内: `AGENTS.md`（Gemini 周りの環境変数・機能一覧）、`src/lib/gemini.ts`、`src/lib/gemini-model-routing.ts`

---

*この文書は検討時点の整理であり、OpenRouter／各プロバイダの料金・上限は公式サイトの最新情報に従うこと。*
