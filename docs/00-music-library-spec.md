# Music Library（`/music`）

MC の Supabase 曲マスタを正本にした公開カタログ。Music8（[music8.jp](https://www.music8.jp/) / `E:\m8`）の情報設計を踏襲しつつ、UI は musicai.jp のダーク基調。閲覧・連続再生はログイン不要。

関連: [`supabase-music8-catalog-tables.md`](./supabase-music8-catalog-tables.md) · [`00-genre-best-spec.md`](./00-genre-best-spec.md) · [`00-music8-playlist-autoplay-in-ma.md`](./00-music8-playlist-autoplay-in-ma.md) · [`00-music-chat-product-plan.md`](./00-music-chat-product-plan.md)

Music8 静的サイトは JSON のまま並走する。`wp/` と `E:\m8` は参照のみ。

## 確定方針

- 公開。選曲投稿だけ開催中部屋が必要（第2階層）。
- データは GCS JSON ではなく Supabase（`songs` / `song_videos` / `artists` / `song_styles`）。
- カタログフィルタは部屋ライブラリと同じ趣旨。ma は **明示 `domestic` 以外**（`western` および未設定の `unknown`。Music8 曲の大半は unknown）。mc は `all`。`eq western` の厳密一致はしない。
- 一覧は一律 **40 曲/ページ**（Music8 はスタイル40・ジャンル/アーティスト曲20。本サイトは揃える）。
- 曲一覧行: 枠左端にナビスタイル色（5px。サムネとの間に余白）。タイトル横にボーカル（`F` と `M` は別ラベル）と小さめジャンル（複数は `Pop / R&B`）。複数アーティストは名前ごとに国籍（例 `The Weeknd` `CAN` · `Tomoko Aran` `JP`）。`artists.the_prefix` がある場合は The を付けて表示し、冠詞あり／なしでも同一人物として照合する。右端は年月（例 `2026.09`）、その下に三点メニュー（モーダルでジャンル別曲一覧へのリンク。`STYLE_ADMIN` 時は曲詳細と同じ Genre BEST 追加ボタンも出す）。欠落は非表示。**スタイル・アーティスト等の共通曲一覧は年見出しで区切る**（ページ内・新しい年が上。Music8 と同じ）。
- 再生中の右カラムはタブ切替。先頭 `SONG DATA`（曲詳細）、続けて曲のアーティスト名（複数なら複数。例 `SONG DATA | The Police | Prince`）。**アーティスト詳細の曲一覧に限り**、ページの当該アーティストはタブに出さない。単独曲は `SONG DATA` のみ、共演者がいるときだけ他アーティストを横に出す。タブ幅は件数で等分。アーティストタブは `/api/music/artist` でプロフィールを取得。`STYLE_ADMIN` ログイン時のみ、曲詳細・アーティスト情報の右上に管理画面（`/admin/songs/{id}` / `/admin/library/artist`）への別タブリンクを出す。
- 連続再生はページ内 YouTube IFrame のみ。部屋の Ably・announce・視聴履歴には書かない。
- 9 スタイル（pop … others）。トップ見出しは「9 Styles」（Music8 トップの「8 Styles」は使わない）。
- AI 曲解説は出さない。

## URL

- 予約パス: `styles` / `artists` / `genres` / `genre-best` / `charts` / `search`。`[roomId]` より静的 `music` が優先。`music` は部屋 ID 扱いにしない。

| パス | 内容 |
|------|------|
| `/music` | 9スタイル × 新着3曲 |
| `/music/styles` | スタイル一覧。各ボタン左端にナビスタイル色（5px。ラベルとの間に余白） |
| `/music/styles/{slug}/{page}` | スタイル曲一覧。`/styles/{slug}` は `/1` へ |
| `/music/artists` | A–Z 索引。`?q=` でアーティスト名検索（40件ページ。既定は曲数↓。愛称・日本語名は部屋ライブラリと同じ展開。5sos＝5 Seconds of Summer 等は1行に統合し、どちらからでも検索） |
| `/music/artists/{letter}` · `/{letter}/{page}` | 頭文字一覧（40件）。並び替え: ABC・曲数・活動開始（↑↓）。行左端に最多ナビスタイル色（5px）・名前横に国籍。`0-9` = 数字始まり（911 等）。`other` = 記号・非ラテン |
| `/music/{artistSlug}` · `/{artistSlug}/{page}` | アーティスト詳細＋曲一覧。プロフィール下に Style Breakdown（9スタイル積み上げ・合計100%）と Top Genres（複数タグ・曲数比%・上位5） |
| `/music/{artistSlug}/songs/{songSlug}` | 曲詳細 |
| `/music/genres` | A–Z 索引。`?q=` でジャンル名検索（40件ページ。既定は曲数↓。日本語名も対象） |
| `/music/genres/{letter}` · `/{letter}/{page}` | 頭文字一覧（40件）。並び替え: ABC・曲数。行左端にジャンル色。`0-9` = 数字始まり（2-step 等）。`other` = 記号・非ラテン |
| `/music/genres/{slug}/{page}` | ジャンル別曲一覧（40件）。`/{slug}` は `/1` へ |
| `/music/genre-best` | Genre BEST 一覧。タブは管理と同じ（Genre → 9スタイル → 更新順）。`?tab=` で切替 |
| `/music/genre-best/{slug}/{page}` | Genre BEST 別曲一覧（40件。年見出しの共通曲一覧）。`/{slug}` は `/1` へ |
| `/music/charts` | 週間チャート一覧（US / UK） |
| `/music/charts/us` · `/uk` | 直近取込の Top 10。順位順（年見出しなし）。未紐づけ曲は出さない |

公開キーは `songs.music8_artist_slug` / `music8_song_slug`。欠落曲は詳細リンクを出さない。

ソート: 原盤日 → 無ければ YouTube / `catalog_published_at`（`libraryEffectiveReleaseDateForSort`）。新しい順。

代表 video: official → visualizer → topic → lyric → live（`rankLibraryVideoVariant`）。カバーは Spotify 優先、無ければ YT サムネ。

## フェーズ

### 第1（完了）

トップ、スタイル、アーティスト、曲詳細、40件ページ、ページ内連続再生（次曲・次ページ `?autoplay=1`、埋め込み不可はスキップ）。トップはスタイル横断キューをループ。発見導線はトップフッタと `/sitemap`。

### 第2

- ジャンル一覧・ジャンル別曲一覧（40件）。`catalog_genres` / `song_genres`。索引は `/music/genres`。
- Genre BEST 一覧・曲一覧（40件）。`catalog_playlists` / `catalog_playlist_songs`。索引は `/music/genre-best`。
- 週間チャート Top 10（US 火曜 / UK 金曜）。管理 `/admin/weekly-charts` で Spotify 公式PL取込。公開の PV は紐づいた曲の代表 YouTube（公式優先）。別曲の PV へは管理の「PVを変更」。公開は `/music/charts`。
- 検索。曲検索は未実装。アーティスト索引は `/music/artists?q=`、ジャンル索引は `/music/genres?q=`。
- 開催中部屋への選曲投稿。`GET /api/room-live-status` + `mc:last_active_room` + `tryDeliverShareToOpenRoom`。ソロ再生とは独立。

## 課題（バックログ）

- `artists.name` に曲名が入っている行（Billie Jean / All For Love）は、公開表示で slug または曲の `main_artist` に寄せる。文字索引も表示名の先頭文字で振り直す（All For Love → Bryan Adams は B）。同じ slug は曲数を合算。DB の英語名は管理で直す。
- `songs.style` と `song_styles` が食い違うと誤掲載になる（例 Metal 曲が Pop 一覧に残る）。一覧は `songs.style` が別ナビなら除外し、`songs.style` 一致曲は JOIN 欠落でも含める。管理の曲保存／一括スタイル変更で `song_styles` を同期する。
- `/music/artists` の A–Z はスナップショットの件数だけ。slug 解決は文字ページで行い、結果はプロセス内 15 分キャッシュ。公開一覧の曲数は詳細と同じ `songs.music8_artist_slug`（feat. 参加は部屋ライブラリ索引のみ）。一覧行の左端色は同じ曲集合の最多ナビスタイル（Music8 9色。同数は slug 順）。
- 管理登録から一覧反映までメモリキャッシュ約2分（全件フォールバック時）。JOIN ページは都度 DB。
- YouTube 埋め込み不可・地域制限は次曲スキップ。部屋選曲とは別失敗モード。
- 公開 BFF は service role。anon 直読みはしない。レート制限は運用で見直す。
- スタイル一覧は `songs` × `song_styles` の JOIN + `range` に、`songs.style` 列の一致曲をマージ（失敗時は全件取得フォールバック）。
- SEO: 公開 index 可。canonical は musicai.jp/music（mc は musicchat.jp/music）。
- PWA / モバイルは初版レスポンシブのみ。インストール導線は後続。
- Music8 との意図的差分: ページサイズ40統一、Genre BEST が DB、データが DB 直読み、UI が ma ダーク。
