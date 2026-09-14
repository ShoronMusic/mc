# Music Library（`/music`）

MC の Supabase 曲マスタを正本にした公開カタログ。Music8（[music8.jp](https://www.music8.jp/) / `E:\m8`）の情報設計を踏襲しつつ、UI は musicai.jp のダーク基調。閲覧・連続再生はログイン不要。

関連: [`supabase-music8-catalog-tables.md`](./supabase-music8-catalog-tables.md) · [`00-genre-best-spec.md`](./00-genre-best-spec.md) · [`00-music8-playlist-autoplay-in-ma.md`](./00-music8-playlist-autoplay-in-ma.md) · [`00-music-chat-product-plan.md`](./00-music-chat-product-plan.md)

Music8 静的サイトは JSON のまま並走する。`wp/` と `E:\m8` は参照のみ。

## 確定方針

- 公開。選曲投稿だけ開催中部屋が必要（第2階層）。
- データは GCS JSON ではなく Supabase（`songs` / `song_videos` / `artists` / `song_styles`）。
- カタログフィルタは部屋ライブラリと同じ趣旨。ma は **明示 `domestic` 以外**（`western` および未設定の `unknown`。Music8 曲の大半は unknown）。mc は `all`。`eq western` の厳密一致はしない。
- 一覧は一律 **40 曲/ページ**（Music8 はスタイル40・ジャンル/アーティスト曲20。本サイトは揃える）。
- 曲一覧行: タイトル横にボーカル（`F` と `M` は別ラベル）と小さめジャンル（複数は `Pop / R&B`）。複数アーティストは名前ごとに国籍（例 `The Weeknd` `CAN` · `Tomoko Aran` `JP`）。`artists.the_prefix` がある場合は The を付けて表示し、冠詞あり／なしでも同一人物として照合する。右端は年月（例 `2026.09`）。欠落は非表示。
- 再生中の右カラムはタブ切替。先頭 `SONG DATA`（曲詳細）、続けて曲のアーティスト名（複数なら複数。例 `SONG DATA | The Police | Prince`）。タブ幅は件数で等分。アーティストタブは `/api/music/artist` でプロフィールを取得。`STYLE_ADMIN` ログイン時のみ、曲詳細・アーティスト情報の右上に管理画面（`/admin/songs/{id}` / `/admin/library/artist`）への別タブリンクを出す。
- 連続再生はページ内 YouTube IFrame のみ。部屋の Ably・announce・視聴履歴には書かない。
- 9 スタイル（pop … others）。トップ見出しは「9 Styles」（Music8 トップの「8 Styles」は使わない）。
- AI 曲解説は出さない。

## URL

予約パス: `styles` / `artists` / 将来 `genres` / `genre-best` / `search`。`[roomId]` より静的 `music` が優先。`music` は部屋 ID 扱いにしない。

| パス | 内容 |
|------|------|
| `/music` | 9スタイル × 新着3曲 |
| `/music/styles` | スタイル一覧 |
| `/music/styles/{slug}/{page}` | スタイル曲一覧。`/styles/{slug}` は `/1` へ |
| `/music/artists` | A–Z 索引 |
| `/music/artists/{letter}` | 頭文字一覧（`other` = 記号・非ラテン） |
| `/music/{artistSlug}` · `/{artistSlug}/{page}` | アーティスト詳細＋曲一覧 |
| `/music/{artistSlug}/songs/{songSlug}` | 曲詳細 |

公開キーは `songs.music8_artist_slug` / `music8_song_slug`。欠落曲は詳細リンクを出さない。

ソート: 原盤日 → 無ければ YouTube / `catalog_published_at`（`libraryEffectiveReleaseDateForSort`）。新しい順。

代表 video: official → visualizer → topic → lyric → live（`rankLibraryVideoVariant`）。カバーは Spotify 優先、無ければ YT サムネ。

## フェーズ

### 第1（完了）

トップ、スタイル、アーティスト、曲詳細、40件ページ、ページ内連続再生（次曲・次ページ `?autoplay=1`、埋め込み不可はスキップ）。トップはスタイル横断キューをループ。発見導線はトップフッタと `/sitemap`。

### 第2（未実装）

- ジャンル一覧・ジャンル別曲一覧（40件）。`catalog_genres` / `song_genres`。
- Genre BEST 一覧・詳細。`catalog-genre-best.ts` の公開ラップ。
- 検索。`library-search-query.ts` を公開向けに制限。
- 開催中部屋への選曲投稿。`GET /api/room-live-status` + `mc:last_active_room` + `tryDeliverShareToOpenRoom`。ソロ再生とは独立。

## 課題（バックログ）

- slug 欠落曲は詳細 URL 不能。`scripts/backfill-music8-slugs-for-songs.ts` の適用が前提。
- `songs.style` と `song_styles` が食い違うと誤掲載になる（例 Metal 曲が Pop 一覧に残る）。一覧は `songs.style` が別ナビなら除外し、`songs.style` 一致曲は JOIN 欠落でも含める。管理の曲保存／一括スタイル変更で `song_styles` を同期する。
- 部屋索引は `main_artist` 文字列、公開 URL は slug。不一致は query 層で slug 優先。
- 管理登録から一覧反映までメモリキャッシュ約2分（全件フォールバック時）。JOIN ページは都度 DB。
- YouTube 埋め込み不可・地域制限は次曲スキップ。部屋選曲とは別失敗モード。
- 公開 BFF は service role。anon 直読みはしない。レート制限は運用で見直す。
- スタイル一覧は `songs` × `song_styles` の JOIN + `range` に、`songs.style` 列の一致曲をマージ（失敗時は全件取得フォールバック）。
- SEO: 公開 index 可。canonical は musicai.jp/music（mc は musicchat.jp/music）。
- PWA / モバイルは初版レスポンシブのみ。インストール導線は後続。
- Music8 との意図的差分: ページサイズ40統一、Genre BEST が DB、データが DB 直読み、UI が ma ダーク。
