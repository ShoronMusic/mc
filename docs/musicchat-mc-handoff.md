# Music Chat（mc）実装 — 進捗・引き継ぎ（別 PC 用）

更新: **2026-07-07**  
リポジトリ: **`E:\mc`**（Git 作業ディレクトリ。略称 **mc** ＝ Music Chat、**ma** ＝ 洋楽AIチャット / musicaichat）

**正本・方針**: [`00-music-chat-product-plan.md`](./00-music-chat-product-plan.md)  
**DB（案2）**: [`supabase-room-gatherings-product-column.md`](./supabase-room-gatherings-product-column.md)

---

## 1. 何をやっているか（30 秒要約）

| 略称 | 製品 | ローカル | 本番（予定） | `NEXT_PUBLIC_PRODUCT` |
|:----:|------|----------|--------------|------------------------|
| **ma** | 洋楽AIチャット | http://localhost:**3002** | musicai.jp | 未設定 or `musicaichat` |
| **mc** | Music Chat | http://localhost:**3003** | musicchat.jp | `musicchat` |

- **同一リポジトリ `E:\mc`** を ma / mc **両デプロイ**（Vercel 2 プロジェクト想定）
- **AI 以外は共通化**（`IS_MC_PRODUCT` / `product-mode.ts` で分岐）
- **ルームは案2**: 同じ `room_id` でも ma と mc は **別の会**（Ably 接頭・DB `product` 列）
- **mc**: 完全無料・白 UI・AI なし・**ma への目立つ導線**

---

## 2. 別 PC での起動手順

### 2.1 クローン・依存

```bash
cd E:\mc   # または任意の作業パス
npm install
```

### 2.2 `.env.local`

- **ma 用**: 従来どおり（`NEXT_PUBLIC_PRODUCT` なしで OK）
- **mc 用**: `npm run dev:chat` / `dev:both` が **`NEXT_PUBLIC_PRODUCT=musicchat` を自動付与**するため、`.env.local` に書かなくても 3003 は mc になる
- 本番 mc 向け（任意）: `NEXT_PUBLIC_MA_PUBLIC_URL=https://www.musicai.jp`
- `.env.example` に `NEXT_PUBLIC_PRODUCT=musicchat` のコメントあり

### 2.3 開発コマンド

| コマンド | 内容 |
|----------|------|
| `npm run dev` | **ma** のみ · ポート **3002** |
| `npm run dev:chat` | **mc** のみ · ポート **3003** |
| `npm run dev:both` | **3002 + 3003 同時**（1 ターミナル） |

**注意**

- mc は `next.config.mjs` で **`distDir=.next-mc`**（ma は `.next`）。同時 dev でビルドキャッシュが衝突しないようにしている
- 3003 が `ERR_CONNECTION_REFUSED` → `dev:chat` または `dev:both` が未起動
- 検証: `npm run validate`（UTF-8 + lint + 型 + test）

---

## 3. 実装済み（進捗一覧）

### Phase 0 — プロダクト切替の土台 ✅

| 項目 | パス / 内容 |
|------|-------------|
| product 判定 | `src/lib/product-mode.ts` · `src/lib/product-branding.ts`（`IS_MC_PRODUCT`） |
| middleware | `src/middleware.ts` — mc で `/api/ai/*`・`/admin/*`・AI 系 user API を **404** |
| layout | `src/app/layout.tsx` — `data-product` / `data-theme=light`（mc）· favicon・metadata 分岐 |
| dev スクリプト | `scripts/dev-musicchat.mjs` · `scripts/dev-both.mjs` |
| 単体テスト | `src/lib/product-mode.unit-test.ts` |

### 案2 Step 1〜3 — ma / mc 部屋分離 ✅

| Step | 内容 | 主なファイル |
|------|------|--------------|
| 1 | `product` 列スコープ · 集会 API · live 一覧 · Ably 接頭 | `src/lib/room-product-scope.ts` · `room-gatherings` · `room-live-status` · `AblyProviderWrapper` |
| 2 | presence · auth-session · lobby-message · jp unlock | `room-presence` · `room-auth-session` · `room-lobby-message` 等 |
| 3 | セッション奪取・入室復元を product 内に限定 | `room-session-takeover` · `room-enter-resume` · `SessionReplacedNotice` |

**DB**: `room_gatherings` / `room_lobby_message` に `product` 列 — SQL は [`supabase-room-gatherings-product-column.md`](./supabase-room-gatherings-product-column.md)。**未実行 DB では ma は従来フォールバック、mc 分離は SQL 後に本番同等**。

### 案2 Step 4 + UI 白テーマ（mc 部屋・トップ）✅

#### インフラ・スタイル

