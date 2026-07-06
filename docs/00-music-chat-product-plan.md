# Music Chat × Music AI Chat — 二ブランド方針（索引）

> **用途**: AI 機能を一切持たない **Music Chat**（**mc** · ドメイン候補 **musicchat.jp**）を、既存 **Music AI Chat**（**ma** · **musicai.jp**）と併走させるための**正本**。  
> **目的**: 集客（基本無料プレイ）→ **ma** への利用促進 → 課金ユーザー増。  
> **ステータス**: 企画進行中 — **認証: 案 A 確定**（2026-07-07）

**関連**: `docs/00-ai-trial-and-billing-implementation.md`（お試し・課金） · `docs/00-prepaid-pricing-summary.md`（価格） · `docs/サービス基本情報.md` · `AGENTS.md`

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
| **訴求** | みんなで洋楽を聴く・選曲する同期チャット | AI が曲を解説・選曲を助ける |
| **AI** | **一切なし** | お試し 10 曲 → プリペイド |
| **UI トーン** | **白ベース**（予定） | **黒ベース**（現状） |
| **料金** | 基本無料 | AI 利用で課金 |
| **役割** | ファネル上段（集客） | ファネル下段（体験・課金） |

**ma** はすでに AI なしでも選曲・同期再生・通常チャットは無料（U1/U3）。**mc** はその体験を別ブランド・別ドメインで打ち出し、**ma** の課金ストーリーを汚さず集客する。

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
| 部屋 AI UI · 課金 UI | 非表示 | 表示 |
| LP · manifest · テーマ | 白・musicchat | 黒・musicaichat |

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

### 3.2 ルーム・Ably

**案1（推奨）**: ルーム ID 共用。mc で作った部屋は ma からも同 URL（AI は ma のみ）。

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

## 4. ma への転換導線（mc から）

1. 部屋内 CTA — 「AI 解説 → musicai.jp で無料 10 曲」
2. 登録後 — 同一アカウントで **ma** のお試しが使える旨
3. `https://musicai.jp/room/03?from=musicchat&promo=trial`
4. お試し 10 曲 · AI API は **ma のみ**

---

## 5. コスト・リスク

Ably / YouTube / Supabase 共用 · ブランド明示 · SEO 役割分担（mc＝同期視聴、ma＝AI）— 初版 §5 と同様。

---

## 6. ローカル開発

| 略称 | コマンド（実装後） | URL |
|:----:|-------------------|-----|
| **ma** | `npm run dev` | http://localhost:3002 |
| **mc** | `npm run dev:chat`（予定） | http://localhost:3003 |

- **ディレクトリは常に `E:\mc`**
- 共用機能の変更 → **3002 と 3003 両方**でプレビュー推奨
- AI のみの変更 → 3002 のみで可

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
