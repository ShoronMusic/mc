# Music8 → MusicAIチャット 連携用 JSON 仕様

Music8 側で生成する **最適化 JSON** の条件・項目・ファイル名・ディレクトリ規則。アプリはこのツリーの URL のみを読む想定（既存 `data/songs/` の WP 用 JSON とは分離）。

**安定キー**：`artist_slug` + `song_slug`（ファイル名の `{artist_slug}_{song_slug}` と一致）

---

## 1. ベース URL とバージョン

- **本番例**：`https://xs867261.xsrv.jp/data/data/musicaichat/v1/`（サーバ上は `data/data/` 配下に配置）
- 実 URL の一覧は `docs/music8_json_example.txt` を参照。
- **アプリ側**：環境変数 `MUSIC8_MUSICAICHAT_BASE_URL`（省略時は上記と同じ）。無効化は `0` / `off` / `false`。インデックス TTL は `MUSIC8_MUSICAICHAT_INDEX_TTL_MS`（ミリ秒、省略時 3600000）。実装は `src/lib/music8-musicaichat.ts`。
- パスに **`v1`** を含め、スキーマの破壊的変更時は `v2` へ切り替え可能にする。
- 文字コード：**UTF-8（BOM なし）**

---

## 2. ディレクトリ構成

```
musicaichat/v1/
  manifest.json
  index/
    youtube_to_song.json
    artist_index.json
  songs/
    {artist_slug}_{song_slug}.json
  optional/                    # インデックス巨大化時のみ使用
    youtube/
      {video_id}.json          # 1 動画 ID 1 ファイル方式へ移行する場合
```

既存の `data/songs/` や `data/artists/` と**並行**でよい。本仕様は `musicaichat/v1/` 以下に限定する。

---

## 3. ファイル名ルール

| 種別 | パターン | 例 |
|------|-----------|-----|
| 曲ファクト本体 | `{artist_slug}_{song_slug}.json` | `david-bowie_china-girl.json` |

- スラッグは **既存 Music8 の slug 規則に従う**（小文字・ハイフンなど）。生成元はマスタ DB とし、ファイル名と `stable_key` を必ず一致させる。
- ファイル名に使えない文字は slug 生成段階で除外済みとする。

**カバー曲**：原曲と **別エントリ**（別 `artist_slug` / 別ファイル）とし、`relations` で原曲の `stable_key` とリンクする。

**同一原曲キーに複数 YouTube ID がある場合**：**1 ファイル**にまとめ、`youtube.ids` に列挙する（推奨）。

---

## 4. `manifest.json`

生成物全体のメタ情報。アプリはバージョン・生成日の確認に使える。

| 項目 | 説明 |
|------|------|
| `schema_version` | 例 `"1.0.0"` |
| `generated_at` | ISO8601 |
| `base_url` | この `v1` ツリーのベース URL |
| `counts` | `songs`, `youtube_index_entries`, `artists` など件数 |
| `index_files` | `youtube_to_song`, `artist_index` の相対パス |

---

## 5. 検索用インデックス

### 5.1 `index/youtube_to_song.json`

**目的**：YouTube 動画 ID → 曲の安定キー。

- キー：11 文字の `video_id`（例 `_YC3sTbAPcU`）
- 値（例）：

| フィールド | 型 | 説明 |
|------------|-----|------|
| `artist_slug` | string | 必須 |
| `song_slug` | string | 必須 |
| `role` | string | `primary` / `alternate`（同曲の別 MV 等） |
| `recording_kind` | string | 下記列挙 |

`recording_kind` の列挙例：`original` | `cover` | `live` | `remaster` | `radio_edit` | `short` | `other`

**スケールアウト**：エントリが肥大したら `optional/youtube/{video_id}.json` の 1 ID 1 ファイル、またはキー先頭ハッシュによるシャードに移行する。

### 5.2 `index/artist_index.json`

**目的**：アーティスト別の曲一覧を軽量に取得（フル曲 JSON を読む前の絞り込み）。

- キー：`artist_slug`
- 値（例）：

| フィールド | 説明 |
|------------|------|
| `songs` | 配列。各要素に `song_slug`, `title`, `youtube_ids`（任意・複数可）など |

---

## 6. 曲本体 `songs/{artist_slug}_{song_slug}.json`

### 6.1 必須トップレベル項目

