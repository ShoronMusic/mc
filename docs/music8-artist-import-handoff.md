# Music8 アーティスト JSON → mc `artists` 取り込み — 引き継ぎ（自宅 PC）

更新: 2026-05-21  
リポジトリ: `E:\mc`（musicaichat）

詳細設計・将来統合: [`music8-artist-import-and-integration-plan.md`](./music8-artist-import-and-integration-plan.md)

---

## 1. 目的

m8（Music8）のアーティスト JSON を正として、mc の Supabase `artists` マスタを揃える。  
曲一括（`import:music8:bulk`）と同系の **slug 突合 + m8 正式名** で、将来 m8 / mc 統合をしやすくする。

---

## 2. データの場所（この PC）

| 種別 | パス | 備考 |
|------|------|------|
| **一覧 JSON** | `C:\Users\maeha\json\artists.json` | 約 **6,709** 件（slug 供給） |
| **個別 JSON** | `C:\Users\maeha\json\artists\{slug}.json` | 約 **6,723** ファイル |
| **読まない** | `{slug}_songs.json` / `{slug}_spngs.json` | 曲リスト用 |
| mc 参照コピー | `E:\mc\log\artists.json` | 一覧の参照用（取り込みは C: 側推奨） |
| 失敗ログ | `C:\Users\maeha\json\music8-artist-import-failures-*.jsonl` | apply 時に自動作成 |
| 失敗ログコピー | `E:\mc\log\music8-artist-import-failures-2026-05-21T07-18-33-563Z.jsonl` | 445 行 |

m8 本番元（外付け SSD）: `E:\m8\public\data\` → **自宅 PC では `C:\Users\maeha\json` にコピー済み**で作業する。

---

## 3. DB（Supabase）— 実施済み SQL

SQL Editor で **「アーティスト m8 整合」** を実行済みであること（8 列確認済み）。

```sql
-- 確認用
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'artists'
  and column_name in (
    'name_base', 'the_prefix', 'name_sort', 'music8_artist_id',
    'active_year_start', 'description_en', 'music8_members', 'music8_synced_at'
  )
order by column_name;
```

定義全文: [`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md) の「アーティスト m8 整合」節。

### `artists` の考え方（m8 寄せ）

| m8 | mc 列 |
|----|--------|
| `name` + `thePrefix` | `name_base` + `the_prefix`、表示は **`name`**（The 込み） |
| `id` | `music8_artist_id` |
| `slug` | `music8_artist_slug` |
| 一覧のコンパクト行 | `artists.json` は **slug リスト用**（DB 直書きしない） |

---

## 4. 実施済み作業の結果

### 一括 apply（全件・1 本）

- コマンド: 一覧 + 個別ディレクトリ、**`--limit` なし**（約 6,720 件）
- 結果:
  - **ok: 6,275**
  - **fail: 445**
  - **skip: 0**
- 失敗ログ: `C:\Users\maeha\json\music8-artist-import-failures-2026-05-21T07-18-33-563Z.jsonl`
- 失敗理由（445 件すべて）: `duplicate key ... idx_artists_name`（同名の `artists` 行が複数あり、insert/update が衝突）

### 参考（取り込み前の mc 件数）

- `artists` 総数: 約 5,121
- `music8_artist_slug` あり: 約 2,410

---

## 5. コード（リポジトリ内）

| パス | 役割 |
|------|------|
| `src/lib/music8-artist-import.ts` | JSON → パッチ、突合、upsert（**同名重複行対策あり**） |
| `scripts/import-music8-artists-bulk.ts` | 一括 CLI |
| `scripts/run-music8-artists-import-local.ps1` | この PC 用ショートカット |
| `src/app/api/admin/artist-master-import-json/route.ts` | 管理画面 1 件 import |
| `src/lib/music8-canonical-artist-name.ts` | 曲登録時の正式名解決（`name_base` + `the_prefix` 対応） |

### 突合の優先順位

1. `music8_artist_id`
2. `music8_artist_slug`
3. `name_sort` / 表示名バリエーション
4. 同名が複数行 → **slug 優先で1行**（`pickCanonicalArtistRow`）
5. `name` 更新で衝突 → **`name` なしで update**（m8 メタのみ反映）

### 単体テスト

```powershell
Set-Location E:\mc
npm run test:music8-artist-import
npm run test:music8-artists-bulk
```

---

## 6. 環境（`.env.local`）

**コミット禁止。** 自宅 PC の `E:\mc\.env.local` に最低限:

```env
SUPABASE_SERVICE_ROLE_KEY=（サービスロール）

# 任意（指定を省略できる）
MUSIC8_ARTISTS_DIR=C:/Users/maeha/json/artists
MUSIC8_ARTISTS_LIST_JSON=C:/Users/maeha/json/artists.json
MUSIC8_ARTISTS_FAILURE_LOG_DIR=C:/Users/maeha/json
```

---

## 7. 自宅 PC での実行手順（PowerShell）

