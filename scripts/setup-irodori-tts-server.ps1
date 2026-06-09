# Setup Irodori-TTS-Server next to MC (default E:\Irodori-TTS-Server).
# Usage:  cd E:\mc ; .\scripts\setup-irodori-tts-server.ps1
# Start:  cd E:\Irodori-TTS-Server ; uv run python -m irodori_openai_tts --host 0.0.0.0 --port 8088

param(
  [string]$InstallDir = "E:\Irodori-TTS-Server",
  [int]$Port = 8088
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "git not found. Install from https://git-scm.com/download/win"
}
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
  Write-Error "nvidia-smi not found. NVIDIA GPU driver required for cu128."
}

$py = $env:MC_SETUP_PYTHON
if (-not $py) {
  if (Get-Command py -ErrorAction SilentlyContinue) { $py = "py -3" }
  elseif (Test-Path "$env:LOCALAPPDATA\Python\bin\python.exe") {
    $py = "$env:LOCALAPPDATA\Python\bin\python.exe"
  } else {
    $py = "python"
  }
}
$uv = "$py -m uv"
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Write-Host "Installing uv via $py ..."
  Invoke-Expression "$py -m pip install --upgrade uv"
}

if (-not (Test-Path $InstallDir)) {
  Write-Host "Cloning into $InstallDir"
  git clone https://github.com/Aratako/Irodori-TTS-Server.git $InstallDir
} else {
  Write-Host "Already exists: $InstallDir (git pull)"
  Push-Location $InstallDir
  git pull --ff-only
  Pop-Location
}

Push-Location $InstallDir
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}

Write-Host "uv sync --extra cu128 (first run: large download, 10+ min)..."
Invoke-Expression "$uv sync --extra cu128"

Write-Host ""
Write-Host "=== Setup done ==="
Write-Host ".env.local on MC:"
Write-Host "  NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED=1"
Write-Host "  IRODORI_TTS_SERVER_URL=http://127.0.0.1:$Port"
Write-Host "  IRODORI_TTS_VOICE=none"
Write-Host ""
Write-Host "Start TTS server (keep this terminal open):"
Write-Host "  cd $InstallDir"
Write-Host "  $uv run python -m irodori_openai_tts --host 0.0.0.0 --port $Port"
Write-Host ""
Write-Host "Health check:"
Write-Host "  curl.exe http://127.0.0.1:$Port/health"
Write-Host ""
Write-Host "Restart npm run dev, then re-enter the room."
Pop-Location
