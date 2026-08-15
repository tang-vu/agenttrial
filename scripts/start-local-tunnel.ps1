param(
  [int]$Port = 4179,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$seedPath = Join-Path $stateDirectory "signing-seed.txt"
$statePath = Join-Path $stateDirectory "processes.json"
$emptyConfig = Join-Path $stateDirectory "cloudflared-empty.yml"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source

if (!(Test-Path $cloudflared)) { throw "cloudflared is not installed at $cloudflared" }
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
if (Test-Path $statePath) {
  $existing = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if (Get-Process -Id $existing.tunnelPid -ErrorAction SilentlyContinue) {
    throw "AgentTrial is already published at $($existing.url). Run stop-local-tunnel.ps1 first."
  }
  Remove-Item -LiteralPath $statePath
}
if (!(Test-Path $emptyConfig)) { New-Item -ItemType File -Path $emptyConfig | Out-Null }
if (!(Test-Path $seedPath)) {
  $bytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  [Convert]::ToHexString($bytes).ToLowerInvariant() | Set-Content -LiteralPath $seedPath -NoNewline
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw "Port $Port is already in use by PID $($listener.OwningProcess)." }
if (!$SkipBuild) {
  & $pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
}

$env:AGENTTRIAL_SIGNING_SEED = Get-Content -LiteralPath $seedPath -Raw
$web = Start-Process -FilePath $pnpm -ArgumentList @(
  "--filter", "@agenttrial/web", "start", "--port", "$Port"
) -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (
  Join-Path $stateDirectory "web.out.log"
) -RedirectStandardError (Join-Path $stateDirectory "web.err.log") -PassThru
Remove-Item Env:AGENTTRIAL_SIGNING_SEED

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-RestMethod "http://127.0.0.1:$Port/api/health" | Out-Null
    $ready = $true
    break
  } catch {}
}
if (!$ready) { throw "AgentTrial did not become healthy on port $Port." }

$session = Get-Date -Format "yyyyMMdd-HHmmss"
$tunnelLog = Join-Path $stateDirectory "cloudflared-$session.log"
$tunnel = Start-Process -FilePath $cloudflared -ArgumentList @(
  "--config", $emptyConfig, "tunnel", "--url", "http://127.0.0.1:$Port",
  "--no-autoupdate", "--logfile", $tunnelLog
) -WorkingDirectory $stateDirectory -WindowStyle Hidden -RedirectStandardOutput (
  Join-Path $stateDirectory "tunnel-$session.out.log"
) -RedirectStandardError (Join-Path $stateDirectory "tunnel-$session.err.log") -PassThru

$publicUrl = $null
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $match = Select-String -Path $tunnelLog -Pattern "https://[-a-z0-9]+\.trycloudflare\.com" -AllMatches
    $publicUrl = $match.Matches.Value | Select-Object -Last 1
    if ($publicUrl) { break }
  }
}
if (!$publicUrl) { throw "Cloudflare Quick Tunnel did not publish a URL." }

$webPid = (Get-NetTCPConnection -LocalPort $Port -State Listen).OwningProcess
@{ webPid = $webPid; tunnelPid = $tunnel.Id; port = $Port; url = $publicUrl } |
  ConvertTo-Json | Set-Content -LiteralPath $statePath
Write-Output $publicUrl
