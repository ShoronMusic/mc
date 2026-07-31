# ライブラリ・キーワード検索の高速化（計画と進捗）

**目的**: 部屋ライブラリ（アーティスト／曲名キーワード検索）の体感遅延を削減する。  
**対象 UI**: チャット入力のライブラリモーダル（`ChatInput`）  
**開始**: 2026-07-30  
**状態**: Phase 1 完了。Phase 2 は**コード側（クエリ一括化）完了・DB 索引の SQL は用意済みで未適用**。

関連: [`library-feature-spec-ja.md`](./library-feature-spec-ja.md)（機能仕様）／[`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md)（索引定義）

---

## 1. 背景と症状

- ライブラリ検索でキーワードを入れると、候補表示・曲一覧が出るまで数秒〜十数秒かかることがある。
- 特に日本語入力中（IME 変換）と「検索」押下直後の待ちが目立つ。
- YouTube Data API や Spotify API は、このキーワード検索経路では呼ばれていない（遅延の主因ではない）。

---

## 2. 実装経路（現状の骨格）

| 段階 | 経路 | 主なファイル |
|------|------|----------------|
| UI 入力 | `libraryQuery` → 日本語名マッチ／検索実行 | `src/components/chat/ChatInput.tsx` |
| 日本語名 → 英語 `main_artist` | `GET /api/library/match-main-artists` | `src/app/api/library/match-main-artists/route.ts`・`resolveMainArtistsForLibrarySearch` |
| 曲検索 | `GET /api/library/search` | `src/app/api/library/search/route.ts`・`src/lib/library-search-query.ts` |
| 全アーティスト索引 | `GET /api/library/artists`（プロセス内 15 分キャッシュ） | `src/lib/build-library-artist-index.ts` |
| アーティスト選択後 | `songs-by-artist`・`artist-info`（＋ Music8 GCS） | 各 `src/app/api/library/*` |

検索語は表記ゆれのため最大約 12 バリエーションに展開され、各バリエーションで `%…%` ILIKE を発行する。

---

## 3. 遅延要因（調査結論）

優先度の高い順:

1. **入力 2 文字目以降、1 文字ごとに日本語名照合 API を発行**（デバウンスなし）
2. **検索確定時に照合 API を再取得**し、索引取得 → 照合 → 曲検索を**直列**に待っていた
3. **1 回の検索内で Supabase クエリが多数・逐次実行**（バリエーションごと・アーティストごと）
4. **アーティスト索引キャッシュミス時に `songs`＋`song_credits` 全件走査**
5. **`%ILIKE%` 向けの `pg_trgm` 索引がリポジトリ定義に見当たらない**（B-tree `lower(name)` 等は中間一致に弱い）
6. **catalog 絞り込みが取得後の Node 側**のため、不要行転送と上限後フィルタによる漏れリスク
7. **アーティスト選択後の Music8 GCS 待ち・詳細 API の重複呼び出し**（キーワード入力そのものより「選択後」）

---

## 4. フェーズ計画

### Phase 1 — 待ち・重複・直列の解消（コードのみ・低リスク）

| # | 施策 | 期待効果 | 状態 |
|---|------|----------|------|
| 1.1 | 日本語名マッチを **300ms デバウンス**＋同一語の Promise 共有 | 入力中の API 嵐を抑制 | **完了**（2026-07-30） |
| 1.2 | 検索実行時の **照合再取得を廃止**（入力中結果を再利用） | ボタン押下の余分な RTT を削減 | **完了** |
| 1.3 | 索引取得・照合・曲検索を **並行起動**（曲検索が照合完了を待たない） | 体感の「検索開始」を短縮 | **完了** |
| 1.4 | バリエーション／アーティスト別クエリの **限定並行化**（同時実行数定数化） | サーバー応答時間の短縮 | **完了** |
| 1.5 | テキスト検索と `resolveMainArtistsForLibrarySearch` を **API 内で並行** | 同上 | **完了** |
| 1.6 | `match-main-artists` に **短期 Cache-Control**（private 60s / SWR 300s） | ブラウザ再取得の緩和 | **完了** |

**意図的に触っていないもの（Phase 1）**: 検索結果の意味・並びの仕様変更、DB スキーマ、Music8 条件付き取得、索引の永続集計。

### Phase 2 — DB 検索そのものの高速化（中コスト・効果大）

| # | 施策 | 期待効果 | 状態 |
|---|------|----------|------|
| 2.1 | `%ILIKE%` 対象列へ **`pg_trgm` GIN**（`songs` の title／artist 系、`artists.name`／`name_ja` 等） | DB 側の本質的な高速化 | **SQL 用意済み・DB 未適用** |
| 2.2 | **catalog 条件を DB クエリへ押し込み**（取得後フィルタ依存を減らす） | 転送量削減・上限後漏れの緩和 | 保留（下記「見送り理由」） |
| 2.3 | バリエーション検索の **RPC／1 クエリ化**（暫定の `Promise.all` より効率的） | ラウンドトリップ削減 | 未着手 |
| 2.4 | 再生回数を **履歴行の全転送ではなく DB 集約**（＋複合索引） | 付加情報の遅延削減 | 索引のみ 2.1 の SQL に同梱。RPC 化は未着手 |
| 2.5 | 候補アーティストの **`song_credits` 経路を一括取得**（`artists`→`song_credits`→`songs` を 1 名ずつ叩かない） | 往復・クエリ数の削減 | **完了**（2026-07-31） |

**2.1 の適用手順**: [`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md) の「キーワード検索の索引（`pg_trgm`）」を **Supabase SQL Editor で実行**する。  
アプリ側の変更は不要（既存クエリがそのまま索引に乗る）。適用後に §6 のベンチを再測し、`LIBRARY_SEARCH_ARTIST_CONCURRENCY` の引き上げ余地も再評価する。

**2.2 の見送り理由**: `catalog` の判定は「洋楽扱い日本人アーティスト」を **無条件で通す**分岐を含み（`western_treated_jp_artists` の照合は空白除去・slug 正規化を伴う）、SQL の `catalog_scope` 条件だけでは **通すべき行を落としうる**。押し込むなら判定用の正規化列を `songs` 側に持たせるなど、スキーマ側の準備が先。

### Phase 3 — 索引・選択後の待ち（中〜高コスト）

| # | 施策 | 期待効果 | 状態 |
|---|------|----------|------|
| 3.1 | アーティスト索引を **集計テーブル／マテビュー**＋更新経路 | キャッシュミス時の全件走査を廃止 | 未着手 |
| 3.2 | 索引キャッシュの **インスタンス間共有**＋ in-flight 一本化 | サーバーレスでの再構築競合を抑制 | 未着手 |
| 3.3 | 索引レスポンスに日本語名・正規化キーを含め、**入力中照合 API を廃止可能に** | クライアント完結の候補出し | 未着手 |
| 3.4 | `artist-info` の Music8 を **DB 不足時のみ**、詳細 API の **二重呼び出し解消** | 選択後の待ち削減 | 未着手 |
| 3.5 | 検索初回レスポンスから `my_play_count`／AI 解説有無などを **遅延取得** | 初回表示優先 | 未着手 |

### Phase 4 — 運用・検証

| # | 施策 | 状態 |
|---|------|------|
| 4.1 | 代表クエリの応答時間を定期計測（下記ベンチ） | Phase 1 時点でローカル計測済み |
| 4.2 | `pg_trgm` 適用前後の `EXPLAIN`／本番相当データ量での確認 | 未着手 |
| 4.3 | catalog 押し込み後の検索漏れ回帰テスト | 未着手 |

---

## 5. 変更ファイル

### Phase 1（2026-07-30）

| ファイル | 内容 |
|----------|------|
| `src/components/chat/ChatInput.tsx` | デバウンス、照合キャッシュ、検索時の並行起動・再取得廃止 |
| `src/lib/library-search-query.ts` | `mapWithLimitedConcurrency`、照合・アーティスト曲取得の並行化、同時実行数定数 |
| `src/app/api/library/search/route.ts` | バリエーション／アーティスト別の限定並行、照合とテキスト検索の並行 |
| `src/app/api/library/match-main-artists/route.ts` | Cache-Control |

### Phase 2（2026-07-31）

| ファイル | 内容 |
|----------|------|
| `docs/supabase-songs-and-performances-tables.md` | `pg_trgm` GIN 索引ほかの SQL（2.1・**実行は運用者**） |
| `src/lib/library-search-query.ts` | `fetchCreditSongsForLibraryArtistNamesBatch`、`fetchSongsForLibraryArtistSelection` に一括結果の受け口 |
| `src/app/api/library/search/route.ts` | 候補アーティストのクレジット経路を事前一括取得 |

同時実行数（現行）:

- `LIBRARY_SEARCH_QUERY_CONCURRENCY = 4`（表記ゆれバリエーション等）
- `LIBRARY_SEARCH_ARTIST_CONCURRENCY = 3`（1 アーティストあたり複数クエリのため控えめ）

Supabase へ一度に投げすぎないよう上限を定数化している（過去の DB／接続枯渇インシデントを踏まえた制約）。

切り戻し用の環境変数:

| 変数 | 意味 |
|------|------|
| `LIBRARY_SEARCH_CREDIT_BATCH=0` | 2.5 の一括取得をやめ、従来の「アーティスト 1 名ずつ」に戻す |

---

## 6. 計測メモ（Phase 1）

環境: ローカル `localhost:3002`、同一 DB、`catalog=western`、`limit=100`。  
比較: サーバー側 Phase 1 変更の有無（stash で前後比較）。クライアント改善（デバウンス等）は体感・リクエスト回数向けで、下記は主に **API 応答時間**。

| クエリ | 改善前（warm 目安） | 改善後（warm 目安） | 備考 |
|--------|---------------------|---------------------|------|
| `テイラー` | 約 7.2 s | 約 2.1 s | 先頭 Taylor Swift・件数 100 は前後一致 |
| `beatles` | （未厳密比較） | 約 1.1 s | |
| `スミス` | （未厳密比較） | 約 2.9 s | |
| `love` | （未厳密比較） | 約 5.0 s | ヒット幅が広く Phase 2 以降の課題 |

初回（cold）はキャッシュ・接続でさらに遅くなる。`match-main-artists` 単体は warm で約 0.2 s 前後（ブラウザ Cache-Control は別途）。

### Phase 2.5（クレジット経路の一括化）の計測

**結果の同一性**: 一括化あり／なし（`LIBRARY_SEARCH_CREDIT_BATCH=0`）で、`love`・`beatles`・`テイラー`・`スミス` の  
返却 100 件の **id 列 SHA-1 が完全一致**。並びも件数も変わらないことを確認済み。

**応答時間**: 有意な短縮は観測できなかった（`love` で 4.4 s 前後 ↔ 5.5 s 前後、計測ごとの揺れの範囲内）。  
クエリ本数は候補アーティスト 1 名あたり 3 本減るため **DB 負荷は下がる**が、体感短縮には 2.1 の索引が必要。

### 計測時の注意（重要）

同一クエリの繰り返しでも **2〜3 倍ぶれる**（例: `テイラー` 2.1 s ↔ 4.6 s、`love` 4.4 s ↔ 13 s）。  
一方で候補アーティスト 1 名の `beatles` は約 1.2 s で安定している。  
→ 遅さは **候補アーティスト数 × `songs` の全走査**に比例し、走査が増えるとインスタンス側で不安定化する。  
ベンチは必ず **3 回以上**測り、軽いクエリ（`beatles`）を対照に置くこと。

検証済み:

- `npx tsc --noEmit` 通過
- ライブラリ関連単体テスト（`library-artist-autoplay` / `library-song-display-by-video` / `admin-library-index` / `western-treated-jp-artists` / `song-catalog-scope` / `artist-english-name`）通過
- 代表クエリで件数・先頭アーティスト・id 列ハッシュのスモーク

---

## 7. 推奨の次アクション

1. **Phase 2.1 の SQL を実行**（運用者）… 現状ここが最大のボトルネック。候補アーティストごとの `main_artist ILIKE '%名前%'` が毎回 `songs` を全走査している。
2. 適用後に §6 を再測し、**`LIBRARY_SEARCH_ARTIST_CONCURRENCY` の引き上げ**と 2.3（RPC 化）の必要性を判断。
3. **Phase 3.4 選択後 Music8／二重 fetch** … キーワード検索とは別だが、ライブラリ全体の体感に効く。

---

## 8. 非目標・注意

- 検索ヒットの**意味付けや並びの仕様変更**は本プロジェクトの主目的ではない（高速化の副作用が出たら回帰で検知する）。
- **`.env*` の無断変更**や本番 DB の無承認スキーマ変更はしない。Phase 2 の索引追加は指示者確認のうえ適用する。
- 並行度を上げすぎると Supabase／接続プールを圧迫しうる。定数変更時は計測と合わせて行う。

---

## 9. 進捗ログ

| 日付 | 内容 |
|------|------|
| 2026-07-30 | 経路調査。遅延要因を整理。 |
| 2026-07-30 | Phase 1 実装（デバウンス・重複廃止・並行化・Cache-Control）。ローカル計測で `テイラー` warm 約 7.2s → 約 2.1s。本書作成。 |
| 2026-07-31 | ボトルネックを再測（`love` は候補アーティスト 36 件 → 全走査の反復が支配的）。Phase 2.1 の SQL を `supabase-songs-and-performances-tables.md` に用意（**DB 未適用**）。Phase 2.5 クレジット経路の一括化を実装（結果 id 列が完全一致）。2.2 は洋楽扱い判定のため保留と判断。 |
| 2026-07-31 | 「マイケル」検索で C 列に曲名 `Billie Jean` / `Faith` が出る不具合を修正。原因は `artists.name` に曲名・`name_ja` に本人名が付いた行。照合結果を `song_credits` 先の支配的 `main_artist` へ正規化（`pickCanonicalLibraryMainArtistName`）。 |
