# Music8 → mc 週次 DB 同期（PowerShell 手順）

**目的**: m8 の静的 JSON（GCS 正本）を Supabase の `artists` / `songs` に **差分だけ**反映する。  
**頻度**: 週 1〜2 回（m8 で `update-all-data.js` → GCS 反映のあと）。

関連: [`music8-json-gcs-handoff.md`](./music8-json-gcs-handoff.md)（GCS・パス）／[`music8-library-import-notes.md`](./music8-library-import-notes.md)（差分の仕組み・初回フル取り込み）／[`music8-artist-import-handoff.md`](./music8-artist-import-handoff.md)（アーティスト一括の別経路）

---

## 前提

| 項目 | 内容 |
|------|------|
| 作業ディレクトリ | `E:\mc` |
| ローカル JSON | `E:\m8\public\data`（m8 の `public\data` と同内容） |
| 認証 | `E:\mc\.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`** |
| m8 側 | 先に JSON 生成・GCS 反映済みであること（`E:\m8\docs\gcs-json-migration.md`） |
| 前回成功の記録 | `tmp\music8-sync-last-success.json`（apply 成功時に自動更新） |

---

## 毎週の標準コマンド（推奨）

**`E:\m8\public\data` が m8 生成直後で最新**なら、`gcloud rsync` は **省略**（省略時、アーティストの「更新候補」が mtime だけで増えにくい）。

```powershell
Set-Location E:\mc

$logRoot = "tmp\music8-sync-logs\$(Get-Date -Format 'yyyy-MM-ddTHH-mm-ss')"
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

# --- 省略可: GCS → ローカル（m8 ローカルが古いときだけ）---
# $ErrorActionPreference = 'Continue'
# gcloud storage rsync gs://music8-json-prod/data E:\m8\public\data --recursive *>&1 `
#   | Tee-Object -FilePath "$logRoot\00-gcloud-rsync.log"
# $ErrorActionPreference = 'Stop'
# if ($LASTEXITCODE -ne 0) { throw "gcloud rsync failed" }

# 差分計画 → DB 反映（dry-run 省略）
.\scripts\run-music8-weekly-sync.ps1 -Apply -SkipDryRun -LogDir $logRoot
```

| オプション | 意味 |
|------------|------|
| `-Apply` | DB に書き込む |
| `-SkipDryRun` | 6,000 件超の dry-run を飛ばす（**毎週は付ける**） |
| `-LogDir` | ログ保存先（`transcript.log`・`run-errors.log` 等） |
| `-SinceDays 10` | 直近 N 日更新ファイルを重点チェック（省略時は前回成功時刻 or 7 日） |

**完了の目印**

- 画面: `[log] done` または `[apply] wrote state: ...\tmp\music8-sync-last-success.json`
- サマリ: `"failures": 0` に近いこと（`video_id_missing` は別途対応可）

**所要時間**: 差分件数次第（初回フルに近い週は数時間、通常は短い）。

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
| アーティストが毎回 6,000 件超 | 初回 or rsync 直後の mtime 起因。1 回 apply 完了後は減る想定 |
| `failures` / `video_id_missing` | 上記「失敗曲の再投入」 |

---

## 実装参照

| パス | 役割 |
|------|------|
| `scripts/run-music8-weekly-sync.ps1` | 週次ラッパー（ログ・`-SkipDryRun`） |
| `scripts/diff-music8-sync-plan.ts` | 差分計画 |
| `scripts/apply-music8-sync-plan.ts` | アーティスト → 曲の順で apply |
| `tmp/music8-bulk-forward-args.txt` | GCS URL・ローカル dir・`sleep-ms` 等 |
| `src/lib/music8-sync-diff.ts` | 差分ロジック |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-02 | 毎週ルーティンとして PowerShell 手順を整理（`-SkipDryRun`・ログ・gcloud 任意・トラブルシュート） |
