param(
  [int]$Port = 4179,
  [string]$Hostname = "agenttrial.tangvu.dev",
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [Parameter(Mandatory = $true)][string]$StateDirectory,
  [Parameter(Mandatory = $true)][string]$NodePath,
  [Parameter(Mandatory = $true)][string]$CloudflaredPath
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$seedPath = Join-Path $StateDirectory "signing-seed.txt"
$statePath = Join-Path $StateDirectory "processes.json"
$webLog = Join-Path $StateDirectory "web.out.log"
$webErrorLog = Join-Path $StateDirectory "web.err.log"
$tunnelLog = Join-Path $StateDirectory "cloudflared.out.log"
$tunnelErrorLog = Join-Path $StateDirectory "cloudflared.err.log"
$webLauncher = $null
$tunnel = $null
$webPid = 0

function Test-LocalHealth {
  try {
    Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 5 | Out-Null
    return $true
  } catch { return $false }
}

function Start-Web {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { throw "Port $Port is already in use by PID $($listener.OwningProcess)." }

  $env:AGENTTRIAL_SIGNING_SEED = Get-Content -LiteralPath $seedPath -Raw
  $env:AGENTTRIAL_DATA_DIR = Join-Path $StateDirectory "data"
  $env:HOSTNAME = "127.0.0.1"
  $env:PORT = "$Port"
  try {
    $standaloneServer = Join-Path $repo "apps\web\.next\standalone\apps\web\server.js"
    if (!(Test-Path $standaloneServer)) { throw "Standalone production server is missing." }
    $script:webLauncher = Start-Process -FilePath $NodePath -ArgumentList @(
      ('"' + $standaloneServer + '"')
    ) -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $webLog `
      -RedirectStandardError $webErrorLog -PassThru
  } finally {
    Remove-Item Env:AGENTTRIAL_SIGNING_SEED -ErrorAction SilentlyContinue
    Remove-Item Env:AGENTTRIAL_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:HOSTNAME -ErrorAction SilentlyContinue
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  }

  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-LocalHealth) {
      $script:webPid = (Get-NetTCPConnection -LocalPort $Port -State Listen).OwningProcess
      return
    }
  }
  throw "AgentTrial web process did not become healthy."
}

function Start-Tunnel {
  $script:tunnel = Start-Process -FilePath $CloudflaredPath -ArgumentList @(
    "--config", ('"' + $ConfigPath + '"'), "tunnel", "--no-autoupdate", "run"
  ) -WorkingDirectory $StateDirectory -WindowStyle Hidden -RedirectStandardOutput $tunnelLog `
    -RedirectStandardError $tunnelErrorLog -PassThru
}

function Write-State {
  @{
    supervisorPid = $PID
    webLauncherPid = if ($webLauncher) { $webLauncher.Id } else { 0 }
    webPid = $webPid
    tunnelPid = if ($tunnel) { $tunnel.Id } else { 0 }
    port = $Port
    url = "https://$Hostname"
    mode = "named-tunnel"
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $statePath
}

function Stop-OwnedProcess([object]$Process) {
  if ($Process -and !$Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

try {
  Start-Web
  Start-Tunnel
  Write-State

  $failedHealthChecks = 0
  while ($true) {
    Start-Sleep -Seconds 10

    if (Test-LocalHealth) {
      $failedHealthChecks = 0
    } else {
      $failedHealthChecks += 1
      if ($failedHealthChecks -ge 3) {
        Stop-OwnedProcess $webLauncher
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener -and $listener.OwningProcess -eq $webPid) {
          Stop-Process -Id $webPid -Force -ErrorAction SilentlyContinue
        }
        Start-Web
        $failedHealthChecks = 0
      }
    }

    if (!$tunnel -or $tunnel.HasExited) { Start-Tunnel }
    Write-State
  }
} finally {
  Stop-OwnedProcess $tunnel
  Stop-OwnedProcess $webLauncher
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
}
