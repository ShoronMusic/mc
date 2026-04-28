# Music8 曲単位 JSON（スキーマメモ）

WordPress（Music8）側で生成された**1曲1ファイル**の JSON です。アプリは `src/lib/music8-song-lookup.ts` の定数 `MUSIC8_SONGS_BASE` から同じパス規則で取得しています。

## 例（公開 URL・ローカルコピー）

- **公開 URL**: [https://xs867261.xsrv.jp/data/data/songs/police_every-breath-you-take.json](https://xs867261.xsrv.jp/data/data/songs/police_every-breath-you-take.json)
- **ファイル名規則**: `{メインアーティストslug}_{曲slug}.json`（例: `police` + `_` + `every-breath-you-take`）
- **リポジトリ内のサンプル**: `ref/police_every-breath-you-take.json`（必要に応じて `log/police_every-breath-you-take.json` も同型）

## 固定 ID（WordPress）

| フィールド | 例 | 説明 |
|------------|-----|------|
| **`id`**（ルート） | `48794` | **曲（投稿）の固定 ID**。WP が採番。URL スラッグが変わっても同一曲のキーとして使える想定。 |
| **`artists[].id`** | `2` | アーティスト（カテゴリ等）側の ID。 |
| **`slug`**（ルート） | `every-breath-you-take` | 曲スラッグ。ファイル名の後半と対応。 |

アプリ内マスタと連動する場合は、Supabase 等に **`music8_song_id`（= ルートの `id`）** または **`music8_song_path`（= `police_every-breath-you-take` などファイルベース名）** を持てば、再取得・突合が一意にできます。

**視聴履歴 POST**: 曲マスタ `songs.music8_song_data`（jsonb）に、`musicaichat_v1` なら `stable_key`・`display`・`youtube` 等、`music8_wp_song` なら `id`・`slug`・`main_artists` 等の**軽量スナップショット**を保存する（`src/lib/music8-song-persist.ts`）。同一 JSONのフルコピーではない。

## マスタ連携でよく使うトップレベル項目（例より）

| フィールド | 用途の例 |
|------------|-----------|
| `title` | 曲名 |
| `artists[]` | メイン名・slug・ACF（出身、メンバー、和名など） |
| `genres` | ジャンル名・slug（アプリのスタイル正規化のヒント） |
| `vocals` | ボーカル区分 |
| `releaseDate` | リリース日（年代 `song_era` の Music8 優先ロジックで利用） |
| `styles` | 数値 ID 配列（別マスタと対応する場合は WP 側定義と要照合） |
| `videoId` | YouTube の video id（JSON 内の表記。アプリの `video_id` と突合可能） |
| `spotifyTrackId` / `acf.spotify_*` | 外部 ID・音響特徴など |
| `content` | 解説 HTML |
| `modified` / `lastUpdated` | キャッシュ無効化・同期判定用 |

アプリ側の抽出ロジックは `extractMusic8SongFields`（`src/lib/music8-song-fields.ts`）を参照。

## アプリでの取得 URL

`getMusic8SongJsonUrl(artistSlug, titleSlug)` →

`${MUSIC8_SONGS_BASE}/${artistSlug}_${titleSlug}.json`

ベース URL は `music8-song-lookup.ts` の `MUSIC8_SONGS_BASE` と一致させること。

## 関連

- ライブラリ取り込み検討メモ（相談整理・GCS 前提）: `docs/music8-library-import-notes.md`
- スタイル: `src/lib/music8-style-to-app.ts`（Music8 → アプリ `SongStyle`）
- 年代: `src/lib/song-era.ts`（Music8 `releaseDate` 優先）
- メインアーティスト名の別名: `src/config/music8-main-artist-aliases.json`
