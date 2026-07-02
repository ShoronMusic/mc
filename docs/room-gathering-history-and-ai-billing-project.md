# チャット開催履歴 × AI 課金帰属 — 継続実装プロジェクト

最終更新: 2026-06-30  
ステータス: **Phase 1–3 完了（管理モニタリング・原価試算） / Phase 4 未着手**

## 目的

1. **12 時間スロット（06:00–18:00 / 18:00–06:00）× 部屋**単位で開催・利用を日次モニタリングする（**会終了不要**）。マイページ参加履歴と同じ境界。
2. **AI（Gemini）・YouTube API・Ably（推定）** の原価を、課金設計に使える形で集計する。
3. **オーナー負担 / ログインユーザー負担 / ゲストが享受できる範囲** をルール化し、参加者にも明示する。

補助: **会（gathering）終了時**に `room_gathering_snapshots` へ 1 行保存（滅多に発生しない環境では主軸にならない）。

関連:

- Gemini ログ SQL: `docs/supabase-gemini-usage-logs-table.md`
- 開催スナップショット SQL（Phase 2）: `docs/supabase-room-gathering-snapshots-table.md`
- 有料化の型: `docs/monetization-options.md`
- **⭐ AI お試し10曲・実装マスタ**: `docs/00-ai-trial-and-billing-implementation.md`
- **⭐ プリペイド価格・損益**: `docs/00-prepaid-pricing-summary.md`
- 他業界 AI 有料事例: `docs/ai-paid-service-reference-examples.md`
- 会（live session）仕様: `docs/room-live-session-spec.md`

---

## 進捗サマリー（2026-06-30 時点）

| 領域 | 状態 | 備考 |
|------|------|------|
| 帰属ルール・ログ INSERT | ✅ 完了 | `billing_kind` / `gathering_id` / `billing_user_id` 等 |
| 部屋 UI の無料明示 | ✅ 完了 | `AiUsageBillingNotice` |
| マイページ個人 AI 利用量 | ✅ 完了 | 参加履歴タブ（トップレベル） |
| マイページ personal / roomCommon 分割 | ✅ 完了 | 主催者は部屋共通 AI 内訳も表示 |
| AI 3分類（解説 / @ / 他）と割合表示 | ✅ 完了 | 月次・各参加セッション |
| 管理ダッシュボード 5 カテゴリタブ | ✅ 完了 | `admin-sections.ts` · `AdminDashboardTabs` |
| 管理 `/admin/gathering-history`（12h スロット） | ✅ 完了 | Gemini + YT クォータ¥ + Ably 推定 + 合計 |
| 管理 `/admin/user-billing-usage` | ✅ 完了 | `billing_user_id` · 主催部屋 YT/Ably 帰属 |
| 管理 `/admin/user-ai-trial` | ✅ 完了 | お試し残数・状態・IP・消費ログ（`user_ai_trial`） |
| 管理 `/admin/room-cost-summary` | ✅ 完了 | 部屋別・主催者別原価サマリー |
| 会終了時スナップショット集計 | ✅ コード完了 | **補助**（live のままの会が多い環境では行が増えない） |
| 過去会の遡及スナップショット | ❌ 未実装 | 終了**後**の会のみ |
| YouTube API の gathering 紐づけ（スナップショット） | ❌ 未実装 | スナップショット上 `youtube_api_calls` は 0 固定。12h/部屋原価は `room_id` 集計 |

### 記録が始まるタイミング

- **マイページ参加履歴の AI 利用量**: `gemini_usage_logs.user_id` 列と `GEMINI_USAGE_PERSIST` が有効なら、**すでに**ログイン中ユーザーの呼び出しから記録・表示される（直近 120 日）。
- **管理画面 12h スロット集計**: `gemini_usage_logs`・`room_playback_history`・`room_chat_log`・`youtube_api_usage_logs` から**オンザフライ**集計。会終了不要。`/admin/gathering-history` · API `GET /api/admin/daily-slot-history`。
- **管理画面 ユーザー別課金帰属**: `billing_user_id` を請求先キーに Gemini・選曲を期間集計。主催部屋の YouTube API・Ably 推定は `room_gatherings.created_by` × 時刻でオーナーに帰属。`/admin/user-billing-usage`。
- **管理画面 部屋原価サマリー**: 部屋 × 期間の Gemini + YT + Ably + 選曲。`/admin/room-cost-summary` · API `GET /api/admin/room-cost-summary`。
- **開催履歴スナップショット（補助）**: `docs/supabase-room-gathering-snapshots-table.md` の SQL を Supabase で実行したうえで、**これから `ended` になる会**ごとに 1 行保存される。過去に終了済みの会は自動では作られない。
- **トリガー**: 主催者の手動終了（`end_reason: manual_end`）／在室 0 自動終了 Cron（`empty_presence_auto`）。

