#requires -Version 5.1
<#
.SYNOPSIS
  Music8 bulk import: optional diff, split keys into chunks, run chunk-runner (resume-safe).

.DESCRIPTION
  1) Optional: diff local data/songs vs DB -> keys txt
  2) Split keys into chunk-*.txt
  3) If forward-args file is missing, write a template and exit (edit, then re-run)
  4) Run music8-import-chunk-runner (same script again resumes)

  Requires: Node, npm install at repo root, .env.local with SUPABASE_SERVICE_ROLE_KEY.

.EXAMPLE
  .\scripts\run-music8-import-overnight.ps1 -RunDiff

.EXAMPLE
  .\scripts\run-music8-import-overnight.ps1 -KeysFile 'tmp\my-missing-keys.txt' -SkipSplit

.EXAMPLE
  .\scripts\run-music8-import-overnight.ps1 -ChunkRunnerDryRun
#>
[CmdletBinding()]
param(
  [string] $ProjectRoot = '',
  [string] $KeysFile = 'tmp\my-missing-keys.txt',
  [string] $SongsDir = 'E:\m8\public\data\songs',
  [int] $ChunkSize = 200,
  [string] $ChunksDir = 'tmp\music8-import-chunks',
  [string] $StateFile = 'tmp\music8-import-chunk-state.json',
  [string] $ForwardArgsFile = 'tmp\music8-bulk-forward-args.txt',
  [switch] $RunDiff,
  [switch] $SkipSplit,
  [switch] $ChunkRunnerDryRun
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

function Get-ArgForChunkRunner {
  param(
    [string] $ResolvedFull,
    [string] $ParamInput
  )
  # Absolute Windows paths (E:\...) in --flag=value can break when passed through npx from PowerShell.
  # If the user passed a relative repo path, pass that unchanged (no drive letter).
  if ([System.IO.Path]::IsPathRooted($ParamInput)) {
    return $ResolvedFull
  }
  return $ParamInput
}

$keysResolved = Join-Path $ProjectRoot $KeysFile
$chunksResolved = Join-Path $ProjectRoot $ChunksDir
$stateResolved = Join-Path $ProjectRoot $StateFile
$forwardResolved = Join-Path $ProjectRoot $ForwardArgsFile

Write-Host "ProjectRoot: $ProjectRoot"

if ($RunDiff) {
  Write-Host '[diff] songs dir vs DB -> key list'
  Invoke-NpxTsx @(
    'scripts/diff-music8-songs-dir-vs-db-slugs.ts'
    "--songs-dir=$SongsDir"
    "--out-missing=$keysResolved"
  )
}

if (-not (Test-Path -LiteralPath $keysResolved)) {
  throw "Keys file not found: $keysResolved (use -RunDiff or set -KeysFile to a real path; not tmp/your-keys.txt)."
}

if (-not (Test-Path -LiteralPath $forwardResolved)) {
  Write-Host "Created forward-args template (edit, then re-run): $forwardResolved"
  $template = @'
# One flag per line. Lines starting with # are comments.

--artist-songs-base=http://127.0.0.1:38100/data/artists
--songs-base=http://127.0.0.1:38100/data/songs
--songs-local-dir=E:/m8/public/data/songs
--sleep-ms=80
--failure-log=tmp/music8-import-overnight.jsonl
'@
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($forwardResolved, $template, $utf8NoBom)
  Write-Host 'Edit that file, then run this script again.'
  exit 0
}

if (-not $SkipSplit) {
  Write-Host '[split] keys -> chunks'
  Invoke-NpxTsx @(
    'scripts/music8-split-import-keys.ts'
    "--keys-file=$keysResolved"
    "--chunk-size=$ChunkSize"
    "--out-dir=$chunksResolved"
  )
} else {
  Write-Host '[split] skipped (-SkipSplit)'
}

$chunksArgForRunner = Get-ArgForChunkRunner -ResolvedFull $chunksResolved -ParamInput $ChunksDir
$stateArgForRunner = Get-ArgForChunkRunner -ResolvedFull $stateResolved -ParamInput $StateFile
$forwardArgForRunner = Get-ArgForChunkRunner -ResolvedFull $forwardResolved -ParamInput $ForwardArgsFile

$runnerArgs = @(
  'scripts/music8-import-chunk-runner.ts'
  ('--chunks-dir=' + $chunksArgForRunner)
  ('--state-file=' + $stateArgForRunner)
  ('--forward-file=' + $forwardArgForRunner)
)
if ($ChunkRunnerDryRun) {
  $runnerArgs += '--dry-run'
}

Write-Host '[chunk-runner] sequential import (re-run same script to resume)'
$env:MUSIC8_CHUNK_RUNNER_FORWARD_FILE = $forwardResolved
try {
  Invoke-NpxTsx @runnerArgs
} finally {
  Remove-Item Env:\MUSIC8_CHUNK_RUNNER_FORWARD_FILE -ErrorAction SilentlyContinue
}

Write-Host 'Done.'
