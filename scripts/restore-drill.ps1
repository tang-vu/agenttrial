param(
  [string]$BackupDirectory = (Join-Path $env:LOCALAPPDATA "AgentTrial\backups")
)

$ErrorActionPreference = "Stop"
$resolvedRoot = [IO.Path]::GetFullPath($BackupDirectory).TrimEnd('\') + '\'
$archive = Get-ChildItem -LiteralPath $resolvedRoot -Filter "agenttrial-*.dump" -File |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1
if (!$archive) { throw "No AgentTrial backup archive exists in $resolvedRoot" }
$archivePath = [IO.Path]::GetFullPath($archive.FullName)
if (!$archivePath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use an archive outside the configured backup directory."
}
function ConvertTo-WslPath([string]$Path) {
  $absolute = [IO.Path]::GetFullPath($Path)
  if ($absolute -notmatch '^([A-Za-z]):\\(.*)$') { throw "Backup path must be on a local drive." }
  return "/mnt/$($Matches[1].ToLower())/$($Matches[2].Replace('\', '/'))"
}
$dockerArchivePath = ConvertTo-WslPath $archivePath

$postgresId = (& docker ps --filter "label=com.docker.compose.project=agenttrial" `
  --filter "label=com.docker.compose.service=postgres" -q).Trim()
if (!$postgresId) { throw "AgentTrial PostgreSQL container is not running." }
if ($postgresId -match "`n") { throw "Multiple AgentTrial PostgreSQL containers were found." }

$suffix = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$drillDatabase = "agenttrial_restore_$suffix"
$containerArchive = "/tmp/$($archive.Name)"
$databaseCreated = $false

try {
  & docker cp $dockerArchivePath "${postgresId}:$containerArchive"
  if ($LASTEXITCODE -ne 0) { throw "Could not stage the backup inside PostgreSQL." }
  & docker exec $postgresId createdb -U agenttrial $drillDatabase
  if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated restore database." }
  $databaseCreated = $true
  & docker exec $postgresId pg_restore -U agenttrial -d $drillDatabase `
    --no-owner --no-privileges --exit-on-error $containerArchive
  if ($LASTEXITCODE -ne 0) { throw "Backup restore failed." }
  $tableCount = (& docker exec $postgresId psql -U agenttrial -d $drillDatabase -Atc `
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';").Trim()
  $runCount = (& docker exec $postgresId psql -U agenttrial -d $drillDatabase -Atc `
    "SELECT count(*) FROM agenttrial_runs;").Trim()
  if ([int]$tableCount -lt 5) { throw "Restored schema is incomplete ($tableCount tables)." }
  Write-Output "Restore drill passed: $($archive.Name)"
  Write-Output "Restored database: $drillDatabase ($tableCount tables, $runCount runs)"
} finally {
  if ($databaseCreated) {
    & docker exec $postgresId dropdb --force -U agenttrial $drillDatabase 2>$null
  }
  & docker exec $postgresId rm -f $containerArchive 2>$null
}
