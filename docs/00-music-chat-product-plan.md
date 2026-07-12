# Music Chat × Music AI Chat — 二ブランド方針（索引）

> **用途**: AI 機能を一切持たない **Music Chat**（**mc** · ドメイン候補 **musicchat.jp**）を、既存 **Music AI Chat**（**ma** · **musicai.jp**）と併走させるための**正本**。  
> **目的**: 集客（基本無料プレイ）→ **ma** への利用促進 → 課金ユーザー増。  
> **ステータス**: 企画進行中 — **認証: 案 A 確定**（2026-07-07）

**関連**: `docs/musicchat-mc-handoff.md`（**実装進捗・別 PC 引き継ぎ**） · `docs/00-ai-trial-and-billing-implementation.md`（お試し・課金） · `docs/00-prepaid-pricing-summary.md`（価格） · `docs/サービス基本情報.md` · `AGENTS.md`

---

## 0. 呼称・ディレクトリ（確定）

| 略称 | 正式名 | ドメイン | ローカル dev | `NEXT_PUBLIC_PRODUCT` |
|:----:|--------|----------|--------------|-------------------------|
| **ma** | Music AI Chat / musicaichat | musicai.jp | http://localhost:**3002** | `musicaichat` |
| **mc** | Music Chat / musicchat | musicchat.jp | http://localhost:**3003** | `musicchat` |

| 項目 | 内容 |
|------|------|
| **共通作業ディレクトリ** | **`E:\mc`**（リネームしない。Git / Cursor ワークスペースはここ） |
| **パス `E:\mc` と略称 mc** | フォルダ名は歴史的経緯で `mc` だが、会話・本ドキュメントでは **mc ＝ Music Chat**。**ma ＝ musicaichat** |
| **旧ドキュメント** | `AGENTS.md` 等の「mc ＝ 洋楽 AI チャット」表記は **ma に読み替え**。本書以降は **ma / mc** を正 |

**開発の流れ（確定イメージ）**

- 共用機能（曲 DB・マイページ等）→ **1 回の指示・1 実装**
- プレビュー → **3002（ma）** と **3003（mc）** で別々に確認
- Git push → Vercel **2 プロジェクト** → musicai.jp / musicchat.jp

---

## 1. 概要

| 項目 | **mc**（Music Chat） | **ma**（Music AI Chat） |
|------|----------------------|-------------------------|
| **ドメイン** | **musicchat.jp**（候補） | **musicai.jp**（本番稼働中） |
| **訴求** | 邦楽・洋楽 — みんなで聴く同期チャット（**完全無料**） | AI が洋楽を解説・選曲を助ける（**AI 有料**） |
| **AI** | **一切なし** | お試し 10 曲 → プリペイド |
| **UI トーン** | **白ベース**（予定） | **黒ベース**（現状） |
| **役割** | ファネル上段（集客） | ファネル下段（体験・課金） |
| **曲種** | **邦楽 OK**（洋楽も可）。AI 解説なしのため ma より制限緩 | **洋楽中心**（邦楽は部屋設定・AI 原価都合で従来どおり） |
| **料金** | **完全無料**（AI・課金 UI なし） | AI 利用で有料（お試し後プリペイド） |
| **ma 導線** | **常に目立つ位置**に CTA（部屋・トップ・マイページ） | — |

**ma** はすでに AI なしでも選曲・同期再生・通常チャットは無料（U1/U3）。**mc** はその体験を **邦楽含む無料同期視聴**として別ブランドで打ち出し、**ma**（有料 AI）へ目立つ導線で送客する。

### 1.1 確定事項（2026-07-07）

| 項目 | 決定 |
|------|------|
| ルーム | **案2 — プロダクト別に部屋を分離**（§3.2）※案1は不採用 |
| mc MVP UI | **白テーマ必須**（初版から） |
| ドメイン | **musicchat.jp 取得予定** |
| mc 料金 | **完全無料** |
| ma 料金 | AI 有料（現行方針） |
| 邦楽 | **mc は解禁**（日本普及・利用者規模を優先） |
| ma 導線 | **常に目立つ表示**（控えめ CTA ではない） |

---

## 2. 共用 vs 分離

### 2.0 原則 — **AI 以外は常に共通化、二重開発禁止**

