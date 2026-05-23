# Music8 → ライブラリ取り込み（相談メモ）

更新日: 2026-05-01（長時間処理の実行メモ・差分取り込み追記）

## 前提（Music8 側のデータ）

Music8 には概ね次が揃っている想定として相談された。

- アーティスト、タイトル、YouTube ID、公開日、スタイル
- その他: 個別 ID、ジャンル、ボーカル、説明文、Spotify track ID など

規模は **2万曲超**。部屋の「ライブラリから選曲」で使うと、**アーティスト・タイトル・スタイル・年代（公開日）の誤りがほぼ出ない**一方、**YouTube ID が稀に無効**になりうる、という前提。

## 方針としての評価（要約）

- **やる価値は高い**。ライブラリ選曲は「メタの正しさ」が体験の大部分を占めるため、Music8 を正とするのは筋が良い。
- 2万件は「技術的に無理」ではなく、**同期方式・検索インデックス・YouTube の鮮度管理**の設計が本体。
- 推奨の論点:
  - **増分同期**と **バッチ投入（再開可能）**
  - YouTube は **取り込み時だけでなく検証／状態フラグ**（無効・非公開・地域制限など）を残せると運用しやすい
  - DB 側は **正規化済み検索用カラム＋適切なインデックス**（全文や `pg_trgm` などは要件に応じて）
  - MVP でも **「全件投入」＋「無効 ID の隔離／UI で選べない」**まで決めてから進めると後戻りが少ない

## 取り込み元は「今の GCS 内 JSON」になるのか？

**基本は「はい」**でよい。本リポジトリでは、曲単位の Music8 JSON は **GCS バケット上のオブジェクト**（および同一パスの公開 URL）を前提に読んでいる。

- 曲 JSON のパス規約・スキーマメモ: `docs/music8-song-json-schema.md`
- アプリ内のベース URL 例: `src/lib/music8-song-lookup.ts` の `MUSIC8_SONGS_BASE`（`https://storage.googleapis.com/music8-json-prod/data/songs` 等）
- 認証付き取得: `src/lib/music8-gcs-server.ts` の `fetchJsonWithOptionalGcsAuth`（`GOOGLE_APPLICATION_CREDENTIALS_JSON` 等で ADC／SA）

つまり **一括取り込みジョブ**を書くなら、現実的な第一候補は:

1. **GCS の `data/songs/`（および必要なら `data/artists/`）を列挙し、各 `{artistSlug}_{titleSlug}.json` を読み、`songs`（および関連テーブル）へ UPSERT**  
2. または、Music8／WP が別途吐いている **マニフェスト（一覧 CSV／JSON）**があれば、それを起点に GCS オブジェクト名を解決して同様に取得

**別ルート**としては、WordPress DB や Music8 専用 API から直接流し込むことも可能だが、**現状のランタイム連携は「GCS（＋公開 HTTP）の JSON」が主軸**である。取り込み専用バッチを新設する場合も、**正本が GCS にあるなら GCS を読むのが一貫している**。

### チャットのリアルタイムと GCS 週次更新の関係

- **部屋の選曲・再生・チャット**は GCS の更新を待たず **リアルタイム**で進む（Ably 等）。
- **GCS の Music8 JSON**は、運用で **週に 1〜2 回**手動スクリプト更新する想定。ここに載るメタの修正が「いつ一覧・解説参照に効くか」のタイミングになる。
- **ライブラリ検索**（`/api/library/search`）が読む **`songs` テーブル**は別レイヤ。GCS を更新しただけでは DB は自動では埋まらない（取り込み／同期ジョブが必要）。

## 運用モデル（チャット先行 → 数日後に Music8 手動登録）

実運用では次の形が多くなる想定でよい。

1. **チャットで新規選曲** → アプリ側に **新規保存**（YouTube 起点の暫定レコードなど）。
2. **数日後**、Music8 側で **正規の手動登録**し、足りない項目（スタイル、公開日、説明、Spotify 等）を補う。
3. その後、**GCS 反映＋（あれば）DB への再取り込み／マージ**で、**ライブラリ上の曲データはほぼ完璧**に近づく。

