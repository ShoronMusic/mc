# Music8 → ライブラリ取り込み（相談メモ）

更新日: 2026-04-28（会話ベースの整理・運用モデル追記）

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

## 未決事項（次に決めると設計が固まる）

1. 同期は **定期バッチ**か **手動トリガー**か  
2. `songs` と Music8 の **1:1 キー**（`music8_song_id` またはファイルベース名）と衝突時のルール  
3. 無効 YouTube は **非表示**か **グレーアウト（選べない）**か  

---

※ 本メモはプロダクト仕様の確定稿ではなく、検討用の整理である。確定仕様は別途 PR／設計書に反映すること。
