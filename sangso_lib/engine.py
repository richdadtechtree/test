"""
engine.py — 실제로 Claude에게 글을 써 달라고 요청하는 곳

두 가지 방법(엔진)이 있습니다.
  • claude-cli : 이미 설치·로그인된 클로드코드를 `claude -p`(한 번 묻고 답 받기 모드)로 부릅니다.
                 구독 요금제 안에서 동작하므로 API 키가 필요 없습니다.  ← 기본값
  • api        : Anthropic API를 공식 파이썬 SDK로 직접 호출합니다.
                 `pip install anthropic` + ANTHROPIC_API_KEY 환경변수가 필요하고, 사용량만큼 과금됩니다.

디버깅 힌트
  - "claude 실행 파일을 찾지 못했습니다" → config.json 의 claude_cli_path 에 전체 경로를 적으세요.
    (예약 작업은 터미널과 PATH가 달라서, 터미널에선 되는데 7시에만 실패하는 일이 흔합니다.)
  - "JSON을 찾지 못했습니다" → logs/ 폴더의 raw_*.txt 에 Claude가 실제로 뭐라고 답했는지 저장됩니다.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("sangso")


class EngineError(RuntimeError):
    pass


# ──────────────────────────────────────────────────────────────
# claude -p
# ──────────────────────────────────────────────────────────────
def find_claude(configured: str = "") -> str | None:
    if configured and Path(configured).exists():
        return configured
    found = shutil.which("claude")
    if found:
        return found
    # 예약 작업 환경에서는 PATH가 짧아서 못 찾는 경우가 많아, 흔한 설치 위치를 직접 뒤집니다.
    home = Path.home()
    candidates = [
        home / ".local/bin/claude", home / ".claude/local/claude",
        Path("/opt/homebrew/bin/claude"), Path("/usr/local/bin/claude"),
        home / ".local/bin/claude.exe",
        Path(os.environ.get("APPDATA", "")) / "npm/claude.cmd",
    ]
    return next((str(c) for c in candidates if c.is_file()), None)


def call_claude_cli(system: str, user: str, cfg: dict, cwd: Path) -> str:
    exe = find_claude(cfg.get("claude_cli_path", ""))
    if not exe:
        raise EngineError("claude 실행 파일을 찾지 못했습니다 (config.json의 claude_cli_path 확인)")

    cmd = [exe, "-p"]
    if cfg.get("claude_cli_model"):
        cmd += ["--model", cfg["claude_cli_model"]]

    log.info("claude -p 호출 중… (보통 1~4분 걸립니다)")
    # 지시문은 명령줄 인자 대신 표준입력(stdin)으로 통째로 넘깁니다.
    # 윈도우의 claude.cmd는 인자 속 줄바꿈을 망가뜨리고, 명령줄 길이 제한(약 8천 자)도 있기 때문입니다.
    proc = subprocess.run(
        cmd, input=f"{system}\n\n────────\n\n{user}", capture_output=True, text=True, encoding="utf-8",
        errors="replace", cwd=str(cwd), timeout=20 * 60,
        # 윈도우에서 검은 콘솔 창이 번쩍 뜨지 않게 합니다.
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if proc.returncode != 0:
        raise EngineError(f"claude -p 실패 (코드 {proc.returncode}): {proc.stderr.strip()[:500]}")
    return proc.stdout


# ──────────────────────────────────────────────────────────────
# Anthropic API (공식 SDK)
# ──────────────────────────────────────────────────────────────
def call_api(system: str, user: str, cfg: dict) -> str:
    try:
        import anthropic  # 필요할 때만 불러옵니다(설치 안 해도 claude-cli 엔진은 동작)
    except ImportError as e:
        raise EngineError("anthropic 패키지가 없습니다: pip install anthropic") from e

    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수를 자동으로 읽습니다
    log.info("API 호출 중… 모델=%s", cfg["api_model"])
    try:
        # 5천 자 이상의 긴 글이라 스트리밍으로 받아야 시간 초과가 나지 않습니다.
        # fallbacks="default": 안전 필터가 드물게 거절하면 서버가 다른 모델로 자동 재시도합니다.
        with client.beta.messages.stream(
            model=cfg["api_model"],
            max_tokens=32000,
            system=system,
            messages=[{"role": "user", "content": user}],
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise EngineError("API 키가 올바르지 않습니다 (ANTHROPIC_API_KEY 확인)") from e
    except anthropic.RateLimitError as e:
        raise EngineError("API 사용 한도 초과 — 잠시 후 다시 시도하세요") from e
    except anthropic.APIStatusError as e:
        raise EngineError(f"API 오류 {e.status_code}: {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise EngineError("인터넷 연결을 확인하세요") from e

    if msg.stop_reason == "refusal":
        raise EngineError("모델이 요청을 거절했습니다")
    return "".join(b.text for b in msg.content if b.type == "text")


# ──────────────────────────────────────────────────────────────
# 응답 → JSON
# ──────────────────────────────────────────────────────────────
def parse_json(raw: str) -> dict:
    """모델이 JSON 앞뒤에 말을 덧붙이거나 ```json 으로 감싸도 본문만 꺼냅니다."""
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        raise EngineError("응답에서 JSON을 찾지 못했습니다")
    try:
        data = json.loads(raw[start:end + 1])
    except json.JSONDecodeError as e:
        raise EngineError(f"JSON 형식 오류: {e}") from e
    for key in ("title", "part1", "part2"):
        if key not in data:
            raise EngineError(f"JSON에 '{key}' 항목이 없습니다")
    return data


def count_chars(part: dict) -> int:
    """공백·줄바꿈을 뺀 글자 수 (원고 분량을 가장 엄격하게 세는 방식)"""
    text = "".join(s.get("subtitle", "") + "".join(s.get("paragraphs", []))
                   for s in (part or {}).get("sections", []))
    return len(re.sub(r"\s", "", text))


def generate(system: str, user: str, cfg: dict, workdir: Path, logdir: Path) -> dict:
    """엔진을 골라 호출하고, 분량이 모자라면 한 번 더 요청합니다."""
    engine = cfg.get("engine", "auto")
    order = {"auto": ["claude-cli", "api"], "claude-cli": ["claude-cli"], "api": ["api"]}.get(engine, ["claude-cli"])
    min1, min2 = cfg["min_chars_part1"], cfg["min_chars_part2"]

    errors = []
    for name in order:
        best, prompt = None, user
        for attempt in (1, 2):
            try:
                raw = call_claude_cli(system, prompt, cfg, workdir) if name == "claude-cli" \
                    else call_api(system, prompt, cfg)
                (logdir / f"raw_{name}_{attempt}.txt").write_text(raw, encoding="utf-8")
                data = parse_json(raw)
            except (EngineError, subprocess.TimeoutExpired, OSError) as e:
                log.warning("[%s] %d차 시도 실패: %s", name, attempt, e)
                errors.append(f"{name}: {e}")
                if attempt == 1 and isinstance(e, EngineError) and "JSON" in str(e):
                    continue  # 형식만 틀린 거라면 한 번 더
                break

            c1, c2 = count_chars(data["part1"]), count_chars(data["part2"])
            log.info("[%s] %d차: 제1장 %d자, 제2장 %d자", name, attempt, c1, c2)
            if best is None or c1 + c2 > best[1] + best[2]:
                best = (data, c1, c2)
            if c1 >= min1 and c2 >= min2:
                return data
            # 분량 부족 → 이유를 알려주고 다시 쓰게 합니다.
            prompt = user + (f"\n\n[재요청] 앞서 쓴 초안은 제1장 {c1}자, 제2장 {c2}자로 분량이 모자랐습니다. "
                             f"공백 제외 제1장 {min1}자, 제2장 {min2}자를 넉넉히 넘기도록 소제목을 늘리고 "
                             f"구체적인 예시와 실행 방법을 더해 처음부터 다시 쓰십시오.")
        if best:
            log.warning("분량이 목표에 못 미쳤지만 가장 긴 초안을 사용합니다")
            return best[0]
    raise EngineError(" / ".join(errors) or "모든 엔진 실패")
