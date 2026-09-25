# ─────────────────────────────────────────────────────────────
# 제갈량 상소문 — 윈도우 예약 작업 등록
#   매일 06:55에 시작 → 글을 미리 써 두고 → 07:00에 창을 띄웁니다.
#   컴퓨터가 꺼져 있었다면, 켜진 뒤 가장 먼저 한 번 실행됩니다(StartWhenAvailable).
#
# 실행: 이 폴더의 install_windows.bat 을 더블클릭
# 해제: install_windows.bat -Uninstall   (또는 작업 스케줄러에서 ZhugeLiangSangso 삭제)
# ─────────────────────────────────────────────────────────────
param([switch]$Uninstall)
$ErrorActionPreference = "Stop"
$TaskName = "ZhugeLiangSangso"
$Root = Split-Path -Parent $PSScriptRoot

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "예약을 해제했습니다." -ForegroundColor Green
    exit 0
}

# 1) 실제 파이썬 위치 찾기 (py 런처 → python 순서)
#    'python'이 마이크로소프트 스토어로 연결되는 가짜 바로가기일 수 있어서, 실제로 실행해 경로를 받아옵니다.
$exe = $null
foreach ($cmd in @("py", "python")) {
    try {
        $args_ = if ($cmd -eq "py") { @("-3", "-c", "import sys;print(sys.executable)") } else { @("-c", "import sys;print(sys.executable)") }
        $out = & $cmd @args_ 2>$null
        if ($LASTEXITCODE -eq 0 -and $out -and (Test-Path $out)) { $exe = $out.Trim(); break }
    } catch {}
}
if (-not $exe) { throw "파이썬을 찾지 못했습니다. https://www.python.org 에서 설치할 때 'Add python.exe to PATH'를 꼭 체크하세요." }

# pythonw.exe = 검은 콘솔 창 없이 실행되는 파이썬
$pyw = Join-Path (Split-Path $exe) "pythonw.exe"
if (-not (Test-Path $pyw)) { $pyw = $exe }
Write-Host "파이썬: $pyw"

# 2) claude 명령이 있는지 미리 확인 (없으면 API 키 방식으로만 동작)
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "주의: 'claude' 명령을 찾지 못했습니다. 클로드코드를 설치·로그인했는지 확인하거나 config.json의 claude_cli_path에 경로를 적으세요." -ForegroundColor Yellow
}

# 3) 예약 작업 등록
$action   = New-ScheduledTaskAction -Execute $pyw -Argument "`"$Root\sangso.py`" --scheduled" -WorkingDirectory $Root
$trigger  = New-ScheduledTaskTrigger -Daily -At "06:55"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "매일 아침 제갈량이 올리는 상소문" -Force | Out-Null

Write-Host ""
Write-Host "등록 완료! 매일 06:55에 글을 쓰기 시작해 07:00에 창이 뜹니다." -ForegroundColor Green
Write-Host "지금 바로 시험해 보려면:  schtasks /run /tn $TaskName"
Write-Host "문제가 생기면 이 파일을 여세요: $Root\logs\sangso.log"
