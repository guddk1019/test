param(
  [switch]$SkipInstall,
  [switch]$SkipMigrate,
  [switch]$SkipSeed,
  [switch]$SkipBuild,
  [int]$BackendPort = 4000,
  [int]$FrontendPort = 3000,
  [string]$ApiBaseUrl = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$NpmCmd = "npm.cmd"
$RuntimeDir = Join-Path $RepoRoot ".runtime"

$BackendPidFile = Join-Path $RuntimeDir "backend.prod.pid"
$FrontendPidFile = Join-Path $RuntimeDir "frontend.prod.pid"
$BackendOutLog = Join-Path $RuntimeDir "backend.prod.out.log"
$BackendErrLog = Join-Path $RuntimeDir "backend.prod.err.log"
$FrontendOutLog = Join-Path $RuntimeDir "frontend.prod.out.log"
$FrontendErrLog = Join-Path $RuntimeDir "frontend.prod.err.log"
$PortsFile = Join-Path $RuntimeDir "prod.ports.json"

if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
  $ApiBaseUrl = "http://127.0.0.1:$BackendPort"
}

function Invoke-Npm {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args,
    [string]$WorkingDirectory = $RepoRoot
  )

  Push-Location $WorkingDirectory
  try {
    & $NpmCmd @Args
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: npm.cmd $($Args -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Stop-ProcessFromPidFile {
  param([string]$PidFilePath)

  if (-not (Test-Path -LiteralPath $PidFilePath)) {
    return
  }

  $pidRaw = (Get-Content -LiteralPath $PidFilePath -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($pidRaw -and $pidRaw -match '^\d+$') {
    $existingProcess = Get-Process -Id ([int]$pidRaw) -ErrorAction SilentlyContinue
    if ($existingProcess) {
      Stop-Process -Id $existingProcess.Id -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 300
    }
  }

  Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
}

function Get-ListeningProcessIds {
  param([int]$Port)

  try {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
    if (-not $connections) {
      return @()
    }

    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    return @()
  }
}

function Stop-ListeningProcesses {
  param(
    [int]$Port,
    [string]$Label
  )

  $processIds = Get-ListeningProcessIds -Port $Port
  if (-not $processIds -or $processIds.Count -eq 0) {
    return
  }

  foreach ($procId in $processIds) {
    if ($procId -and $procId -match '^\d+$') {
      $proc = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Warning "$Label port $Port is already in use by PID $($proc.Id) ($($proc.ProcessName)). Stopping it."
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      }
    }
  }

  Start-Sleep -Milliseconds 300
}

function Wait-ForHttp {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  return $false
}

function Prepare-LogFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PrimaryPath,
    [Parameter(Mandatory = $true)]
    [string]$Prefix
  )

  # Try primary log path first. If locked, fallback to unique timestamped log.
  try {
    Set-Content -LiteralPath $PrimaryPath -Value "" -Encoding utf8 -ErrorAction Stop
    return $PrimaryPath
  } catch {
    for ($i = 0; $i -lt 5; $i++) {
      $stamp = (Get-Date).ToString("yyyyMMdd-HHmmss-fff")
      $fallbackPath = Join-Path $RuntimeDir "$Prefix.$stamp.$PID.$i.log"
      try {
        Set-Content -LiteralPath $fallbackPath -Value "" -Encoding utf8 -ErrorAction Stop
        Write-Warning "Log file is locked: $PrimaryPath"
        Write-Warning "Using fallback log file: $fallbackPath"
        return $fallbackPath
      } catch {
        Start-Sleep -Milliseconds 120
      }
    }

    throw "Unable to prepare log file for prefix '$Prefix'. Primary was locked and fallback creation failed."
  }
}

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

Stop-ProcessFromPidFile -PidFilePath $BackendPidFile
Stop-ProcessFromPidFile -PidFilePath $FrontendPidFile
Stop-ListeningProcesses -Port $BackendPort -Label "Backend"
Stop-ListeningProcesses -Port $FrontendPort -Label "Frontend"