| フィールド | 説明 |
|------------|------|
| `schema_version` | このファイルのスキーマ版（例 `1.0.0`） |
| `stable_key` | `{ "artist_slug", "song_slug" }`（ファイル名と一致） |
| `display` | 表示名・クレジット行（UI / プロンプト兼用） |
| `recording` | 録音種別・カバー／原曲関係 |
| `releases` | リリース日（可能なら ISO 日付のみ） |
| `classification` | ジャンル・スタイル・ボーカル等（**短い配列**。プロンプトに貼るならラベル文字列推奨） |
| `youtube` | 動画 ID の統合結果（後述） |
| `identifiers` | Spotify / Apple 等（あれば。重複排除用） |
| `facts_for_ai` | **AI プロンプト用の事実ブロック**（HTML 禁止・短文・箇条書き中心） |
| `relations` | 原曲・カバー・正準曲へのリンク（カバーでは推奨） |

### 6.2 `display`（例）

- `song_title`
- `primary_artist_name`
- `credit_line`
- 任意：`primary_artist_name_ja` など

### 6.3 `recording`（カバー・ライブ等）

- `kind`：`original` | `cover` | `live` | `remaster` | …（運用で固定）
- `this_version`：この録音／この版の `artist_name`, `artist_slug`, `release_year`, `notes`（短く）
- `original_work`：原曲側の `artist_name`, `artist_slug`, `song_slug`, `release_year`, `shared_with_this_commentary`（例：`lyrics`, `composition`, `historical_context`）

**方針（コンテンツ）**

- カバー：**カバーアーティストと公開年を最初に**示したうえで、オリジナルと共通する解説は **原曲アーティスト・リリース年・歌詞まわり**などに限定して共有する想定を `facts_for_ai` で表現する。
- オリジナル：`kind: original`。`original_work` は自参照または省略のいずれかに**生成側で統一**する。

### 6.4 `releases`

- `original_release_date`
- `this_release_date`（カバー・別録音で有効）

不明は `null` またはキー省略。

### 6.5 `youtube`

元データの `videoId` / `ytvideoid` を生成時に **マージ・重複除去**し、次に集約する。

| フィールド | 説明 |
|------------|------|
| `ids` | 動画 ID の配列 |
| `primary_id` | 代表として使う 1 本（任意） |

### 6.6 `facts_for_ai`（プロンプト専用・厳守）

- **HTML や長文 `content` を入れない**。箇条書きと短い文のみ。
- 推奨キー：

| キー | 説明 |
|------|------|
| `locale` | 例 `ja` |
| `opening_lines` | カバーでは「カバー側→原曲」の順で 1〜2 文。オリジナルでは簡潔な導入 |
| `bullets` | ジャンル・文脈・歌詞テーマなど 1 文単位の事実要約 |
| `constraints_for_model` | 「特定 MV に言及しない」等の禁止・注意 |
| `video_specific_line_template` | 動画固有は **最後の 1 文まで**（テンプレ） |

### 6.7 `relations`（任意・カバー推奨）

- `canonical_song`：`{ artist_slug, song_slug }`
- `derived_from` / `covers` など、グラフが必要なら拡張

---

## 7. 生成時の整合性条件（Music8 スクリプト側）

1. 各曲の `youtube.ids` の各 ID が、`youtube_to_song.json` に登録され、**同じ `stable_key`** を指すこと。
2. 同一 `video_id` が**別 stable_key** に重複登録されないこと（意図的な別扱いを除く）。
3. `stable_key` とファイル名 `{artist_slug}_{song_slug}.json` が一致すること。
4. `manifest.counts` が実ファイル数・インデックス件数と一致すること。
5. `facts_for_ai` に生 HTML や根拠のない数値（チャート等）を機械的に詰め込まない運用ルール（必要なら人手レビュー層）。

---

## 8. アプリ側参照 URL 例

ベースを `https://xs867261.xsrv.jp/data/data/musicaichat/v1/` とした場合：

- `https://xs867261.xsrv.jp/data/data/musicaichat/v1/manifest.json`
- `https://xs867261.xsrv.jp/data/data/musicaichat/v1/index/youtube_to_song.json`
- `https://xs867261.xsrv.jp/data/data/musicaichat/v1/index/artist_index.json`
- `https://xs867261.xsrv.jp/data/data/musicaichat/v1/songs/police_every-breath-you-take.json`（曲例）

その他のリンクは `docs/music8_json_example.txt` と同一。

---

## 9. キャッシュ方針（参考）

- Music8 照合結果はアプリ側で **`video_id → stable_key`** や **`stable_key → 取得日時 / lastUpdated`** をキャッシュ可能。
- `manifest.generated_at` または Music8 側の更新時刻でキャッシュ無効化を判断できるとよい。

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-04-11 | 初版（仕様ドラフトを MD 化） |
| 2026-04-11 | 本番ベース URL を `data/data/musicaichat/v1` に合わせ、`music8_json_example.txt` と相互参照 |
