# Music8 アーティスト JSON → mc `artists` 取り込み・将来統合計画

更新: 2026-05-21

## 目的

- **m8（Music8）アーティスト JSON を正**として、mc（洋楽チャット）の `artists` マスタを揃える。
- 曲一括取り込み（`import-music8-songs-bulk.ts`）と同様、**`{slug}.json`** を正本とする。
- **一覧（slug 供給）:** `E:\m8\public\data\artists.json`（配列・コンパクト）。mc 参照コピー: `log/artists.json`。
- **個別（DB 反映の正本）:** `E:\m8\public\data\artists\{slug}.json`（`{slug}_songs.json` / `{slug}_spngs.json` は**対象外**）。
- **この PC の取り込み用コピー（推奨）:** `C:\Users\maeha\json\artists.json` と `C:\Users\maeha\json\artists\{slug}.json`。
- **本番 GCS:** 上記と同パス（HTTP / ローカル未指定時のフォールバック）。
- 将来 m8 / mc を**同一ドメインモデルに統合**できるよう、フィールド意味を m8 に寄せる（mc 専用は最小限）。

参考 JSON 例: `log/strokes.json`（The Strokes / `slug: strokes`）。

---

## 現状（2026-05 時点）

| 指標 | 値 |
|------|-----|
| `artists` 総数 | 約 5,121 |
| `music8_artist_slug` あり | 約 2,410 |
| slug なし | 約 2,711（YouTube 選曲などで生成された行） |
| `songs` 総数 | 約 20,896 |

### mc と m8 の差

| 項目 | m8 | mc（従来） |
|------|-----|------------|
| 表示名 | `name` + `thePrefix` 分離 | `name` 1列に The 込み混在 |
| WP ID | `id`（例: 4834） | 未保存 |
| 説明文 | `description`（英日混在） | `profile_text`（和文抽出のみ） |
| Spotify | `acf.spotify_artist_id` 等 | 列あり・**アーティスト JSON import 未マップ**（曲 JSON 経由のみ） |
| メンバー | `member[]` 構造化 | `members` カンマ文字列 |

---

## 方針（m8 に寄せる）

### キー優先順位（突合）

1. `music8_artist_id`（m8 `id`）
2. `music8_artist_slug`（m8 `slug`）
3. 名前（補助・The ゆれは `name_sort` / loose match）

### 列設計（第1弾マイグレーション）

| mc 列 | m8 由来 | 役割 |
|-------|---------|------|
| `name` | 合成表示名 | **後方互換**（`The Strokes`）。ライブラリ `ilike` は当面この列 |
| `name_base` | `name` | 冠詞なし本体（`Strokes`） |
| `the_prefix` | `thePrefix` / `the_prefix` | `The` / `A` / `An` |
| `name_sort` | 算出 | The 抜き小文字（ソート・名寄せ） |
| `music8_artist_id` | `id` | 統合時の固定キー |
| `music8_artist_slug` | `slug` | 既存 |
| `name_ja` | `artistjpname` | 既存 |
| `kind` | `Occupation[].value` | `band` 等 |
| `origin_country` | `acf.artistorigin` | 既存 |
| `active_year_start` | `artistactiveyearstart` | 検索用 |
| `active_period` | 整形文字列 | 表示用（例: `1998 -`） |
| `members` | `member[].name` | 既存 |
| `profile_text` | 和文抽出 | 既存（= `description_ja` 相当） |
| `description_en` | `description` 英語部 | 新規 |
| `image_url` | `spotify_artist_images` | 代表画像 |
| `spotify_artist_id` / `spotify_artist_images` | acf | 既存・import で必ず反映 |
| `youtube_channel_url` / `youtube_channel_title` | `youtube_channel` | 既存 |
| `music8_members` | `member[]` | jsonb（m8 形状保持） |
| `music8_synced_at` | — | 最終同期時刻 |

**保存しない（WP ラッパー）:** `taxonomy`, `parent`, `_links`, `count`, `link` など。

SQL は `docs/supabase-songs-and-performances-tables.md` の「アーティスト m8 整合」節を Supabase SQL Editor で実行。

---

## m8 JSON ↔ mc マッピング（Strokes 例）

| m8 キー | 例 | mc 列 |
|---------|-----|--------|
| `id` | `4834` | `music8_artist_id` |
| `slug` | `strokes` | `music8_artist_slug` |
| `name` | `Strokes` | `name_base` |
| `thePrefix` | `The` | `the_prefix` |
| — | `The Strokes` | `name`（`formatArtistDisplayName`） |
| `artistjpname` | `ザ・ストロークス` | `name_ja` |
| `occupation` | `band` | `kind` |
| `acf.artistorigin` | `US` | `origin_country` |
| `artistactiveyearstart` | `1998` | `active_year_start` / `active_period` |
| `member[]` | `Albert Hammond Jr.` | `members` + `music8_members` |
| `description` | 英語段落 | `description_en` / 和文→`profile_text` |
| `spotify_artist_id` | （空でも可） | `spotify_artist_id` |

---

## 実装（mc）

