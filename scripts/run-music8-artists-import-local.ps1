# この PC の m8 アーティスト JSON 取り込み（C:\Users\maeha\json）
# 用法:
#   .\scripts\run-music8-artists-import-local.ps1 -DryRun -Limit 5
#   .\scripts\run-music8-artists-import-local.ps1 -Apply -SkipArtists 0 -Limit 500

param(
  [switch]$Apply,
  [int]$SkipArtists = 0,
  [int]$Limit = 0,
  [int]$SleepMs = 200
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot + '\..'

$JsonRoot = 'C:/Users/maeha/json'
$List = Join-Path $JsonRoot 'artists.json'
$Dir = Join-Path $JsonRoot 'artists'
$FailureLog = Join-Path $JsonRoot ('music8-artist-import-failures-' + (Get-Date -Format 'yyyy-MM-ddTHH-mm-ss') + '.jsonl')

$args = @(
  'scripts/import-music8-artists-bulk.ts',
  '--artists-list=' + $List,
  '--artists-dir=' + $Dir,
  '--failure-log=' + $FailureLog,
  '--sleep-ms=' + $SleepMs
)
if ($Apply) { $args += '--apply' } else { $args += '--dry-run' }
if ($SkipArtists -gt 0) { $args += '--skip-artists=' + $SkipArtists }
if ($Limit -gt 0) { $args += '--limit=' + $Limit }

Write-Host 'npx tsx' ($args -join ' ')
npx tsx @args
