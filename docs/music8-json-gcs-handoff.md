# MusicAIChat（mc）— Music8 静的 JSON / Xserver → GCS 引継ぎ

> **目的**: 別 PC・別セッションでも、`E:\mc`（MusicAIChat）が **Xserver 上の JSON** と **GCS（music8-json-prod）** の関係を把握し、日常運用・残タスクを迷わず進められるようにする。  
> **関連リポ**: `E:\m8`（Music8 本番サイト）— 移行完了ドキュメントは **`E:\m8\docs\gcs-json-migration.md`**  
> **Git 運用**: コミット・push は各リポでローカル判断（本ファイルは mc 側の単一ソース）

---

## 1. 2 リポの役割

| リポ | パス | 役割 |
|------|------|------|
| **m8** | `E:\m8` | 公開サイト music8.jp。静的 JSON の**生成正本**（`public/data`）と **GCS への rsync** を主にここで実施（2026-05 移行完了） |
| **mc** | `E:\mc` | MusicAIChat（musicai.jp）。JSON を**読んで** Supabase 取り込み・AI 曲解説・選曲連携に利用 |

**共有バケット（1 つ）**

- GCS: `gs://music8-json-prod/data/`
- HTTP（公開読み取り時）: `https://storage.googleapis.com/music8-json-prod/data/`
- パス例: `songs/`, `artists/`, `compact-songs.json`, `musicaichat/v1/`, `genres/`, `styles/` など（m8 と同じツリー）

---

## 2. 配信方式の違い（重要）

m8 と mc で **同じバケット** を使うが、**アプリからの読み方** が異なる。

| 項目 | m8（music8.jp） | mc（musicai.jp） |
|------|-----------------|------------------|
| JSON の取り方 | ブラウザ / サーバーが **GCS 公開 URL** を直接 `fetch` | 原則 **Vercel サーバー**が SA で GCS 取得 → API / サーバー処理（`music8-gcs-server.ts`） |
| バケット公開 | **公開読み取り**（`allUsers` objectViewer + CORS）— m8 移行済み | ドキュメント上は **非公開バケット + SA** 方針（`docs/firestore-json-migration-notes.md` 2026-04 追記） |
| 旧 Xserver JSON | ロールバック用にコード上レガシー URL 残存 | 管理 UI・bulk import の**既定値が Xserver のまま**の箇所あり（§5） |

mc のランタイム（`music8-musicaichat.ts` 等）は **既定で GCS URL**（`storage.googleapis.com/.../musicaichat/v1`）。  
管理画面・bulk import の既定 URL も **GCS**（`src/lib/music8-data-urls.ts`）。ロールバック時のみ `MUSIC8_SONGS_BASE` 等で Xserver を指定可能。

---

## 3. URL 対応表

| 用途 | 旧（Xserver） | 新（GCS） |
|------|---------------|-----------|
| 曲 JSON ディレクトリ | `https://xs867261.xsrv.jp/data/data/songs` | `https://storage.googleapis.com/music8-json-prod/data/songs` |
| アーティスト JSON | `https://xs867261.xsrv.jp/data/data/artists` | `https://storage.googleapis.com/music8-json-prod/data/artists` |
| musicaichat v1 | `https://xs867261.xsrv.jp/data/musicaichat/v1/` 等（パス表記ゆれに注意） | `https://storage.googleapis.com/music8-json-prod/data/musicaichat/v1` |
| 圧縮配布（廃止方向） | `data.zip` + PHP 展開 | **使わない** — `gcloud storage rsync` |
| WordPress API（JSON とは別） | `https://xs867261.xsrv.jp/md/wp-json` | 変更なし（生成スクリプトが参照） |

**サムネイル・画像**は JSON 配信とは別。JSON 内の `thumbnail` / Spotify URL は従来どおり外部 CDN（Xserver WP / Spotify 等）。m8 移行ドキュメント参照。

---

## 4. データの正本と生成フロー

### 4.1 どこに JSON ができるか

| 場所 | 説明 |
|------|------|
| **`E:\m8\public\data`** | **推奨の正本**（m8 の `scripts/update-all-data.js` 出力先）。GCS rsync の実績もここから |
| **`E:\mc\log\public\data`** | mc リポ内 `log/scripts/update-all-data.js` の出力先（`log/scripts` から見て `../public/data`） |
| **`E:\mc\public\data`** | **存在しない**（`public/svg` のみ） |

**推奨運用**: JSON の生成・GCS 同期は **m8 側で実施**し、mc は GCS（または SA 経由）から読む。  
mc の `log/scripts` は m8 からコピーされたレガシー生成群。二重管理を避けるなら m8 を正とする。