| 項目 | パス |
|------|------|
| mc 白テーマ CSS 大量上書き | `src/app/globals.css`（`html[data-product='musicchat']`） |
| デザイントークン | `--mc-bg-page` / `--mc-border` / `--mc-accent`（緑 `#16a34a` はアクティブのみ） |
| UI ヘルパー | `src/lib/product-branding.ts`（アイコンボタン・入力欄・タグライン等） |

#### 部屋 UI（`RoomWithSync` / `RoomWithoutSync`）

| 項目 | 状態 |
|------|------|
| 白背景・グレー枠 | ✅ |
| AI 曲解説・comment-pack・曲クイズ呼び出しスキップ | ✅（`IS_MC_PRODUCT` で API 取得も省略） |
| チャット管理者ツール非表示 | ✅ `Chat.tsx` |
| 進行表示名 | mc: **「進行」** / ma: **「AI」** |
| タグライン | mc: **YouTube × 一緒に聴く × チャット** |
| mc ロゴ | `MusicChatTitleLogo` · `public/musicchat_icon.png` |
| 選曲アナウンス API | mc は `/api/room/announce-song`（AI なし）— `room-announce-song-client.ts` |

#### チャット・入力・履歴

| 項目 | パス |
|------|------|
| 発言色（暗背景用インライン色の無効化） | `src/lib/chat-text-color.ts` · `Chat.tsx` |
| 発言欄薄緑 BG | `.mc-chat-input-field` |
| 利用規約・選曲方法ボタン（薄灰＋輪郭） | `chatInputLegalLinkBtnClass` 等 |
| 視聴履歴白パネル・別タブ視聴ボタン | `RoomPlaybackHistory.tsx` |
| リサイズハンドル薄灰化 | `ResizableSection.tsx` |

#### トップ・認証まわり（一部）

| 項目 | 状態 |
|------|------|
| トップ文言・ロゴ | `StartPageMainCard` · `StartPageSiteIntro` · `JoinChoice` 等 |
| 課金・AI お知らせ | `AiUsageBillingNotice` — mc 非表示 |

### ma 導線バナー（部屋ヘッダー）✅ — 直近セッション

| 項目 | 内容 |
|------|------|
| コンポーネント | `src/components/home/McMaPromoBanner.tsx` → **`McMaPromoHeaderBanner`** |
| 配置 | 退室ボタンの**右** — `RoomWithSync.tsx` · `RoomWithoutSync.tsx` |
| 表示 | `sm` 以上（狭い画面は非表示） |
| 文言 | 「AIの曲解説や選曲参加でより楽しめる！」＋「洋楽AIチャット — 同じアカウントで利用可」 |
| アイコン | `/music_ai_chat_icon_wh_150.png`（**丸枠なし**黒背景正方形） |
| リンク先 | `getMaPublicOrigin()` — ローカル 3003→3002、本番 musicai.jp |
| 見た目 | 黒 BG · 白文字 · ホバーで**輪郭発光**（`globals.css` の `.mc-ma-promo-header`） |

**注意（既知）**: mc 用 `globals.css` が `text-white` / `text-gray-*` を一括で暗色に上書きするため、バナーは **専用クラス + `!important`** で白文字を維持している。Tailwind の `text-white` だけでは読めなくなる。

**トップのブロック版** `McMaPromoBanner` は `MC_MA_PROMO_BLOCK_BANNER_VISIBLE = false` で**非表示**（部屋ヘッダー版のみ有効）。

---

## 4. Git 状態（2026-07-07 時点）

**コミット前のワーキングツリー**に上記変更が載っている想定。別 PC では:

```bash
git fetch
git status
git log -5 --oneline
```

主要な**新規ファイル**（未追跡の可能性）:

- `src/lib/product-mode.ts` · `product-branding.ts` · `room-product-scope.ts`
- `src/components/home/McMaPromoBanner.tsx` · `MusicChatTitleLogo.tsx`
- `src/lib/room-announce-song-client.ts` · `room-announce-song-server.ts`
- `scripts/dev-musicchat.mjs` · `dev-both.mjs`
- `public/musicchat_icon.png`
- `docs/supabase-room-gatherings-product-column.md`

**push 前に別 PC で取り込む**: リモートに push 済みなら `git pull`。未 push なら USB / 別手段で `E:\mc` を同期するか、先にコミット・push すること。

---

## 5. 手動確認チェックリスト（mc · 3003）

1. `npm run dev:both` → http://localhost:3003 を開く
2. 部屋入室 — ヘッダーが白基調・mc ロゴ・タグライン表示
3. 退室ボタン右 — **黒バナー**・白文字・ma アイコン・ホバー発光
4. バナークリック → 3002（ma）が別タブで開く
5. YouTube URL 選曲 — **AI 曲解説が出ない**こと
6. チャット発言・選曲アナウンスが**暗い文字で読める**こと
7. 視聴履歴パネルが白背景であること
8. 同時に 3002 で ma 部屋に入り、**追い出されない**こと（DB `product` 列実行後）
9. `npm run validate` が通ること