| パス | 内容 |
|------|------|
| `src/lib/music8-artist-import.ts` | JSON 正規化 → DB パッチ生成・突合・upsert |
| `src/app/api/admin/artist-master-import-json/route.ts` | 上記ライブラリ利用 |
| `scripts/import-music8-artists-bulk.ts` | GCS / URL 一覧から一括（`--dry-run` / `--apply`） |
| `src/lib/music8-canonical-artist-name.ts` | DB から `name_base` + `the_prefix` で表示名解決 |

### 一括取り込み（準備済み）

```bash
# 推奨（この PC）: 一覧 JSON で slug を決め、個別 JSON を artists/ から読む
npx tsx scripts/import-music8-artists-bulk.ts --dry-run `
  --artists-list=C:/Users/maeha/json/artists.json `
  --artists-dir=C:/Users/maeha/json/artists --limit=5
npx tsx scripts/import-music8-artists-bulk.ts --apply `
  --artists-list=C:/Users/maeha/json/artists.json `
  --artists-dir=C:/Users/maeha/json/artists

# mc 内の参照コピー（一覧のみ・個別は m8 側ディレクトリが必要）
npx tsx scripts/import-music8-artists-bulk.ts --dry-run --from-artists-list --artists-dir=E:/m8/public/data/artists --limit=3

# 再開（一覧の配列順で先頭 N 件スキップ）
npx tsx scripts/import-music8-artists-bulk.ts --apply --artists-list=E:/m8/public/data/artists.json \
  --artists-dir=E:/m8/public/data/artists --skip-artists=1000 --limit=500

# 失敗ログ（apply 時・既定 C:/Users/maeha/json/music8-artist-import-failures-{timestamp}.jsonl）
# `idx_artists_name` 重複は `resolveExistingArtistIdForMusic8Patch` で既存行に update（再実行可）
npx tsx scripts/import-music8-artists-bulk.ts --apply `
  --retry-failures=C:/Users/maeha/json/music8-artist-import-failures-2026-05-21T07-18-33-563Z.jsonl `
  --artists-dir=C:/Users/maeha/json/artists

# ディレクトリ列挙のみ（一覧 JSON なし）
npx tsx scripts/import-music8-artists-bulk.ts --dry-run --artists-dir=E:/m8/public/data/artists --limit=5

# 1 slug（ローカル優先 → 無ければ GCS）
npx tsx scripts/import-music8-artists-bulk.ts --apply --artists-dir=E:/m8/public/data/artists --slug=abc

# 単体 JSON（mc 側のコピー）
npx tsx scripts/import-music8-artists-bulk.ts --dry-run --json-file=log/strokes.json

# GCS / artist_index（ローカルが無いとき）
npx tsx scripts/import-music8-artists-bulk.ts --apply --slug=strokes
npx tsx scripts/import-music8-artists-bulk.ts --apply --from-gcs-list
```

`.env.local` 例（この PC にコピーした場合）:

```
MUSIC8_ARTISTS_DIR=C:/Users/maeha/json/artists
MUSIC8_ARTISTS_LIST_JSON=C:/Users/maeha/json/artists.json
MUSIC8_ARTISTS_FAILURE_LOG_DIR=C:/Users/maeha/json
```

m8 外付け SSD から取る場合:

```
MUSIC8_ARTISTS_DIR=E:/m8/public/data/artists
MUSIC8_ARTISTS_LIST_JSON=E:/m8/public/data/artists.json
```

`npm run import:music8:artists` は `--dry-run --slug=strokes` のショートカット。

---

## 運用フロー（推奨）

1. **SQL マイグレーション**（新列追加）を本番／開発 DB に適用。
2. **パイロット:** `log/strokes.json` または `--slug=strokes` で dry-run → apply。
3. **一括:** `--from-gcs-list` または slug リストファイルで全アーティスト同期。
4. **既存行の整理:** slug なし 2,711 行は別途 `music8_artist_slug` 付与・The ゆれ統合（`normalize:songs:main-artist` と同系）。
5. **曲取り込み:** 既存 `import:music8:bulk` と併用。`songs.main_artist` は `resolveMainArtistForNewSongRegistration` が m8 正式名を優先。

---

## 将来統合（m8 ⟷ mc）

| 段階 | 内容 |
|------|------|
| **現在** | mc は m8 JSON の**レプリカ + uuid**。表示は m8 と同じ `the_prefix` + `name_base` ルール。 |
| **中期** | 差分同期は `music8_artist_id` + `music8_synced_at`。任意で `music8_artist_snapshot` jsonb を全レスポンス保存。 |
| **統合時** | mc 専用列（`image_credit` 等）だけ `artist_mc_meta` に退避。検索・チャットは m8 マスタ API を正とし、mc DB はキャッシュ可。 |

### 統合後も mc に残すもの

- `id` (uuid)、`created_at` / `updated_at`
- チャット／視聴集計との FK（`songs.artist_id`）
- YouTube のみ存在するアーティスト（`music8_artist_id` null 許容）

---

## 関連ドキュメント

- `docs/supabase-songs-and-performances-tables.md` — SQL・`artists` 定義
- `docs/music8-library-import-notes.md` — 曲一括取り込み
- `docs/song-artist-db-fields.md` — 長期フィールド案
- `log/strokes.json` — アーティスト JSON サンプル
- `AGENTS.md` — 心臓部・コマンド