> **確定方針**: 曲 DB・マイページ・部屋コア・認証・ライブラリ等、**AI に依存しない機能は 1 実装のみ**。**mc** 用にコピー・フォーク・別 API・別コンポーネント tree は作らない。

| やること | やらないこと |
|----------|--------------|
| 同一 `src/` を **ma / mc** 両デプロイから使う | `E:\chat` 別 repo でマイページ等を再実装 |
| AI タブ・AI API だけ **product-mode で非表示 / 404** | `MyPageMusicChat.tsx` のような二重コンポーネント |
| 曲登録・Music8 sync は **`E:\mc` スクリプト 1 本** | musicchat 専用 DB・別 Supabase |
| バグ修正・機能追加は **1 PR で ma / mc 両方に効く** | 「mc だけ直す」分岐ファイルの増殖 |

**分岐の置き場所**: `src/lib/product-mode.ts`（新規）に集約。UI は `isMaProduct()` / `isMcProduct()`（または `isAiProduct()`）でガード。サーバーは middleware で **AI ルートのみ mc デプロイで 404**。

### 2.1 共用（DB・API・UI — 変更は 1 箇所）

#### データベース（Supabase 1 プロジェクト）

| テーブル群 | 用途 |
|------------|------|
| 認証 · `songs` / `artists` / マイリスト · 履歴 · お題（講評以外） · ルーム | **ma / mc 共通**（Music8 sync は `docs/00-music8-weekly-mc-sync.md` — ファイル名の `mc` は週次 sync 文脈のレガシー表記） |

#### API Routes — **共用（mc もそのまま呼ぶ）**

`/api/my-list` · `/api/library/*` · `/api/favorites` · `/api/room-playback-history` · `/api/room-gatherings` · `/api/user/public-profile` · `/api/user/join-greeting` · `/api/user/theme-playlist-mission`（**`room-blurb` は ma のみ**）· `/api/music8/*` 等 — 詳細は初版 §2.1 表と同様（AI 系除く）。

#### UI — **共用（AI タブだけガード）**

`MyPage.tsx` · `RoomWithSync` / `RoomWithoutSync` · `ChatInput` 等は **1 ファイル**。mc では AI 系タブ・@ ・課金を非表示。

| タブ / 機能 | mc | ma |
|-------------|:--:|:--:|
| プロフィール・ルーム管理・視聴・マイリスト・参加履歴・お題（講評なし） | ○ | ○ |
| @ 履歴 · AI 趣向 · お試し/課金 · Gemini 使用量 · AI 部屋設定 | × | ○ |

#### 管理・バッチ — **ma デプロイのみ**（DB は共用）

| パス | 備考 |
|------|------|
| `/admin/*` | **mc** デプロイでは 404 |
| cron · Music8 sync | **ma 側 1 本**（二重実行しない） |

**1 アカウント共通**（認証案 A）: musicchat.jp で登録 → **同じ Google / メール** で musicai.jp にログイン可能。セッションはドメインごと（§3.3）。

### 2.2 分離・抑止（AI とブランド殻のみ）

| 項目 | mc | ma |
|------|-----|-----|
| `/api/ai/*` 等 | **404** | フル |
| **Gemini（サーバー全体）** | **`getGeminiModel` が常に null**（視聴履歴の style/era 含む） | 通常 |
| 部屋 AI UI · 課金 UI | 非表示 | 表示 |
| LP · manifest · テーマ | 白・musicchat | 黒・musicaichat |

mc の視聴履歴 **スタイル**: Music8 → キャッシュ → 取れなければ `Other`（Gemini なし）。**年代**: キャッシュ → YouTube 公開日の十年ラベル → 取れなければ `Other`。

### 2.3 禁止事項（レビュー時）

- [ ] ma / mc 用コンポーネント **二重作成**
- [ ] `/api/my-list` 等の **別 route  tree**
- [ ] Music Chat 専用 Supabase / 曲テーブル
- [ ] Music8 sync の二重化

---

## 3. 実装アプローチ

### 3.1 同一リポジトリ · product-mode

```
NEXT_PUBLIC_PRODUCT=musicaichat   → ma（3002 / musicai.jp）
NEXT_PUBLIC_PRODUCT=musicchat     → mc（3003 / musicchat.jp）
```

