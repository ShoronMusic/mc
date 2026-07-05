# インシデント記録: 2026-07-05 本番（musicai.jp）長時間ライブ中の AI 停止・サイト 504

> **対象**: [musicai.jp](https://www.musicai.jp/) 部屋 03 ほか  
> **期間**: 2026-07-05 23:17 頃〜 2026-07-06 00:30 頃（JST）  
> **ステータス**: **復旧済み**（Supabase PRO 移行・サイト再アクセス可）。コード修正は **Vercel 未デプロイの場合は本番未反映**  
> **関連ログ**: `log/202607052300.txt`（会話ログ DL・23:47 まで）

---

## 1. 概要

約 1 時間の同期ライブ運用中に、次の症状が重なった。

| 症状 | ユーザー影響 |
|------|----------------|
| AI エージェントが「選曲待ち」のまま進まない | 曲間で停止したように見える |
| ページ再読み込みで **504 GATEWAY_TIMEOUT**（`MIDDLEWARE_INVOCATION_TIMEOUT`） | サイト全体にアクセスできない |
| Supabase ダッシュボードで Postgres エラー急増・**Project low on resources** | DB / Auth が不安定 |

**直接原因**: Supabase **FREE（Nano）** の CPU / 接続 / メモリ枯渇に加え、middleware が毎リクエスト `getUser()` で Supabase Auth を待ち、障害時に **全ページが 504** になった。

**寄与要因（アプリ）**: 長時間ライブでの Gemini・曲解説・おすすめ曲・@・AI キャラ選曲の集中、Ably **presence** 急増、AI 選曲 API のレート制限後リトライ欠如。

---

## 2. タイムライン（JST）

| 時刻 | 出来事 |
|------|--------|
| 23:17 | 小龍・ちひろ入室（部屋 03）。ちひろはサポーター AI 無制限表示を確認 |
| 23:21〜23:41 | 選曲・曲解説 5 本・おすすめ曲・@・エージェント選曲が正常動作 |
| 23:29:45 | 同一曲の「エージェント選曲です！」が **2 回**（軽微な重複表示） |
| 23:42〜23:47 | Bon Jovi ライブ選曲・概要リクエストまで継続。会話ログ最終行 23:47:05 |
| 23:50〜00:10 頃（推定） | Supabase Postgres / Auth エラー急増。Ably presence 1 時間で **30 万メッセージ超**（約 90% が presence） |
| 00:10 頃 | Vercel Function Timeout 急増。ユーザー報告: AI 停止・504 |
| 00:29 頃 | Supabase **PRO** アップグレード完了 |
| 00:32 頃 | 視聴履歴上は Blaze Of Glory まで再生（一部クライアントは継続 or 復旧後） |
| 00:35 以降 | 本番サイト再アクセス可（ユーザー確認） |

---

## 3. 根本原因

### 3.1 インフラ（主因）

- **Supabase Nano（FREE）**: 共有 CPU・500MB RAM。1 時間の AI 多発＋Auth 多発で **low on resources**。
- **PostgREST**: 直近 60 分で 97 リクエスト中 **87 エラー**（障害ピーク時）。
- **Vercel middleware**: `updateSupabaseSession` → `supabase.auth.getUser()` が応答しないと **MIDDLEWARE_INVOCATION_TIMEOUT** → 504。
- **Supabase 側インシデントバナー**（調査中）が同時期に表示され、プラットフォーム要因もあり得る。

### 3.2 アプリケーション（副因・再発防止対象）

| 領域 | 問題 | 影響 |
|------|------|------|
| `character-song-pick` | 部屋単位 **90 秒**レート制限時、`throttled: true` で **リトライせず**同一 AI ターンが永久停止 | 「エージェント選曲待ち」で止まる |
| AI ターン（開始直後） | 人間+AI のみの部屋でパスしても AI が選曲しないのにパスボタン表示 | UX 混乱（修正済み） |
| Ably presence | 更新が多すぎるとメッセージ急増（課金・負荷） | Nano 枯渇の一因 |
| 監視 | HTTP 504・middleware 失敗を DB に残さない | 会話ログだけでは原因追跡不可 |

---

## 4. 実施した対応

### 4.1 運用（完了）

- [x] Supabase を **FREE → PRO**（$25/月）にアップグレード
- [x] PRO 後 Compute 正常域（CPU・RAM・Connections）をダッシュボードで確認
- [x] 会話ログ `log/202607052300.txt` で 23:47 まで正常動作を裏取り

### 4.2 コード修正（リポジトリ内・**要 Vercel デプロイ**）

| 変更 | ファイル（主要） |
|------|------------------|
| middleware: auth cookie なしはスキップ、`getUser` **4 秒で fail-open** | `src/lib/supabase/middleware.ts` |
| AI 選曲スロットル後 **自動リトライ**、fetch 120 秒タイムアウト | `src/components/room/RoomWithSync.tsx` |
| presence 更新 **最小 30 秒**間隔 | `src/lib/ably-traffic-config.ts`・`RoomWithSync.tsx` |
| `character-song-pick` に `maxDuration = 60` | `src/app/api/ai/character-song-pick/route.ts` |
| パス／AI ターン・入室直後パスボタン非表示など | `RoomWithSync.tsx`（選曲順・パス関連） |
| サポーター AI 無制限（`AI_SUPPORTER_UNLIMITED_USER_IDS`） | `src/lib/ai-supporter-unlimited-user-ids.ts` 他 |

環境変数（`.env.example` 追記）:

```env
# middleware getUser 待ち ms（超過時 cookie 更新スキップ・504 回避）
MIDDLEWARE_SUPABASE_AUTH_TIMEOUT_MS=4000

# サポーター向け AI 無制限
AI_SUPPORTER_UNLIMITED_USER_IDS=

# presence 更新の最小間隔 ms（既定 30000）
NEXT_PUBLIC_ABLY_PRESENCE_MIN_UPDATE_MS=30000
```

単体テスト: `src/lib/supabase/middleware.unit-test.ts`・`ai-supporter-unlimited-user-ids.unit-test.ts` 他。

---

## 5. 障害時の切り分け手順（再発時）

会話ログ（`/admin/room-chat-log`）**だけでは 504 や DB エラーは分からない**。次の順で確認する。

1. **Vercel** Observability … Function Timeout・5xx・middleware
2. **Supabase** [Reports / Logs](https://supabase.com/dashboard/project/ofxsvhiygmdkwqmaeoid) … Postgres・Auth
3. **Ably** Usage … presence 比率・メッセージ数
4. **`/admin/gathering-history`** … 該当部屋・12h スロットの Gemini / YT / Ably 推定
5. **`/admin/ai-character-song-picks`** … エージェント選曲が途切れた時刻
6. **`/admin/youtube-api-usage`** … 選曲 API の失敗・`response_status`
7. **会話ログ DL** … ユーザー体験の裏取り

詳細メニュー一覧: `src/config/admin-sections.ts`（カテゴリ: 課金・原価 / AI 運用 / 部屋・開催）。

---

## 6. 残課題（TODO）

### 6.1 優先（デプロイ・運用）

| # | 課題 | 担当目安 |
|---|------|----------|
| P1 | **上記コード修正を Vercel 本番にデプロイ** | 開発 |
| P1 | PRO 移行後 24h、Supabase 成功率・Postgres エラーが安定したか確認 | 運用 |
| P2 | 長時間ライブ時の運用ガイド（複数タブ禁止・2h ごと再開推奨）を利用者向けにどこかへ1行 | 企画/UI |
| P2 | Vercel **Hobby** のままなら Serverless **10 秒制限**を意識（AI 選曲は Pro 60 秒とセットで検討） | インフラ |

### 6.2 製品・監視（中期）

| # | 課題 | 参照 |
|---|------|------|
| M1 | **運用ヘルス 1 ページ**（直近 24h: Gemini 失敗・YT 失敗・スロット原価の要約） | `docs/公開Go-No-Goチェックリスト.md` §6 未達 |
| M2 | HTTP 5xx / middleware タイムアウトの **永続ログ or Sentry** | 現状 Vercel Logs のみ |
| M3 | Gemini **失敗**リクエストの `gemini_usage_logs` 相当 or 別テーブル | 成功ログのみ |
| M4 | エージェント選曲 announce **二重表示**（23:29）の調査・修正 | `RoomWithSync.tsx` |
| M5 | Supabase Advisor **RLS Disabled**（Critical）のテーブル整理 | セキュリティ |
| M6 | インシデント対応手順（BAN・告知・証跡） | `docs/abuse-moderation-future-tasks.md` M13 |

### 6.3 低優先

| # | 課題 |
|---|------|
| L1 | ちひろさん画面の「サポート」表記とコード「サポータアカウント」の表記ゆれ統一 |
| L2 | `CHARACTER_SONG_PICK_MIN_GAP_MS` の本番チューニング（90 秒が短いか検証） |

---

## 7. 再発防止チェックリスト（ライブ前）

- [ ] Supabase が **PRO**（または十分な Compute）である
- [ ] Vercel に **middleware / AI リトライ / presence 抑制** がデプロイ済み
- [ ] 同じ部屋を **複数タブで開かない**
- [ ] Ably・Supabase・Vercel のダッシュボードを開ける（STYLE_ADMIN）
- [ ] 障害時: 部屋リロード → 選曲者指名で人間にターン戻し

---

## 8. 参考リンク

| リソース | URL |
|----------|-----|
| 本番 | https://www.musicai.jp/ |
| Supabase プロジェクト | https://supabase.com/dashboard/project/ofxsvhiygmdkwqmaeoid |
| Supabase Status | https://status.supabase.com/ |
| 開催履歴・原価設計 | `docs/room-gathering-history-and-ai-billing-project.md` |
| 選曲順・パス仕様 | `docs/room-selection-turn-order-spec.md` |
| Go/No-Go 監視 | `docs/公開Go-No-Goチェックリスト.md` |

---

## 9. 実装ログ

| 日付 | 内容 |
|------|------|
| 2026-07-05〜06 | 本インシデント発生・調査・Supabase PRO・コード修正（本 MD 作成） |