### DB で実行が必要な SQL（運用チェックリスト）

1. `docs/supabase-gemini-usage-logs-table.md` — `user_id` および Phase 1 列（`gathering_id`, `billing_kind` 等）
2. `docs/supabase-room-gathering-snapshots-table.md` — `room_gathering_snapshots` / `room_gathering_participant_snapshots`

テーブル未作成時はスナップショット保存をスキップし、会終了処理自体は失敗しない。

---

## 参加者向けの前提（明示する文言）

部屋 UI・利用規約・マイページで共通の考え方:

> **【現在】AI 機能はサイト管理者が API 原価を負担しており、参加者・主催者・ゲストともに追加料金はかかりません（完全無料）。**  
> 試験運用のうちに利用量を記録しています。将来、利用枠や有料プランを導入する場合がありますが、現時点では請求は行いません。

表示コンポーネント: `src/components/room/AiUsageBillingNotice.tsx`  
文言定義: `src/lib/ai-usage-disclosure-copy.ts`

### AI 機能ごとの料金目安（参考・3分類）

| 分類 | 含むもの | 目安（試算） |
|------|----------|--------------|
| **曲解説・選曲 AI** | comment-pack、曲クイズ、次に聴くなら 等 | 1曲フル（解説5本+クイズ+おすすめ）通常 **約 ¥1.4** · 多いとき **約 ¥3.6** 前後（原価+2割の参考料金） |
| **@ 質問・会話** | chat_reply、question_guard、検索クエリ抽出 | @ 1回 約 ¥0.4〜0.5（会話が長いと増加） |
| **その他** | お題講評、趣向要約 等 | 利用頻度は低め |

実装: `src/lib/gemini-usage-categories.ts` · UI: `src/components/mypage/GeminiUsageCategoryBreakdown.tsx`

**注意**: 部屋共通（豆知識・AI エージェント選曲 API）はマイページ個人内訳に含めない。

---

## 誰が何を「享受」し、誰の原価か

### 凡例

| 記号 | 意味 |
|------|------|
| ○ | 利用・表示できる |
| △ | 制限付き・主催者設定依存 |
| × | 原則不可（将来プランで変更可） |
| **課金** | 将来の請求・枠消費の帰属先（試算・ログ上の `billing_kind`） |

### ログインユーザー（参加者・主催者共通）

| 機能 | 享受 | 課金帰属（試算） |
|------|------|------------------|
| 自分が選曲した曲の AI 曲解説（comment-pack / commentary） | ○ | **選曲したユーザー** |
| 曲解説後クイズ（song_quiz） | ○ | **選曲したユーザー**（選曲に付随） |
| 「@」AI 返答（chat_reply） | ○ | **質問したユーザー** |
| 質問ガード分類（question_guard_classify） | ○（警告 UI） | **質問したユーザー** |
| 「曲を貼って」検索クエリ抽出 | ○ | **依頼したユーザー** |
| 次に聴くなら（試験） | △（フラグ ON 時） | **リクエストしたユーザー** |
| お題曲の AI 講評（ルーム） | ○ | **選曲したユーザー** |
| マイページのお題・趣向要約 | ○ | **本人**（部屋と無関係） |

### ゲスト（未ログイン）

| 機能 | 享受 | 課金帰属（試算） |
|------|------|------------------|
| チャット発言・同期視聴 | ○ | 原則 **AI 原価なし**（Gemini 未使用） |
| URL 選曲 | △（部屋設定による） | **主催者（オーナー）** — `guest_enjoy_owner_paid` |
| 選曲に付く AI 曲解説の**閲覧** | ○（部屋全体に表示） | **主催者**（ゲストが選曲した場合） |
| 「@」AI 返答 | △（部屋が許可する場合） | **主催者** — ゲストは `user_id` を持たないため |
| 豆知識（tidbit）の閲覧 | ○ | **主催者** |
| AI エージェントの選曲・発言の閲覧 | △（オーナーが ON） | **主催者** |
| マイページ・個人 AI 利用履歴 | × | — |

