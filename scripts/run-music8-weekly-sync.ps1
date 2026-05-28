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
#>
[CmdletBinding()]
param(
  [string] $ProjectRoot = '',
  [string] $SongsDir = 'E:\m8\public\data\songs',
  [string] $ArtistsDir = 'E:\m8\public\data\artists',
  [string] $ArtistsList = 'E:\m8\public\data\artists.json',
  [int] $SinceDays = 0,
  [string] $OutDir = '',
  [switch] $Apply,
  [switch] $SkipApply,
  [string] $ForwardArgsFile = 'tmp\music8-bulk-forward-args.txt'
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}
Set-Location -LiteralPath $ProjectRoot

function Invoke-NpxTsx {
  param([string[]] $Arguments)
  & npx @('tsx') @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed (exit $LASTEXITCODE): npx tsx $($Arguments -join ' ')"
  }
}

$stamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
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

Write-Host '[1/3] diff plan'
Invoke-NpxTsx $diffArgs

$manifest = Join-Path $OutDir 'manifest.json'
if (-not (Test-Path -LiteralPath $manifest)) {
  throw "manifest not found: $manifest"
}

Write-Host '[2/3] apply dry-run'
$applyDryArgs = @(
  'scripts/apply-music8-sync-plan.ts'
  "--manifest=$manifest"
  "--forward-file=$ForwardArgsFile"
)
Invoke-NpxTsx $applyDryArgs

if ($Apply -and -not $SkipApply) {
  Write-Host '[3/3] apply (DB update)'
  $applyArgs = @(
    'scripts/apply-music8-sync-plan.ts'
    "--manifest=$manifest"
    '--apply'
    "--forward-file=$ForwardArgsFile"
  )
  Invoke-NpxTsx $applyArgs
} else {
  Write-Host '[3/3] skipped (pass -Apply to write DB). Plan dir:' $OutDir
}
