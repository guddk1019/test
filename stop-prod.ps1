$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeDir = Join-Path $RepoRoot ".runtime"
$BackendPidFile = Join-Path $RuntimeDir "backend.prod.pid"
$FrontendPidFile = Join-Path $RuntimeDir "frontend.prod.pid"
$PortsFile = Join-Path $RuntimeDir "prod.ports.json"

function Stop-ByPidFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PidFilePath,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $PidFilePath)) {
    Write-Host "${Label}: pid file not found."
    return
  }

  $pidRaw = (Get-Content -LiteralPath $PidFilePath -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($pidRaw -and $pidRaw -match '^\d+$') {
    $process = Get-Process -Id ([int]$pidRaw) -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      Write-Host "${Label}: stopped (PID $($process.Id))."
    } else {
      Write-Host "${Label}: process already stopped."
    }
  } else {
    Write-Host "${Label}: invalid pid file."
  }

  Remove-Item -LiteralPath $PidFilePath -Force -ErrorAction SilentlyContinue
}

function Get-PortFromConfig {
  param(
    [string]$Role,
    [int]$DefaultPort
  )

  if (-not (Test-Path -LiteralPath $PortsFile)) {
    return $DefaultPort
  }

  try {
    $raw = Get-Content -LiteralPath $PortsFile -Raw -ErrorAction Stop
    $cfg = $raw | ConvertFrom-Json -ErrorAction Stop
    if ($Role -eq "backend" -and $cfg.backendPort) { return [int]$cfg.backendPort }
    if ($Role -eq "frontend" -and $cfg.frontendPort) { return [int]$cfg.frontendPort }
  } catch {
    return $DefaultPort
  }

  return $DefaultPort
}

function Stop-ByPort {
  param(
    [int]$Port,
    [string]$Label
  )

  try {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
  } catch {
    Write-Host "${Label}: no listening process on port $Port."
    return
  }

  if (-not $connections) {
    Write-Host "${Label}: no listening process on port $Port."
    return
  }

  $procIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($procId in $procIds) {
    if ($procId -and $procId -match '^\d+$') {
      $proc = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "${Label}: stopped by port $Port (PID $($proc.Id))."
      }
    }
  }
}

Stop-ByPidFile -PidFilePath $BackendPidFile -Label "Backend"
Stop-ByPidFile -PidFilePath $FrontendPidFile -Label "Frontend"

$backendPort = Get-PortFromConfig -Role "backend" -DefaultPort 4000
$frontendPort = Get-PortFromConfig -Role "frontend" -DefaultPort 3000

Stop-ByPort -Port $backendPort -Label "Backend"
Stop-ByPort -Port $frontendPort -Label "Frontend"
