# Music8 / MusicAiChat: WP からの置き換え — 比較とタスク

日付: 2026-08-29  
方針: 曲・アーティスト登録の正本を WordPress から **MusicAiChat の Supabase** に移す。Music8 公開は静的 JSON のまま。WP への逆同期はしない。

関連: [`00-music8-supabase-canonical.md`](./00-music8-supabase-canonical.md) · [`00-music8-human-update-flow.md`](./00-music8-human-update-flow.md) · [`supabase-music8-catalog-tables.md`](./supabase-music8-catalog-tables.md) · [`00-library-ui-handoff.md`](./00-library-ui-handoff.md)

---

## WP と新システムの比較

### メリット（新システム）

- **一度の登録で両方に載る。** YouTube → WP と MusicAiChat が別経路だったのを、Supabase 1 本にする。
- **公開サイトは速いまま。** Music8 は WP REST を叩かない。読むのは JSON、書くのは DB。
- **WP の重い全件 JSON 生成を減らせる。** 1 曲は増分。全件は必要なときだけ。
- **曲キーが安定する。** `songs.music8_song_id` を一意にできる。
- **チャット機能と同じ DB。** 再生、コメント、クレジット、動画バリエーションが同じ正本。

### デメリット（新システム）

- **管理 UI がまだ WP より劣る。** 1 曲は大きい別ウィンドウ。アーティスト編集も画面が分散。
- **WP の全項目は未移行。** チャート、プレイリスト、音声特徴量、メンバー分解など。公開の骨格は足りるが ACF のコピーではない。
- **並行期は二系統。** 切替まで `E:\m8` の `generate:all`（WP JSON）と新登録が並ぶ。
- **登録に MusicAiChat が要る。** 今は `localhost:3002`。止まると YT to M7 が使えない。
- **公開反映は JSON / GCS が残る。** DB に書いた瞬間に music8.jp は変わらない。
- **WP に慣れた操作は捨てる。** 投稿画面・カテゴリ ACF の作業順は使わなくなる。

交換の要約: **正本と二重管理のコストは下がる。日常の「WP で全部いじる」快適さは、新画面を直すまで一時的に下がる。**

---

## タスクリスト

凡例: `[x]` 完了 · `[ ]` 未着手 / 進行中

### 1. 初回: DB と既存曲の埋め込み

- [x] カタログ拡張 SQL（`catalog_styles` 等）を実行。styles=9 / vocals=2
- [x] `music8_song_id` 重複を解消し、ユニーク索引を付ける
- [x] `comment_feedback` 等の FK を付け替えてから重複行を削除
- [x] `E:\m8` で `npm run generate:all`（本日までの WP 更新を JSON へ）
- [x] 曲 JSON → 中間テーブル（2026-08-30 完了）  
      `[done] matched=21924 missing_song=438 applied=21924 artists_patched=26813 dryRun=false`
- [x] import 完了後の件数確認（2026-08-30）  
      song_styles=21845 / song_genres=39181 / song_vocals=22795 / song_tags=0 / liked=15554 / artists_with_wp_term=6619  
      タグ 0 は曲 JSON（`generate-latest-songs-json.js`）に `post_tag` が載っていないため。取り込み失敗ではない。

### 2. 並行期の運用（切替まで）

- [ ] 新規曲は **YT to M7**（yttowp は使わない）
- [ ] 公開 JSON の正本は当面 WP → `E:\m8` の `npm run generate:all`
- [ ] 本番反映は従来どおり GCS rsync（または `MUSIC8_GCS_SYNC=1`）
- [ ] WP へは書き戻さない

### 3. 1 曲登録 UI（あと）

今は拡張が `/admin/songs/new` を 1100×1200 の別ウィンドウでフルロードしている。

