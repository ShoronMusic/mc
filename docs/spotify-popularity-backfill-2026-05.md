# Spotify popularity バックフィル（2026-05）

`spotify_popularity` 未設定（約 2,972 曲）を、Spotify Web API（Client Credentials）と手動 track ID で補完した作業の記録。

関連: `docs/supabase-songs-and-performances-tables.md`（`songs.spotify_popularity` 列）、`docs/music8-library-import-notes.md`（Music8 一括取り込みで m8 JSON 由来の値が入る曲もある）。

---

## 1. 背景

| 項目 | 内容 |
|------|------|
| 対象テーブル | `public.songs` |
| 列 | `spotify_popularity`（`smallint` 0–100）、`spotify_track_id` ほか |
| 通常の入り方 | Music8 曲 JSON 取り込み時に `acf.spotify_popularity` 等からコピー（`src/lib/song-entities.ts` の `patchSongFutureColumnsFromMusic8`） |
| 今回のギャップ | YouTube 起点のみ・m8 に Spotify メタが無い曲など **約 14% が NULL** のまま残っていた |

### 開始時の DB 集計（Supabase SQL）

```sql
select
  count(*) as total,
  count(spotify_popularity) as with_spotify_popularity,
  round(100.0 * count(spotify_popularity) / nullif(count(*), 0), 1) as pct
from public.songs;
```

| 指標 | 件数 |
|------|------|
| 総曲数 | 20,898 |
| `spotify_popularity` あり | 17,926（**85.8%**） |
| 未設定 | **2,972** |

---

## 2. 未設定曲の一覧 CSV 出力

Supabase SQL Editor の **Export → CSV は最大 100 行**のため、全件はローカルスクリプトで出力。

```powershell
Set-Location E:\mc
npx tsx scripts/export-songs-no-spotify-popularity-csv.ts
# 出力例: tmp/songs-no-spotify-popularity-{timestamp}.csv
```

列: `main_artist`, `song_title`, `display_title`, `spotify_track_id`, `spotify_track_id_from_json`（`music8_song_data` 内）, m8 スラッグ など。

---

## 3. 自動バックフィル（Spotify API 検索）

### 前提（`.env.local`）

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`（`--apply` 時）
- 任意: `SPOTIFY_MARKET=US`

### スクリプト

`scripts/backfill-songs-spotify-metadata.ts`  
共通ライブラリ: `src/lib/spotify-search-track.ts`（管理の YouTube プレイリスト import と同系の `artist:… track:…` 検索）。

### 1 曲あたりの処理（`--apply`）

1. Spotify API で検索 or `GET /v1/tracks/{id}`（既存 `spotify_track_id` あり時）
2. 取得できたら **その場で** `songs` を 1 行 UPDATE
3. `--delay-ms`（既定 400）待機
4. 次曲へ（**並列ではない**）

### 検索の優先順

1. 既存 `spotify_track_id` → トラック GET
2. `display_title` を `Artist - Title` に分割 → フィールド検索
3. `main_artist` + `song_title`
4. `display_title` 全文を `q` にした汎用検索（`display_title_free_text`）

### コマンド例

```powershell
# dry-run（既定）
npx tsx scripts/backfill-songs-spotify-metadata.ts --limit=100 --offset=0

