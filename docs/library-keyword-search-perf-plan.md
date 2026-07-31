# ライブラリ・キーワード検索の高速化（計画と進捗）

**目的**: 部屋ライブラリ（アーティスト／曲名キーワード検索）の体感遅延を削減する。  
**対象 UI**: チャット入力のライブラリモーダル（`ChatInput`）  
**開始**: 2026-07-30  
**最終更新**: 2026-07-31  

関連: [`library-feature-spec-ja.md`](./library-feature-spec-ja.md)（機能仕様）／[`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md)（`pg_trgm`・スナップショット表 SQL）

---

## 0. 進捗サマリー（2026-07-31 時点）

| 区分 | 内容 | 状態 |
|------|------|------|
| Phase 1 | デバウンス・重複照合廃止・クエリ並行化 | **完了・利用者確認済み** |
| Phase 2.1 | `pg_trgm` GIN 索引 | **適用済み・速度改善確認** |
| Phase 2.5 | `song_credits` 経路の一括取得 | **完了** |
| 品質修正 | 「マイケル」で曲名がアーティストに出る問題 | **完了・利用者確認済み** |
| Phase 3.4 | 詳細 API 一本化・Music8 条件付き取得 | **完了・利用者確認済み** |
| Phase 3.5 | 基本一覧＋後続詳細の二段階取得 | **完了・利用者確認済み** |
| Phase 3.1 / 3.2 | 索引 DB スナップショット＋ in-flight | **完了・利用者確認済み**（表未作成時はフォールバック） |
| Phase 2.2 | catalog の DB 押し込み | **保留**（検索漏れリスク） |
| Phase 2.3 / 2.4 / 3.3 | RPC 化・再生回数集約・索引への日本語キー | **未着手**（任意の続き） |

**結論**: 費用対効果の高い施策は一通り完了。日常利用で十分な速度になったため **一区切り可能**。続きをするなら本命は **Phase 3.3**（入力中照合の削減）。

---

## 1. 背景と症状（着手時）

- キーワード入力〜候補・曲一覧表示まで数秒〜十数秒かかることがあった。
- 特に日本語入力中（IME）と「検索」押下直後の待ちが目立った。
- YouTube Data API / Spotify API は、このキーワード検索経路では呼ばれていない。

---

## 2. 実装経路（改善後の骨格）

| 段階 | 経路 | 主なファイル |
|------|------|----------------|
| UI 入力 | `libraryQuery` → デバウンス付き日本語名マッチ／検索実行 | `src/components/chat/ChatInput.tsx` |
| 日本語名 → 英語 `main_artist` | `GET /api/library/match-main-artists`（正規化あり） | `match-main-artists`・`resolveMainArtistsForLibrarySearch`・`pickCanonicalLibraryMainArtistName` |
| 曲検索（基本） | `GET /api/library/search?deferDetails=1` | `search/route.ts`・`library-search-query.ts` |
| 曲の付加情報 | `POST /api/library/song-details` | `song-details/route.ts` |
| 全アーティスト索引 | `GET /api/library/artists`（メモリ → DB スナップショット → 全件走査） | `build-library-artist-index.ts` |
| アーティスト選択後 | `songs-by-artist?deferDetails=1`・`artist-info`（Music8 は DB 不足時のみ） | 各 `src/app/api/library/*` |

検索語は表記ゆれのため最大約 12 バリエーションに展開し、限定並行で `%…%` ILIKE を発行する。

---

## 3. 着手時の遅延要因と対応結果

| # | 要因 | 対応 | 結果 |
|---|------|------|------|
| 1 | 入力 1 文字ごとの照合 API | 300ms デバウンス＋ Promise 共有 | 解消 |
| 2 | 検索時の照合再取得・直列待ち | 再利用＋並行起動 | 解消 |
| 3 | バリエーション／アーティスト別の逐次クエリ | 限定並行化＋クレジット一括 | 軽減 |
| 4 | 索引キャッシュミス時の全件走査 | DB スナップショット＋ in-flight | コード完了 |
| 5 | `%ILIKE%` に弱い B-tree | `pg_trgm` GIN | 適用・効果確認 |
| 6 | catalog の取得後フィルタ | — | 保留 |
| 7 | 選択後の Music8／詳細二重呼び | 条件付き取得＋一本化 | 解消 |

---

## 4. フェーズ計画と状態

### Phase 1 — 待ち・重複・直列の解消

| # | 施策 | 状態 |
|---|------|------|
| 1.1 | 日本語名マッチ 300ms デバウンス＋同一語 Promise 共有 | **完了**（2026-07-30） |
| 1.2 | 検索実行時の照合再取得廃止 | **完了** |
| 1.3 | 索引・照合・曲検索の並行起動 | **完了** |
| 1.4 | バリエーション／アーティスト別クエリの限定並行化 | **完了** |
| 1.5 | テキスト検索とアーティスト照合の API 内並行 | **完了** |
| 1.6 | `match-main-artists` の短期 Cache-Control | **完了** |

### Phase 2 — DB 検索そのものの高速化

| # | 施策 | 状態 |
|---|------|------|
| 2.1 | `pg_trgm` GIN（songs / artists の検索列） | **適用済み・速度改善確認** |
| 2.2 | catalog 条件の DB 押し込み | **保留**（洋楽扱い日本人判定のため漏れリスク） |
| 2.3 | バリエーション検索の RPC／1 クエリ化 | 未着手 |
| 2.4 | 再生回数の DB 集約（RPC） | 索引は 2.1 に同梱。RPC 化は未着手 |
| 2.5 | 候補アーティストの `song_credits` 一括取得 | **完了**（2026-07-31） |

### Phase 3 — 索引・選択後・初回表示

| # | 施策 | 状態 |
|---|------|------|
| 3.1 | アーティスト索引の DB スナップショット | **完了・利用者確認済み**（2026-07-31） |
| 3.2 | in-flight 一本化＋ DB によるインスタンス間共有 | **完了**（Redis は不要と判断） |
| 3.3 | 索引へ日本語名・正規化キーを載せ照合 API 削減 | 未着手（続きの本命） |
| 3.4 | `artist-info` の Music8 条件付き・二重呼び解消 | **完了・利用者確認済み** |
| 3.5 | `my_play_count`／AI 解説有無の遅延取得 | **完了・利用者確認済み** |

### Phase 4 — 運用・検証

| # | 施策 | 状態 |
|---|------|------|
| 4.1 | 代表クエリ計測 | 実施済み（下記） |
| 4.2 | `pg_trgm` の `EXPLAIN` 再確認 | 任意 |
| 4.3 | catalog 押し込み後の回帰 | 2.2 着手時 |

---

## 5. 変更ファイル一覧

### Phase 1

| ファイル | 内容 |
|----------|------|
| `src/components/chat/ChatInput.tsx` | デバウンス、照合キャッシュ、検索時の並行起動 |
| `src/lib/library-search-query.ts` | `mapWithLimitedConcurrency`、並行化、同時実行数定数 |
| `src/app/api/library/search/route.ts` | バリエーション／アーティスト別の限定並行 |
| `src/app/api/library/match-main-artists/route.ts` | Cache-Control |

### Phase 2

| ファイル | 内容 |
|----------|------|
| `docs/supabase-songs-and-performances-tables.md` | `pg_trgm` SQL |
| `src/lib/library-search-query.ts` | クレジット一括・canonical 名正規化 |
| `src/app/api/library/search/route.ts` | クレジット経路の事前一括 |

### Phase 3.4 / 3.5 / 3.1–3.2

| ファイル | 内容 |
|----------|------|
| `src/app/api/library/artist-info/route.ts` | DB 十分なら Music8 省略 |
| `src/lib/music8-artist-json-by-name-server.ts` | Music8 成功／不在キャッシュ |
| `src/app/api/library/song-details/route.ts` | 後続詳細 API |
| `src/app/api/library/search/route.ts` | `deferDetails=1` |
| `src/app/api/library/songs-by-artist/route.ts` | 同上 |
| `src/components/chat/ChatInput.tsx` | 二段階マージ・詳細 API 一本化 |
| `src/lib/build-library-artist-index.ts` | スナップショット＋ in-flight |
| `scripts/rebuild-library-artist-index.ts` | 手動フル再構築 |
| `src/lib/build-library-artist-index.unit-test.ts` | スナップショットパース試験 |

**同時実行数**: `LIBRARY_SEARCH_QUERY_CONCURRENCY = 4`／`LIBRARY_SEARCH_ARTIST_CONCURRENCY = 3`  
**切り戻し**: `LIBRARY_SEARCH_CREDIT_BATCH=0` でクレジット一括をオフ

---

## 6. 計測メモ

環境: ローカル `localhost:3002`、同一 DB。値は通信・DB 状態で変動するため、相対比較用。

### Phase 1（キーワード検索 API・warm 目安）

| クエリ | 改善前 | 改善後 | 備考 |
|--------|--------|--------|------|
| `テイラー` | 約 7.2 s | 約 2.1 s | 件数・先頭一致 |
| `beatles` | — | 約 1.1 s | |
| `スミス` | — | 約 2.9 s | |
| `love` | — | 約 5.0 s（当時） | 幅広クエリ |

### Phase 2.1 以降

- 利用者が検索速度の改善を確認（`pg_trgm` 適用後）。
- Phase 2.5 は結果 id 列 SHA-1 が一致。体感短縮は索引適用後が主因。

### Phase 3.5（二段階取得）

| 操作 | 従来（全情報） | 基本一覧 | 後続詳細 |
|------|----------------|----------|----------|
| `マイケル` 100件 | 約 4.33 s | **約 1.64 s** | 約 0.73 s |
| `love` 100件 | 約 3.85 s | **約 2.57 s** | 約 0.55 s |
| Michael Jackson 53曲 | 約 2.94 s | **約 0.62 s** | 約 0.43 s |

AI 解説あり件数は従来と一致（マイケル 18、love 11、MJ 14）。

### Phase 3.1（アーティスト索引）

| 操作 | 時間 |
|------|------|
| `/api/library/artists?catalog=all` 初回（全件走査） | 約 30 s |
| 同 2 回目（メモリ） | 約 0.26 s |

スナップショット表適用後は、プロセス再起動後も DB から即返し可能。

### 品質修正（マイケル）

- 原因: `artists.name` に曲名（Billie Jean / Faith）、`name_ja` に本人名。
- 対応: 紐づく曲の支配的 `main_artist` へ正規化 → Michael Jackson / George Michael。

---

## 7. 運用メモ（スナップショット）

1. SQL: [`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md) の `library_artist_index_snapshots`
2. 初回構築: `npx tsx scripts/rebuild-library-artist-index.ts`
3. 管理画面で洋楽扱い／邦楽リスト等を変えたときは既存の `clearLibraryArtistIndexCache` がメモリ＋スナップショットを破棄
4. 表が無い（`42P01`）ときは従来のメモリ構築にフォールバック

---

## 8. 残課題と推奨

| 優先 | 施策 | 備考 |
|------|------|------|
| 任意・本命 | **3.3** 索引に日本語キーを載せ照合 API 削減 | 入力中体感 |
| 任意 | **2.4** 再生回数の DB 集約 | 後続詳細の安定化（3.5 で体感は改善済み） |
| 任意 | **2.3** 検索 RPC 化 | `love` 級の幅広語向け・コスト高 |
| 保留 | **2.2** catalog DB 押し込み | スキーマ準備が先 |

日常利用で十分な速度なら、**ここで一区切りでよい**。

---

## 9. 非目標・注意

- 検索ヒットの意味付け・並びの仕様変更は主目的ではない。
- `.env*` の無断変更や本番 DB の無承認スキーマ変更はしない。
- 並行度を上げすぎると Supabase／接続プールを圧迫しうる。

---

## 10. 進捗ログ

| 日付 | 内容 |
|------|------|
| 2026-07-30 | 経路調査。遅延要因を整理。本書作成。 |
| 2026-07-30 | Phase 1 実装。`テイラー` warm 約 7.2s → 約 2.1s。 |
| 2026-07-31 | Phase 2.1 SQL 用意 → 適用・速度改善を利用者確認。Phase 2.5 クレジット一括。2.2 は保留。 |
| 2026-07-31 | 「マイケル」で Billie Jean / Faith が C 列に出る不具合を正規化で修正。利用者確認。 |
| 2026-07-31 | Phase 3.4（Music8 条件付き・詳細一本化）。利用者確認。 |
| 2026-07-31 | Phase 3.5（二段階取得）。基本一覧の待ちを大幅短縮。利用者確認。 |
| 2026-07-31 | Phase 3.1/3.2（索引スナップショット＋ in-flight）。利用者確認。 |
| 2026-07-31 | ここまでの進捗を本書に集約。残りは任意（本命 3.3）。一区切り可能と判断。 |
