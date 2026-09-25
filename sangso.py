#!/usr/bin/env python3
"""
제갈량 상소문 — 매일 아침, 승상 제갈량이 주공(나)께 올리는 조언

사용법 (터미널에서 이 폴더로 이동한 뒤)
  python sangso.py              오늘 상소가 없으면 새로 쓰고, 창으로 띄웁니다
  python sangso.py --force      이미 있어도 새로 씁니다
  python sangso.py --scheduled  예약 작업용: 글을 미리 써 두고 config.json의 show_at(07:00)까지 기다렸다 띄웁니다
  python sangso.py --sample     Claude를 부르지 않고 견본 상소를 띄웁니다 (디자인 확인용)
  python sangso.py --no-open    창을 띄우지 않고 파일만 만듭니다
  python sangso.py --redraw     Claude를 부르지 않고, 지난 상소들을 지금 디자인으로 다시 그립니다

문제가 생기면 logs/sangso.log 를 먼저 열어 보세요. 무엇이 어디서 실패했는지 적혀 있습니다.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import date, datetime
from pathlib import Path

# 이 파일이 있는 폴더를 기준으로 모든 경로를 잡습니다.
# (예약 작업은 '현재 폴더'가 엉뚱한 곳일 수 있어서 상대 경로를 쓰면 안 됩니다)
BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))

from sangso_lib import collect, engine, prompt, render  # noqa: E402

OUT, ARCHIVE, LOGS = BASE / "output", BASE / "archive", BASE / "logs"
TEMPLATE, SAMPLE = BASE / "templates" / "sangso.html", BASE / "sample" / "first_sangso.json"
log = logging.getLogger("sangso")


def setup_logging() -> None:
    LOGS.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    fh = logging.FileHandler(LOGS / "sangso.log", encoding="utf-8")
    fh.setFormatter(fmt)
    log.addHandler(fh)
    if sys.stdout:  # pythonw(창 없는 실행)에서는 stdout이 없습니다
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        log.addHandler(sh)
    log.setLevel(logging.INFO)


def load_config() -> dict:
    cfg = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
    return {k: v for k, v in cfg.items() if not k.startswith("_")}


def wait_until(hhmm: str) -> None:
    """지금이 hh:mm 이전이면 그때까지 기다립니다. 이미 지났으면(컴퓨터를 늦게 켠 경우) 바로 띄웁니다."""
    h, m = map(int, hhmm.split(":"))
    target = datetime.now().replace(hour=h, minute=m, second=0, microsecond=0)
    secs = (target - datetime.now()).total_seconds()
    if 0 < secs < 3 * 3600:
        log.info("%s까지 %d초 기다립니다", hhmm, secs)
        time.sleep(secs)


def write_today(today: date, cfg: dict) -> tuple[Path, str]:
    """오늘의 상소를 새로 쓰고 (HTML 경로, 엔진 이름)을 돌려줍니다."""
    budget = cfg["max_context_chars"]
    cc_items = collect.read_claude_code_history(cfg["history_days"], budget * 2 // 3)
    ai_items = collect.read_claude_ai_export(BASE, budget // 3)
    log.info("재료: 클로드코드 기록 %d건, claude.ai 기록 %d건", len(cc_items), len(ai_items))

    system, user = prompt.build(
        today,
        nth=len([f for f in ARCHIVE.glob("*.json") if f.stem != today.isoformat()]),
        profile=collect.read_profile(BASE),
        recent=collect.read_recent_sangso(ARCHIVE),
        cc_history=collect.format_items(cc_items),
        ai_history=collect.format_items(ai_items),
        min1=cfg["min_chars_part1"], min2=cfg["min_chars_part2"],
    )
    # 빈 작업 폴더에서 claude -p를 실행해야 엉뚱한 프로젝트 파일을 읽지 않습니다
    work = LOGS / "work"
    work.mkdir(exist_ok=True)
    data = engine.generate(system, user, cfg, work, LOGS)

    (ARCHIVE / f"{today.isoformat()}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    label = {"auto": "클로드 코드", "claude-cli": "클로드 코드", "api": cfg["api_model"]}.get(cfg["engine"], cfg["engine"])
    return render.render(data, today, OUT, TEMPLATE, label), label


def main() -> int:
    ap = argparse.ArgumentParser(description="제갈량 상소문")
    ap.add_argument("--force", action="store_true", help="오늘 상소가 있어도 새로 쓴다")
    ap.add_argument("--scheduled", action="store_true", help="show_at 시각까지 기다렸다가 띄운다")
    ap.add_argument("--sample", action="store_true", help="견본 상소를 띄운다")
    ap.add_argument("--no-open", action="store_true", help="창을 띄우지 않는다")
    ap.add_argument("--redraw", action="store_true", help="지난 상소들을 새 디자인으로 다시 그린다")
    args = ap.parse_args()

    setup_logging()
    for d in (OUT, ARCHIVE):
        d.mkdir(exist_ok=True)
    cfg = load_config()
    today = date.today()
    today_html = OUT / f"{today.isoformat()}.html"

    if args.redraw:
        # 날짜 순서대로 다시 그려야 '지난/다음 상소' 링크가 맞게 이어집니다
        for f in sorted(ARCHIVE.glob("????-??-??.json")):
            render.render(json.loads(f.read_text(encoding="utf-8")), date.fromisoformat(f.stem),
                          OUT, TEMPLATE, "클로드 코드")
            log.info("다시 그림: %s", f.stem)
        if not today_html.exists():
            return 0
        page = today_html
    elif args.sample:
        page = render.render(json.loads(SAMPLE.read_text(encoding="utf-8")), today, OUT, TEMPLATE,
                             "견본", notice="견본 상소입니다. 실제 상소는 python sangso.py 로 쓰게 하십시오.",
                             filename="sample.html")
    elif today_html.exists() and not args.force:
        log.info("오늘 상소가 이미 있어 그대로 엽니다")
        page = today_html
    else:
        try:
            page, _ = write_today(today, cfg)
        except Exception as e:  # 어떤 이유로든 실패해도 아침 창은 뜨게 합니다
            log.exception("오늘 상소 작성 실패")
            src = max(ARCHIVE.glob("*.json"), default=SAMPLE)
            page = render.render(json.loads(src.read_text(encoding="utf-8")), today, OUT, TEMPLATE,
                                 "지난 상소", notice=f"오늘 상소를 쓰지 못해 지난 상소({src.stem})를 다시 올리옵니다. "
                                                   f"원인: {e} — logs/sangso.log 를 확인하시옵소서.",
                                 filename="_fallback.html")  # 오늘 파일로 저장하지 않아야 다음 실행 때 다시 시도합니다

    log.info("상소 파일: %s", page)
    if args.scheduled:
        wait_until(cfg.get("show_at", "07:00"))
    if not args.no_open:
        render.open_window(page)
    return 0


if __name__ == "__main__":
    sys.exit(main())