**ゲスト向けの一言**: 「AI 付き選曲・@ 質問は、試験運用では主催者の部屋枠で提供される場合があります。ログインすると自分の利用履歴を確認できます。」

### チャットオーナー / 主催者

| 機能 | 享受 | 課金帰属（試算） |
|------|------|------------------|
| 30 秒無発言の豆知識（tidbit） | ○（部屋全体） | **主催者** — `room_owner` |
| AI エージェントの選曲・解説（character_song_pick 等） | ○（部屋全体） | **主催者** — `ai_agent` |
| AI エージェント TTS（試験） | △ | **主催者** |
| ゲストの AI 付き選曲・@ | ○（部屋として提供） | **主催者** — `guest_enjoy_owner_paid` |
| 部屋日次サマリー生成 | ○（管理画面） | 管理操作（集計のみ） |

**オーナー向けの一言**: 「豆知識・AI エージェント・ゲストの AI 利用は、主催者の部屋原価として記録されます。マイページの参加履歴では、**あなた自身が触発した AI** と **部屋共通 AI** を分けて表示する予定です。」

---

## ログ上の `billing_kind`（Phase 1）

`gemini_usage_logs.billing_kind`（SQL 追記）:

| 値 | 意味 | `billing_user_id` |
|----|------|-------------------|
| `participant_user` | ログインユーザー起因 | 当該 `user_id` |
| `guest_enjoy_owner_paid` | ゲスト操作だが部屋で AI を享受 | 主催者 `created_by` |
| `room_owner` | 部屋共通（豆知識等） | 主催者 |
| `ai_agent` | AI エージェント | 主催者 |

実装: `src/lib/gemini-usage-attribution.ts`  
INSERT 時の解決: `src/lib/gemini-usage-log.ts` · live 会解決: `src/lib/room-live-gathering.ts`

ゲスト時 `participant_user` → `guest_enjoy_owner_paid` へ昇格する API:

- `POST /api/ai/comment-pack`
- `POST /api/ai/chat`
- `POST /api/ai/question-guard-classify`

---

## 記録する開催履歴（Phase 2）

### A. 12h スロット（**主軸** · 会終了不要）

部屋 × 06:00–18:00 / 18:00–06:00。マイページ参加履歴と同じ境界。

| 項目 | 内容 |
|------|------|
| 画面 | `/admin/gathering-history` |
| API | `GET /api/admin/daily-slot-history`（`?days=` / `?roomId=` / `?slotKey=` 詳細） |
| 集計 | `src/lib/room-daily-slot-aggregate.ts` |
| データ源 | `gemini_usage_logs` · `room_playback_history` · `room_chat_log` · `youtube_api_usage_logs` |

行クリックで **参加者別 AI 内訳**（`billing_user_id`・3分類・選曲数）。

### B. 会終了スナップショット（**補助**）

会 `ended` 時に 1 行スナップショット + 参加者行。詳細 SQL は `docs/supabase-room-gathering-snapshots-table.md`。

#### 親（会サマリー）

- 開催・終了日時、部屋名、会タイトル、主催者
- 選曲数合計、発言数、Gemini / Ably 推定（`ably_messages_estimated` = `room_chat_log` 件数 1:1）
- `gemini_by_billing_kind`（JSON 内訳）
- **注意**: `youtube_api_calls` はスナップショット INSERT 時 **0 固定**（未実装）。YT 原価は 12h スロット・部屋原価サマリーで確認

#### 子（参加者）

- 表示名、`user_id`、滞在時間、選曲数、AI 利用（帰属別）
- **AI エージェント行**（仮想参加者、`is_ai_agent: true`）

#### API（スナップショット一覧）

- `GET /api/admin/gathering-history`（`?days=` / `?gatheringId=`）— テーブル作成後のみ行が増える

#### 集計実装

- `src/lib/room-gathering-snapshot.ts` — `persistRoomGatheringSnapshot(s)`
- 呼び出し: `POST /api/room-gatherings`（`action=end`）· `sweepEmptyLiveGatherings`（Cron）

---

## インフラ原価試算（Phase 3 · `infra-cost-estimates.ts`）

管理画面 3 画面で共通。試算値であり請求額ではない。

### YouTube Data API

