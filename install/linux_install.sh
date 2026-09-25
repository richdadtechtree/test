#!/bin/bash
# 제갈량 상소문 — 리눅스(cron) 등록. 해제: bash install/linux_install.sh --uninstall
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="# zhuge-liang-sangso"
mkdir -p "$ROOT/logs"
crontab -l 2>/dev/null | grep -v "$TAG" > /tmp/sangso_cron || true
if [[ "${1:-}" != "--uninstall" ]]; then
  # cron에는 화면(DISPLAY) 정보가 없어서 창을 띄우려면 직접 넘겨줘야 합니다.
  echo "55 6 * * * cd '$ROOT' && DISPLAY=${DISPLAY:-:0} PATH='$PATH' $(command -v python3) sangso.py --scheduled >> '$ROOT/logs/cron.log' 2>&1 $TAG" >> /tmp/sangso_cron
fi
crontab /tmp/sangso_cron && rm /tmp/sangso_cron
echo "완료. 현재 crontab:"; crontab -l | grep "$TAG" || echo "(등록 없음)"