**利点**: 最初から Music8 に全項目を要求せず、チャットの止まりが少ない。`video_id` や内部 `songs.id` で後から突合しやすい。

**設計で押さえるとよい点**:

- Music8 登録完了後に **`music8_song_id`（またはファイルベース名）の後付け**と「反映済み」フラグを持てると、**二重レコードや取り違え**を防ぎやすい。
- Music8 反映前は **暫定メタ**（oEmbed 等）のままになりうることは運用上許容し、必要なら管理画面だけ「未連携」表示。
- Music8 登録後も **YouTube の削除・非公開**は起こりうるため、**検証フラグ／最終確認日**だけ残しておくと長期運用は堅い。

## 実装時にコード側で触りやすい参照

| 用途 | パス |
|------|------|
| 曲 JSON URL・lookup | `src/lib/music8-song-lookup.ts` |
| フィールド抽出 | `src/lib/music8-song-fields.ts` |
| GCS / 公開 URL から JSON 取得 | `src/lib/music8-gcs-server.ts` |
| 部屋ライブラリ検索（現状は DB `songs`） | `src/app/api/library/search/route.ts` |
| Music8 未連携の選曲を JST 日別（管理・手動登録用） | `src/app/admin/library-music8-pending/page.tsx`・`GET /api/admin/library-music8-pending` |

## 手動バッチ（初回2万曲向け）

`scripts/import-music8-songs-bulk.ts` を追加済み。  
artist簡易JSON（`{artist}_songs.json`）の slug / ytvideoid を基準に、`songs/{artist}_{song}.json` を読んで `songs` + `song_videos` + `songs.music8_song_data` を冪等更新する。

代表コマンド:

```bash
# まず dry-run（対象抽出確認）
npm run import:music8:bulk -- --dry-run --artist-slugs=police

# 実投入（1アーティスト）
npm run import:music8:bulk -- --artist-slugs=police --sleep-ms=120

# artist_index.json から全体を拾って段階投入（例: 先頭100アーティスト）
npm run import:music8:bulk -- --limit-artists=100 --sleep-ms=120
```

主なオプション:

- `--artist-slugs=police,queen`（対象を明示）
- `--artist-slugs-file=tmp/music8-artist-slugs.txt`
- `--artist-index-url=.../index/artist_index.json`（slug供給元）
- `--artist-songs-base=https://xs867261.xsrv.jp/data/data/artists`
- `--songs-base=https://xs867261.xsrv.jp/data/data/songs`
- `--from-artist=police`（slug の辞書順で `>=` フィルタ。**index の並びの続き**には不向きなことがある）
- `--skip-artists=3000`（`artist_index.json` のキー順で先頭 N 件を捨てる。**3000 アーティスト処理済みの続き**は `--skip-artists=3000`）
- `--limit-artists=100` / `--limit-songs-per-artist=200`
- `--failure-log=tmp/music8-import-failures.jsonl`
- `--video-overrides=tmp/music8-video-overrides.json` … Music8 側に `videoId` が無い曲だけ、手動で ID を渡す。JSON は **`artistSlug_songSlug`（小文字可・ファイル名と同じつなぎ方）** をキー、値は **11 文字の video_id** または **`https://www.youtube.com/watch?v=...`**。リスト／曲 JSON に ID がある場合はそちらが優先され、オーバーライドは使われない。
- **`--video-overrides-only=tmp/hokan050101.txt`** … **その JSON に載っているキー（曲）だけ**を取り込む。**`--video-overrides` と限定フラグを付け忘れても全曲走査しない**ため、手動補完ファイルだけ流すときはこれを推奨。
- **`--only-video-overrides-keys`**（**`--overrides-only`** または **`--only-video-overrides-keys=1`**）… `--video-overrides=PATH` と併用し、PATH のキーだけ処理。**起動直後の JSON に `onlyVideoOverrideKeys": true` と stderr の `限定モード ON` が出ているか確認**（`false` なら全 index 走査）。
- **ローカル `data/songs` と DB の差分（スラッグ突合）**: `npm run diff:music8:songs-dir-vs-db -- --songs-dir="E:\\m8\\public\\data\\songs"`（`music8_artist_slug` と `music8_song_slug` が両方ある行だけと、ディスク上の `*.json` ベース名を比較。ライブラリ表示曲数とは定義が異なることに注意）
- **差分キーだけ一括取り込み**: `out-missing` のテキストを `import:music8:bulk` に渡す。例:  
  `npx tsx scripts/import-music8-songs-bulk.ts --import-keys-file=tmp/music8-on-disk-not-in-db-....txt --artist-songs-base=http://127.0.0.1:38100/data/artists --songs-base=http://127.0.0.1:38100/data/songs --sleep-ms=80`  
  **HTTP で曲 JSON が取れないとき**（プロキシ未起動・認証なし GCS など）は **`--songs-local-dir=E:\m8\public\data\songs`** を追加すると、同じ `{artist}_{slug}.json` をディスクから読む。  
  （2591 件なら `--dry-run` で件数確認のうえ、本番は時間がかかる。未取得 JSON 時は `--video-overrides` を併用可）
