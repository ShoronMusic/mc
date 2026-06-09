# Start Irodori-TTS-Server (keep this terminal open while using MC agent voice).
param(
  [string]$InstallDir = "E:\Irodori-TTS-Server",
  [int]$Port = 8088
)

if (-not (Test-Path $InstallDir)) {
  Write-Error "Not found: $InstallDir. Run scripts/setup-irodori-tts-server.ps1 first."
}

$uvCmd = $null
if (Get-Command uv -ErrorAction SilentlyContinue) {
  $uvCmd = "uv"
} else {
  $py = $env:MC_SETUP_PYTHON
  if (-not $py) {
    if (Test-Path "$env:LOCALAPPDATA\Python\bin\python.exe") {
      $py = "$env:LOCALAPPDATA\Python\bin\python.exe"
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
      $py = "py -3"
    } else {
      $py = "python"
    }
  }
  $uvCmd = "$py -m uv"
  try {
    Invoke-Expression "$uvCmd --version" | Out-Null
  } catch {
    Write-Error @"
uv not found. Install once (PowerShell):

  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

Then restart PowerShell, or run:

  `$env:Path = "`$env:USERPROFILE\.local\bin;`$env:Path"
"@
  }
}

Push-Location $InstallDir

# Windows で %USERPROFILE%\.cache が無いと HF モデル DL が失敗することがある
$hfHome = Join-Path $InstallDir ".cache\huggingface"
New-Item -ItemType Directory -Force -Path $hfHome | Out-Null
$env:HF_HOME = $hfHome
Write-Host "HF cache: $hfHome"

Write-Host "Ensuring CUDA PyTorch (cu128) in venv..."
Invoke-Expression "$uvCmd sync --extra cu128"
Write-Host "Starting Irodori-TTS-Server on port $Port ..."
Write-Host "Tip: edit $InstallDir\.env -> IRODORI_MODEL_DEVICE=cuda, IRODORI_PRELOAD=true for speed."
Write-Host "Tip: put a female ref WAV in voices\ and set MC IRODORI_TTS_VOICE to its filename stem."
Write-Host "First speech request downloads models (~5 min). Later requests are faster."
# --no-sync: uv run だけだと CPU 版 torch に戻ることがある
Invoke-Expression "$uvCmd run --no-sync python -m irodori_openai_tts --host 0.0.0.0 --port $Port"
