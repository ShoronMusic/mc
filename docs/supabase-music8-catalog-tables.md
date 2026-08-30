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
| CPT `playlist` + meta `playlist_songs` | `catalog_playlists` + `catalog_playlist_songs` |
| CPT `sp_artist` | 特集（既存 `featured_pages`）。曲マスタではない |

公開ナビのスタイル 9 種（Pop … others）が正。genre の `parent_genre` にある jazz / reggae はジャンル側に残す。

## スクリプト

| コマンド | 役割 |
|----------|------|
| `npx tsx scripts/import-music8-wp-catalog.ts` | ローカル Music8 曲 JSON → 中間テーブル（`music8_song_id` で結合） |
| `npx tsx scripts/export-music8-json-from-supabase.ts` | Supabase → musicaichat/v1 + `styles_summary.json` |
| 管理 `POST /api/admin/songs-register` | YouTube 1 曲登録 + 増分 JSON |

初回は既存の曲一括取り込み（`import-music8-songs-bulk.ts` / 週次同期）のあと、本インポートで style/genre を埋める。

## 並行期

WP への逆同期はしない。公開 Music8（`E:\m8`）は JSON を読み続ける。生成元だけこの DB に切り替える。
