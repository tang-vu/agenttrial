param([switch]$DisableAutostart)

$ErrorActionPreference = "Stop"
$taskName = "AgentTrial Local Service"
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$statePath = Join-Path $stateDirectory "processes.json"

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if ($pm2) {
  if ($DisableAutostart) {
    & $pm2.Source delete agenttrial-stack agenttrial-tunnel 2>$null
    & $pm2.Source save --force | Out-Null
  } else {
    & $pm2.Source stop agenttrial-stack agenttrial-tunnel 2>$null
  }
}

if ($DisableAutostart) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} else { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }

if (!(Test-Path $statePath)) {
  Write-Output "No running AgentTrial local service was found."
  exit 0
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json

function Stop-VerifiedProcess([int]$ProcessId, [string]$Pattern) {
  if (!$ProcessId) { return }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -like "*$Pattern*") {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if ($state.mode -in @("docker-durable", "pm2-docker-durable")) {
  Stop-VerifiedProcess $state.supervisorPid "run-durable-local-service.ps1"
  Stop-VerifiedProcess $state.tunnelPid "cloudflared-agenttrial.yml"
  $expectedRepo = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
  if ($state.repo -and (Resolve-Path -LiteralPath $state.repo).Path -eq $expectedRepo) {
    & docker compose --project-directory $state.repo -p agenttrial stop
  }
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Write-Output "Durable AgentTrial PM2 service stopped. Autostart disabled: $DisableAutostart"
  exit 0
}

Stop-VerifiedProcess $state.supervisorPid "run-local-service.ps1"
Stop-VerifiedProcess $state.tunnelPid "cloudflared-agenttrial.yml"
Stop-VerifiedProcess $state.webLauncherPid "standalone\apps\web\server.js"

$listener = Get-NetTCPConnection -LocalPort $state.port -State Listen -ErrorAction SilentlyContinue
if ($listener -and $listener.OwningProcess -eq $state.webPid) {
  Stop-Process -Id $state.webPid -Force -ErrorAction SilentlyContinue
}
Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
Write-Output "AgentTrial local service stopped. Autostart disabled: $DisableAutostart"
