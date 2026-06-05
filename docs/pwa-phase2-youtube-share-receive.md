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
| 共有データの保存 | **`localStorage`**（Android 共有冷起動で sessionStorage が消えるため） |
| 部屋への遷移 | 直近部屋があれば `/share` から **部屋へ直接**。トップに来た場合も **自動で部屋へ** |
| セッション cookie の更新 | **middleware** で `getUser()`（PWA 冷起動・共有復帰） |
| 共有からの JoinGate | **端末選択 API をスキップ**・`refreshSession`・直前入室スナップショットで自動入室 |
| PWA 他アプリ復帰 | 上記と同じ **入室スナップショット**（`mc:last_room_enter_v1`）で JoinChoice を省略 |
| ゲスト参加情報 | **localStorage**（`guest-room-persistence.ts`） |

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
| `src/lib/share-target-pending.ts` | localStorage・直近部屋 ID・共有フラグ |
| `src/lib/room-enter-resume.ts` | 直前入室スナップショット（共有復帰用） |
| `src/lib/supabase/middleware.ts` | セッション cookie 更新 |
| `src/components/auth/JoinGate.tsx` | 共有時の自動入室・端末選択スキップ |
| `src/components/chat/ChatInput.tsx` | 保留 URL の消費 |
| `src/components/room/RoomWithSync.tsx` / `RoomWithoutSync.tsx` | 入室時に直近部屋を記録 |
| `src/components/home/SharePendingNotice.tsx` | トップの案内バナー |

---

## 確認（本番 HTTPS）

1. Android で PWA をホーム画面に追加。
2. 部屋に入室 → YouTube アプリで共有 → 洋楽AIチャットを選択。
3. 部屋に戻り、発言欄に `https://www.youtube.com/watch?v=...` が入ること。
4. **再ログインを求められず**、そのまま（または数秒の「読み込み中」のあと）部屋に入れること。
5. 送信で選曲できること。

### 再ログインが出る場合

| 原因 | 対処 |
|------|------|
| 共有冷起動で **sessionStorage が空**（直近部屋・URL が消える） | **修正済み**: localStorage に保存。トップ経由でも直近部屋へ自動遷移 |
| セッション cookie の読み込みが遅い | **修正済み**: 共有時は最大 8 秒待ってから JoinGate 判定 |
| **iOS** で共有が Safari タブで開く | ホーム画面アイコンから利用。コピペ fallback |

実装: `resolveSupabaseUserClient`・`/share` から `window.location.replace` で部屋へ・`mc:join_gate_known_auth_user_id`。

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
