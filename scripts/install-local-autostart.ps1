param([switch]$SkipBuild, [switch]$AllowEphemeral)

$ErrorActionPreference = "Stop"
if (!$AllowEphemeral) {
  throw "The in-process autostart is demo-only. Use install-durable-autostart.ps1 for the public service, or pass -AllowEphemeral explicitly for a disposable local demo."
}
$taskName = "AgentTrial Local Service"
$repo = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot "start-local-tunnel.ps1"
$runScript = Join-Path $PSScriptRoot "run-local-service.ps1"
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$configPath = Join-Path $stateDirectory "cloudflared-agenttrial.yml"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

& $startScript -SkipBuild:$SkipBuild

$arguments = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $runScript + '"'),
  "-ConfigPath", ('"' + $configPath + '"'), "-StateDirectory", ('"' + $stateDirectory + '"'),
  "-NodePath", ('"' + $node + '"'), "-CloudflaredPath", ('"' + $cloudflared + '"')
) -join " "
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $repo
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
$mode = "when $($identity.Name) logs in after reboot (least privilege)"

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Principal $taskPrincipal -Description "Keeps AgentTrial and its Cloudflare named tunnel online." -Force | Out-Null
Write-Output "Installed '$taskName': $mode. https://agenttrial.tangvu.dev"