$BackendOutLog = Prepare-LogFile -PrimaryPath $BackendOutLog -Prefix "backend.prod.out"
$BackendErrLog = Prepare-LogFile -PrimaryPath $BackendErrLog -Prefix "backend.prod.err"
$FrontendOutLog = Prepare-LogFile -PrimaryPath $FrontendOutLog -Prefix "frontend.prod.out"
$FrontendErrLog = Prepare-LogFile -PrimaryPath $FrontendErrLog -Prefix "frontend.prod.err"

Write-Host "==> Repository: $RepoRoot"

if (-not $SkipInstall) {
  Write-Host "==> Installing dependencies"
  Invoke-Npm -Args @("install")
  Invoke-Npm -Args @("--prefix", "frontend", "install")
}

if (-not $SkipMigrate) {
  Write-Host "==> Running DB migration"
  Invoke-Npm -Args @("run", "db:migrate")
}

if (-not $SkipSeed) {
  Write-Host "==> Running DB seed"
  Invoke-Npm -Args @("run", "db:seed")
}

if (-not $SkipBuild) {
  Write-Host "==> Building backend"
  Invoke-Npm -Args @("run", "build")
  Write-Host "==> Building frontend"
  Push-Location $RepoRoot
  try {
    $env:NEXT_PUBLIC_API_BASE_URL = $ApiBaseUrl
    Invoke-Npm -Args @("--prefix", "frontend", "run", "build")
  } finally {
    Remove-Item Env:NEXT_PUBLIC_API_BASE_URL -ErrorAction SilentlyContinue
    Pop-Location
  }
}

Write-Host "==> Starting backend"
$previousPort = $env:PORT
try {
  $env:PORT = "$BackendPort"
  $backendProcess = Start-Process -FilePath "node" -ArgumentList @("dist/src/index.js") -WorkingDirectory $RepoRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $BackendOutLog -RedirectStandardError $BackendErrLog
} finally {
  if ($null -eq $previousPort) {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  } else {
    $env:PORT = $previousPort
  }
}
$backendProcess.Id | Set-Content -LiteralPath $BackendPidFile -Encoding ascii

Write-Host "==> Starting frontend"
$frontendWorkdir = Join-Path $RepoRoot "frontend"
$frontendEntrypoint = "node_modules/next/dist/bin/next"
$previousApiBase = $env:NEXT_PUBLIC_API_BASE_URL
try {
  $env:NEXT_PUBLIC_API_BASE_URL = $ApiBaseUrl
  $frontendProcess = Start-Process -FilePath "node" -ArgumentList @($frontendEntrypoint, "start", "-p", "$FrontendPort") -WorkingDirectory $frontendWorkdir -PassThru -WindowStyle Hidden -RedirectStandardOutput $FrontendOutLog -RedirectStandardError $FrontendErrLog
} finally {
  if ($null -eq $previousApiBase) {
    Remove-Item Env:NEXT_PUBLIC_API_BASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:NEXT_PUBLIC_API_BASE_URL = $previousApiBase
  }
}
$frontendProcess.Id | Set-Content -LiteralPath $FrontendPidFile -Encoding ascii

@{
  backendPort = $BackendPort
  frontendPort = $FrontendPort
  apiBaseUrl = $ApiBaseUrl
} | ConvertTo-Json | Set-Content -LiteralPath $PortsFile -Encoding utf8

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$BackendPort/health" -TimeoutSeconds 40)) {
  throw "Backend did not become healthy. Check: $BackendOutLog / $BackendErrLog"
}

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$FrontendPort/login" -TimeoutSeconds 40)) {
  throw "Frontend did not start. Check: $FrontendOutLog / $FrontendErrLog"
}

Write-Host ""
Write-Host "Started in production mode."
Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
Write-Host "Backend : http://127.0.0.1:$BackendPort/health"
Write-Host "API URL : $ApiBaseUrl"
Write-Host "Logs    : $RuntimeDir"
Write-Host "Stop    : .\stop-prod.ps1"