---

## 6. 今後の予定（未着手・要判断）

方針の正本は [`00-music-chat-product-plan.md`](./00-music-chat-product-plan.md) §4・§7。

### 6.1 インフラ・リリース

| 優先 | タスク |
|:----:|--------|
| 高 | **Supabase SQL 実行** — `product` 列（本番・開発 DB） |
| 高 | **musicchat.jp** ドメイン取得 · Vercel **mc 用プロジェクト** 作成 |
| 高 | mc デプロイ env: `NEXT_PUBLIC_PRODUCT=musicchat` · `NEXT_PUBLIC_MA_PUBLIC_URL` |
| 中 | Supabase Redirect URL に `http://localhost:3003/auth/callback` · `https://www.musicchat.jp/auth/callback`（＋ recover-callback）追加。未登録だと mc の Google 認証が ma（Site URL）へ飛び PKCE 失敗する |
| 中 | mc 用 manifest / OGP 画像の最終化 |
| 低 | `from=musicchat` 深リンク・analytics 計測 |

### 6.2 ma 導線の拡張（企画 §4）

| 置き場所 | 状態 |
|----------|------|
| 部屋ヘッダー（退室右） | ✅ 実装済 |
| トップ / LP ブロック | コンポーネントあり・**`MC_MA_PROMO_BLOCK_BANNER_VISIBLE` でオフ** |
| マイページ | **未実装** — 同一アカウント案内 + ma リンク |
| UserBar 付近 | 未検討 |
| 深リンク `?from=musicchat&promo=trial` | 未実装 |

### 6.3 マイページ・管理（mc ガード）

`MyPage.tsx` 等に **`IS_MC_PRODUCT` ガード未着手**の可能性大。非表示にすべき例:

- AI お試し / 課金 / Gemini 使用量
- @ 履歴 · AI 趣向 · AI 部屋設定

### 6.4 UI 仕上げ

| 項目 | メモ |
|------|------|
| 残存ダーク色クラス | 部屋・モーダル内に ma 由来の `bg-gray-900` 等が残っている箇所の洗い出し |
| `RoomWithoutSync` ヘッダー退室ボタン | mc でも暗色スタイルのままの可能性 — WithSync と揃える |
| モバイル ma バナー | 現状 `sm` 未満は非表示 — 短縮版 or フローティング要検討 |
| PWA | mc 用アイコン・theme-color は layout で一部対応済 |

### 6.5 テスト・品質

| 項目 | 状態 |
|------|------|
| `product-mode.unit-test.ts` | あり |
| `room-product-scope.unit-test.ts` | あり |
| E2E / 手動 ma+mc 同時入室 | 定期確認推奨 |

### 6.6 ドキュメント

| 項目 | メモ |
|------|------|
| `AGENTS.md` | ma/mc 呼称は本書・product-plan が正。古い「mc＝洋楽AI」表記は読み替え |
| 本書 | 別 PC 引き継ぎ用。進捗更新時は日付と §3・§4 を更新 |

---

## 7. 触るときのファイル索引

| 領域 | パス |
|------|------|
| 方針正本 | `docs/00-music-chat-product-plan.md` |
| product 判定・404 リスト | `src/lib/product-mode.ts` |
| mc UI ヘルパー・ma URL | `src/lib/product-branding.ts` |
| 部屋 product / Ably | `src/lib/room-product-scope.ts` |
| mc 白テーマ上書き | `src/app/globals.css` |
| ma 導線バナー | `src/components/home/McMaPromoBanner.tsx` |
| 同期部屋 | `src/components/room/RoomWithSync.tsx` |
| 非同期部屋 | `src/components/room/RoomWithoutSync.tsx` |
| チャット | `src/components/chat/Chat.tsx` · `ChatInput.tsx` |
| 発言色 | `src/lib/chat-text-color.ts` |
| middleware | `src/middleware.ts` |
| layout / metadata | `src/app/layout.tsx` |

---

## 8. 既知の落とし穴

1. **`globals.css` の mc 上書き** — `text-white`・`text-gray-*`・`bg-gray-900` 等をライト用に変換。黒バナーなど**意図的に暗い UI** は専用クラス（`.mc-ma-promo-header`）が必要。
2. **アイコン二種** — 丸付き `musicAIchat_icon.png` は使わない。バナーは `music_ai_chat_icon_wh_150.png`。
3. **dev 同時起動** — ma `.next` / mc `.next-mc` を分離。片方だけ `next dev` するともう一方のポートは落ちる。
4. **DB 未移行** — `product` 列なしでも ma は動くが、mc 分離・同時利用の検証は SQL 後が正。

---

## 9. 変更ログ（本書）

| 日付 | 内容 |
|------|------|
| 2026-07-07 | 初版 — Phase 0〜4・部屋白 UI・ma ヘッダーバナーまでを別 PC 引き継ぎ用に整理 |
