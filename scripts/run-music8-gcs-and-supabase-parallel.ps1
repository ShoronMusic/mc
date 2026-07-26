#requires -Version 5.1
<#
.SYNOPSIS
  同世代並列: m8 JSON 生成 → GCS rsync → mc Supabase 差分適用

.DESCRIPTION
  同一の E:\m8\public\data スナップショットから GCS と Supabase へ反映する。
  週次の標準運用は本スクリプト 1 本（または -SkipM8Generate で mc 側のみ再実行）。

.EXAMPLE
  # 毎週（推奨）: JSON 生成 + GCS + Supabase（アーティストは新規のみ）
  .\scripts\run-music8-gcs-and-supabase-parallel.ps1

.EXAMPLE
  # 月 1 回: アーティストもフル upsert
  .\scripts\run-music8-gcs-and-supabase-parallel.ps1 -ArtistFullUpdate

.EXAMPLE
  # GCS は既に反映済み・ローカル JSON のみから Supabase 再適用
  .\scripts\run-music8-gcs-and-supabase-parallel.ps1 -SkipM8Generate

.EXAMPLE
  # JSON + GCS のみ（Supabase は後で）
  .\scripts\run-music8-gcs-and-supabase-parallel.ps1 -SkipSupabase
#>
[CmdletBinding()]
param(
  [string] $McRoot = '',
  [string] $M8Root = 'E:\m8',
  [string] $LogDir = '',
  [switch] $SkipM8Generate,
  [switch] $SkipGcs,
  [switch] $SkipSupabase,
  [switch] $ArtistFullUpdate,
  [switch] $DryRunSupabase,
  [int] $SinceDays = 0
)

$ErrorActionPreference = 'Stop'

