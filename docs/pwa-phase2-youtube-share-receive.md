# Phase 2 — YouTube 共有 → アプリ（PWA）で受け取り

**索引**: `docs/00-pwa-mobile-app.md`  
**確認手順**: `docs/pwa-dev-verify-mobile.md` §3（共有項目を追加）  
**関連**: `docs/guide/first-song-mobile`（コピペ手順）・`docs/chrome-extension-musicaichat.md`（PC 拡張）

---

## 目的

スマホの YouTube アプリ（またはブラウザ）から **「共有」→ 洋楽AIチャット** を選び、部屋の**発言欄に正規化した `watch?v=` URL を入れる**（送信はユーザーが手動。拡張と同じ）。

コピー＆貼り付け（`first-song-mobile`）の次の一手として **PWA の Web Share Target** を使う。

---

## 方式

| 項目 | 採用 |
|------|------|
| 受け口 URL | `GET /share`（manifest `share_target.action`） |
| パラメータ | `url` / `text` / `title`（OS が渡すものをすべて解析） |
| URL 正規化 | `canonicalYouTubeWatchUrl`（拡張 `content-youtube.js` と同等） |
| 部屋への遷移 | `sessionStorage` の直近参加部屋 `mc:last_active_room` があれば `/{roomId}`、なければ `/?share_pending=1` |
| 発言欄反映 | `sessionStorage` `mc:share_pending_chat_text` → 部屋マウント時に `ChatInput` が消費 |
| 自動送信 | **しない**（拡張・手動貼り付けと同じ） |

### 見送り（今回）

- カスタム URL スキーム（`musicaichat://`）— ストア版（Phase 3）で再検討
- `POST` の share_target — GET で十分
- 共有と同時の自動選曲送信

---

## 対応プラットフォーム

| 環境 | 期待 |
|------|------|
| Android Chrome / PWA（ホーム画面） | **共有先に表示されやすい**（Share Target の主対象） |
| iOS Safari / PWA | Share Target の対応は限定的。**未対応時は従来どおりコピペ**（ガイド参照） |
| PC ブラウザ | 共有シートに載らないことが多い。**Chrome 拡張**を利用 |

---

## ユーザーフロー

1. ホーム画面から洋楽AIチャットを起動し、一度部屋に入室（以降 `mc:last_active_room` が更新される）。
2. YouTube で動画を開き **共有 → 洋楽AIチャット（β）** を選択。
3. アプリが `/share?...` を開き、YouTube URL を抽出・正規化。
4. 直近の部屋へ遷移し、**発言欄に URL が入る**（フォーカス）。
5. ユーザーが **送信** で選曲。

直近部屋がない場合はトップへ。バナーで「部屋を開くと共有した URL が発言欄に入ります」と表示。

---

## 実装（コード）

| パス | 役割 |
|------|------|
| `public/manifest.webmanifest` | `share_target` 定義 |
| `src/app/share/page.tsx` | 共有パラメータ解析・保存・リダイレクト |
| `src/lib/youtube-canonical-watch-url.ts` | URL 正規化・共有ペイロードからの抽出 |
| `src/lib/share-target-pending.ts` | sessionStorage・直近部屋 ID |
| `src/components/chat/ChatInput.tsx` | 保留 URL の消費 |
| `src/components/room/RoomWithSync.tsx` / `RoomWithoutSync.tsx` | 入室時に直近部屋を記録 |
| `src/components/home/SharePendingNotice.tsx` | トップの案内バナー |

---

## 確認（本番 HTTPS）

1. Android で PWA をホーム画面に追加。
2. 部屋に入室 → YouTube アプリで共有 → 洋楽AIチャットを選択。
3. 部屋に戻り、発言欄に `https://www.youtube.com/watch?v=...` が入ること。
4. 送信で選曲できること。

---

## 進捗

| 項目 | 状態 |
|------|------|
| 仕様（本書） | 済 |
| manifest `share_target` | 済 |
| `/share` + 正規化 + 保留 | 済 |
| ChatInput 消費 | 済 |
| 実機（Android PWA） | 未 |

---

*作成: 2026-05-29*