### 4.2 m8 での日常運用（生成 + GCS）

```powershell
cd E:\m8
# .env.local に MUSIC8_GCS_SYNC=1 がある場合、1 コマンドで GCS まで
node scripts/update-all-data.js
```

- 詳細・検証: `E:\m8\docs\gcs-json-migration.md`
- ログ: `E:\m8\scripts\update-logs\update-log-<日時>.txt`
- 成功時の目印: `[SUCCESS] GCS rsync が完了しました`

### 4.3 mc 側の生成スクリプト（任意・レガシー）

```powershell
cd E:\mc
# 出力先: E:\mc\log\public\data
# GCS 同期: 環境変数 MUSIC8_GCS_SYNC=1（※ .env.local 自動読込は m8 版のみ。mc 版は要 $env: または dotenv 未実装）
node log/scripts/update-all-data.js
```

GCS に上げるローカル元を m8 に揃える例:

```powershell
$env:MUSIC8_GCS_SYNC = "1"
$env:MUSIC8_GCS_SYNC_SOURCE = "E:\m8\public\data"
node log/scripts/update-all-data.js
```

または m8 完了後に手動 rsync:

```powershell
gcloud storage rsync "E:\m8\public\data" gs://music8-json-prod/data --recursive
```

---

## 5. mc コード上の参照状況（2026-05 時点）

### 5.1 すでに GCS 前提（変更不要なことが多い）

| ファイル | 内容 |
|----------|------|
| `src/lib/music8-musicaichat.ts` | 既定 `.../music8-json-prod/data/musicaichat/v1` |
| `src/lib/music8-song-lookup.ts` | GCS `songs` / `artists` |
| `src/lib/music8-gcs-server.ts` | SA 認証 fetch |
| `src/app/api/music8/song-by-playback/route.ts` | 同上 |
| `src/app/api/music8/artist-by-name/route.ts` | 同上 |
| `scripts/import-music8-artists-bulk.ts` | 既定 GCS artists |
| `scripts/import-music8-songs-bulk.ts` | `artist_index.json` のみ GCS 既定 |

### 5.2 移行済み（2026-05-25）

| ファイル | 内容 |
|----------|------|
| `src/lib/music8-data-urls.ts` | GCS HTTP ベース一元化・env 解決ヘルパ |
| `src/components/admin/AdminSongMusic8JsonImportPanel.tsx` | 既定 GCS songs |
| `src/components/admin/AdminArtistJsonImportPanel.tsx` | 既定 GCS artists |
| `src/app/admin/songs/[songId]/page.tsx` | 曲 JSON 直リンク・`MUSIC8_SONGS_BASE` 渡し |
| `scripts/import-music8-songs-bulk.ts` | CLI 既定 GCS |
| `src/lib/music8-canonical-artist-name.ts` | Xserver フォールバック削除 |
| `log/scripts/generate-musicaichat-json.js` | `BASE_URL` GCS |

ローカル検証は従来どおり `--songs-local-dir` / `E:/m8/public/data/songs` を利用。

---

## 6. 環境変数（mc / `.env.local`）

`.env.example` には Music8/GCS 項目が少ない。**本番 Vercel では以下を確認**（`docs/firestore-json-migration-notes.md` 参照）。

| 変数 | 用途 |
|------|------|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Vercel: SA 鍵 JSON 全文 |
| `GOOGLE_CLOUD_PROJECT` | 例: `music8-a161a` |
| `GOOGLE_APPLICATION_CREDENTIALS` | ローカル: 鍵ファイルパス |
| `MUSIC8_MUSICAICHAT_BASE_URL` | musicaichat ベース。`0` / `off` で無効化 |
| `MUSIC8_MUSICAICHAT_INDEX_TTL_MS` | 索引キャッシュ TTL |
| `MUSIC8_WP_REST_BASE_URL` | WP REST（生成・補助） |
| `MUSIC8_ARTIST_SONGS_BASE` / `MUSIC8_BULK_SONGS_BASE` | bulk import（未設定時 Xserver） |
| `MUSIC8_ARTIST_INDEX_URL` | 既定 GCS の artist_index |
| `MUSIC8_ARTISTS_GCS_BASE` | artists bulk 既定 |

**GCS 同期（生成スクリプト用・mc の `log/scripts`）**