if (-not $McRoot) {
  $McRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
if (-not $LogDir) {
  $LogDir = Join-Path $McRoot "tmp\music8-parallel-sync-logs\$stamp"
} elseif (-not [System.IO.Path]::IsPathRooted($LogDir)) {
  $LogDir = Join-Path $McRoot $LogDir
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$combinedLog = Join-Path $LogDir 'run.log'
$errorLog = Join-Path $LogDir 'run-errors.log'
$m8StepLog = Join-Path $LogDir '01-m8-update-all-data.log'

function Write-RunLog {
  param([string] $Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $combinedLog -Value $line -Encoding utf8
  Write-Host $Message
}

function Write-FailAndThrow {
  param([string] $Message)
  $Message | Add-Content -LiteralPath $errorLog -Encoding utf8
  Write-RunLog "[FAIL] $Message"
  throw $Message
}

Write-RunLog "[parallel] logDir=$LogDir"
Write-RunLog "[parallel] McRoot=$McRoot M8Root=$M8Root"
Write-RunLog "[parallel] SkipM8Generate=$SkipM8Generate SkipGcs=$SkipGcs SkipSupabase=$SkipSupabase ArtistFullUpdate=$ArtistFullUpdate"

$dataDir = Join-Path $M8Root 'public\data'
$songsDir = Join-Path $dataDir 'songs'
$artistsDir = Join-Path $dataDir 'artists'
$artistsList = Join-Path $dataDir 'artists.json'

try {
  # --- [1] m8: JSON 生成 +（既定）GCS rsync ---
  if (-not $SkipM8Generate) {
    $updateScript = Join-Path $M8Root 'scripts\update-all-data.js'
    if (-not (Test-Path -LiteralPath $updateScript)) {
      Write-FailAndThrow "m8 update-all-data.js が見つかりません: $updateScript"
    }

    Write-RunLog '[1/2] m8 update-all-data.js（JSON 生成 → 成功時 GCS）'
    Push-Location -LiteralPath $M8Root
    try {
      $envBackup = @{
        MUSIC8_GCS_SYNC = $env:MUSIC8_GCS_SYNC
        MUSIC8_GCS_DRY_RUN = $env:MUSIC8_GCS_DRY_RUN
      }
      if ($SkipGcs) {
        $env:MUSIC8_GCS_SYNC = '0'
        Write-RunLog '[1/2] SkipGcs: MUSIC8_GCS_SYNC=0（ローカル JSON のみ）'
      } else {
        # .env.local 未設定でも並列ジョブでは GCS を有効化（明示 Skip 以外）
        $env:MUSIC8_GCS_SYNC = '1'
        Write-RunLog '[1/2] MUSIC8_GCS_SYNC=1（プロセス環境。m8 .env.local より優先される場合あり）'
      }

      # ライブ出力 + ファイル控え（パイプデッドロック回避のため Tee は使わない）
      Write-RunLog "[1/2] live output → console; summary → $m8StepLog"
      & node $updateScript
      $m8Exit = $LASTEXITCODE
      "exit_code=$m8Exit completed_at=$(Get-Date -Format o)" | Set-Content -LiteralPath $m8StepLog -Encoding utf8

      if ($null -eq $m8Exit) { $m8Exit = 0 }
      if ($m8Exit -ne 0) {
        Write-FailAndThrow "m8 update-all-data.js failed (exit $m8Exit). Supabase は実行しません。"
      }
    } finally {
      if ($null -ne $envBackup.MUSIC8_GCS_SYNC) {
        $env:MUSIC8_GCS_SYNC = $envBackup.MUSIC8_GCS_SYNC
      } else {
        Remove-Item Env:\MUSIC8_GCS_SYNC -ErrorAction SilentlyContinue
      }
      if ($null -ne $envBackup.MUSIC8_GCS_DRY_RUN) {
        $env:MUSIC8_GCS_DRY_RUN = $envBackup.MUSIC8_GCS_DRY_RUN
      } else {
        Remove-Item Env:\MUSIC8_GCS_DRY_RUN -ErrorAction SilentlyContinue
      }
      Pop-Location
    }
  } else {
    Write-RunLog '[1/2] skipped (-SkipM8Generate)。既存の public\data を使用'
  }

  foreach ($required in @($dataDir, $songsDir, $artistsDir)) {
    if (-not (Test-Path -LiteralPath $required)) {
      Write-FailAndThrow "必須ディレクトリがありません: $required"
    }
  }

  # --- [2] mc: 同一 public\data → Supabase ---
  if (-not $SkipSupabase) {
    $weekly = Join-Path $McRoot 'scripts\run-music8-weekly-sync.ps1'
    if (-not (Test-Path -LiteralPath $weekly)) {
      Write-FailAndThrow "週次スクリプトが見つかりません: $weekly"
    }

    $mcLogDir = Join-Path $LogDir '02-mc-supabase'
    New-Item -ItemType Directory -Force -Path $mcLogDir | Out-Null

    $weeklyArgs = @{
      ProjectRoot = $McRoot
      SongsDir    = $songsDir
      ArtistsDir  = $artistsDir
      ArtistsList = $artistsList
      LogDir      = $mcLogDir
      SkipDryRun  = $true
    }
    if ($SinceDays -gt 0) {
      $weeklyArgs['SinceDays'] = $SinceDays
    }
    if (-not $DryRunSupabase) {
      $weeklyArgs['Apply'] = $true
    }
    if (-not $ArtistFullUpdate) {
      $weeklyArgs['RealDeltaOnly'] = $true
      Write-RunLog '[2/2] mc Supabase: -Apply -SkipDryRun -RealDeltaOnly（毎週）'
    } else {
      Write-RunLog '[2/2] mc Supabase: -Apply -SkipDryRun（アーティストもフル更新）'
    }
    if ($DryRunSupabase) {
      Write-RunLog '[2/2] DryRunSupabase: DB 書き込みなし（計画のみ）'
      $weeklyArgs.Remove('Apply')
    }

    & $weekly @weeklyArgs
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
      Write-FailAndThrow "mc weekly sync failed (exit $LASTEXITCODE). GCS は既に更新済みの可能性あり → -SkipM8Generate で再実行可。"
    }
  } else {
    Write-RunLog '[2/2] skipped (-SkipSupabase)'
  }

  Write-RunLog "[parallel] done. log=$combinedLog"
} catch {
  $record = @(
    "$(Get-Date -Format o)"
    $_.Exception.Message
    $_.ScriptStackTrace
  ) -join "`n"
  $record | Add-Content -LiteralPath $errorLog -Encoding utf8
  Write-Host "[parallel] failed. see $errorLog"
  throw
}
