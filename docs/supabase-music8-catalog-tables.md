# Music8 カタログ拡張テーブル（Supabase 正本）

Music8 公開サイトと MusicAiChat で **曲マスタを 1 本化**するための追加 SQL。既存の `songs` / `artists` / `song_credits` / `song_videos` は残し、WP のタクソノミー・プレイリスト・チャートだけを正規化する。

**SQL 正本**: [`sql/music8-catalog-extension.sql`](./sql/music8-catalog-extension.sql)（Supabase SQL Editor で実行）

関連: [`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md) · [`music8-musicaichat-json-spec.md`](./music8-musicaichat-json-spec.md) · [`00-music8-weekly-mc-sync.md`](./00-music8-weekly-mc-sync.md)

## 方針

- **書き込みの正本**: この Supabase（MC 既存プロジェクト）
- **Music8 公開の読み取り**: 静的 JSON（WP REST を捨てた理由＝負荷とレスポンスを維持）
- JSON の生成元を **WP MySQL → この DB** に切り替える（増分エクスポート: `scripts/export-music8-json-from-supabase.ts`）
- WP の `category` はアーティスト。`artists.wp_term_id` と既存 `music8_artist_id` で突合
- 曲の固定キーは既存 `songs.music8_song_id`（WP post ID）

## WP / ACF → テーブル

| WP | 行き先 |
|-----|--------|
| `post` | `songs`（既存）+ `song_videos` |
| 投稿本文（楽曲解説の要約） | `songs.music8_intro`。WP/`E:\\m8` 曲 JSON の `content` を HTML 除去してバックフィル。新規は管理曲詳細の Gemini 取得。部屋ライブラリ曲詳細は保存直後からこの列を表示。Music8 公開 JSON は週次エクスポート後 |
| `category`（アーティスト） | `artists` + `wp_term_id` |
| `style` | `catalog_styles` + `song_styles` |
| `genre` | `catalog_genres` + `song_genres`（`parent_genre` は style と不一致のまま保持） |
| `vocal` | `catalog_vocals` + `song_vocals` |
| `post_tag` | `catalog_tags` + `song_tags` |
| ACF `likecount` | `songs.is_liked`（チェック有無。数値カウンタではない） |
| ACF `spotify_artists01-05` | 使わない。`song_credits` が正 |
| ACF `chart_name1-6` / `chart_position1-6` | `catalog_charts` + `song_chart_entries` |
| ACF `member` | `artist_members` |
| ACF `Occupation` | `artists.occupations` |
| ACF `related_artists`（textarea） | `artists.related_artists_raw`（正規化は後続） |
| CPT `playlist` + meta `playlist_songs` | `catalog_playlists` + `catalog_playlist_songs`（＋ `catalog_playlist_styles`。UI 名は Genre BEST。仕様: [`00-genre-best-spec.md`](./00-genre-best-spec.md)） |
| playlist thumbnail | `catalog_playlists.cover_image_url`（パッチ: [`sql/catalog-playlists-cover-image.sql`](./sql/catalog-playlists-cover-image.sql)） |
| CPT `sp_artist` | 特集（既存 `featured_pages`）。曲マスタではない |

公開ナビのスタイル 9 種（Pop … others）が正。genre の `parent_genre` にある jazz / reggae はジャンル側に残す。

## スクリプト

| コマンド | 役割 |
|----------|------|
| `npx tsx scripts/import-music8-wp-catalog.ts` | ローカル Music8 曲 JSON → 中間テーブル（`music8_song_id` で結合） |
| `npx tsx scripts/import-music8-playlists-from-wp.ts` | WP REST プレイリスト → `catalog_playlists*`（既定 dry-run。`--apply`） |
| `npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts` | 曲 JSON `content` → `songs.music8_intro`（`<p>` 除去。既定 dry-run） |
| `npx tsx scripts/export-music8-json-from-supabase.ts` | Supabase → musicaichat/v1 + `styles_summary.json` |
| `npx tsx scripts/backfill-music8-slugs-for-songs.ts` | 洋楽で slug が空の曲に `music8_artist_slug` / `music8_song_slug` を付与（既定 dry-run。`--apply`。`--export` で JSON も書く） |
| 管理 `POST /api/admin/songs-register` | YouTube 1 曲登録 + slug 付与 + 増分 JSON |
| 管理 `/admin/genre-best`・`/api/admin/genre-best*` | Genre BEST 一覧・詳細・曲登録・WP 取込 |

初回は既存の曲一括取り込み（`import-music8-songs-bulk.ts` / 週次同期）のあと、本インポートで style/genre を埋める。

## 並行期

WP への逆同期はしない。公開 Music8（`E:\m8`）は JSON を読み続ける。生成元だけこの DB に切り替える。
