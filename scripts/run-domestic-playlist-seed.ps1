#requires -Version 5.1
<#
.SYNOPSIS
  YouTube プレイリスト URL → 邦楽 seed JSON 生成 → （任意）MC DB 投入

.DESCRIPTION
  scripts/domestic-playlist-seed.ts の PowerShell ラッパー。
  プレイリスト URL を引数または対話入力で受け取り、fetch / apply を実行します。
  成功・失敗ログは tmp/domestic-seed-logs/ 以下に保存します。

.PARAMETER PlaylistUrl
  例: https://www.youtube.com/watch?v=...&list=PL...

.PARAMETER PlaylistId
  list= の値だけ指定する場合（URL の代わり）

.PARAMETER JsonOut
  出力 JSON パス。未指定時は tmp/domestic-seed-{playlistId}-{stamp}.json

.PARAMETER Apply
  fetch 後に apply（本番 DB 投入）まで実行

.PARAMETER ApplyDryRun
  fetch 後に apply --dry-run を実行（-Apply より優先度低）

.PARAMETER ForceAllow
  apply 時に --force-allow（手動確認済み seed 用）

.PARAMETER MaxItems
  fetch の先頭 N 件だけ（試験用）

.PARAMETER SkipReviewPause
  fetch 後の「JSON を確認して Enter」待ちをスキップ

.EXAMPLE
  .\scripts\run-domestic-playlist-seed.ps1

.EXAMPLE
  .\scripts\run-domestic-playlist-seed.ps1 -PlaylistUrl "https://www.youtube.com/watch?v=aF6qA9hCK70&list=PL5XfxmiFda5vynLlCflY36h4d6ZA5n7sW"

.EXAMPLE
  .\scripts\run-domestic-playlist-seed.ps1 -PlaylistId PL5XfxmiFda5vynLlCflY36h4d6ZA5n7sW -ApplyDryRun

.EXAMPLE
  .\scripts\run-domestic-playlist-seed.ps1 -PlaylistUrl "https://www.youtube.com/playlist?list=PL..." -Apply -ForceAllow
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string] $PlaylistUrl = '',
  [string] $PlaylistId = '',
  [string] $ProjectRoot = '',
  [string] $JsonOut = '',
  [string] $LogDir = '',
  [int] $MaxItems = 0,
  [switch] $Apply,
  [switch] $ApplyDryRun,
  [switch] $ForceAllow,
  [switch] $SkipReviewPause,
  [switch] $NoSkipExisting
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectRoot {
  param([string] $Root)
  if ($Root) {
    return (Resolve-Path -LiteralPath $Root).Path
  }
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-PlaylistIdFromUrl {
  param([string] $Url)
  $u = $Url.Trim()
  if (-not $u) { return $null }
  if ($u -match '(?:[?&]list=|youtu\.be/playlist\?list=)([A-Za-z0-9_-]+)') {
    return $Matches[1]
  }
  if ($u -match '^PL[A-Za-z0-9_-]+$') {
    return $u
  }
  return $null
}

function Write-RunLog {
  param(
    [string] $CombinedLog,
    [string] $Message
  )
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $CombinedLog -Value $line -Encoding utf8
}

function Invoke-DomesticSeedStep {
  param(
    [string] $LogDir,
    [string] $CombinedLog,
    [string] $ErrorLog,
    [string] $StepName,
    [string[]] $Arguments
  )
  $stepLog = Join-Path $LogDir "$StepName.log"
  $cmd = "npx tsx $($Arguments -join ' ')"
  Write-Host "[log] step -> $stepLog"
  Write-RunLog -CombinedLog $CombinedLog -Message "=== $StepName ==="
  Write-RunLog -CombinedLog $CombinedLog -Message $cmd

  $stdoutFile = Join-Path $LogDir "$StepName.stdout.log"
  $stderrFile = Join-Path $LogDir "$StepName.stderr.log"

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & npx @('tsx') @Arguments 1> $stdoutFile 2> $stderrFile
    $exit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prevEap
  }

  Get-Content -LiteralPath $stdoutFile -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
  Get-Content -LiteralPath $stderrFile -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }

  $summary = @(
    "exit=$exit"
    "stdout=$stdoutFile"
    "stderr=$stderrFile"
  ) -join ' | '
  Add-Content -LiteralPath $stepLog -Value $summary -Encoding utf8

  if ($exit -ne 0) {
    $err = "Command failed (exit $exit): $cmd"
    $err | Add-Content -LiteralPath $ErrorLog -Encoding utf8
    Get-Content -LiteralPath $stderrFile -ErrorAction SilentlyContinue | Add-Content -LiteralPath $ErrorLog -Encoding utf8
    throw $err
  }
  return @{
    ExitCode = $exit
    StdoutFile = $stdoutFile
    StderrFile = $stderrFile
  }
}