| 項目 | 値 |
|------|-----|
| クォータ | `search.list` × **100** + `videos.list` × **1** + その他 × **1** |
| ¥ 目安 | クォータ単位 × **¥0.0015**（100 単位 ≈ ¥0.15 · `monetization-options.md` の選曲単価に整合） |
| ログ | `youtube_api_usage_logs`（`endpoint` / `room_id` / `created_at`） |
| 集計ヘルパ | `src/lib/youtube-api-slot-aggregate.ts` · `enrichYoutubeApiStats()` |

### Ably（推定）

| 項目 | 値 |
|------|-----|
| メッセージ推定 | `room_chat_log` の **user + ai 件数**（1 行 = 1 メッセージ。会スナップショットと同じ） |
| ¥ 目安 | 件数 × **¥0.0004**（Ably Standard 従量 $2.50/100 万 msg · USD160 換算の目安） |
| 帰属（ユーザー別画面） | 主催部屋のチャットを `room_gatherings.created_by` × 時刻でオーナーに帰属（YT API と同じ） |

### 合計試算

各集計行: **`total_cost_jpy_approx` = Gemini + YouTube + Ably**（いずれも `costJpyApprox` 合算）。

### 管理画面の列形式

| 列 | 表示例 |
|----|--------|
| Gemini | `446 回 / 約 ¥54` |
| YT API | `598 回 / 598u / 約 ¥0.9` |
| Ably 推定 | `779 件 / 約 ¥0.3` |
| 合計 | `約 ¥55` |

CSV には `youtube_quota_units` · `youtube_jpy` · `ably_messages_est` · `ably_jpy` · `total_jpy` を出力。

---

## 管理画面・原価モニタリング（Phase 2–3）

カテゴリ **課金・原価**（`src/config/admin-sections.ts`）:

| 画面 | API | 集計 lib | 主な列 |
|------|-----|----------|--------|
| `/admin/gathering-history` | `GET /api/admin/daily-slot-history` | `room-daily-slot-aggregate.ts` | スロット · 部屋 · 選曲 · Gemini · YT · Ably · 合計 |
| `/admin/user-billing-usage` | `GET /api/admin/user-billing-usage` | `admin-user-billing-aggregate.ts` | ユーザー · Gemini · 主催部屋 YT/Ably · 合計 · 部屋数 |
| `/admin/room-cost-summary` | `GET /api/admin/room-cost-summary` | `room-cost-aggregate.ts` | 部屋/主催者 · 選曲 · Gemini · YT · チャット · Ably · 合計 |

**YouTube オーナー帰属**: `src/lib/room-owner-for-billing.ts` — `loadGatheringsForBillingWindow` + `attributeYoutubeLogToOwner(gatherings, roomId, iso)`。

**部屋原価サマリー**は部屋別・主催者別の 2 ビュー + CSV。直近 7〜90 日。

---

## マイページ（参加者向け）

| UI | パス / タブ | API |
|----|-------------|-----|
| **参加履歴**（トップレベルタブ） | マイページ → 参加履歴 | `GET /api/user/gemini-usage-summary` |
| 月次 AI 利用 + 3分類内訳 | 参加履歴上部 | 同上（`monthlyByCategory`, `byCategory`） |
| 各参加セッションの AI + 棒グラフ | 参加履歴リスト各行 | 同上（`bySlot`, `bySlotCategory`） |

集計: `src/lib/user-gemini-usage-aggregate.ts` · 料金試算: `src/lib/gemini-pricing.ts`

**集計範囲**: マイページは `billing_user_id` ベース + **personal**（本人操作）/ **roomCommon**（主催者としての部屋共通 AI）分割。  
`character_song_pick`（AI エージェント）は personal に含めず roomCommon 側。

---

## 実装ファイル索引

