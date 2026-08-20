param([switch]$SkipBuild)

$ErrorActionPreference = "Stop"
$taskName = "AgentTrial Local Service"
$backupTaskName = "AgentTrial Database Backup"
$repo = Split-Path -Parent $PSScriptRoot
$runScript = Join-Path $PSScriptRoot "run-durable-local-service.ps1"
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$configPath = Join-Path $stateDirectory "cloudflared-agenttrial.yml"
$seedPath = Join-Path $stateDirectory "signing-seed.txt"
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

if (!(Test-Path -LiteralPath $seedPath)) { throw "Existing managed signing seed was not found." }
if (!$SkipBuild) {
  $previousWslEnv = $env:WSLENV
  $env:AGENTTRIAL_SIGNING_SEED = (Get-Content -LiteralPath $seedPath -Raw).Trim()
  $env:AGENTTRIAL_BUILD_COMMIT = (& git -C $repo rev-parse HEAD).Trim()
  $env:WSLENV = ((@($previousWslEnv, "AGENTTRIAL_SIGNING_SEED/u", "AGENTTRIAL_BUILD_COMMIT/u") `
    | Where-Object { $_ }) -join ":")
  try {
    Push-Location $repo
    & docker compose -p agenttrial build
  }
  finally {
    Pop-Location
    Remove-Item Env:AGENTTRIAL_SIGNING_SEED -ErrorAction SilentlyContinue
    Remove-Item Env:AGENTTRIAL_BUILD_COMMIT -ErrorAction SilentlyContinue
    if ($null -eq $previousWslEnv) { Remove-Item Env:WSLENV -ErrorAction SilentlyContinue }
    else { $env:WSLENV = $previousWslEnv }
  }
  if ($LASTEXITCODE -ne 0) { throw "Docker image build failed." }
}

$arguments = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $runScript + '"'),
  "-ConfigPath", ('"' + $configPath + '"'), "-StateDirectory", ('"' + $stateDirectory + '"'),
  "-CloudflaredPath", ('"' + $cloudflared + '"')
) -join " "
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $repo
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $principal -Description "Keeps durable AgentTrial, workers, signer, and tunnel online." `
  -Force | Out-Null
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
Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger `
  -Settings $backupSettings -Principal $principal `
  -Description "Creates and verifies a rolling AgentTrial PostgreSQL backup." -Force | Out-Null
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  if ((Get-ScheduledTask -TaskName $taskName).State -ne "Running") { break }
  Start-Sleep -Milliseconds 200
}
Start-ScheduledTask -TaskName $taskName
Write-Output "Installed durable AgentTrial autostart and daily backups under $($identity.Name), Limited privilege."