$ProjectRoot = Resolve-ProjectRoot -Root $ProjectRoot
Set-Location -LiteralPath $ProjectRoot

$stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
if (-not $LogDir) {
  $LogDir = Join-Path $ProjectRoot "tmp\domestic-seed-logs\$stamp"
} elseif (-not [System.IO.Path]::IsPathRooted($LogDir)) {
  $LogDir = Join-Path $ProjectRoot $LogDir
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$combinedLog = Join-Path $LogDir 'run.log'
$errorLog = Join-Path $LogDir 'run-errors.log'
$transcriptPath = Join-Path $LogDir 'transcript.log'
$resultSummaryPath = Join-Path $LogDir 'result-summary.json'

Write-Host "[log] $LogDir"
Write-RunLog -CombinedLog $combinedLog -Message "projectRoot=$ProjectRoot"

if (-not $PlaylistUrl -and -not $PlaylistId) {
  Write-Host ''
  Write-Host 'YouTube playlist URL:'
  Write-Host ('  e.g. https://www.youtube.com/watch?v=VIDEO_ID' + '&list=PLAYLIST_ID')
  $PlaylistUrl = Read-Host 'Playlist URL'
}

if (-not $PlaylistId) {
  $PlaylistId = Get-PlaylistIdFromUrl -Url $PlaylistUrl
}
if (-not $PlaylistId) {
  throw 'Could not parse playlist ID. Use URL with list=PL... or -PlaylistId.'
}

if (-not $JsonOut) {
  $safeId = $PlaylistId
  if ($safeId.Length -gt 24) {
    $safeId = $safeId.Substring(0, 24)
  }
  $JsonOut = Join-Path $ProjectRoot "tmp\domestic-seed-$safeId-$stamp.json"
} elseif (-not [System.IO.Path]::IsPathRooted($JsonOut)) {
  $JsonOut = Join-Path $ProjectRoot $JsonOut
}

$jsonDir = Split-Path -Parent $JsonOut
if ($jsonDir) {
  New-Item -ItemType Directory -Force -Path $jsonDir | Out-Null
}

Write-Host "[1] playlistId=$PlaylistId"
Write-Host "[1] jsonOut=$JsonOut"
Write-RunLog -CombinedLog $combinedLog -Message "playlistId=$PlaylistId"
Write-RunLog -CombinedLog $combinedLog -Message "jsonOut=$JsonOut"

$fetchArgs = @(
  'scripts/domestic-playlist-seed.ts'
  'fetch'
  "--playlist-id=$PlaylistId"
  "--out=$JsonOut"
)
if ($MaxItems -gt 0) {
  $fetchArgs += "--max-items=$MaxItems"
}

$runStatus = 'failed'
$fetchSummary = $null
$applySummary = $null

Start-Transcript -LiteralPath $transcriptPath -Force | Out-Null
try {
  Write-Host '[1/3] fetch (build JSON)'
  Invoke-DomesticSeedStep `
    -LogDir $LogDir `
    -CombinedLog $combinedLog `
    -ErrorLog $errorLog `
    -StepName '01-fetch' `
    -Arguments $fetchArgs | Out-Null

  if (-not (Test-Path -LiteralPath $JsonOut)) {
    throw "JSON was not created: $JsonOut"
  }

  $doc = Get-Content -LiteralPath $JsonOut -Raw -Encoding utf8 | ConvertFrom-Json
  $fetchSummary = $doc.summary
  Write-Host "[1/3] fetch done: total=$($fetchSummary.total) releaseDate=$($fetchSummary.withReleaseDate) officialOk=$($fetchSummary.officialOk) included=$($fetchSummary.included)"

  if ($ApplyDryRun -or $Apply) {
    if (-not $SkipReviewPause) {
      Write-Host ''
      Write-Host "Edit JSON if needed: $JsonOut"
      Write-Host 'Press Enter to continue (Ctrl+C to abort)'
      [void](Read-Host 'Continue')
    }

    Write-Host '[2/3] apply dry-run'
    $applyDryArgs = @(
      'scripts/domestic-playlist-seed.ts'
      'apply'
      "--in=$JsonOut"
      '--dry-run'
    )
    if ($ForceAllow) { $applyDryArgs += '--force-allow' }
    if ($NoSkipExisting) { $applyDryArgs += '--no-skip-existing' }

    Invoke-DomesticSeedStep `
      -LogDir $LogDir `
      -CombinedLog $combinedLog `
      -ErrorLog $errorLog `
      -StepName '02-apply-dry-run' `
      -Arguments $applyDryArgs | Out-Null

    $doc = Get-Content -LiteralPath $JsonOut -Raw -Encoding utf8 | ConvertFrom-Json
    $dryImported = @($doc.items | Where-Object { $_.applyStatus -eq 'dry_run' }).Count
    Write-Host "[2/3] dry-run targets: $dryImported items"
  } else {
    Write-Host '[2/3] skipped (use -ApplyDryRun or -Apply)'
  }

  if ($Apply) {
    Write-Host '[3/3] apply (write DB)'
    $applyArgs = @(
      'scripts/domestic-playlist-seed.ts'
      'apply'
      "--in=$JsonOut"
    )
    if ($ForceAllow) { $applyArgs += '--force-allow' }
    if ($NoSkipExisting) { $applyArgs += '--no-skip-existing' }

    Invoke-DomesticSeedStep `
      -LogDir $LogDir `
      -CombinedLog $combinedLog `
      -ErrorLog $errorLog `
      -StepName '03-apply-db' `
      -Arguments $applyArgs | Out-Null

    $doc = Get-Content -LiteralPath $JsonOut -Raw -Encoding utf8 | ConvertFrom-Json
    $applySummary = [ordered]@{
      imported = @($doc.items | Where-Object { $_.applyStatus -eq 'imported' }).Count
      skipped_existing = @($doc.items | Where-Object { $_.applyStatus -eq 'skipped_existing' }).Count
      skipped_excluded = @($doc.items | Where-Object { $_.applyStatus -eq 'skipped_excluded' }).Count
      skipped_gate = @($doc.items | Where-Object { $_.applyStatus -eq 'skipped_gate' }).Count
      failed = @($doc.items | Where-Object { $_.applyStatus -eq 'failed' }).Count
    }
    Write-Host "[3/3] apply done: imported=$($applySummary.imported) failed=$($applySummary.failed)"
  } else {
    Write-Host '[3/3] skipped (use -Apply -ForceAllow for DB write)'
    Write-Host "      JSON: $JsonOut"
  }

  $runStatus = 'success'
  Write-Host "[log] done. combined=$combinedLog errors=$errorLog transcript=$transcriptPath"
} catch {
  $record = @(
    "$(Get-Date -Format o)"
    $_.Exception.Message
    $_.ScriptStackTrace
  ) -join "`n"
  $record | Add-Content -LiteralPath $errorLog -Encoding utf8
  Write-Host "[log] failed. see $errorLog"
  throw
} finally {
  $result = [ordered]@{
    status = $runStatus
    finishedAt = (Get-Date).ToString('o')
    playlistId = $PlaylistId
    playlistUrl = if ($PlaylistUrl) { $PlaylistUrl } else { "https://www.youtube.com/playlist?list=$PlaylistId" }
    jsonOut = $JsonOut
    logDir = $LogDir
    fetchSummary = $fetchSummary
    applySummary = $applySummary
  }
  ($result | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $resultSummaryPath -Encoding utf8
  Write-RunLog -CombinedLog $combinedLog -Message "status=$runStatus summary=$resultSummaryPath"
  Stop-Transcript | Out-Null
}