| 領域 | パス |
|------|------|
| プロジェクト仕様（本書） | `docs/room-gathering-history-and-ai-billing-project.md` |
| 帰属ルール | `src/lib/gemini-usage-attribution.ts` |
| ログ永続化 | `src/lib/gemini-usage-log.ts` |
| 3分類 | `src/lib/gemini-usage-categories.ts` |
| Gemini 料金試算 | `src/lib/gemini-pricing.ts` |
| **インフラ原価試算（YT/Ably）** | `src/lib/infra-cost-estimates.ts` |
| YouTube API 回数集計 | `src/lib/youtube-api-slot-aggregate.ts` |
| YouTube オーナー帰属 | `src/lib/room-owner-for-billing.ts` |
| 12h スロット境界 | `src/lib/room-daily-slot.ts` |
| 12h スロット集計 | `src/lib/room-daily-slot-aggregate.ts` |
| 部屋原価集計 | `src/lib/room-cost-aggregate.ts` |
| ユーザー別課金集計 | `src/lib/admin-user-billing-aggregate.ts` |
| ユーザー集計（マイページ） | `src/lib/user-gemini-usage-aggregate.ts` |
| 会スナップショット | `src/lib/room-gathering-snapshot.ts` |
| 参加者向け文言 | `src/lib/ai-usage-disclosure-copy.ts` |
| **1曲選曲フル原価目安（参加者向け）** | `src/lib/song-selection-cost-guide.ts` · `SongSelectionCostGuide.tsx` |
| 部屋注意 UI | `src/components/room/AiUsageBillingNotice.tsx` |
| マイページ内訳 UI | `src/components/mypage/GeminiUsageCategoryBreakdown.tsx` |
| マイページ本体 | `src/components/mypage/MyPage.tsx` |
| 管理メニュー分類 | `src/config/admin-sections.ts` · `AdminDashboardTabs.tsx` |
| 管理 API | `src/app/api/admin/daily-slot-history/route.ts` · `user-billing-usage/route.ts` · `room-cost-summary/route.ts` |
| 管理 UI | `src/app/admin/gathering-history/page.tsx` · `user-billing-usage/page.tsx` · `room-cost-summary/page.tsx` |

単体テスト: `gemini-usage-attribution` · `room-gathering-snapshot` · `room-daily-slot` · `admin-user-billing` · `admin-sections` · `room-owner-for-billing` · `user-gemini-usage` · `youtube-api-slot` · **`infra-cost-estimates`**

---

## 実装フェーズ

### Phase 1 — 帰属ログ基盤（**完了**）

- [x] 本ドキュメント
- [x] `gemini-usage-attribution.ts`（context → billing_kind）
- [x] `gemini_usage_logs` 列追加 SQL 文書
- [x] `persistGeminiUsageLog` 拡張 + `room-live-gathering.ts`
- [x] 部屋 UI への AI 有料明示（`AiUsageBillingNotice`）
- [x] `isGuestTrigger` 配線（comment-pack, chat, question-guard）
- [x] `gatheringId` サーバー側 live 解決
- [x] tidbit / character-song-pick の `buildGeminiUsagePersistMeta` 配線
- [x] マイページ参加履歴 + 月次/スロット集計 API
- [x] AI 3分類 UI（解説 / @ / 他）と料金割合表示
- [x] 参加履歴を曲管理サブタブからトップレベルタブへ昇格

### Phase 2 — 管理モニタリング（**12h スロット + ユーザー別** · 完了）

- [x] 12h スロット集計（会終了不要）— `/admin/gathering-history`
- [x] スロット詳細の参加者別 AI（`billing_user_id`・表示名・選曲数）
- [x] ユーザー別期間集計 — `/admin/user-billing-usage`（`GET /api/admin/user-billing-usage`）
- [x] 表示名解決（参加履歴 `display_name`）

### Phase 2b — 会終了スナップショット（**コード完了・補助・DB 待ち**）

- [ ] `room_gathering_snapshots` / `_participant_snapshots` テーブル（**Supabase で SQL 実行**）
- [x] `ended` 時に集計 INSERT（手動終了・在室0自動終了）
- [ ] 過去会のバックフィル（任意・未着手）

### Phase 3 — 原価の拡張・課金準備

- [x] YouTube API を 12h スロットに紐づけ（`youtube_api_usage_logs` × `room_id`）
- [x] YouTube API を部屋オーナーに帰属（`room_gatherings.created_by` × 時刻）
- [x] 管理: CSV エクスポート（12h スロット・ユーザー別課金）
- [x] マイページ: `billing_user_id` 集計 + personal / roomCommon 分割
- [x] 管理画面「部屋原価サマリー」— `/admin/room-cost-summary`（部屋別・主催者別）
- [x] YT クォータ単位→¥目安・Ably 推定列（部屋原価・12h スロット・ユーザー別課金）

### Phase 4 — 課金商品連動（将来）

**マスタ**: `docs/00-ai-trial-and-billing-implementation.md`（10 曲お試し · 選曲のみ無料 · `aiMode`）

