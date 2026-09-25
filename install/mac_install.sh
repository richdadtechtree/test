#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 제갈량 상소문 — macOS 예약 등록 (launchd)
#   매일 06:55에 시작 → 글을 미리 써 두고 → 07:00에 창을 띄웁니다.
#   맥이 잠자기 중이었다면 깨어난 뒤 실행됩니다. (완전히 꺼져 있었다면 그날은 건너뜁니다)
#
# 실행: 터미널에서  bash install/mac_install.sh
# 해제: bash install/mac_install.sh --uninstall
# ─────────────────────────────────────────────────────────────
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.sangso.zhugeliang"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"; echo "예약을 해제했습니다."; exit 0
fi

PY="$(command -v python3 || true)"
[[ -z "$PY" ]] && { echo "python3를 찾지 못했습니다. 터미널에서 xcode-select --install 을 실행하세요."; exit 1; }

# ⚠ macOS 보안(TCC): 데스크탑·문서·다운로드 폴더는 예약 작업이 읽지 못하게 막혀 있습니다.
case "$ROOT" in
  "$HOME/Desktop"*|"$HOME/Documents"*|"$HOME/Downloads"*)
    echo "⚠ 이 폴더($ROOT)는 macOS가 예약 작업의 접근을 막는 위치입니다."
    echo "  폴더를 홈 바로 아래(예: ~/sangso)로 옮긴 뒤 다시 실행하세요."; exit 1;;
esac

command -v claude >/dev/null || echo "주의: 'claude' 명령을 찾지 못했습니다. 클로드코드 설치·로그인 여부를 확인하세요."

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"
# launchd는 PATH가 아주 짧아서 claude를 못 찾습니다 → 지금 터미널의 PATH를 그대로 넘겨줍니다.
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$PY</string><string>$ROOT/sangso.py</string><string>--scheduled</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>55</integer></dict>
  <key>StandardOutPath</key><string>$ROOT/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/launchd.err.log</string>
</dict></plist>
PLIST

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "등록 완료! 매일 06:55에 글을 쓰기 시작해 07:00에 창이 뜹니다."
echo "지금 바로 시험:  launchctl kickstart gui/$(id -u)/$LABEL"
echo "문제가 생기면:   $ROOT/logs/sangso.log"
