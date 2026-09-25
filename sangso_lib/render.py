"""
render.py — Claude가 써 준 JSON을 두루마리 모양 HTML로 바꾸고, 창으로 띄우는 곳

• HTML 모양은 templates/sangso.html 에 있습니다. 디자인은 그 파일만 고치면 됩니다.
• Claude가 쓴 글은 모두 html.escape 로 '글자 그대로' 넣습니다.
  (글 속에 <script> 같은 문자가 섞여도 코드로 실행되지 않게 하는 안전장치)
"""

from __future__ import annotations

import html
import json
import logging
import os
import platform
import shutil
import subprocess
import webbrowser
from datetime import date
from pathlib import Path
from string import Template

from . import art
from .engine import count_chars

log = logging.getLogger("sangso")

STEMS, BRANCHES = "甲乙丙丁戊己庚辛壬癸", "子丑寅卯辰巳午未申酉戌亥"


def ganji(d: date) -> str:
    """연도의 간지(예: 2026 → 丙午年)와 계절 한 글자"""
    y = d.year - 4
    season = "冬春春春夏夏夏秋秋秋冬冬"[d.month - 1]
    return f"{STEMS[y % 10]}{BRANCHES[y % 12]}年 {season}"


def _esc(s) -> str:
    return html.escape(str(s or ""))


def _body(part: dict) -> str:
    out = []
    for sec in (part or {}).get("sections", []):
        if sec.get("subtitle"):
            out.append(f"<h3>{_esc(sec['subtitle'])}</h3>")
        out += [f"<p>{_esc(p)}</p>" for p in sec.get("paragraphs", []) if str(p).strip()]
    return "\n      ".join(out)


