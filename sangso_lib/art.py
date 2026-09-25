"""
art.py — 조회 장면의 '그림'을 준비하는 곳

우선순위 (위에서부터 먼저 있는 것을 씁니다)
  1) assets/court.jpg (또는 .png/.webp)   ← 내가 직접 만든 그림 (힉스필드·ChatGPT·미드저니 등)
     assets/portrait.jpg (또는 .png/.webp) ← 대화창 초상화
  2) assets/court_auto.jpg, portrait_auto.jpg ← 이 프로그램이 무료 이미지 생성 서비스에서 받아 둔 그림
  3) 둘 다 없으면 → templates/court.js 가 코드로 그린 그림

자동 그림은 Pollinations(https://pollinations.ai)라는, 가입 없이 쓰는 무료 이미지 생성 서비스에서
처음 한 번만 받아 저장합니다. 매일 새로 받지 않으므로 아침 창이 늦어지지 않습니다.

디버깅 힌트
  - 그림이 안 바뀐다 → logs/sangso.log 에서 '그림' 으로 검색하세요.
  - 무료 서비스라 가끔 느리거나 막힐 수 있습니다. 실패하면 하루 뒤에 다시 시도하고, 그동안은 코드 그림을 씁니다.
  - 마음에 안 들면: python sangso.py --new-art  (config.json 의 art_seed 를 바꿔 다시 뽑습니다)
"""

from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from pathlib import Path

log = logging.getLogger("sangso")

EXTS = (".jpg", ".jpeg", ".png", ".webp")

# 그림 주문서(프롬프트). 영어가 이미지 모델에 가장 잘 통합니다.
COURT_PROMPT = (
    "Masterpiece digital painting, official key art of a premium historical strategy game, "
    "Three Kingdoms era China, grand throne hall of the Shu Han chancellor's palace. "
    "Zhuge Liang stands at the center on a raised stone dais in front of a huge gilded folding screen "
    "painted with ink mountains, wearing a flowing white crane-feather robe with dark navy trim and a black silk guanjin headscarf, "
    "holding a white crane-feather fan, calm and wise, long thin black beard. "
    "Many court officials in richly colored Han dynasty robes and black official hats kneel and bow deeply, prostrate on the floor, "
    "in orderly rows on both sides of a long red carpet leading to the dais, seen from behind. "
    "Towering red lacquered pillars with golden brackets, hanging red palace lanterns, polished dark stone floor with reflections, "
    "warm golden sunlight streaming through lattice windows, drifting incense smoke. "
    "Symmetrical one-point perspective, wide cinematic 16:9 composition, highly detailed, dramatic warm lighting, "
    "painterly brush texture, no text, no watermark, no letters"
)
PORTRAIT_PROMPT = (
    "Masterpiece character portrait, bust shot of Zhuge Liang the legendary Three Kingdoms strategist, "
    "wise gentle face, calm intelligent eyes, long thin black beard and mustache, black silk guanjin headscarf, "
    "white robe with dark navy collar, holding a white crane-feather fan near the chest, "
    "premium historical strategy game character art, detailed digital painting, soft rim light, "
    "dark warm brown background, facing the viewer, no text, no watermark"
)

URL = "https://image.pollinations.ai/prompt/{prompt}?width={w}&height={h}&seed={seed}&nologo=true&enhance=false&model=flux"


def find(assets: Path, name: str) -> Path | None:
    """사용자 그림(name.*)이 있으면 그것, 없으면 자동 그림(name_auto.jpg)."""
    for ext in EXTS:
        if (assets / f"{name}{ext}").is_file():
            return assets / f"{name}{ext}"
    auto = assets / f"{name}_auto.jpg"
    return auto if auto.is_file() else None


def _download(prompt: str, w: int, h: int, seed: int, dest: Path) -> bool:
    url = URL.format(prompt=urllib.parse.quote(prompt), w=w, h=h, seed=seed)
    req = urllib.request.Request(url, headers={"User-Agent": "zhuge-sangso/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            ctype = r.headers.get("Content-Type", "")
            body = r.read()
    except OSError as e:  # 인터넷 끊김, 시간 초과, 서비스 오류 등
        log.warning("그림 받기 실패 (%s): %s", dest.name, e)
        return False
    # 오류 안내문(HTML/JSON)을 그림으로 착각해 저장하지 않도록 확인합니다
    if not ctype.startswith("image/") or len(body) < 20_000:
        log.warning("그림이 아닌 응답을 받았습니다 (%s, %d바이트)", ctype, len(body))
        return False
    dest.write_bytes(body)
    log.info("그림 저장: %s (%d KB)", dest, len(body) // 1024)
    return True


def ensure(base: Path, cfg: dict, force: bool = False) -> None:
    """자동 그림이 없으면 받아 둡니다. 실패해도 프로그램은 계속 진행합니다."""
    if not cfg.get("auto_art", True):
        return
    assets = base / "assets"
    assets.mkdir(exist_ok=True)
    stamp = assets / ".art_attempt.json"
    try:
        last = json.loads(stamp.read_text(encoding="utf-8")).get("t", 0)
    except (OSError, ValueError):
        last = 0
    missing = [n for n in ("court", "portrait") if force or not find(assets, n)]
    if not missing:
        return
    if not force and time.time() - last < 24 * 3600:
        return  # 실패한 지 하루가 안 됐으면 기다립니다 (매일 아침을 느리게 만들지 않도록)
    stamp.write_text(json.dumps({"t": time.time()}), encoding="utf-8")

    seed = int(cfg.get("art_seed", 1234))
    log.info("그림을 받아 옵니다 (처음 한 번, 1~3분)…")
    if "court" in missing:
        _download(COURT_PROMPT, 1600, 900, seed, assets / "court_auto.jpg")
    if "portrait" in missing:
        _download(PORTRAIT_PROMPT, 512, 600, seed + 7, assets / "portrait_auto.jpg")