作業ディレクトリは **`E:\mc`**。行継続は **バッククォート `` ` ``**（`^` は cmd 用）。

### 7.1 失敗 445 件の再取り込み（最優先・最新コード必須）

`git pull` または最新の `music8-artist-import.ts` が入っていることを確認してから。

```powershell
Set-Location E:\mc

# 確認（10 件）
npx tsx scripts/import-music8-artists-bulk.ts --dry-run `
  --retry-failures=C:/Users/maeha/json/music8-artist-import-failures-2026-05-21T07-18-33-563Z.jsonl `
  --artists-dir=C:/Users/maeha/json/artists `
  --limit=10

# 本番（445 件）
npx tsx scripts/import-music8-artists-bulk.ts --apply `
  --retry-failures=C:/Users/maeha/json/music8-artist-import-failures-2026-05-21T07-18-33-563Z.jsonl `
  --artists-dir=C:/Users/maeha/json/artists
```

期待: 多くが `[update]`、`fail` は 0 に近い。  
新しい失敗があれば `failureLogPath` がサマリ JSON に出る。

ログを `log\` にコピーした場合:

```powershell
--retry-failures=log/music8-artist-import-failures-2026-05-21T07-18-33-563Z.jsonl
```

### 7.2 ショートカット

```powershell
.\scripts\run-music8-artists-import-local.ps1 -DryRun -Limit 5
.\scripts\run-music8-artists-import-local.ps1 -Apply -SkipArtists 0 -Limit 500
```

### 7.3 全件を最初からやり直す場合（通常不要）

```powershell
npx tsx scripts/import-music8-artists-bulk.ts --apply `
  --artists-list=C:/Users/maeha/json/artists.json `
  --artists-dir=C:/Users/maeha/json/artists
```

所要: **おおよそ 2〜4 時間**（`--sleep-ms=200` 既定）。分割するなら:

```powershell
--skip-artists=0 --limit=500
--skip-artists=500 --limit=500
# ...
```

---

## 8. 注意事項

| 項目 | 内容 |
|------|------|
| スリープ | **オフ**（途中停止防止） |
| PowerShell | ウィンドウを閉じない |
| `npm run import:music8:artists` | strokes 1 件 dry-run のみ。**一括は `npx tsx` 直叩き** |
| 失敗ログ | **apply のみ**作成（dry-run では増えない） |
| 445 件の初回 retry | **古いコード**では再び `idx_artists_name` で失敗した。**§7.1 を最新コードで** |
| 同名 `artists` 2 行 | 今回は **統合しない**（m8 メタを canonical 行に載せるだけ） |

---

## 9. 完了確認（任意 SQL）

```sql
-- m8 id が入った件数
select count(*) as with_m8_id from public.artists where music8_artist_id is not null;

-- slug 付き
select count(*) as with_slug from public.artists where music8_artist_slug is not null;

-- 例: Strokes
select name, name_base, the_prefix, music8_artist_slug, music8_artist_id, music8_synced_at
from public.artists
where music8_artist_slug = 'strokes' or music8_artist_id = 4834;
```

---

## 10. 未着手・将来

- [ ] 失敗 445 の **retry 完了**（§7.1）
- [ ] 同名 `artists` **重複行の整理**（別スクリプト／手動。データ品質）
- [ ] `artists` 重複を減らしたあと、必要なら **全件再 sync** は通常不要
- [ ] 曲側 `import:music8:bulk` との整合（`songs.main_artist` は `resolveMainArtistForNewSongRegistration` が m8 優先）
- [ ] 将来統合: [`music8-artist-import-and-integration-plan.md`](./music8-artist-import-and-integration-plan.md)「将来統合」節

---

## 11. 関連ドキュメント

- [`music8-artist-import-and-integration-plan.md`](./music8-artist-import-and-integration-plan.md) — マッピング・統合方針
- [`music8-library-import-notes.md`](./music8-library-import-notes.md) — 曲一括
- [`supabase-songs-and-performances-tables.md`](./supabase-songs-and-performances-tables.md) — SQL
- [`AGENTS.md`](../AGENTS.md) — 心臓部一覧
- サンプル JSON: `log/strokes.json`（個別）、`log/artists.json`（一覧）

---

## 12. トラブル時

| 現象 | 対処 |
|------|------|
| `SUPABASE_SERVICE_ROLE_KEY が必要` | `.env.local` を `E:\mc` に配置 |
| すべて `[skip] no JSON` | `--artists-dir` が `C:\Users\maeha\json\artists` か確認 |
| retry でまた `idx_artists_name` | `music8-artist-import.ts` が最新か確認（§5 の重複行対策） |
| 件数が合わない | 一覧 6709 vs 個別 6723 — slug 無し個別 JSON は skip されうる |

---

**引き継ぎ時の最短コマンド:** §7.1 の `--apply --retry-failures=...` を最新コードで実行し、サマリの `ok` / `fail` を確認。