- 雛形 JSON の生成（`video_id_missing` だけキー化・値は空文字）:
  - `npx tsx scripts/gen-music8-video-overrides-from-failures.ts tmp/music8-import-failures.jsonl --out=tmp/music8-video-overrides.json`
  - または標準出力へ: `npm run gen:music8:video-overrides -- tmp/music8-import-failures.jsonl > tmp/music8-video-overrides.json`（npm が `--out` を食うためファイル指定は `npx tsx` 推奨）

## 長時間処理の手順メモ（実行用・2026-05-01）

大量件数では **1曲ごとの `sleep-ms` と HTTP/DB 待ち**が積み上がる。全 `artist_index` 走査は **数時間級**になり得る。**限定モード**で件数を絞るか、`--import-keys-file` で差分だけ流す。

### 所要時間の目安

- ざっくり **待ち時間 ≒ 処理曲数 × `sleep-ms`**（ミリ秒）＋取得・DB のオーバーヘッド。
- 例: 2500 曲 × `sleep-ms=80` → スリープだけで約 **200 秒（3分強）** 前後。2万曲 × `120ms` → スリープだけ **40分超**。

### チャンク分割・再開（夜間・12時間超の補完用）

1キー一覧を **複数ファイルに分割**し、**チャンクごと**に `import-music8-songs-bulk` を起動。**状態 JSON** に完了した `chunk-*.txt` を記録するため、PCが落ちても **同じコマンドを再実行**すれば未完了チャンクから続く。

1. **分割**（例: 2500 行を 200 行×13 チャンク）  
   `npx tsx scripts/music8-split-import-keys.ts --keys-file=tmp/music8-on-disk-not-in-db-....txt --chunk-size=200 --out-dir=tmp/music8-import-chunks`  
   失敗 JSONL からキーだけ抜き出す場合:  
   `--from-failure-log=tmp/music8-import-failures.jsonl` と任意で `--reason=song_json_not_found,video_id_missing`

2. **順実行（再開可）**  
   `npx tsx scripts/music8-import-chunk-runner.ts --chunks-dir=tmp/music8-import-chunks --state-file=tmp/music8-import-chunk-runner-state.json --forward-file=tmp/music8-bulk-forward-args.txt`  
   `tmp/music8-bulk-forward-args.txt` は **1行1引数**（例: `--artist-songs-base=http://127.0.0.1:38100/data/artists`）。`#` 始まりはコメント。PowerShell で `npx` が `--` 以降を解釈してしまう場合に確実。  
   シェルが安全なら `--` の後に bulk と同じ引数を並べても可。

   **分割し直した**ときは `chunk-00001.txt` などファイル名が再利用されるため、**別ジョブなら `--state-file` を新規パスにするか、古い状態 JSON を削除**すること。

   npm 経由は引数が紛れやすいので、長時間ジョブは **`npx tsx` 直叩き**を推奨。

