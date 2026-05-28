# PWA・スマホアプリ化 — 方針・ロードマップ

**索引・進捗**: `docs/00-pwa-mobile-app.md`  
**スマホ確認手順**: `docs/pwa-dev-verify-mobile.md`

**目的**: スマートフォン向けに「アプリとして使える体験」を整備する。  
**前提**: **PC 版は現行 Web のまま**。開発体制は **Cursor + Next.js + Vercel**（Xcode / Android Studio 等の追加環境は Phase 3 まで不要）。

---

## 1. 現状サマリー

| 領域 | 現状 |
|------|------|
| **基盤** | Next.js 14・Vercel・TypeScript |
| **認証** | Supabase Auth（Google・メール/パスワード・ゲスト） |
| **リアルタイム** | Ably |
| **動画** | YouTube IFrame Player API |
| **スマホ UI** | `RoomMainLayout`・`UserBar`・ライブラリ 3 段 UI 等 |
| **スマホ選曲** | YouTube 共有 → コピー → 貼り付け（`/guide/first-song-mobile`） |
| **PC 連携** | Chrome 拡張 |
| **PWA** | Phase 1 着手（manifest・導線 UI。SW は未） |
| **ストア** | なし |

---

## 2. 選択肢と推奨順序

| 方式 | mc との相性 |
|------|-------------|
| **A. PWA** | **第一候補** — 日々の改修を Web と同じデプロイで届けられる |
| **B. Capacitor / TWA** | 中期 — 共有シート・ストア掲載 |
| **C. ネイティブ全面** | 非推奨（工数・二重メンテ） |

1. PWA + モバイル UX  
2. 需要次第でストア版（WebView で本番 URL ならデプロイフローは PWA と同型）  
3. PC Web + 拡張は維持  

決済: まず Web（`docs/monetization-options.md`）。ストア IAP は収益化フェーズで別設計。

---

## 3. 日々の改修・データ更新（アプリ化後も同じ）

### 3.1 開発・リリース

```
Cursor で修正 → validate → git push → Vercel デプロイ
```

PWA ユーザーは **同じ本番 URL** を開く。ストアの再インストールは不要。

### 3.2 データの層

| 層 | 例 | ユーザー操作 |
|----|-----|--------------|
| **ライブ** | チャット・部屋・マイリスト | 不要 |
| **マスタ** | Supabase 曲 DB・Music8 GCS JSON | 不要（週次 sync は `docs/00-music8-weekly-mc-sync.md`） |
| **クライアント** | UI・JS | 通常は次回起動で反映。SW 導入時は「再読み込み」案内を検討 |

### 3.3 Service Worker 方針（未導入）

- 最初は **manifest + 導線のみ**（UI 改修とキャッシュ競合を避ける）
- SW を入れる場合は **更新告知 UI** をセットで

### 3.4 バックグラウンド再生

YouTube 埋め込みのため **アプリ化してもバックグラウンド音楽再生は期待しない**。主価値はフォアグラウンドの同期視聴＋チャット。

---

## 4. 整備項目（一覧）

### 4.1 PWA 基盤

| # | 項目 | 状態 |
|---|------|------|
| P1 | Web App Manifest | 済 |
| P4 | メタ・viewport | 済 |
| P3 | インストール導線 UI | 済 |
| P2 | Service Worker | 未 |
| P5 | safe-area 監査 | 随時 |

### 4.2 モバイル UX（Phase 1〜2）

選曲フロー・YouTube 共有受け口・キーボード・オンボーディング・実機パフォーマンス（`docs/my-list-spec.md` スマホ入口と連動）。

### 4.3 認証・ディープリンク（Phase 2）

OAuth Redirect・部屋 URL・standalone でのセッション検証。

### 4.4 ストア版（Phase 3）

Capacitor、共有拡張、審査、IAP。登録費の目安: Apple 99 USD/年、Google 25 USD 一度きり。

---

## 5. ロードマップ

```
Phase 0   モバイル Web 利用可
Phase 1   manifest・導線・メタ（進行中）→ 本書 §4.1
Phase 2   共有 URL・マイリスト入口・OAuth 実機
Phase 3   ストア版（任意）
継続      PC Web + 拡張
```

---

## 6. 検討事項（抜粋）

| ID | 論点 |
|----|------|
| T1 | SW: `next-pwa` / Serwist / 自前 |
| T2 | ストア: Capacitor vs TWA |
| T3 | 共有受け口: `/share?url=` vs カスタムスキーム |
| D2 | PC 拡張との parity（共有 vs ライブラリ選曲） |

全文・リスク表は Phase 2 以降に必要なら本書へ追記。方針変更時は **索引の進捗表も更新**。

---

## 7. やらないこと

- PC ネイティブ化
- YouTube API 外のバックグラウンド抽出
- React Native 全面書き直し（現時点）
- IAP 先行（収益化フェーズまで）

---

## 8. 関連ドキュメント

| 文書 | 内容 |
|------|------|
| `00-pwa-mobile-app.md` | 索引・進捗 |
| `pwa-dev-verify-mobile.md` | 実機確認 |
| `chrome-extension-musicaichat.md` | PC |
| `my-list-spec.md` | マイリスト・スマホ入口 |
| `monetization-options.md` | 決済 |

---

*最終更新: 2026-05-28*