- [ ] Phase A–D（本 MD チェックリスト参照）
- [ ] Vercel Pro 移行・固定費実測の転記（`monetization-simulation-assumptions.ts` パターン B/C）
- [ ] 料金形態決定（月額サブスク / プリペイド / 上限タイト — `docs/monetization-options.md` 2026-06 見直し）
- [ ] ユーザークレジット / オーナー部屋枠
- [ ] ゲスト AI 制限フラグ（オーナー設定）
- [ ] 利用規約・FAQ 固定化

---

## 既知の制限・未解決

| 項目 | 内容 |
|------|------|
| AI エージェント選曲後の曲解説 | ブラウザから comment-pack が走ると、ログ上は選曲者の `user_id` に付く場合がある（帰属ギャップ） |
| マイページ集計キー | `billing_user_id` 請求先 + personal / roomCommon 分割。**管理画面**も同キー |
| スナップショット選曲数 | `room_playback_history` の時刻窓（`gathering_id` 列は未使用） |
| ゲスト参加者行 | スナップショット参加者はログインユーザー中心（`is_guest` 行は今後拡張可） |

---

## 動作確認手順

### マイページ（個人 AI）

1. ログインして部屋で選曲・@ 質問を数回実行
2. マイページ → **参加履歴** タブ
3. 月次ブロックに回数・料金目安・3分類の棒グラフ。主催者は **personal / roomCommon** 内訳も表示されること

### 管理画面（12h スロット · 原価試算）

1. STYLE_ADMIN + `SUPABASE_SERVICE_ROLE_KEY` で `/admin` にログイン
2. **課金・原価** → **開催履歴（12h スロット）** — 行に Gemini / YT（回数·クォータ·¥）/ Ably / 合計
3. 行クリック → 参加者別 AI 内訳・詳細パネルに YT/Ably/合計
4. **ユーザー別 AI 利用** — 主催部屋の YT/Ably がオーナー行に載ること
5. **部屋原価サマリー** — 部屋別・主催者別切替 · CSV に quota/ably 列

### 会終了スナップショット（補助 · DB 要 SQL）

1. `supabase-room-gathering-snapshots-table.md` の SQL を実行
2. 部屋で会を開始 → 選曲等 → **会を終了**
3. `GET /api/admin/gathering-history` で終了会 1 行（12h スロット UI とは別 API）

---

## 変更時のチェックリスト

- `billing_kind` ルールを変えたら **本 MD の表** と `gemini-usage-attribution.ts` を同期
- SQL 列追加は `docs/supabase-gemini-usage-logs-table.md` を更新
- 参加者向け文言は `ai-usage-disclosure-copy.ts` のみ編集（Room / MyPage は import）
- 3分類の context 対応を変えたら `gemini-usage-categories.ts` を更新
- YT/Ably 試算単価を変えたら **`infra-cost-estimates.ts`** と本 MD「インフラ原価試算」節を同期

---

## 実装ログ

| 日付 | 内容 |
|------|------|
| 2026-06-29 | Phase 1 着手: 帰属 lib・ログ拡張・部屋/マイページ UI 明示・comment-pack/chat ゲスト帰属 |
| 2026-06-29 | マイページ: `GET /api/user/gemini-usage-summary`・参加履歴への AI 利用量表示 |
| 2026-06-29 | AI 3分類（解説/@/他）・割合棒グラフ・部屋詳細パネルへの目安説明 |
| 2026-06-29 | 参加履歴タブを曲管理から独立（マイページトップレベル） |
| 2026-06-29 | Phase 1 完了: question-guard ゲスト帰属・tidbit/character-song-pick の persist meta 統一 |
| 2026-06-29 | Phase 2: `room-gathering-snapshot.ts`・会終了フック・`/admin/gathering-history` |
| 2026-06-29 | 進捗を本 MD に集約。スナップショットは SQL 実行後の**新規終了会**から記録開始 |
| 2026-06-29 | Phase 2 完了: 12h スロット・ユーザー別課金・管理ダッシュボードタブ分類 |
| 2026-06-30 | Phase 3: YouTube API オーナー帰属・部屋原価サマリー・管理ダッシュボード課金タブ |
| 2026-06-30 | `infra-cost-estimates.ts`: YT クォータ→¥ · Ably 推定。部屋原価サマリーに列追加 |
| 2026-06-30 | 12h スロット・ユーザー別課金にも YT/Ably/合計列を統一。本 MD を Phase 3 完了まで更新 |
| 2026-06-30 | ⭐ Phase 4 マスタ `docs/00-ai-trial-and-billing-implementation.md` 作成（10曲お試し・選曲のみ無料・aiMode） |
