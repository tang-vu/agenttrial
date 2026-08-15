$ErrorActionPreference = "Stop"
$stateDirectory = Join-Path $env:LOCALAPPDATA "AgentTrial\tunnel"
$statePath = Join-Path $stateDirectory "processes.json"
if (!(Test-Path $statePath)) { throw "No AgentTrial tunnel state was found." }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json

$tunnel = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.tunnelPid)" -ErrorAction SilentlyContinue
if ($tunnel -and $tunnel.CommandLine -like "*127.0.0.1:$($state.port)*") {
  Stop-Process -Id $state.tunnelPid -Force
}
$listener = Get-NetTCPConnection -LocalPort $state.port -State Listen -ErrorAction SilentlyContinue
if ($listener -and $listener.OwningProcess -eq $state.webPid) {
  Stop-Process -Id $state.webPid -Force
}
Remove-Item -LiteralPath $statePath
Write-Output "AgentTrial tunnel stopped."

