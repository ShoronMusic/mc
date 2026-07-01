# AI 有料サービス参考事例（音楽以外）

最終更新: 2026-06-30  
用途: **Phase 4 課金設計**・`docs/monetization-options.md` の外部ベンチマーク。価格は各社公開情報の**目安**（為替・改定で変動）。

関連:

- 自プロダクトの課金型整理: `docs/monetization-options.md`
- 開催履歴 × AI 帰属プロジェクト: `docs/room-gathering-history-and-ai-billing-project.md`
- 参加者向け料金目安（実装）: `src/lib/song-selection-cost-guide.ts`

---

## 概要

2024〜2026年は、音楽に限らず **「AI を核にした有料プラン」** が一般化している。ただし課金の形は大きく分かれ、**無制限サブスクだけ**にすると API 原価と乖離しやすい。業界では **定額 + 回数/クレジット上限** のハイブリッドが標準化しつつある（[RevenueCat: AI とハイブリッドマネタイズ](https://www.revenuecat.com/jp/blog/growth/ai-hybrid-monetization/) 等）。

musicaichat が示している **1曲あたり約 ¥1.4〜¥3.6（原価+2割の参考）** は、Duolingo Max や Character.AI c.ai+ のような **月額食べ放題** より **従量に近い単位** で、将来のクレジット制と整合しやすい。

---

## 課金モデルの型（他業界共通）

| 型 | 内容 | 向いている原価構造 | 代表例 |
|----|------|-------------------|--------|
| **定額サブスク** | 月額/年額で機能パック | 原価が予測可能、または上限付き | ChatGPT Plus、Duolingo Max |
| **既存サービスへの AI 上乗せ** | 本体プラン + AI ティア | 既存 LTV の上にプレミアム化 | Canva Pro、Adobe CC + Firefly |
| **クレジット / 回数券** | 生成・利用ごとに消費 | 1回あたり API 原価が明確 | Runway、Adobe Firefly クレジット |
| **ハイブリッド** | 無料枠 + 月額 + 従量/クレジット | AI 原価がユーザーごとにバラつく | 多くの生成 AI アプリ（2025〜） |

自プロダクト向けの整理は `docs/monetization-options.md` の「収益モデルの型」「ハイブリッド」を参照。

---

## 1. 汎用 AI アシスタント・業務ツール

月 **$10〜$30（約 1,500〜4,500 円）** 帯に集中。ヘビーユーザー・法人向けに **$200/月** 級もある。

| サービス | 分野 | 目安（月額） | メモ |
|----------|------|--------------|------|
| [ChatGPT Plus / Go](https://openai.com/chatgpt/pricing/) | 汎用チャット | 約 $20 | 画像・Deep Research・カスタム GPT 等 |
| [Claude Pro / Max](https://www.anthropic.com/pricing) | 汎用チャット | $20〜$200 | 長文・エージェント。業務向け Max は高単価 |
| [Gemini Advanced / Google AI Pro](https://one.google.com/about/google-ai-plans/) | 汎用 + Google 連携 | 約 $20 / ¥1,200〜 | Workspace・NotebookLM 連携 |
| [Microsoft Copilot Pro](https://www.microsoft.com/microsoft-365-copilot/pricing) | Office 連携 | 約 $20 | Word/Excel/PowerPoint 内 AI |
| [Notion AI](https://www.notion.so/product/ai) | ドキュメント | 約 $10/人 | Notion ユーザー向け上乗せ |
| [Perplexity Pro](https://www.perplexity.ai/pro) | 検索・調査 | 約 $20 | 出典付き回答 |
| [GitHub Copilot](https://github.com/features/copilot/plans) | コード | $10〜 | 開発者定番 |
| [Cursor](https://cursor.com/pricing) | コードエディタ | $20〜 | AI ネイティブ IDE |

**示唆**: 「AI そのもの」を月額で売る市場は既に成熟。**上限・モデル tier・速度** で差別化。

---

## 2. クリエイティブ（画像・動画・音声）

| サービス | 分野 | 目安 | メモ |
|----------|------|------|------|
| [Midjourney](https://www.midjourney.com/home) | 画像生成 | $10/月〜 | サブスク + 生成量の段階 |
| [Adobe Firefly / Creative Cloud](https://www.adobe.com/products/firefly.html) | 画像・デザイン | CC サブスク + クレジット | 商用利用・Photoshop 連携 |
| [Canva Pro](https://www.canva.com/pricing/) | デザイン | 年額換算で低〜中 | AI は Pro 内の付加機能 |
| [Runway](https://runwayml.com/pricing) | 動画生成 | $12/月〜 | 月額 + 生成クレジット |
| [ElevenLabs](https://elevenlabs.io/pricing) | 音声合成 | $6/月〜 | 文字数・クレジット制 |

**示唆**: **月額 + クレジット** が主流。無制限生成の定額は少ない。

---

## 3. 学習・教育

| サービス | 目安 | AI 機能 | メモ |
|----------|------|---------|------|
| [Duolingo Max](https://www.duolingo.com/) | 約 $30/月（Super より上乗せ） | GPT-4 会話（Roleplay）、Explain My Answer、Video Call | **既存ゲーミフィケーション学習 + AI プレミアム tier** の典型 |
| （各種語学アプリ） | 月数百〜数千円 | AI 添削・会話 | 本体無料/安価 + AI は Max 相当 |

**示唆**: musicaichat に近いのは **「体験本体は無料/既存、AI だけ高単価 tier」** の構造。1 回の AI 会話より **月額パッケージ** で売っている点は異なる。

---

## 4. AI コンパニオン・チャット（ゲーム的ロールプレイ含む）

| サービス | 目安（月額） | 無料枠 | 有料の価値 |
|----------|--------------|--------|------------|
| [Character.AI c.ai+](https://character.ai/subscribe) | $9.99 | 基本チャットは無料 | 高速応答、広告なし、音声、上位モデル |
| Replika Pro | 約 $20 | 制限あり | 音声通話、関係性モード、3D |
| 各種 companion アプリ | $5〜$20 | アプリにより差大 | メモリ拡張、画像生成、優先アクセス |

**示唆**: **無料でコア体験 + Plus で快適さ・上限緩和**。会話 1 回あたり課金ではなく **サブスク** が多い。

---

## 5. スマホ消費者アプリ（日本含む）

| アプリ | 分野 | 目安 | メモ |
|--------|------|------|------|
| [EPIK](https://apps.apple.com/jp/app/epik/id1577705074) | 写真・動画編集 | PRO 約 ¥900/月 | AI 肌補正・切り抜き・フィルター |
| CapCut 等 | 動画 | Pro 内 | AI 編集は上位プラン |
| Scringo 等 | 翻訳 | Pro 約 ¥790/月 | 無料は回数制、Pro で無制限 |
| ChatGPT / Gemini アプリ | 汎用 | 各社 Plus 相当 | 日本でも月額プランあり |

**示唆**: **低単価月額（¥500〜¥1,500）** と **無料の回数制限** の組み合わせが多い。

---

## 6. ゲーム（AI NPC・生成 AI）

### 現状

| 事例 | 状態 | 課金 |
|------|------|------|
| Ubisoft **Teammates / NEO NPC** | R&D・プレイテスト段階 | **有料サブスクとして未提供**（[GamesIndustry](https://www.gamesindustry.biz/ubisofts-ai-npc-project-can-now-deliver-sarcastic-gms-helpful-team-mates-and-hidden-lore-and-is-being-played-now)、[Ubisoft News](https://news.ubisoft.com/en-us/article/3mWlITIuWuu0MoVuR6o8ps/ubisoft-reveals-teammates-an-ai-experiment-to-change-the-game)） |
| AI NPC 会話全般 | 実験・デモ多数 | **1 会話 = API 原価** のため、サブスク化 or **回数制限** が論点（[Game File 分析](https://www.gamefile.news/p/ai-npcs-ubisoft-convai-money)） |

### ゲーム周辺の有料例（AI そのものではないが参考）

| 事例 | 内容 |
|------|------|
| [Roblox Plus](https://about.roblox.com/ja/ja-newsroom/2026/04/introducing-roblox-plus-subscription) | 月 $4.99。プラットフォーム定額 + クリエイター還元 |
| Duolingo Max | ゲーミフィケーション + AI |
| Character.AI | キャラ会話（ゲーム IP 風含む） |

**示唆**: **大作ゲーム本編に「AI 会話サブスク」を載せた商用例はまだ少ない**。musicaichat の **同期ルーム × 選曲 1 回 = AI バンドル** は、ゲームより **Duolingo / 従量クレジット** に近い設計空間。

---

## 7. ハイブリッドマネタイズの潮流（2025〜2026）

AI 導入でサブスクの **変動費がゼロではなくなった** ため、次の組み合わせが増えている。

1. **無料 + 日次/月次上限**（回数・トークン・生成数）
2. **月額 Pro**（広告なし・高速・上位モデル・上限拡大）
3. **クレジット追加購入**（超過分）

参照: [RevenueCat — AI とハイブリッドマネタイズ](https://www.revenuecat.com/jp/blog/growth/ai-hybrid-monetization/)

---

## musicaichat との対応関係（メモ）

| 他社パターン | musicaichat の現状 / 候補 |
|--------------|---------------------------|
| 月額食べ放題（Duolingo Max 型） | `monetization-options.md` の **月 1,000 円・300 曲上限** シミュレーション |
| クレジット / 1 曲単位（Runway 型） | **1 曲 ≈ 1〜2 クレジット**（NEW/DB 極）、**30 円/曲** 暫定案 |
| 無料 + AI だけ有料 | **選曲者単位 `aiMode`**（`monetization-options.md` の混在ルーム案） |
| 参考料金の透明性 | 参加者向け **原価+2割** 目安（`song-selection-cost-guide.ts`）。**「Gemini」表記なし** |
| ゲーム型 AI NPC | 未商用が多い。**1 選曲バンドル課金** の方が説明しやすい |

---

## 価格帯のざっくり比較（参考）

| 単位 | 他社の目安 | musicaichat（参考料金・2割増） |
|------|------------|--------------------------------|
| 月額サブスク | ¥900〜¥4,500（一般）、¥3,000〜（Max 級） | シミュレーション: **¥1,000/月・300 曲** |
| 1 回の AI 体験 | 明示単価は少ない（サブスク内） | **約 ¥1.4〜¥3.6 / 曲**（フル AI バンドル） |
| @ 質問 1 回 | サブスク内 | **約 ¥0.4〜¥0.5**（目安） |

---

## 更新・メンテ

- 各社の価格改定時は **公式 pricing ページ** を優先して本 MD を更新する。
- 自プロダクトの原価試算を変えたら `docs/room-gathering-history-and-ai-billing-project.md` と `src/lib/infra-cost-estimates.ts` を先に同期する。
- Phase 4 で商品を決めたら、本 MD の「musicaichat との対応」に **採用/不採用** を追記する。
- お試し10曲・選曲のみ無料の実装正本: **`docs/00-ai-trial-and-billing-implementation.md`**

---

## 参考リンク

- OpenAI ChatGPT pricing: https://openai.com/chatgpt/pricing/
- Character.AI subscribe: https://character.ai/subscribe
- Duolingo Max（解説記事例）: https://artificial-intelligence-wiki.com/industry-ai/ai-in-education/duolingo-max-complete-guide/
- Ubisoft Teammates: https://news.ubisoft.com/en-us/article/3mWlITIuWuu0MoVuR6o8ps/ubisoft-reveals-teammates-an-ai-experiment-to-change-the-game
- AI NPC のコスト論点: https://www.gamefile.news/p/ai-npcs-ubisoft-convai-money
- RevenueCat ハイブリッド: https://www.revenuecat.com/jp/blog/growth/ai-hybrid-monetization/