- [ ] YouTube 上（または小さなパネル）でアーティスト・曲名・style を確認して送る
- [ ] 管理画面全体を毎回開かない（API 直送信）
- [ ] タイトル分解が怪しいときだけ止める
- [ ] ボタン名を MusicAiChat / Music8 に合わせる（「M7」は旧称）
- [ ] 本番ホストでも拡張が使えるようにする（今は `localhost:3002`）

### 4. アーティスト新規・編集 UI（あと）

入口: `/admin/library/artist`（洋楽）・`/admin/domestic-artist-register`（邦楽）・`/admin/artists-newly-registered`

- [ ] よく使う Origin / Member / Occupation / Spotify / YouTube / Wikipedia をすぐ直せる画面
- [ ] 新規登録を WP カテゴリ画面相当の手間に近づける（項目は絞って速く）
- [ ] 邦楽・洋楽・未整備行の入口を分かりやすくする
- [ ] WP カテゴリ編集を正本にしない（操作を新画面へ寄せる）

### 5. 未投入の WP 項目（必要になったら）

公開の曲・アーティスト情報は現状で成り立つ。足りないのは「WP 画面と同じ列」側。

曲（Chart 以外）:

- [ ] `ytreleasedate` / `artist_order` / `pvstyle` の明示
- [ ] Spotify 音声特徴量（danceability 等）— 専用列なし
- [ ] `spotify_artists01–05` の詳細（クレジットは `song_credits` が正）
- [x] カンマ区切り `spotify_artists` のうち、**本当に複数人なのに `song_credits` が1人**の曲だけ補完（2026-08-30）  
      1回目: `backfill-song-credits-from-metadata.ts --apply`（timeout 後 `--offset=18900`）→ 複数クレジット 3,947 → **4,068**。  
      2回目（日本語名除外 + 別名 / The 除去 / compact / Spotify `artists[]`）: 全 22,642 曲を apply。`song_credits` 27,661 行 / クレジットあり 22,627 / **複数クレジット 4,056**。カンマ入り `spotify_artists` 4,587。差は 1組名のカンマと、誤分割を直した分。  
      日本語スクリプトのクレジットは書き換えない。マスタに無いアーティストは自動作成しない（Violent Femmes、米津/宇多田の英語表記など）。失敗ログ: `tmp/song-credits-backfill-failures-*.jsonl`

アーティスト:

- [x] `artist_members` への Member 分解（2026-08-30）  
      `music8_members` から既存アーティスト行だけリンク。無いメンバーは自動作成しない。管理ライブラリ／部屋ライブラリでバンド↔メンバーの相互リンク。
- [ ] `wikipedia_page` を週次パッチに載せる
- [ ] `spotify_artist_images_s` / 出身地・年齢・SNS など薄い列

その他 CPT:

- [ ] チャート 6 枠 → `catalog_charts` + `song_chart_entries`
- [ ] CPT プレイリスト → `catalog_playlists`

### 6. JSON 正本の切替（Music8 公開）

- [ ] 生成元を WP の `update-all-data.js` から  
      `npx tsx scripts/export-music8-json-from-supabase.ts --full` へ切替
- [ ] 1 曲登録の増分 JSON が `E:\m8\public\data` に安定して出ること
- [ ] GCS 手順を切替後の正本に合わせる
- [ ] 切替後も Music8 フロント（`E:\m8`）は JSON 読みのまま

### 7. やらなくてよいこと（意図的にやらない）

- WP への曲・アーティスト逆同期
- 新規のための yttowp
- 1 曲ごとに全件 export / catalog import
- `Earth, Wind & Fire` / `Tyler, The Creator` など、名前の中のカンマを共演扱いにしてクレジットを足すこと

---

## 人間が今やること（1 曲）

作業セッションで `E:\mc` の `npm run dev` を一度起動したあと、1 曲あたりは次の 2 操作。

1. YouTube で「M7で曲登録」
2. 開いた画面で「Supabase に登録」

本番 Music8 に載せる GCS は、公開したいタイミングだけ。