# DB 反映
npx tsx scripts/backfill-songs-spotify-metadata.ts --apply --limit=100 --offset=0
```

### 重要: `offset` は常に `0`

対象は **`spotify_popularity IS NULL` の行だけ**（`display_title` 昇順の先頭から `limit` 件）。  
反映済み行は次回の対象外になる。

| 運用 | 結果 |
|------|------|
| **毎回 `--offset=0`** | 未設定の先頭 100 曲を処理（正しい） |
| `--offset=100,200,300…` と増やす | 未設定リスト内の塊を **飛ばす**（誤り。旧ログメッセージは修正済み） |

完了の目安: 1 回の件数が **100 未満**、または集計で `still_missing` が意図した残数（今回は 5）。

所要時間の目安: **100 曲 ≒ 1〜2 分**、全件 ≒ **40 分〜1 時間**（`--delay-ms=400`）。

ログ: `tmp/spotify-backfill-*.jsonl`

---

## 4. 手動補修（no_match・track ID 指定）

自動検索で見つからなかった曲のうち、Spotify にあるものは **track ID を指定**して反映。

### track ID のみ → API で popularity 等を取得

`scripts/apply-manual-spotify-metadata-patches.ts` の `FETCH_BY_TRACK_ID`:

| display_title | spotify_track_id | API 取得 pop（例） |
|---------------|------------------|-------------------|
| Ghost In The Shell: Stand Alone Complex - Opening Theme - Get 9 | `2j5uB4m09BUw77O3Hhig38` | 14 |
| Suisei Channel - もうどうなってもいいや / 星街すいせい | `17oTdCFRG5Vp4381jehV3U` | 59 |

### track ID + popularity を直指定

同スクリプトの `PATCHES`:

| display_title | spotify_track_id | pop |
|---------------|------------------|-----|
| d4vd - Crashing | `44MnSCzK2nFWQvv0kjUvkW` | 2（手入力。要確認時は Spotify で再確認） |
| Linkin Park - Numb (Official Music Video) [4k Upgrade] – Linkin Park | `2nLtzopw4rPReszdYBJU6h` | 90 |
| Msg (Mcauley Schenker Group) - Gimme Your Love From The Album Perfect Timing | `7qnkwHL4nIRT9eRWuhLWGb` | 39 |
| Nikos791 - Parov Stelar - Diamonds | `1M9piyRemGf82O8JeuCKzO` | 14 |
| Otopia - Psychology | `6yVl4xl7KIEviXsdGI1eM8` | 51 |

```powershell
npx tsx scripts/apply-manual-spotify-metadata-patches.ts --apply
```

### 曲マスタ削除

| display_title | 理由 |
|---------------|------|
| Rod Stewart - Ole Ola | ユーザー指定で削除（`deleteSongMasterCascade`） |

---

## 5. 最終結果（2026-05-22 時点）

```powershell
npx tsx scripts/count-songs-spotify-popularity.ts
```

| 指標 | 件数 |
|------|------|
| 曲マスタ総数 | **20,897**（Rod Stewart 1 曲削除後） |
| **`spotify_popularity` あり** | **20,892** |
| **未設定** | **5** |
| カバー率 | **約 100.0%** |

今回の作業で **約 2,966 曲** に popularity が追加された（開始 2,972 未設定 − 最終 5 未設定 ≒ 2,967。削除 1 曲を含むと整合）。

### 意図的に NULL のまま（5 曲）

Live 版・マッシュアップ・投稿者名入りタイトルなど **Spotify に無い／検索不能** として運用上 OK。

- Lady Gaga - Moth Into Flame (Dress Rehearsal) At The 59th Grammy Awards 2017
- Machine Gun Kelly - Empty Out Your Pockets X Boulevard Of Broken Dreams
- Nicolas Fernandez - The Police Every Breath You Take 2008 Live Hd
- Shock - Electrophonic Phunk
- Zxlh-_twyru

---

## 6. 確認用 SQL

```sql
-- 件数サマリ
select
  count(*) as total,
  count(spotify_popularity) as with_spotify_popularity,
  count(*) - count(spotify_popularity) as still_missing
from public.songs;

-- 未設定一覧
select display_title, main_artist, song_title, spotify_track_id
from public.songs
where spotify_popularity is null
order by display_title;
```

管理画面: `/admin/library` で **Spotify人気順**ソート（`spotify_popularity`）。曲詳細: `/admin/songs/[songId]`。

---

## 7. スクリプト一覧

| スクリプト | 用途 |
|------------|------|
| `scripts/export-songs-no-spotify-popularity-csv.ts` | 未設定曲の CSV 全件出力 |
| `scripts/backfill-songs-spotify-metadata.ts` | Spotify 検索 → DB 更新（100 曲ずつ） |
| `scripts/apply-manual-spotify-metadata-patches.ts` | 手動 track ID / 削除 |
| `scripts/count-songs-spotify-popularity.ts` | 件数集計 |
| `src/lib/spotify-search-track.ts` | Client Credentials・検索・トラック GET |

---

## 8. 今後の再実行

- m8 一括取り込み後に再び NULL が増えた場合: 上記 **§3** を `--offset=0` で繰り返す。
- 個別に直す: **§4** のパッチスクリプトに `FETCH_BY_TRACK_ID` または `PATCHES` を追記。
- `play_count` は **アプリ内選曲回数**であり、Spotify popularity とは別指標。

---

## 9. 既知の注意

- API の popularity は **取得時点のスナップショット**（時間とともに Spotify 側で変動）。
- `display_title_free_text` のみでヒットした曲は **別曲の可能性** あり（目視・track ID 確認推奨）。
- レート制限（429）時は `--delay-ms=600` などに増やす。
