# 荒らし対策・モデレーション — 今後の課題メモ

チャット・選曲・AI API の**悪用・スパム・嫌がらせ**に備えた拡張を、実装状況とあわせて整理する。法務・プライバシーは方針決めのうえで進めること。

---

## 現状（実装済み・緩和策）

| 領域 | 内容 |
|------|------|
| AI チャット | IP 単位の短時間レート制限（`src/lib/chat-ai-rate-limit.ts`、`getChatAiClientIp` は `x-forwarded-for` / `x-real-ip`。`TRUST_X_FORWARDED_FOR=0` で無効化可）。**メモリ保持のみ**で、BAN リストや永続ログではない |
| AI コスト経路 | `src/lib/ai-cost-rate-limit.ts` で character-chat / resolve-song-request / comment-pack / commentary / song-quiz / announce / feedback / 履歴・チャットログ書き込みを制限。`resolve-song-request` はログイン必須 |
| お試し枠 | `AI_TRIAL_ENFORCEMENT_ENABLED=1` 時に有効。`user_ai_trial` 欠落は **fail-closed**。`packPhase` 省略は base と同様に消費 |
| 質問ガード | クライアント fail-open に加え、`/api/ai/chat` でサーバ再検証（既定 fail-closed。`AI_QUESTION_GUARD_SERVER_FAIL_OPEN=1` で障害時通す） |
| 部屋チャットログ | GET/POST とも在室・参加履歴または STYLE_ADMIN。偽ログ POST に RL |
| STYLE_ADMIN | 未設定時は視聴履歴 PATCH も **全拒否**（`/admin` と同一） |
| Ably | **Token Auth**（`ABLY_API_KEY` + `NEXT_PUBLIC_ABLY_ENABLED=1` + `/api/ably/token`）。公開キーは使わない |
| Admin SSRF | `jsonUrl` は https・プライベート IP 拒否（`src/lib/safe-outbound-url.ts`） |
| ゲスト | 表示名・同期部屋の `clientId`（Ably）で区別。**Supabase `user_id` が付かない**ことが多く、別ブラウザ・別端末では同一人物の追跡は困難 |
| ミドルウェア | OAuth 救済のみ（`src/middleware.ts`）。IP ブロックなし |
| 詳細レポート | `docs/ma-adversarial-verification.md` |

---

## 限界・前提（設計のときに読む）

- **IP だけでの特定・BAN**は弱い: CGNAT・共有 Wi‑Fi・VPN・回線変更で、同一 IP に複数人がいる／一人が IP を変えやすい。
- **ゲストに IP を保存する**場合は、利用目的・保存期間・第三者提供の有無を**プライバシーポリシー等に明記**し、必要最小限にすることが前提（個人情報保護法・GDPR 等の論点になりうる）。
- **サーバーレス**ではインメモリのレート制限はインスタンス単位でばらつく。厳密な制限は**エッジ / WAF / 専用プロキシ**との併用が現実的（`chat-ai-rate-limit.ts` コメントにも記載あり）。
- Ably Token は **部屋チャネル限定**だが、任意 `clientId` での入室自体はゲスト参加の製品仕様として残る（なりすまし・荒らしは別途キック／BAN が必要）。

---

## 今後の課題（ToDo）

優先度は運用負荷・被害の出方に合わせて調整する。

### 1. アカウント・認証まわり（効果が大きい）

| # | 内容 | 状態 |
|---|------|------|
| M1 | **問題のある操作だけログイン必須**（例: チャット送信、特定 API）。ゲストは閲覧のみ、など段階的にも可 | 一部（resolve-song-request・@） |
| M2 | **登録ユーザー向け BAN**: Supabase の `user_id` またはメールで拒否 | 未着手 |
| M3 | **管理者用の「アカウント停止」フロー**（理由・期間・解除。監査ログの有無） | 未着手 |

### 2. ネットワーク・インフラ（即効性があることが多い）

| # | 内容 | 状態 |
|---|------|------|
| M4 | **ホスティング / CDN の WAF・ボット対策** | 未着手 |
| M5 | **既知の攻撃元 IP の一時ブロック** | 未着手 |

### 3. アプリ内のログ・モデレーション（ゲスト含む）

| # | 内容 | 状態 |
|---|------|------|
| M6 | **疑わしいイベントの短期ログ** | 一部（チャットログアクセス制御） |
| M7 | **オプションの IP 拒否リスト** | 部分（`TRUST_X_FORWARDED_FOR`） |
| M8 | **部屋オーナー / モデレーターによるキック・ミュート** | 未着手 |
| M9 | **通報フロー** | 未着手 |

### 4. プロダクト・UX

| # | 内容 | 状態 |
|---|------|------|
| M10 | **新規ゲストのクールダウン** | 未着手 |
| M11 | **同一部屋内の連投・重複コンテンツ検知** | 未着手 |
| M12 | **AI コスト上限**（部屋単位・日次。既存のレート制限と併用） | アプリ RL 追加済み。エッジ併用は未 |

### 5. ドキュメント・運用

| # | 内容 | 状態 |
|---|------|------|
| M13 | **インシデント対応手順** | 未着手 |
| M14 | **利用規約・ポリシーとの整合** | 未着手 |

---

## 参考コードパス

- `src/lib/chat-ai-rate-limit.ts` — チャット AI 用 IP 取得・レート制限
- `src/lib/ai-cost-rate-limit.ts` — Gemini / YT コスト経路の共有 RL
- `src/lib/question-guard-classify-rate-limit.ts` — 質問ガード分類まわり
- `src/lib/server-ai-question-guard.ts` — `/api/ai/chat` サーバ側ガード
- `src/app/api/ably/token/route.ts` — Ably Token Auth
- `src/middleware.ts` — 現状は OAuth のみ
- `AGENTS.md` — AI ガード・ポリシー関連の索引

---

## 関連ドキュメント

- `docs/ma-adversarial-verification.md` — 敵対的検証レポート（修正状況あり）
- `docs/feedback-and-ai-improvement-todo.md` — フィードバック・品質改善
- `docs/supabase-setup.md` — DB・RLS の一般的な注意
