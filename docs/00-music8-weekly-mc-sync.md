# Music8 → mc 週次 DB 同期（PowerShell 手順）

**目的**: m8 の静的 JSON（同一 `public/data` スナップショット）を **GCS と Supabase に同世代で反映**する。  
**頻度**: 週 1〜2 回。

**正本切替後**: JSON は WP ではなく `npx tsx scripts/export-music8-json-from-supabase.ts` から出す（`docs/supabase-music8-catalog-tables.md`）。切替までは本手順（WP JSON → GCS + DB）を継続。

関連: [`music8-json-gcs-handoff.md`](./music8-json-gcs-handoff.md)（GCS・パス）／[`music8-library-import-notes.md`](./music8-library-import-notes.md)（差分の仕組み・初回フル取り込み）／[`music8-artist-import-handoff.md`](./music8-artist-import-handoff.md)（アーティスト一括の別経路）／m8 側 `E:\m8\docs\gcs-json-migration.md`

---

## 前提

| 項目 | 内容 |
|------|------|
| 作業ディレクトリ | `E:\mc`（並列ラッパー）／必要なら `E:\m8` |
| ローカル JSON | `E:\m8\public\data`（生成直後の同世代を GCS・Supabase の両方に使う） |
| 認証 | `E:\mc\.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`**／GCS は `gcloud` 認証済み |
| m8 側 | 並列ラッパーが `update-all-data.js` を呼ぶ（単独実行時は先に JSON 生成済みであること） |
| 前回成功の記録 | `tmp\music8-sync-last-success.json`（apply 成功時に自動更新） |

---

## 毎週の標準コマンド（推奨・同世代並列）

**1 本で** m8 JSON 生成 → GCS rsync → mc Supabase 差分適用（アーティストは新規のみ）。

```powershell
Set-Location E:\mc
.\scripts\run-music8-gcs-and-supabase-parallel.ps1
```

| オプション | 意味 |
|------------|------|
| （既定） | m8 生成 + `MUSIC8_GCS_SYNC=1` + mc `-Apply -SkipDryRun -RealDeltaOnly` |
| `-ArtistFullUpdate` | 月 1 回向け。アーティスト既存行も再 upsert（`-RealDeltaOnly` なし） |
| `-SkipM8Generate` | JSON/GCS を飛ばし、既存 `E:\m8\public\data` から Supabase のみ（失敗後の再実行向き） |
| `-SkipGcs` | ローカル JSON のみ生成し GCS は上げない |
| `-SkipSupabase` | JSON + GCS のみ（mc は後で） |
| `-DryRunSupabase` | Supabase は計画のみ（DB 非書き込み） |

ログ: `tmp\music8-parallel-sync-logs\<stamp>\`（中に `02-mc-supabase\`）。

**所要時間**: m8 生成＋GCS 数分〜数十分 + mc 適用 1 時間前後（件数次第）。

### 月 1 回: アーティストもフル更新

```powershell
Set-Location E:\mc
.\scripts\run-music8-gcs-and-supabase-parallel.ps1 -ArtistFullUpdate
```

### mc 側だけ（従来どおり・JSON は既に最新）

**`E:\m8\public\data` が m8 生成直後で最新**なら、並列の `-SkipM8Generate` か、下の週次スクリプト単体。

```powershell
Set-Location E:\mc

$logRoot = "tmp\music8-sync-logs\$(Get-Date -Format 'yyyy-MM-ddTHH-mm-ss')"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

# 差分計画 → DB 反映（dry-run 省略・毎週はアーティストを新規のみ）
.\scripts\run-music8-weekly-sync.ps1 -Apply -SkipDryRun -RealDeltaOnly -LogDir $logRoot
```

| オプション | 意味 |
|------------|------|
| `-Apply` | DB に書き込む |
| `-SkipDryRun` | 6,000 件超の dry-run を飛ばす（**毎週は付ける**） |
| `-RealDeltaOnly` | アーティストは**新規のみ**（mtime 起因の stale をスキップ）。**毎週はこれを付ける** |
| `-LogDir` | ログ保存先（`transcript.log`・`run-errors.log` 等） |
| `-SinceDays 10` | 直近 N 日更新ファイルを重点チェック（省略時は前回成功時刻 or 7 日） |

**完了の目印**

- 画面: `[log] done` または `[apply] wrote state: ...\tmp\music8-sync-last-success.json`
- サマリ: `"failures": 0` に近いこと（`video_id_missing` は別途対応可）

**所要時間**: 毎週（`-RealDeltaOnly`）なら曲件数次第で 1 時間前後。月 1 回のフル更新は 3 時間強。

**なぜ毎週と月 1 を分けるか**: アーティストの「更新候補」判定は**ファイル mtime と `music8_synced_at` の比較のみ**（曲と違い内容ハッシュを見ない）。m8 でデータ更新すると全アーティスト JSON の mtime が新しくなるため、**中身が同じでも登録済みほぼ全件（約 6,900 件）が stale** になる。1 件ずつ Supabase へ複数回問い合わせる逐次処理なので、これだけで 2 時間半かかる。説明文・画像などの実更新を拾うのは月 1 回で足りる。

---

## 手動で diff → apply に分ける場合

件数を先に見てから投入するとき。

```powershell
Set-Location E:\mc

npx tsx scripts/diff-music8-sync-plan.ts `
  --songs-dir=E:\m8\public\data\songs `
  --artists-dir=E:\m8\public\data\artists `
  --artists-list=E:\m8\public\data\artists.json `
  --out-dir=tmp\music8-sync-plan-latest