- **Git / Cursor**: **`E:\mc`**
- **Vercel**: プロジェクト **2 本**（同一 Git、env のみ差替え）

### 3.2 ルーム・Ably — **確定: 案2（プロダクト別・同時利用可）**

> **2026-07-07 方針変更**: 案1（ルーム ID 共用）は **不採用**。実機で「ma の部屋 02 に mc 入室 → 追い出し・部屋名の強制同期」が起き、**別ブランドとして独立利用できない**ため。

#### 起きていたこと（案1の問題）

| 現象 | 原因 |
|------|------|
| mc で 02 に入ると ma から追い出される | 同一 Ably `room:02` + `room-session-takeover` が **プロダクトを区別しない** |
| mc の部屋名が ma と同じになる | `room_gatherings` · `display_title` が **product 列なしで 1 本** |
| 「同じ部屋が再度開かれたため…退室」 | 同一 `user_id` が **同じ roomId** を ma / mc で開いた |

ユーザーは **アカウントは 1 つ**のまま、**ma の部屋と mc の部屋を同時に・自由に**使いたい。別アカウントは現実的でない。

#### 案2の意味（確定）

| レイヤ | ma | mc |
|--------|-----|-----|
| **アカウント** | 共通（同一 `user_id`） | 共通 |
| **開催・参加の部屋** | **ma 用の会**（例: ma で部屋 02 主催） | **mc 用の会**（例: mc で部屋 09 主催） |
| **同時利用** | **可** — ma/02 と mc/09 を **同じブラウザ・同じログイン**で並行 |
| **Ably** | チャンネルに **product 接頭**（例: `musicaichat:room:02`） | `musicchat:room:09` |
| **DB** | `room_gatherings` 等に **`product`** 列（`musicaichat` \| `musicchat`） |
| **数字 ID** | 01〜09 等は **各プロダクト内で独立割当**（mc の 02 ≠ ma の 02 の中身） |

**例（理想）**

```
ろん（1 アカウント）
  ma  … localhost:3002/02  「開発中デバッグ」  AI あり
  mc  … localhost:3003/09  「土曜オフ会」      無料・邦楽 OK
        ↓ 同時に開いても追い出しなし・名前も連動しない
```

#### ma への導線（案2でも維持）

- mc から **「AI 解説は ma で」** CTA は継続
- **同じ room 番号への deep link は任意**（基本は ma トップ or 自分の ma 主催部屋へ誘導）
- ユーザーが望めば ma で **別の部屋**を選んで AI 体験

#### 実装タスク（Phase 1 — 未着手）

- [x] `room_gatherings.product`（+ ロビー `display_title` も product スコープ）
- [x] Ably チャンネル名を `getAblyRoomChannel(roomId)` で product 付与
- [x] `room-session-takeover` · `SessionReplacedNotice` を **product 内のみ**有効
- [x] トップの開催中一覧・主催 API を **product でフィルタ**（Step 1 で `room-gatherings` / `room-live-status`）
- [x] 既存 ma データは `product = musicaichat` として移行

**邦楽（mc）**: mc 集会のみ邦楽スキップ緩和（product-mode + 履歴 API）。

#### 案1（記録・不採用理由）

同一 `room/03` URL で ma・mc が同じチャット — クロスプロモは楽だが、**同一ユーザー・同時利用と両立しない**ため撤回。

### 3.3 認証 — **確定: 案 A**

| 項目 | 方針 |
|------|------|
| アカウント | Supabase 1 つ · `user_id` 共通 |
| ログイン UI | **各ドメイン**で完結 |
| セッション | **ドメインごと**。mc → ma は同 credentials で再ログイン（Google 1 タップ） |
| 中央 hub | Phase 1 では **作らない** |

Redirect URLs: 本番 **musicai.jp + musicchat.jp** · 開発 **localhost:3002 + 3003**（§3.3 旧表参照）。

### 3.4 本番デプロイ

| | **ma** | **mc** |
|--|--------|--------|
| ドメイン | musicai.jp | musicchat.jp |
| Vercel | プロジェクト A | プロジェクト B |
| cron · `/admin` | ○（cron は **A のみ 1 本**） | × |
| GEMINI | ○ | × |

---

## 4. ma への転換導線（mc から）— **常時・目立つ表示（確定）**

