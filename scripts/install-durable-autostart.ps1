param([switch]$SkipBuild)

$ErrorActionPreference = "Stop"
$legacyTaskName = "AgentTrial Local Service"
$backupTaskName = "AgentTrial Database Backup"
$repo = Split-Path -Parent $PSScriptRoot
$ecosystem = Join-Path $repo "ecosystem.config.cjs"
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$configPath = Join-Path $stateDirectory "cloudflared-agenttrial.yml"
$seedPath = Join-Path $stateDirectory "signing-seed.txt"
$pm2 = (Get-Command pm2.cmd -ErrorAction Stop).Source

if (!(Test-Path -LiteralPath $seedPath)) { throw "Existing managed signing seed was not found." }
if (!(Test-Path -LiteralPath $configPath)) { throw "Cloudflare tunnel config was not found." }
if (!(Test-Path -LiteralPath $ecosystem)) { throw "PM2 ecosystem config was not found." }

if (!$SkipBuild) {
  $previousWslEnv = $env:WSLENV
  $env:AGENTTRIAL_SIGNING_SEED = (Get-Content -LiteralPath $seedPath -Raw).Trim()
  $env:AGENTTRIAL_BUILD_COMMIT = (& git -C $repo rev-parse HEAD).Trim()
  $env:WSLENV = ((@($previousWslEnv, "AGENTTRIAL_SIGNING_SEED/u", "AGENTTRIAL_BUILD_COMMIT/u") `
    | Where-Object { $_ }) -join ":")
  try {
    Push-Location $repo
    & docker compose -p agenttrial build
  } finally {
    Pop-Location
    Remove-Item Env:AGENTTRIAL_SIGNING_SEED -ErrorAction SilentlyContinue
    Remove-Item Env:AGENTTRIAL_BUILD_COMMIT -ErrorAction SilentlyContinue
    if ($null -eq $previousWslEnv) { Remove-Item Env:WSLENV -ErrorAction SilentlyContinue }
    else { $env:WSLENV = $previousWslEnv }
  }
  if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }
}

# PM2 already owns startup for the other workstation projects. Remove the old
# one-project supervisor so only PM2 controls AgentTrial after logon.
Stop-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false -ErrorAction SilentlyContinue

Push-Location $repo
try {
  & $pm2 delete agenttrial-stack agenttrial-tunnel 2>$null
  & $pm2 start $ecosystem
  if ($LASTEXITCODE -ne 0) { throw "PM2 failed to start AgentTrial." }
  & $pm2 save --force
  if ($LASTEXITCODE -ne 0) { throw "PM2 failed to save its process list." }
} finally {
  Pop-Location
}

$backupScript = Join-Path $PSScriptRoot "backup-durable.ps1"
$backupArguments = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $backupScript + '"')
) -join " "
$backupAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $backupArguments `
  -WorkingDirectory $repo
$backupTrigger = New-ScheduledTaskTrigger -Daily -At "3:00 AM"
$backupSettings = New-ScheduledTaskSettingsSet -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 10) -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger `
  -Settings $backupSettings -Principal $principal `
  -Description "Creates and verifies a rolling AgentTrial PostgreSQL backup." -Force | Out-Null

Write-Output "Installed AgentTrial under PM2 and saved it for the existing PM2 logon resurrection."