PowerShell 一括用: リポジトリの **`scripts/run-music8-import-overnight.ps1`**（`-RunDiff` で差分→分割→runner、初回は `tmp\music8-bulk-forward-args.txt` 雛形作成後に編集して再実行）。chunk-runner は **`MUSIC8_CHUNK_RUNNER_FORWARD_FILE`** でも forward ファイルを受け取れる（`npx` 経由で `--forward-file` が欠ける場合の回避）。

### 全 index を誤って回さない（重要）

| やりたいこと | 使うもの | 起動ログで確認 |
|-------------|----------|----------------|
| 手動 Video ID だけ（小さい JSON） | **`--video-overrides-only=PATH`** 推奨 | `onlyVideoOverrideKeys: true`、stderr「限定モード」 |
| 同上（フラグ分割） | `--video-overrides=PATH` ＋ `--only-video-overrides-keys` または `--overrides-only` または `--only-video-overrides-keys=1` | 同上 |
| **ローカルにあって DB に無いキーだけ**（差分テキスト） | **`--import-keys-file=tmp/....txt`** | `importKeysFile` がパス、`keyedOnlyMode: true`、`keyedTaskTotal` が行数 |

**`--video-overrides` だけ**では全アーティスト走査のまま。**必ず**上表の限定系を付ける。

`npm run ...` でフラグが効かないときは **`npx tsx scripts/import-music8-songs-bulk.ts ...`** を使う（Windows / npm の引数解釈の切り分け用）。

### 差分 → 取り込み（スラッグ突合）

1. **ディスクと DB の差分**（`music8_artist_slug` と `music8_song_slug` が両方ある行 ↔ ローカル `*.json` ベース名。ライブラリ表示件数とは一致しない場合あり）:

```powershell
cd e:\mc
npx tsx scripts/diff-music8-songs-dir-vs-db-slugs.ts --songs-dir="E:\m8\public\data\songs"
```

- 結果: コンソールに JSON サマリ、`tmp/music8-on-disk-not-in-db-<日時>.txt` に **未突合キー1行1件**。
- **DB にだけあるスラッグ**も欲しいとき: `--out-orphans=tmp/music8-db-slugs-no-file.txt` を追加。

2. **そのキーだけ取り込み**（例: 2500 件級）:

```powershell
npx tsx scripts/import-music8-songs-bulk.ts `
  --import-keys-file=tmp/music8-on-disk-not-in-db-2026-05-01T08-04-15-879Z.txt `
  --artist-songs-base=http://127.0.0.1:38100/data/artists `
  --songs-base=http://127.0.0.1:38100/data/songs `
  --songs-local-dir=E:\m8\public\data\songs `
  --sleep-ms=80 `
  --dry-run
```

`--dry-run` を外して本番。曲 JSON が取れない環境では **`[song-json-minimal]`** や **`--video-overrides`** の併用が必要になることがある（実装済みのフォールバック）。

### 失敗ログから Video ID 手動補完

1. `npm run gen:music8:video-overrides -- tmp/music8-import-failures.jsonl` → 空値の JSON を編集、または手書き。
2. **`--video-overrides-only=編集済み.json`** で再投入（全曲走査しない）。

3. Music8 の **`compact-songs.json`（大きな配列・`ytvideoid` あり）** を使い、失敗 JSONL の `artistSlug`+`songSlug` で突き合わせて Supabase に保存:  
   `npx tsx scripts/import-music8-compact-from-failures.ts --compact=E:/m8/public/data/compact-songs.json --failures=tmp/music8-import-overnight.jsonl`（`--dry-run` 可。`--report-skips` で未解決キー一覧のみ表示・DB 不要。~90MB 時は `NODE_OPTIONS=--max-old-space-size=8192`。不正な引用符は **`jsonrepair`** で修復するフォールバックあり／二重引用符系のみ事前に ASCII `"` へ寄せる）。  
   `npm run import:music8:compact-from-failures -- --compact=...` でも可。

