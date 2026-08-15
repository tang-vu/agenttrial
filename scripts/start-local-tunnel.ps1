param(
  [int]$Port = 4179,
  [string]$Hostname = "agenttrial.tangvu.dev",
  [string]$TunnelId = "88c75f02-f4d3-4086-a485-462ee04ab843",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$seedPath = Join-Path $stateDirectory "signing-seed.txt"
$statePath = Join-Path $stateDirectory "processes.json"
$configPath = Join-Path $stateDirectory "cloudflared-agenttrial.yml"
$credentialsPath = Join-Path $env:USERPROFILE ".cloudflared\$TunnelId.json"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source

if (!(Test-Path $cloudflared)) { throw "cloudflared is not installed at $cloudflared" }
if (!(Test-Path $credentialsPath)) { throw "Tunnel credentials are missing at $credentialsPath" }
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null

if (Test-Path $statePath) {
  $existing = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $supervisor = Get-Process -Id $existing.supervisorPid -ErrorAction SilentlyContinue
  if ($supervisor) {
    try {
      Invoke-RestMethod "https://$Hostname/api/health" -TimeoutSec 10 | Out-Null
      Write-Output "https://$Hostname"
      exit 0
    } catch {
      throw "AgentTrial supervisor PID $($existing.supervisorPid) is already running but the public health check failed."
    }
  }
  Remove-Item -LiteralPath $statePath -Force
}

if (!(Test-Path $seedPath)) {
  $bytes = [byte[]]::new(32)
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant() |
    Set-Content -LiteralPath $seedPath -NoNewline
}

@"
tunnel: $TunnelId
credentials-file: $credentialsPath

ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:$Port
    originRequest:
      connectTimeout: 10s
      keepAliveConnections: 16
      keepAliveTimeout: 1m30s
  - service: http_status:404
"@ | Set-Content -LiteralPath $configPath

if (!$SkipBuild) {
  & $pnpm build
  if ($LASTEXITCODE -ne 0) { throw "Production build failed." }
}

$supervisorLog = Join-Path $stateDirectory "supervisor.out.log"
$supervisorErrorLog = Join-Path $stateDirectory "supervisor.err.log"
$supervisor = Start-Process -FilePath powershell.exe -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
  ('"' + (Join-Path $PSScriptRoot "run-local-service.ps1") + '"'),
  "-Port", "$Port", "-Hostname", $Hostname, "-ConfigPath", ('"' + $configPath + '"'),
  "-StateDirectory", ('"' + $stateDirectory + '"'), "-PnpmPath", ('"' + $pnpm + '"'),
  "-CloudflaredPath", ('"' + $cloudflared + '"')
) -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput $supervisorLog `
  -RedirectStandardError $supervisorErrorLog -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  Start-Sleep -Seconds 1
  if ($supervisor.HasExited) {
    throw "AgentTrial supervisor exited. See $supervisorErrorLog"
  }
  try {
    Invoke-RestMethod "https://$Hostname/api/health" -TimeoutSec 10 | Out-Null
    $ready = $true
    break
  } catch {}
}
if (!$ready) { throw "https://$Hostname did not become healthy within 60 seconds." }

Write-Output "https://$Hostname"