def render(data: dict, day: date, out_dir: Path, template: Path, engine_label: str,
           notice: str = "", filename: str | None = None, bubble: tuple = (50, 50),
           reply_slots: list | None = None) -> Path:
    """filename을 주면(견본·임시본) 그 이름으로 저장하고, 지난 상소의 링크는 건드리지 않습니다."""
    c1, c2 = count_chars(data.get("part1")), count_chars(data.get("part2"))
    tasks, motto = data.get("today_task") or {}, data.get("motto") or {}

    # 앞뒤 날짜의 상소 파일이 있으면 '지난/다음 상소' 버튼을 켭니다
    days = sorted(p.stem for p in out_dir.glob("????-??-??.html"))
    iso = day.isoformat()
    prev = [d for d in days if d < iso]
    nxt = [d for d in days if d > iso]

    weekday = "월화수목금토일"[day.weekday()]
    # 조회 대화: 예전 상소(이 기능 이전)에는 없으므로 한 구절과 기본 대답으로 대신합니다
    c = data.get("court") or {}
    one_liner = c.get("saying") or data.get("one_liner") or motto.get("meaning") or ""
    idiom = c.get("idiom") or {"hanja": motto.get("hanja", ""), "reading": motto.get("reading", ""),
                               "meaning": motto.get("meaning", ""), "source": motto.get("source", "")}
    replies = [r for r in (c.get("replies") or []) if isinstance(r, dict) and r.get("text")][:4] or [
        {"who": "장완", "text": "승상의 말씀, 깊이 새기겠사옵니다."},
        {"who": "비의", "text": "주공께서 들으시면 분명 웃으실 것이옵니다."},
        {"who": "강유", "text": "소장, 오늘도 한 걸음 나아가겠나이다!"},
    ]
    court = {"saying": one_liner, "idiom": idiom, "replies": replies, "event": c.get("event", ""),
             # 그림 파일을 쓸 때만 쓰는 자리(화면 %): 말풍선 꼬리가 가리킬 곳, 신하 대답 말풍선 자리 (court.js 참고)
             "art_tip": list(bubble)[:2], "art_slots": reply_slots or []}
    # </script> 같은 문자열이 글에 섞여도 스크립트가 끊기지 않도록 "</" 를 바꿔 둡니다
    court_json = json.dumps(court, ensure_ascii=False).replace("</", "<\\/")
    court_script = (template.parent / "court.js").read_text(encoding="utf-8")

    # 그림 파일이 있으면 코드 그림 대신 사용합니다 (art.py 참고). ?v=… 는 그림을 바꿨을 때 브라우저가 옛 그림을 쓰지 않게 합니다
    def art_url(name: str) -> str:
        f = art.find(out_dir.parent / "assets", name)
        return f"../assets/{f.name}?v={int(f.stat().st_mtime)}" if f else ""
    court_img, portrait_img = art_url("court"), art_url("portrait")
    page = Template(template.read_text(encoding="utf-8")).safe_substitute(
        date_iso=iso,
        date_short=f"{day:%m월 %d일}",
        date_long=f"서기 {day.year}년 {day.month}월 {day.day}일 {weekday}요일",
        ganji=ganji(day),
        title=_esc(data.get("title")),
        salutation=_esc(data.get("salutation")),
        p1_heading=_esc((data.get("part1") or {}).get("heading")),
        p2_heading=_esc((data.get("part2") or {}).get("heading")),
        p1_body=_body(data.get("part1")),
        p2_body=_body(data.get("part2")),
        closing=_esc(data.get("closing")),
        task_cc=_esc(tasks.get("claude_code")),
        task_life=_esc(tasks.get("life")),
        # 구절을 띄어쓰기 단위로 나눠 한 줄(세로 한 칸)씩 세웁니다
        motto_hanja="".join(f"<span>{_esc(w)}</span>" for w in str(motto.get("hanja") or "").split()),
        motto_reading=_esc(motto.get("reading")),
        motto_meaning=_esc(motto.get("meaning")),
        motto_source=_esc(motto.get("source")),
        c1=f"{c1:,}", c2=f"{c2:,}", ctotal=f"{c1 + c2:,}",
        engine=_esc(engine_label),
        notice=_esc(notice),
        one_liner=_esc(one_liner),
        idiom_hanja=_esc(idiom.get("hanja")), idiom_reading=_esc(idiom.get("reading")),
        idiom_meaning=_esc(idiom.get("meaning")), idiom_source=_esc(idiom.get("source")),
        court_json=court_json,
        court_script=court_script,
        court_img=court_img, portrait_img=portrait_img,
        court_mode="has-art" if court_img else "no-art",
        prev_href=f"{prev[-1]}.html" if prev else "#", prev_class="" if prev else "off",
        next_href=f"{nxt[0]}.html" if nxt else "#", next_class="" if nxt else "off",
    )
    out = out_dir / (filename or f"{iso}.html")
    out.write_text(page, encoding="utf-8")

    # 어제 파일의 '다음 상소' 버튼이 오늘을 가리키도록, 어제 것을 가볍게 갱신
    if prev and not filename:
        p = out_dir / f"{prev[-1]}.html"
        txt = p.read_text(encoding="utf-8")
        if 'class="off">다음 상소' in txt:
            p.write_text(txt.replace('<a href="#" class="off">다음 상소',
                                     f'<a href="{iso}.html" class="">다음 상소'), encoding="utf-8")
    return out


# ──────────────────────────────────────────────────────────────
# 창 띄우기
# ──────────────────────────────────────────────────────────────
def _app_browser() -> str | None:
    """크롬/엣지를 찾으면 주소창 없는 '앱 창'으로 띄울 수 있습니다."""
    system = platform.system()
    if system == "Windows":
        roots = [os.environ.get(k, "") for k in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")]
        cands = [Path(r) / sub for r in roots if r for sub in (
            "Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe")]
    elif system == "Darwin":
        cands = [Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                 Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
                 Path("/Applications/Chromium.app/Contents/MacOS/Chromium")]
    else:
        cands = [Path(p) for n in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge")
                 if (p := shutil.which(n))]
    return next((str(c) for c in cands if c.is_file()), None)


def open_window(path: Path) -> None:
    url = path.resolve().as_uri()
    exe = _app_browser()
    if exe:
        try:
            subprocess.Popen([exe, f"--app={url}", "--window-size=1000,1150", "--new-window"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info("앱 창으로 열었습니다: %s", url)
            return
        except OSError as e:
            log.warning("앱 창 실패, 기본 브라우저로 엽니다: %s", e)
    webbrowser.open(url)
