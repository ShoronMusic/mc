# Genre BEST（WP Playlist → MC DB）

WP カスタム投稿 **Playlists**（CPT `playlist`）を MC Supabase に取り込み、管理画面で一覧・曲一覧・曲登録する。

正本は **MC Supabase**。WP への逆同期はしない。`wp/` は参照のみ。

関連: [`supabase-music8-catalog-tables.md`](./supabase-music8-catalog-tables.md) · [`sql/music8-catalog-extension.sql`](./sql/music8-catalog-extension.sql) · [`sql/catalog-playlists-cover-image.sql`](./sql/catalog-playlists-cover-image.sql)

## 命名

| 用語 | 意味 |
|------|------|
| Genre BEST | 本機能全体の UI 名（＝ WP Playlists） |
| Genre タブ | `catalog_playlist_styles` が **0 件**の PL（WP `styles: []`） |
| 「Genre Best」字幕 | `description` が `Genre Best`、または Genre タブ所属時の詳細表示用 |

## テーブル

| テーブル | 役割 |
|----------|------|
| `catalog_playlists` | PL 本体（`slug` / `title` / `description` / `wp_post_id` / `cover_image_url` / `last_song_updated_at` …） |
| `catalog_playlist_songs` | `(playlist_id, song_id)` + `position` |
| `catalog_playlist_styles` | Style タブ分類（空＝Genre） |
| `catalog_playlist_genres` | 将来用（取込時は未使用可） |

曲キー: WP 曲 post ID → `songs.music8_song_id` → `songs.id`。未登録曲はスキップ。

## 取込

```bash
npx tsx scripts/import-music8-playlists-from-wp.ts          # dry-run
npx tsx scripts/import-music8-playlists-from-wp.ts --apply
npx tsx scripts/import-music8-playlists-from-wp.ts --apply --limit=5
```

または管理 `POST /api/admin/genre-best/import`。

ソース: `GET {MUSIC8_WP_REST}/custom/v1/playlists` → 各 `GET …/playlist/{slug}`。

- Upsert: `wp_post_id`（なければ `slug`）
- 曲: 当該 PL の `catalog_playlist_songs` を **置換**（`position`＝REST 配列順）
- Style: 名前で `catalog_styles` に突合して `catalog_playlist_styles` を置換

## タブ規則（一覧・登録モーダル共通）

1. **Genre**（styles 空の PL があるとき）
2. 固定順: Pop → Dance → Alternative → Electronica → R&B → Hip-hop → Rock → metal → others（該当 PL があるもののみ）
3. **更新順**（全件・`last_song_updated_at` DESC → タイトル）

Genre / Style タブ内はタイトル A–Z。

## 画面（STYLE_ADMIN）

| パス | 内容 |
|------|------|
| `/admin/genre-best` | 一覧（件数・タブ・サムネ／タイトル／曲数）＋ WP 取込 |
| `/admin/genre-best/[slug]` | 詳細（カバー・字幕・曲一覧・曲削除） |
| `/admin/library/artist` | 曲行末尾 **Genre BEST** ボタン＋登録済み `[ タイトル ]` ラベル |
| `/admin/library` | アーティスト曲一覧のタイトル横に登録済みラベル |
| `/admin/songs/[songId]` | プレイヤー下 **Genre BEST** ボタン＋登録済みラベル（リンク）。曲詳細から開くアーティスト詳細モーダルの曲一覧にも同じラベル |
| 邦楽アーティスト編集 | 登録曲一覧に Genre BEST 登録済みラベル |

詳細の曲順: `original_release_date` DESC（無ければ `position`）。

登録成功時（モーダル）: WP `playlist-modal` と同様に `/audio/success-chime.mp3` を再生し、緑の seekbar が 2s で埋まるアニメの後に閉じる。

## API（いずれも STYLE_ADMIN）

| Method | Path | 役割 |
|--------|------|------|
| GET | `/api/admin/genre-best` | 一覧 |
| POST | `/api/admin/genre-best` | 手動新規 |
| POST | `/api/admin/genre-best/import` | WP 一括取込 |
| GET | `/api/admin/genre-best/[slug]` | 詳細＋曲 |
| POST | `/api/admin/genre-best/[slug]/songs` | `{ songId }` 末尾追加 |
| DELETE | `/api/admin/genre-best/[slug]/songs` | `{ songId }` 削除 |
| GET | `/api/admin/genre-best/for-songs?ids=` | 曲行ラベル用 |

## 範囲外

- **ボーカル選択**（WP プレイリストの `playlist_vocal` / duet・F・M）。Genre BEST では持たない・取り込まない・UI にも出さない
- Music8 静的サイト（`E:\m8`）向け JSON エクスポート
- 部屋チャットへの Genre BEST 導線
- WP 管理画面・`wp/` の改変
