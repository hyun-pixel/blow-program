param([switch]$InstallShortcut, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$taskAdminRoot = $PSScriptRoot
$taskRepoRoot = (Resolve-Path (Join-Path $taskAdminRoot '../..')).Path
$taskAdminUrl = 'http://127.0.0.1:4174/'

if ($InstallShortcut) {
    $taskDesktop = [Environment]::GetFolderPath('Desktop')
    $taskShortcutPath = Join-Path $taskDesktop 'BLOW 관리자.lnk'
    if (Test-Path -LiteralPath $taskShortcutPath) { throw '바탕화면에 BLOW 관리자 바로가기가 이미 있습니다. 기존 연결을 먼저 확인해 주세요.' }
    $taskPowerShell = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $taskShell = New-Object -ComObject WScript.Shell
    $taskShortcut = $taskShell.CreateShortcut($taskShortcutPath)
    $taskShortcut.TargetPath = $taskPowerShell
    $taskShortcut.Arguments = '-NoProfile -WindowStyle Hidden -File "' + $PSCommandPath + '"'
    $taskShortcut.WorkingDirectory = $taskAdminRoot
    $taskShortcut.Description = 'BLOW 관리자 서버를 시작하고 관리자 페이지를 엽니다.'
    $taskIcon = Join-Path $taskRepoRoot 'apps/desktop/release/.icon-ico/icon.ico'
    if (Test-Path -LiteralPath $taskIcon) { $taskShortcut.IconLocation = $taskIcon + ',0' }
    $taskShortcut.Save()
    Write-Output $taskShortcutPath
    exit 0
}

$taskMutex = New-Object System.Threading.Mutex($false, 'Local\BLOWAdminLauncher4174')
$taskLockHeld = $false
try {
    $taskLockHeld = $taskMutex.WaitOne(0)
    if (-not $taskLockHeld) { exit 0 }

    $taskListener = @(Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue)
    if ($taskListener.Count -eq 0) {
        $taskNode = (Get-Command node -ErrorAction Stop).Source
        $taskVite = Join-Path $taskRepoRoot 'node_modules/vite/bin/vite.js'
        if (-not (Test-Path -LiteralPath $taskVite)) { throw '관리자 실행에 필요한 파일이 없습니다. 프로젝트 폴더를 옮기거나 삭제했는지 확인해 주세요.' }
        if (-not (Test-Path -LiteralPath (Join-Path $taskAdminRoot 'dist/index.html'))) { throw '관리자 실행 파일이 준비되지 않았습니다. 관리자 화면을 먼저 빌드해야 합니다.' }
        $taskLogDir = Join-Path $taskAdminRoot '.local'
        New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
        $taskServer = Start-Process -FilePath $taskNode -ArgumentList @(('"' + $taskVite + '"'), 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort') -WorkingDirectory $taskAdminRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogDir 'admin-stdout.log') -RedirectStandardError (Join-Path $taskLogDir 'admin-stderr.log') -PassThru
    }

    $taskReady = $false
    $taskDeadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        try {
            $taskResponse = Invoke-WebRequest -Uri $taskAdminUrl -UseBasicParsing -TimeoutSec 2
            if ($taskResponse.Content -notmatch 'name="blow-admin-launcher" content="local-admin-v1"') {
                throw 'PORT_IN_USE'
            }
            $taskReady = $true
        } catch {
            if ($_.Exception.Message -eq 'PORT_IN_USE') { throw '4174 포트에 다른 화면 또는 이전 관리자 서버가 실행 중입니다. 기존 관리자 서버를 종료한 뒤 다시 실행해 주세요.' }
            if ($taskListener.Count -gt 0) { throw '기존 관리자 서버가 응답하지 않습니다. 잠시 후 다시 실행해 주세요.' }
            if ($taskServer.HasExited) { throw '관리자 서버가 시작되지 않았습니다. apps/admin-web/.local의 실행 기록을 확인해 주세요.' }
            Start-Sleep -Milliseconds 300
        }
    } while (-not $taskReady -and [DateTime]::UtcNow -lt $taskDeadline)
    if (-not $taskReady) { throw '관리자 화면 준비 시간이 초과되었습니다. 잠시 후 다시 실행해 주세요.' }
    if (-not $NoBrowser) { Start-Process $taskAdminUrl }
    Write-Output 'BLOW admin is ready at http://127.0.0.1:4174/'
} catch {
    if ($NoBrowser) { throw }
    $taskShell = New-Object -ComObject WScript.Shell
    $null = $taskShell.Popup($_.Exception.Message, 0, 'BLOW 관리자 실행', 16)
    exit 1
} finally {
    if ($taskLockHeld) { $taskMutex.ReleaseMutex() }
    $taskMutex.Dispose()
}
