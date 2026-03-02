param(
  [string]$MigrationFile = "003_v020_foundation.sql",
  [string]$ContainerName = "corp-perf-postgres",
  [string]$DbName = "corp_perf",
  [string]$DbUser = "postgres",
  [switch]$InsertIfMissing,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sqlPath = Join-Path $repoRoot "sql\$MigrationFile"

$dockerExe = $null
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCommand) {
  $dockerExe = $dockerCommand.Source
}
if (-not $dockerExe) {
  $defaultDockerPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path -LiteralPath $defaultDockerPath) {
    $dockerExe = $defaultDockerPath
  }
}

function Invoke-DbSql {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Sql,
    [switch]$Scalar
  )

  if ($dockerExe) {
    $psqlArgs = @("exec", $ContainerName, "psql", "-U", $DbUser, "-d", $DbName)
    if ($Scalar) {
      $psqlArgs += @("-tAc", $Sql)
    } else {
      $psqlArgs += @("-c", $Sql)
    }
    $output = & $dockerExe @psqlArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to execute SQL via docker/psql."
    }
    return $output
  }

  $nodeScript = @'
const path = require("node:path");
const dotenv = require(path.join(process.cwd(), "node_modules", "dotenv"));
const { Client } = require(path.join(process.cwd(), "node_modules", "pg"));
dotenv.config({ path: path.join(process.cwd(), ".env") });

const sql = process.argv[2];
const scalar = process.argv[3] === "1";

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in environment.");
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(sql);
    if (scalar) {
      if (result.rows.length === 0) {
        process.stdout.write("");
        return;
      }
      const row = result.rows[0];
      const firstKey = Object.keys(row)[0];
      process.stdout.write(String(row[firstKey] ?? ""));
      return;
    }
    process.stdout.write("OK");
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
'@

  $scalarFlag = if ($Scalar) { "1" } else { "0" }
  $tempScriptPath = Join-Path $env:TEMP ("repair-migration-checksum-" + [Guid]::NewGuid().ToString("N") + ".cjs")
  try {
    Set-Content -LiteralPath $tempScriptPath -Value $nodeScript -Encoding utf8
    $output = & node $tempScriptPath $Sql $scalarFlag
  } finally {
    Remove-Item -LiteralPath $tempScriptPath -Force -ErrorAction SilentlyContinue
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to execute SQL via node/pg. Ensure DATABASE_URL is valid."
  }
  return $output
}

if (-not (Test-Path -LiteralPath $sqlPath)) {
  throw "Migration file not found: $sqlPath"
}

$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $sqlPath).Hash.ToLower()
$escapedFile = $MigrationFile.Replace("'", "''")

Write-Host "Target migration : $MigrationFile"
Write-Host "Target checksum  : $checksum"
if ($dockerExe) {
  Write-Host "Mode             : docker/psql"
  Write-Host "Container        : $ContainerName"
  Write-Host "Database         : $DbName"
} else {
  Write-Host "Mode             : direct DB (node/pg via DATABASE_URL)"
}

if ($DryRun) {
  Write-Host "DryRun enabled. No DB change applied."
  exit 0
}

$existsSql = "SELECT 1 FROM schema_migrations WHERE file_name='$escapedFile';"
$exists = Invoke-DbSql -Sql $existsSql -Scalar

if ($exists -match "1") {
  $updateSql = "UPDATE schema_migrations SET checksum='$checksum' WHERE file_name='$escapedFile';"
  [void](Invoke-DbSql -Sql $updateSql)
  Write-Host "Checksum updated successfully."
  exit 0
}

if (-not $InsertIfMissing) {
  throw "No migration row found for '$MigrationFile'. Re-run with -InsertIfMissing to insert."
}

$insertSql = "INSERT INTO schema_migrations (file_name, checksum) VALUES ('$escapedFile', '$checksum');"
[void](Invoke-DbSql -Sql $insertSql)

Write-Host "Checksum row inserted successfully."