| 変数 | 用途 |
|------|------|
| `MUSIC8_GCS_SYNC` | `1` で rsync 実行（全生成成功時のみ） |
| `MUSIC8_GCS_BUCKET` | 既定 `gs://music8-json-prod/data` |
| `MUSIC8_GCS_SYNC_SOURCE` | ローカル元上書き（例 `E:\m8\public\data`） |
| `MUSIC8_GCS_DRY_RUN` | `1` で差分確認のみ |

**m8 の `.env.local` 例**（サイト用）:

```
DATA_BASE_URL=https://storage.googleapis.com/music8-json-prod/data
NEXT_PUBLIC_DATA_BASE_URL=https://storage.googleapis.com/music8-json-prod/data
MUSIC8_GCS_SYNC=1
```

mc には `DATA_BASE_URL` は不要（Next が m8 用 URL を持たない）。代わりに §6 の SA / `MUSIC8_*` を使う。

---

## 7. 別 PC 初回セットアップ

- [ ] `E:\m8` と `E:\mc` を clone
- [ ] Node.js（各 `package.json` の major に合わせる）
- [ ] `gcloud auth login` / `gcloud config set project music8-a161a`
- [ ] m8: `.env.local`（WP 認証・`MUSIC8_GCS_SYNC` 等）
- [ ] mc: `.env.local`（Supabase・Gemini・`GOOGLE_*`・`MUSIC8_*`）
- [ ] mc 本番: Vercel に `GOOGLE_APPLICATION_CREDENTIALS_JSON` + 再デプロイ済みか確認
- [ ] 疎通: m8 `node scripts/verify-gcs-json.js` / mc 管理画面または API で 1 曲 JSON 取得

---

## 8. 検証コマンド

```powershell
# GCS 上の代表ファイル
gcloud storage ls gs://music8-json-prod/data/compact-songs.json
gcloud storage ls gs://music8-json-prod/data/musicaichat/v1/manifest.json

# HTTP（公開設定時・m8 用）
curl -I "https://storage.googleapis.com/music8-json-prod/data/latest-songs.json"
```

mc 本番はブラウザ直 fetch ではなく API 経由のため、**管理画面で JSON 取り込み**または **comment-pack が musicaichat facts を拾うか**で確認する。

---

## 9. やめること / 残すこと

| やめる（JSON 配信） | 残す |
|---------------------|------|
| Xserver へ `data.zip` アップロード + PHP 展開 | WordPress REST（JSON **生成**用） |
| 本番参照を Xserver `/data/data/` に戻す（ロールバック時以外） | ローカル `E:\m8\public\data` を正本として編集・rsync |
| mc 管理 UI の Xserver URL を新規運用で使い続ける | bulk import の `--songs-local-dir` / 一時 proxy（`127.0.0.1:38100`）でのデバッグ |

---

## 10. 関連ドキュメント（mc 内）

| ファイル | 内容 |
|----------|------|
| `docs/firestore-json-migration-notes.md` | GCS 方針・rsync・Vercel SA・非公開バケット |
| `docs/music8-library-import-notes.md` | 曲ライブラリ取り込み・`E:/m8/public/data` |
| `docs/music8-musicaichat-json-spec.md` | musicaichat v1 ツリー |
| `docs/music8-artist-import-handoff.md` | アーティスト bulk・env |
| `docs/music8-song-json-schema.md` | 曲 JSON スキーマ |
| `AGENTS.md` | musicaichat JSON・env の入口 |

**m8 側（生成・公開サイト）**

| ファイル | 内容 |
|----------|------|
| `E:\m8\docs\gcs-json-migration.md` | Phase 1–5 完了手順・日常運用・ロールバック |

---

## 11. 残タスクチェックリスト（mc プロジェクト）

- [x] 管理 UI 3 箇所の既定 URL を GCS（または env）に変更 — `music8-data-urls.ts` + 管理パネル・曲詳細
- [x] `import-music8-songs-bulk.ts` の CLI 既定を GCS に
- [x] `music8-canonical-artist-name.ts` フォールバックを GCS に（Xserver 二重参照を削除）
- [x] `log/scripts/generate-musicaichat-json.js` の `BASE_URL` を GCS に統一
- [x] `.env.example` に `GOOGLE_*` / `MUSIC8_*` / `MUSIC8_GCS_*` を追記
- [ ] （任意）`log/scripts/update-all-data.js` に m8 同様の `.env.local` dotenv 読込
- [x] `src/lib/music8-data-urls.ts` で URL 一元化
- [ ] Xserver `data.zip` 運用の完全停止（m8 / インフラ判断）

---

## 12. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-05-25 | 初版。m8 GCS 移行完了を前提に mc 引継ぎを集約 |
