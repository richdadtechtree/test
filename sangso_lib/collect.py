"""
collect.py — 제갈량이 읽을 '주공에 대한 기록'을 모으는 곳

세 군데에서 재료를 모읍니다.
  1) profile.md                : 사용자가 직접 적는 나에 대한 기록 (가장 중요)
  2) 클로드코드 대화 기록       : ~/.claude/projects/**/*.jsonl  (내 컴퓨터에 자동 저장됨)
  3) claude.ai 대화 내보내기    : data/ 폴더에 넣은 conversations.json (선택)

⚠ 기록 파일의 형식은 클로드코드 버전에 따라 조금씩 바뀔 수 있습니다.
   그래서 모든 읽기를 try/except로 감싸서, 한 파일이 이상해도 전체가 멈추지 않게 했습니다.
   "대화 기록이 0건"으로 나온다면 → logs/sangso.log 를 열어 어떤 파일을 읽었는지 확인하세요.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

log = logging.getLogger("sangso")

# 사용자가 입력한 문장이 아니라 클로드코드가 내부적으로 끼워 넣는 메시지들.
# 이런 건 '주공의 고민'이 아니므로 걸러냅니다.
_NOISE_PREFIXES = (
    "<command-", "<local-command", "Caveat:", "<system-reminder",
    "[Request interrupted", "<bash-", "<user-prompt-submit-hook",
)

MAX_MSG_CHARS = 600  # 메시지 하나가 너무 길면(코드 붙여넣기 등) 앞부분만 사용


def _clip(text: str, limit: int = MAX_MSG_CHARS) -> str:
    text = " ".join(text.split())  # 줄바꿈·연속 공백을 한 칸으로
    return text if len(text) <= limit else text[:limit] + "…"


def _parse_time(value) -> datetime | None:
    """ISO 문자열 또는 밀리초 숫자를 datetime(UTC)으로 바꿉니다. 실패하면 None."""
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, OSError):
        pass
    return None


def _text_from_content(content) -> str:
    """메시지 content가 문자열일 수도, 블록 목록일 수도 있어서 둘 다 처리합니다.
    tool_result(도구 실행 결과) 블록은 사용자가 쓴 말이 아니므로 버립니다."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [b.get("text", "") for b in content
                 if isinstance(b, dict) and b.get("type") == "text"]
        return "\n".join(p for p in parts if p)
    return ""


# ──────────────────────────────────────────────────────────────
# 1) profile.md
# ──────────────────────────────────────────────────────────────
def read_profile(base: Path) -> str:
    path = base / "profile.md"
    if not path.exists():
        # 첫 실행: 견본을 복사해 둡니다. profile.md는 개인 기록이라 git에 올라가지 않습니다(.gitignore).
        example = base / "profile.example.md"
        if not example.exists():
            return "(profile.md 없음)"
        path.write_text(example.read_text(encoding="utf-8"), encoding="utf-8")
        log.info("profile.md 를 새로 만들었습니다. 내용을 채워 주세요: %s", path)
    return path.read_text(encoding="utf-8")


# ──────────────────────────────────────────────────────────────
# 2) 클로드코드 대화 기록
# ──────────────────────────────────────────────────────────────
def claude_home() -> Path:
    # CLAUDE_CONFIG_DIR 환경변수로 위치를 바꾼 사람도 있으므로 먼저 확인
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def read_claude_code_history(days: int, budget: int) -> list[dict]:
    """최근 `days`일 동안 내가 클로드코드에 입력한 문장들을 최신순으로 모읍니다."""
    root = claude_home() / "projects"
    if not root.exists():
        log.info("클로드코드 기록 폴더 없음: %s", root)
        return []

    since = datetime.now(timezone.utc) - timedelta(days=days)
    items: list[dict] = []

    # 최근에 수정된 파일부터 읽으면 예산 안에 최신 대화가 먼저 들어갑니다.
    files = sorted(root.glob("*/*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    for f in files:
        if datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc) < since:
            break  # 이후 파일은 모두 더 오래됨
        try:
            with f.open(encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if rec.get("type") != "user" or rec.get("isMeta"):
                        continue
                    text = _text_from_content((rec.get("message") or {}).get("content")).strip()
                    if not text or text.startswith(_NOISE_PREFIXES):
                        continue
                    ts = _parse_time(rec.get("timestamp"))
                    if ts and ts < since:
                        continue
                    project = Path(rec.get("cwd") or f.parent.name).name
                    items.append({"when": ts, "where": f"클로드코드/{project}", "text": _clip(text)})
        except OSError as e:
            log.warning("기록 파일을 읽지 못함 %s: %s", f, e)

    return _newest_within_budget(items, budget)


# ──────────────────────────────────────────────────────────────
# 3) claude.ai 대화 내보내기 (conversations.json)
# ──────────────────────────────────────────────────────────────
def read_claude_ai_export(base: Path, budget: int) -> list[dict]:
    """claude.ai 설정 → 개인정보 → 데이터 내보내기로 받은 zip 안의
    conversations.json 을 data/ 폴더에 넣어두면 읽습니다."""
    items: list[dict] = []
    for path in (base / "data").glob("**/conversations*.json"):
        try:
            convs = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            log.warning("내보내기 파일을 읽지 못함 %s: %s", path, e)
            continue
        for conv in convs if isinstance(convs, list) else []:
            title = conv.get("name") or "제목 없음"
            for m in conv.get("chat_messages") or []:
                if m.get("sender") != "human":
                    continue
                text = (m.get("text") or _text_from_content(m.get("content"))).strip()
                if text:
                    items.append({"when": _parse_time(m.get("created_at")),
                                  "where": f"claude.ai/{title}", "text": _clip(text)})
    return _newest_within_budget(items, budget)


def _newest_within_budget(items: list[dict], budget: int) -> list[dict]:
    """최신순으로 정렬한 뒤, 글자 수 예산을 넘기 전까지만 담습니다."""
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    items.sort(key=lambda x: x["when"] or epoch, reverse=True)
    out, used = [], 0
    for it in items:
        used += len(it["text"]) + 40
        if used > budget:
            break
        out.append(it)
    return out


def format_items(items: list[dict]) -> str:
    if not items:
        return "(기록 없음)"
    lines = []
    for it in items:
        when = it["when"].astimezone().strftime("%m-%d %H:%M") if it["when"] else "날짜미상"
        lines.append(f"- [{when} · {it['where']}] {it['text']}")
    return "\n".join(lines)


# ──────────────────────────────────────────────────────────────
# 4) 지난 상소문 (같은 말 반복 방지 + 어제 군령 점검용)
# ──────────────────────────────────────────────────────────────
def read_recent_sangso(archive: Path, n: int = 5) -> str:
    files = sorted(archive.glob("*.json"), reverse=True)[:n]
    lines = []
    for f in files:
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        tasks = d.get("today_task") or {}
        subs = [s.get("subtitle", "") for part in ("part1", "part2")
                for s in (d.get(part) or {}).get("sections", [])]
        lines.append(f"- {f.stem}: 제목「{d.get('title','')}」 / 소제목: {', '.join(subs)} / "
                     f"군령: {tasks.get('claude_code','')} | {tasks.get('life','')} / "
                     f"한 구절: {(d.get('motto') or {}).get('hanja','')}")
    return "\n".join(lines) or "(지난 상소 없음 — 오늘이 첫 상소)"
