$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 22 이상 설치 후 다시 실행하세요: https://nodejs.org'
  exit 1
}
if (-not (Test-Path 'node_modules/three/package.json') -or -not (Test-Path 'node_modules/ws/package.json')) {
  & npm.cmd ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$taskPort = if ($env:PORT) { [int]$env:PORT } else { 4175 }
$taskUrl = "http://localhost:$taskPort"
try {
  $taskExisting = Invoke-RestMethod "$taskUrl/health" -TimeoutSec 2
  if ($taskExisting.app -eq 'rift-protocol') {
    Start-Process $taskUrl
    Write-Host '이미 실행 중인 게임 서버를 열었습니다.'
    exit 0
  }
} catch {}
$taskLogDir = Join-Path $PSScriptRoot ('.runtime/' + $env:COMPUTERNAME)
New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
$taskNode = (Get-Command node).Source
$taskServer = Start-Process -FilePath $taskNode -ArgumentList @('"' + (Join-Path $PSScriptRoot 'server.mjs') + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogDir 'server.log') -RedirectStandardError (Join-Path $taskLogDir 'error.log') -PassThru
try {
  $taskReady = $false
  for ($taskAttempt=0; $taskAttempt -lt 40; $taskAttempt++) {
    Start-Sleep -Milliseconds 150
    $taskServer.Refresh()
    if ($taskServer.HasExited) { throw ('서버 실행 실패. 확인: ' + (Join-Path $taskLogDir 'error.log')) }
    try { $taskHealth=Invoke-RestMethod "$taskUrl/health" -TimeoutSec 1; if ($taskHealth.app -eq 'rift-protocol') {$taskReady=$true; break} } catch {}
  }
  if (-not $taskReady) { throw '서버가 준비되지 않았습니다.' }
  Start-Process $taskUrl
  Write-Host "`n짭로란트 실행 중: $taskUrl"
  Get-Content -LiteralPath (Join-Path $taskLogDir 'server.log')
  Write-Host "`n친구는 같은 Wi-Fi에서 위 LAN 주소를 열고 같은 방 코드를 입력하세요."
  Write-Host '게임 서버를 끝내려면 Enter를 누르세요.'
  Read-Host | Out-Null
} finally {
  $taskServer.Refresh()
  if (-not $taskServer.HasExited) { Stop-Process -Id $taskServer.Id }
}