### 参照スクリプト・npm

| 用途 | コマンド例 |
|------|------------|
| 一括取り込み本体 | `npm run import:music8:bulk` / `npx tsx scripts/import-music8-songs-bulk.ts` |
| キー一覧のチャンク分割 | `npm run split:music8:import-keys` / `npx tsx scripts/music8-split-import-keys.ts` |
| チャンク順実行・再開 | `npm run run:music8:import-chunks` / `npx tsx scripts/music8-import-chunk-runner.ts` |
| ディスク vs DB 差分 | `npm run diff:music8:songs-dir-vs-db` |
| failure から overrides 雛形 | `npm run gen:music8:video-overrides` / `npx tsx scripts/gen-music8-video-overrides-from-failures.ts` |
| failure + compact-songs.json で Supabase 投入 | `npm run import:music8:compact-from-failures` / `npx tsx scripts/import-music8-compact-from-failures.ts` |
| **The あり／なしの `main_artist` 統一**（曲削除なし・UPDATE のみ） | `npm run normalize:songs:main-artist`（dry-run）→ `npx tsx scripts/normalize-songs-main-artist-from-music8.ts --apply`。`music8_artist_slug` 単位で **先頭 The/A/An 付与だけ**を直す（`src/lib/music8-canonical-artist-name.ts` の `shouldNormalizePrefixOnlyArtistName`）。`--slug=police` で1件だけ可 |

`.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`**（取り込み・差分の DB 側）。差分のディスク側は **`--songs-dir`** の実パス。

## アーティスト JSON 一括（mc `artists`）

- **自宅 PC 引き継ぎ:** **`docs/music8-artist-import-handoff.md`**
- 計画・m8 フィールド対応: **`docs/music8-artist-import-and-integration-plan.md`**
- 実装: `src/lib/music8-artist-import.ts`・`scripts/import-music8-artists-bulk.ts`
- SQL（新列）: `docs/supabase-songs-and-performances-tables.md` の「アーティスト m8 整合」
- 一覧: `E:\m8\public\data\artists.json`（mc 参照 `log/artists.json`）
- 個別: `E:\m8\public\data\artists\{slug}.json` のみ（`*_songs.json` / `*_spngs.json` は読まない）
- 例: `npx tsx scripts/import-music8-artists-bulk.ts --dry-run --artists-list=E:/m8/public/data/artists.json --artists-dir=E:/m8/public/data/artists --limit=5`

## Spotify popularity バックフィル（2026-05 完了）

m8 取り込み後も `spotify_popularity` が NULL だった約 2,972 曲を、Spotify API 一括検索＋手動 track ID で **20,892 / 20,897 曲（残り 5 は Live 等で意図的に NULL）** まで補完した記録。

- **手順・コマンド・最終件数:** `docs/spotify-popularity-backfill-2026-05.md`
- スクリプト: `scripts/backfill-songs-spotify-metadata.ts`・`scripts/export-songs-no-spotify-popularity-csv.ts`・`scripts/apply-manual-spotify-metadata-patches.ts`・`scripts/count-songs-spotify-popularity.ts`

## 未決事項（次に決めると設計が固まる）

1. 同期は **定期バッチ**か **手動トリガー**か  
2. `songs` と Music8 の **1:1 キー**（`music8_song_id` またはファイルベース名）と衝突時のルール  
3. 無効 YouTube は **非表示**か **グレーアウト（選べない）**か  

---

※ 本メモはプロダクト仕様の確定稿ではなく、検討用の整理である。確定仕様は別途 PR／設計書に反映すること。