# manifest の newSongs / staleSongs / artistsToApply を確認してから:

npx tsx scripts/apply-music8-sync-plan.ts `
  --manifest=tmp\music8-sync-plan-latest\manifest.json `
  --apply `
  --forward-file=tmp\music8-bulk-forward-args.txt
```

**ラッパーで画面が固まったとき**は、上記 `npx tsx ... apply` だけ実行（PowerShell ラッパーと子プロセスの出力競合を避ける）。

---

## 差分の見方（出力ファイル）

`tmp\music8-sync-plan-latest\`（または `--out-dir` で指定したフォルダ）:

| ファイル | 内容 |
|----------|------|
| `manifest.json` | 件数サマリ |
| `song-keys-new.txt` / `song-keys-stale.txt` | 曲: 新規 / 更新候補 |
| `artist-slugs-new.txt` / `artist-slugs-stale.txt` | アーティスト: 新規 / 更新候補 |
| `song-keys-apply.txt` / `artist-slugs-apply.txt` | apply が実際に処理する一覧 |

| 種別 | 曲 | アーティスト |
|------|-----|----------------|
| 新規 | ディスクに JSON・DB に slug なし | 同上 |
| 更新 | JSON **フィンガープリント** ≠ DB の `import_fingerprint` | ファイル **mtime** > `music8_synced_at`（内容ハッシュは未使用） |

> **注意**: `gcloud storage rsync` 直後はローカル mtime が一斉に新しくなり、アーティストの stale が一時的に増えやすい。可能なら **m8 生成済みの `E:\m8\public\data` をそのまま diff に使う**。

---

## 失敗曲の再投入（video ID なしなど）

apply 後: `tmp\music8-sync-apply-failures.jsonl`

```powershell
Set-Location E:\mc

@'
{
  "jennifer-lopez_step-into-my-world-2": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "tyga_slave-2": "https://www.youtube.com/watch?v=XXXXXXXXXXX"
}
'@ | Set-Content -Encoding utf8 tmp\music8-video-fix.json

npx tsx scripts/import-music8-songs-bulk.ts --apply `
  --video-overrides-only=tmp\music8-video-fix.json `
  --songs-local-dir=E:\m8\public\data\songs `
  --artists-local-dir=E:\m8\public\data\artists `
  --forward-file=tmp\music8-bulk-forward-args.txt
```

キーは `artistSlug_songSlug`（小文字可）。m8 側で JSON に `videoId` を足して GCS 更新してもよい。

---

## オプション

| 目的 | コマンド |
|------|----------|
| 曲だけ先に | apply に `--skip-artists` |
| アーティストだけ | `--slugs-file=tmp\...\artist-slugs-stale.txt` で `import-music8-artists-bulk.ts --apply` |
| 件数が極端に多い | [`music8-library-import-notes.md`](./music8-library-import-notes.md) のチャンク分割 |
| 初回 2 万曲フル | 同ドキュメントの `import-music8-songs-bulk`（**週次手順ではない**） |

---

## トラブルシュート

| 現象 | 対処 |
|------|------|
| `gcloud` の赤い WARNING（`/:*?"<>|`） | 多くは **警告のみ**。同期は完了することが多い。気になる場合は rsync をやめ m8 ローカルを使う |
| `[2/3] apply dry-run` で固まる | **Ctrl+C** → `-SkipDryRun` 付きで再実行、または手動 `apply` のみ |
| `SUPABASE_SERVICE_ROLE_KEY が必要` | `.env.local` を `E:\mc` に配置 |
| アーティストが毎回 6,000 件超 | m8 のデータ更新でファイル mtime が一斉に更新されるため。毎週は `-RealDeltaOnly` で回避し、フル更新は月 1 回 |
| `failures` / `video_id_missing` | 上記「失敗曲の再投入」 |
| 並列で GCS 成功・Supabase 失敗 | `-SkipM8Generate` 付きで再実行（同一 `public\data` から mc のみ） |
| 並列で m8 生成失敗 | Supabase は走らない。原因修正後にフル再実行 |

---

## 実装参照

| パス | 役割 |
|------|------|
| `scripts/run-music8-gcs-and-supabase-parallel.ps1` | **推奨**: m8 JSON → GCS → Supabase 同世代並列 |
| `scripts/run-music8-weekly-sync.ps1` | mc のみ（diff → apply。並列ラッパーからも呼ばれる） |
| `scripts/diff-music8-sync-plan.ts` | 差分計画 |
| `scripts/apply-music8-sync-plan.ts` | アーティスト → 曲の順で apply |
| `tmp/music8-bulk-forward-args.txt` | GCS URL・ローカル dir・`sleep-ms` 等 |
| `src/lib/music8-sync-diff.ts` | 差分ロジック |
| `E:\m8\scripts\update-all-data.js` | JSON 生成＋任意 GCS rsync |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-02 | 毎週ルーティンとして PowerShell 手順を整理（`-SkipDryRun`・ログ・gcloud 任意・トラブルシュート） |
| 2026-07-25 | 毎週は `-RealDeltaOnly`（アーティストは新規のみ）、アーティストのフル更新は月 1 回に分離。所要時間の内訳を追記 |
| 2026-07-25 | **同世代並列** `run-music8-gcs-and-supabase-parallel.ps1` を追加（GCS と Supabase を同一 `public/data` から反映） |