| 置き場所 | 内容 |
|----------|------|
| **部屋ヘッダー / UserBar 付近** | 常時バナー or 目立つボタン — 「AI が曲を解説 → Music AI Chat（無料 10 曲）」 |
| **トップ / LP** | mc＝完全無料 · ma＝AI 有料 の対比を明示 |
| **マイページ** | 同一アカウントで ma が使える旨 + ma リンク |
| **深リンク** | `https://musicai.jp/room/{同じroomId}?from=musicchat&promo=trial` |

**すみ分けメッセージ（案）**

- **mc**: 邦楽も洋楽も、同期視聴・チャットは **ずっと無料**
- **ma**: AI 解説・@ 質問は **お試し 10 曲 → 有料**。選曲だけなら mc で十分

お試し 10 曲 · AI API は **ma のみ**。mc 側で AI UI / API を出さない。

計測: `from=musicchat` · analytics · 将来 `referral_source` 等。

---

## 5. コスト・リスク

Ably / YouTube / Supabase 共用 · ブランド明示 · SEO 役割分担（mc＝同期視聴、ma＝AI）— 初版 §5 と同様。

---

## 6. ローカル開発

| 略称 | コマンド | URL |
|:----:|----------|-----|
| **ma** | `npm run dev` | http://localhost:**3002** |
| **mc** | `npm run dev:chat` | http://localhost:**3003** |
| **両方** | `npm run dev:both` | 3002 + 3003（**ターミナル 1 本**） |

- **mc を見るときは 3003**（`dev:chat` / `dev:both` が `NEXT_PUBLIC_PRODUCT=musicchat` を付与）
- **ma は 3002** のまま（env 未設定＝ma）
- いま **3002 だけ動いている** → 3003 は `ERR_CONNECTION_REFUSED`（mc サーバー未起動）
- **ターミナル 1 本**: 既存の `npm run dev` を **Ctrl+C** で止めてから `npm run dev:both`
- Phase 0 済: `product-mode.ts` · middleware AI/admin 404 · `data-theme=light`（body 白。部屋内 gray 直書きは Phase 1）

---

## 7. ロードマップ · Phase 0

Phase 0〜3 は初版 §7・§8 と同旨（`product-mode` · Redirect URL · mc MVP · ファネル計測）。

---

## 8. 変更ログ

| 日付 | 内容 |
|------|------|
| 2026-07-07 | 初版 |
| 2026-07-07 | §2.0 共通化 · §3.3 認証案 A · §3.4 デプロイ |
| 2026-07-07 | **§0 呼称確定 — ma＝musicaichat、mc＝musicchat、`E:\mc` は作業 dir のまま** |
| 2026-07-07 | §1.1 確定 — 邦楽 OK・mc 完全無料・白テーマ MVP 必須・案1 ルーム共用・ma 導線常時目立つ · musicchat.jp 取得予定 |
| 2026-07-07 | **Phase 0 実装** — `product-mode` · `npm run dev:chat`（3003）· middleware · 白テーマ土台 |
| 2026-07-07 | `dev:both` · mc 用 `distDir=.next-mc`（同時 dev の 404 回避） |
| 2026-07-07 | **§3.2 方針変更 — 案1 撤回 → 案2（プロダクト別部屋・同時利用可）** |
| 2026-07-07 | **案2 Step 1** — `room-product-scope` · SQL 手順 `docs/supabase-room-gatherings-product-column.md` · 集会 API / live 一覧 / Ably チャンネル接頭 · stale 終了の product スコープ |
| 2026-07-07 | **案2 Step 2** — `room-presence` / `room-auth-session` / `room-lobby-message` · セッション奪取ストレージの product 分離 |
| 2026-07-07 | **案2 Step 3** — `room-session-takeover` · 入室復元・claim/replaced ストレージの product 分離 · `SessionReplacedNotice` mc スタイル |
| 2026-07-07 | **案2 Step 4** — mc 部屋内 AI UI 非表示 · 白テーマ · ma 誘導バナー · チャットバブルライト化 · 邦楽視聴履歴の product スコープ緩和 |
| 2026-07-08 | **mc AI 原価ゼロ** — `isMcGeminiDisabled()` + `getGeminiModel` 一括オフ（視聴履歴 style/era の Gemini 含む） |
