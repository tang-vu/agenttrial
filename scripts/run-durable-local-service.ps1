param(
  [int]$Port = 4179,
  [Parameter(Mandatory = $true)][string]$ConfigPath,
  [Parameter(Mandatory = $true)][string]$StateDirectory,
  [Parameter(Mandatory = $true)][string]$CloudflaredPath
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$seedPath = Join-Path $StateDirectory "signing-seed.txt"
$statePath = Join-Path $StateDirectory "processes.json"
$tunnelLog = Join-Path $StateDirectory "cloudflared.out.log"
$tunnelErrorLog = Join-Path $StateDirectory "cloudflared.err.log"
$tunnel = $null
$previousWslEnv = $env:WSLENV

if (!(Test-Path -LiteralPath $seedPath)) { throw "Managed signing seed is missing." }
if (!(Test-Path -LiteralPath $ConfigPath)) { throw "Cloudflare tunnel config is missing." }

function Set-ComposeEnvironment {
  $env:AGENTTRIAL_SIGNING_SEED = (Get-Content -LiteralPath $seedPath -Raw).Trim()
  $env:AGENTTRIAL_BUILD_COMMIT = (& git -C $repo rev-parse HEAD).Trim()
  $env:AGENTTRIAL_PORT = "$Port"
  $env:NEXT_PUBLIC_APP_URL = "https://agenttrial.tangvu.dev"
  $forwarded = @(
    "AGENTTRIAL_SIGNING_SEED/u", "AGENTTRIAL_BUILD_COMMIT/u", "AGENTTRIAL_PORT/u",
    "NEXT_PUBLIC_APP_URL/u"
  )
  $env:WSLENV = ((@($script:previousWslEnv) + $forwarded | Where-Object { $_ }) -join ":")
}

function Clear-ComposeEnvironment {
  Remove-Item Env:AGENTTRIAL_SIGNING_SEED -ErrorAction SilentlyContinue
  Remove-Item Env:AGENTTRIAL_BUILD_COMMIT -ErrorAction SilentlyContinue
  Remove-Item Env:AGENTTRIAL_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:NEXT_PUBLIC_APP_URL -ErrorAction SilentlyContinue
  if ($null -eq $script:previousWslEnv) {
    Remove-Item Env:WSLENV -ErrorAction SilentlyContinue
  } else {
    $env:WSLENV = $script:previousWslEnv
  }
}

function Start-DurableStack {
  Set-ComposeEnvironment
  try {
    Push-Location $repo
    & docker compose -p agenttrial up -d --remove-orphans
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
    Clear-ComposeEnvironment
  }
}

function Start-DurableStackWithRetry {
  param([int]$Attempts = 60, [int]$DelaySeconds = 10)

  $lastError = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      Start-DurableStack
      return
    } catch {
      $lastError = $_
      Write-Warning "Docker stack start attempt $attempt/$Attempts failed; retrying in $DelaySeconds seconds."
      if ($attempt -lt $Attempts) { Start-Sleep -Seconds $DelaySeconds }
    }
  }
  throw "Docker did not become available after $Attempts attempts: $($lastError.Exception.Message)"
}

function Test-Ready {
  try {
    $ready = Invoke-RestMethod "http://127.0.0.1:$Port/api/ready" -TimeoutSec 5
    return $ready.ready -eq $true -and $ready.persistence.database -eq $true `
      -and $ready.persistence.worker -eq $true -and $ready.persistence.signer -eq $true
  } catch { return $false }
}

function Start-Tunnel {
  $script:tunnel = Start-Process -FilePath $CloudflaredPath -ArgumentList @(
    "--config", ('"' + $ConfigPath + '"'), "tunnel", "--no-autoupdate", "run"
  ) -WorkingDirectory $StateDirectory -WindowStyle Hidden -RedirectStandardOutput $tunnelLog `
    -RedirectStandardError $tunnelErrorLog -PassThru
}

New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
Start-DurableStackWithRetry
for ($attempt = 0; $attempt -lt 120 -and !(Test-Ready); $attempt += 1) {
  Start-Sleep -Seconds 1
}
if (!(Test-Ready)) { throw "Durable AgentTrial stack did not become ready." }
Start-Tunnel

@{
  mode = "docker-durable"
  supervisorPid = $PID
  tunnelPid = $tunnel.Id
  port = $Port
  composeProject = "agenttrial"
  repo = $repo
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8

while ($true) {
  Start-Sleep -Seconds 10
  if (!(Test-Ready)) { Start-DurableStackWithRetry -Attempts 12 -DelaySeconds 5 }
  if (!$tunnel -or $tunnel.HasExited) { Start-Tunnel }
  @{
    mode = "docker-durable"
    supervisorPid = $PID
    tunnelPid = $tunnel.Id
    port = $Port
    composeProject = "agenttrial"
    repo = $repo
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
}
