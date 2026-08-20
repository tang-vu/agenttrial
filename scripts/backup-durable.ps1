param(
  [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA "AgentTrial\backups"),
  [ValidateRange(2, 90)][int]$RetentionCount = 14
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$archiveName = "agenttrial-$timestamp.dump"
$containerPath = "/tmp/$archiveName"

function ConvertTo-WslPath([string]$Path) {
  $absolute = [IO.Path]::GetFullPath($Path)
  if ($absolute -notmatch '^([A-Za-z]):\\(.*)$') { throw "Backup path must be on a local drive." }
  return "/mnt/$($Matches[1].ToLower())/$($Matches[2].Replace('\', '/'))"
}

New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
$resolvedRoot = [IO.Path]::GetFullPath($BackupDirectory).TrimEnd('\') + '\'
$archivePath = Join-Path $BackupDirectory $archiveName
$linuxArchivePath = ConvertTo-WslPath $archivePath
$postgresId = (& docker compose --project-directory $repo -p agenttrial ps -q postgres).Trim()
if (!$postgresId) { throw "AgentTrial PostgreSQL container is not running." }

try {
  & docker exec $postgresId pg_dump -U agenttrial -d agenttrial --format=custom --compress=9 `
    --file=$containerPath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
  & docker exec $postgresId pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Backup archive verification failed." }
  & docker cp "${postgresId}:$containerPath" $linuxArchivePath
  if ($LASTEXITCODE -ne 0) { throw "Could not copy the verified archive from PostgreSQL." }
} finally {
  & docker exec $postgresId rm -f $containerPath 2>$null
}

$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower()
$metadata = [ordered]@{
  schemaVersion = "agenttrial.backup.v1"
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  archive = $archiveName
  sha256 = $hash
  bytes = (Get-Item -LiteralPath $archivePath).Length
  buildCommit = (& git -C $repo rev-parse HEAD).Trim()
  database = "agenttrial"
  format = "postgres-custom"
}
$metadataPath = "$archivePath.json"
$metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

$archives = @(Get-ChildItem -LiteralPath $BackupDirectory -Filter "agenttrial-*.dump" -File |
    Sort-Object LastWriteTimeUtc -Descending)
foreach ($expired in $archives | Select-Object -Skip $RetentionCount) {
  $candidate = [IO.Path]::GetFullPath($expired.FullName)
  if (!$candidate.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a backup outside the configured backup directory."
  }
  Remove-Item -LiteralPath $candidate -Force
  Remove-Item -LiteralPath "$candidate.json" -Force -ErrorAction SilentlyContinue
}

Write-Output "Verified backup: $archivePath"
Write-Output "SHA-256: $hash"
