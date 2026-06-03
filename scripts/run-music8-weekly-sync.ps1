#requires -Version 5.1
<#
.SYNOPSIS
  Music8 週次同期: 差分計画 → dry-run 確認 → （任意）適用

.EXAMPLE
  .\scripts\run-music8-weekly-sync.ps1

.EXAMPLE
  .\scripts\run-music8-weekly-sync.ps1 -Apply

.EXAMPLE
  .\scripts\run-music8-weekly-sync.ps1 -SongsDir 'E:\m8\public\data\songs' -SinceDays 10

.EXAMPLE
  .\scripts\run-music8-weekly-sync.ps1 -Apply -LogDir tmp\music8-sync-logs\my-run
#>
[CmdletBinding()]
param(
  [string] $ProjectRoot = '',
  [string] $SongsDir = 'E:\m8\public\data\songs',
  [string] $ArtistsDir = 'E:\m8\public\data\artists',
  [string] $ArtistsList = 'E:\m8\public\data\artists.json',
  [int] $SinceDays = 0,
  [string] $OutDir = '',
  [string] $LogDir = '',
  [switch] $Apply,
  [switch] $SkipApply,
  [switch] $SkipDryRun,
  [string] $ForwardArgsFile = 'tmp\music8-bulk-forward-args.txt'
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
Set-Location -LiteralPath $ProjectRoot

$stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
if (-not $LogDir) {
  $LogDir = Join-Path $ProjectRoot "tmp\music8-sync-logs\$stamp"
} elseif (-not [System.IO.Path]::IsPathRooted($LogDir)) {
  $LogDir = Join-Path $ProjectRoot $LogDir
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$combinedLog = Join-Path $LogDir 'run.log'
$errorLog = Join-Path $LogDir 'run-errors.log'
$transcriptPath = Join-Path $LogDir 'transcript.log'
Write-Host "[log] $LogDir"

function Write-RunLog {
  param([string] $Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $combinedLog -Value $line -Encoding utf8
}

function Invoke-NpxTsx {
  param(
    [string[]] $Arguments,
    [string] $StepName = 'tsx'
  )
  $stepLog = Join-Path $LogDir "$StepName.log"
  $cmd = "npx tsx $($Arguments -join ' ')"
  Write-Host "[log] step -> $stepLog"
  Write-RunLog "=== $StepName ==="
  Write-RunLog $cmd
  # パイプ捕捉しない（apply → bulk の inherit と組み合わせると Windows でデッドロック）
  Write-Host "[log] live output -> console + $transcriptPath (not $stepLog until end)"
  & npx @('tsx') @Arguments
  $exit = $LASTEXITCODE
  if ($exit -eq 0) {
    Add-Content -LiteralPath $stepLog -Value "completed OK (see transcript.log)" -Encoding utf8
  }
  if ($exit -ne 0) {
    $err = "Command failed (exit $exit): $cmd"
    $err | Add-Content -LiteralPath $errorLog -Encoding utf8
    throw $err
  }
}

Start-Transcript -LiteralPath $transcriptPath -Force | Out-Null
if (-not $OutDir) {
  $OutDir = Join-Path $ProjectRoot "tmp\music8-sync-plan-$stamp"
}

$diffArgs = @(
  'scripts/diff-music8-sync-plan.ts'
  "--songs-dir=$SongsDir"
  "--artists-dir=$ArtistsDir"
  "--out-dir=$OutDir"
)
if ($ArtistsList -and (Test-Path -LiteralPath $ArtistsList)) {
  $diffArgs += "--artists-list=$ArtistsList"
}
if ($SinceDays -gt 0) {
  $diffArgs += "--since-days=$SinceDays"
}

try {
  Write-Host '[1/3] diff plan'
  Invoke-NpxTsx -Arguments $diffArgs -StepName '01-diff-plan'

  $manifest = Join-Path $OutDir 'manifest.json'
  if (-not (Test-Path -LiteralPath $manifest)) {
    throw "manifest not found: $manifest"
  }

  if (-not $SkipDryRun) {
    Write-Host '[2/3] apply dry-run'
    $applyDryArgs = @(
      'scripts/apply-music8-sync-plan.ts'
      "--manifest=$manifest"
      "--forward-file=$ForwardArgsFile"
    )
    Invoke-NpxTsx -Arguments $applyDryArgs -StepName '02-apply-dry-run'
  } else {
    Write-Host '[2/3] skipped (-SkipDryRun)'
  }

  if ($Apply -and -not $SkipApply) {
    Write-Host '[3/3] apply (DB update)'
    $applyArgs = @(
      'scripts/apply-music8-sync-plan.ts'
      "--manifest=$manifest"
      '--apply'
      "--forward-file=$ForwardArgsFile"
    )
    Invoke-NpxTsx -Arguments $applyArgs -StepName '03-apply-db'
  } else {
    Write-Host '[3/3] skipped (pass -Apply to write DB). Plan dir:' $OutDir
  }

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
  Stop-Transcript | Out-Null
}
