"""
art.py — 조회 장면의 '그림 파일'을 찾는 곳

조회 장면은 기본적으로 templates/court.js 가 코드로 그립니다 (조조전 풍 쿼터뷰 + 머리 큰 SD 캐릭터).
그림 파일은 '있으면 대신 쓰는' 선택 사항입니다.

장면 배경 (위에서부터 먼저 있는 것을 씁니다)
  1) assets/court.jpg (또는 .png/.webp)  ← 내가 직접 만든 그림
  2) assets/court_auto.jpg               ← python sangso.py --new-art 로 무료 이미지 서비스에서 뽑은 그림
  3) 없으면 → 코드로 그린 SD 캐릭터 장면 (기본)
  ※ 배경 그림을 쓰면 캐릭터들은 안 보이고 대화창만 움직입니다. 되돌리려면 그 파일을 지우세요.

대화창 초상화 (말하는 사람 얼굴)
  1) assets/portraits/<영문이름>.jpg (또는 .png/.webp) ← 내가 넣은 초상화 (제갈량은 assets/portrait.jpg 도 됨)
  2) assets/portraits/<영문이름>_default.jpg        ← 저장소에 들어 있는 기본 초상화
  3) 없으면 → SD 캐릭터 얼굴을 크게 그려 씁니다
  영문 이름은 아래 CAST_IDS 표를 보세요. 기본 초상화는 Pollinations(https://pollinations.ai)에서
  아래 프롬프트로 시드를 바꿔 여러 장 뽑아 고르고, 오른쪽 아래 워터마크를 잘라 낸 것입니다.

디버깅 힌트
  - 그림이 안 바뀐다 → logs/sangso.log 에서 '그림' 으로 검색하세요.
  - 2026년 9월 현재 무료(가입 없는) 사용자에게는 sana 모델만 열려 있어, model=flux 를 적어도
    sana 그림(1024×576)이 오고 워터마크가 찍힙니다.
"""

from __future__ import annotations

import logging
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
# 대화창 초상화용 주문서: PORTRAIT_BASE 의 {d} 자리에 장수별 설명을 넣습니다
PORTRAIT_BASE = (
    "Masterpiece character portrait, bust shot of {d}, Three Kingdoms era Shu Han, "
    "premium historical strategy game character art, detailed digital painting, soft rim light, "
    "dark warm brown background, facing the viewer, no text, no watermark"
)
# 고른 시드: 장완 12, 비의 12, 동윤 13, 양의 13, 강유 1, 위연 2, 마속 1, 조운 2, 왕평 2, 사마의 11, 제갈량(PORTRAIT_PROMPT) 1
# ('official hat' 이라고 쓰면 현대식 모자가 나와서, 문관은 상투 + 작은 관으로 풀어 썼습니다)
GENERALS = {
    "jiang_wan": "Jiang Wan, calm steady middle-aged ancient Chinese civil minister, gentle reliable face, short neat black beard, hair in a topknot under a small black gauze Han dynasty crown, no brim, deep green hanfu robe with cross collar",
    "fei_yi": "Fei Yi, witty cheerful ancient Chinese civil minister in his thirties, playful smile, thin mustache, hair in a topknot under a small black gauze Han dynasty crown, no brim, sky blue hanfu robe with cross collar",
    "dong_yun": "Dong Yun, strict stern elderly ancient Chinese court official, frowning serious face, long grey beard, grey hair in a topknot under a small black gauze Han dynasty crown, no brim, dark purple hanfu robe with cross collar",
    "jiang_wei": "Jiang Wei, young passionate Chinese general in his twenties, determined bright eyes, clean shaven, silver and blue lamellar armor, red headband",
    "wei_yan": "Wei Yan, fierce hot-tempered Chinese general, bold grin, thick black full beard, tanned skin, dark red lamellar armor with bronze plates",
    "yang_yi": "Yang Yi, fussy sharp-eyed thin middle-aged ancient Chinese court secretary man, narrow suspicious eyes, thin pointed goatee beard, hair in a topknot under a small black gauze Han dynasty crown, no brim, grey brown hanfu robe with cross collar",
    "ma_su": "Ma Su, confident young Chinese strategist scholar, proud smirk, clean shaven, black scholar headscarf, teal Han dynasty robe, holding a scroll",
    "zhao_yun": "Zhao Yun, loyal quiet handsome Chinese general, calm resolute face, white silver armor, white cape, silver helmet with white plume",
    "sima_yi": "Sima Yi, cunning calculating middle-aged ancient Chinese Wei dynasty strategist, cold sharp narrow eyes, faint smirk, thin mustache and pointed goatee, hair in a topknot under a small black gauze Han dynasty crown, no brim, dark purple hanfu robe with cross collar and a grey cape, arms crossed",
    "wang_ping": "Wang Ping, practical weathered veteran Chinese soldier general, rugged face, short stubble beard, brown leather and iron armor, simple helmet",
}
# 한글 이름 → 초상화 파일 이름 (윈도우에서도 탈 없도록 파일 이름은 영문)
CAST_IDS = {
    "제갈량": "zhuge_liang", "장완": "jiang_wan", "비의": "fei_yi", "동윤": "dong_yun", "양의": "yang_yi",
    "마속": "ma_su", "강유": "jiang_wei", "조운": "zhao_yun", "위연": "wei_yan", "왕평": "wang_ping",
    "사마의": "sima_yi",
}
PORTRAIT_PROMPT = (
    "Masterpiece character portrait, bust shot of Zhuge Liang the legendary Three Kingdoms strategist, "
    "wise gentle face, calm intelligent eyes, long thin black beard and mustache, black silk guanjin headscarf, "
    "white robe with dark navy collar, holding a white crane-feather fan near the chest, "
    "premium historical strategy game character art, detailed digital painting, soft rim light, "
    "dark warm brown background, facing the viewer, no text, no watermark"
)

URL = "https://image.pollinations.ai/prompt/{prompt}?width={w}&height={h}&seed={seed}&nologo=true&enhance=false&model=flux"


def find(assets: Path, name: str) -> Path | None:
    """쓸 그림 파일을 우선순위대로 찾습니다: 사용자 그림(name.*) → 자동 그림(name_auto.jpg) → 기본 그림(name_default.jpg).
    하나도 없으면 None → 화면은 코드 그림(court.js)을 씁니다."""
    for ext in EXTS:
        if (assets / f"{name}{ext}").is_file():
            return assets / f"{name}{ext}"
    for suffix in ("_auto", "_default"):
        f = assets / f"{name}{suffix}.jpg"
        if f.is_file():
            return f
    return None


def portrait(assets: Path, who: str) -> Path | None:
    """대화창 초상화. 제갈량은 예전 위치(assets/portrait.*)도 먼저 찾아 봅니다."""
    if who == "제갈량" and (f := find(assets, "portrait")):
        return f
    return find(assets / "portraits", CAST_IDS[who]) if who in CAST_IDS else None


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
    """--new-art 일 때만 배경 그림(과 제갈량 초상화)을 새로 받습니다. 평소엔 아무것도 받지 않습니다.
    (기본 장면은 코드로 그린 SD 캐릭터 장면이라 인터넷이 필요 없습니다.) 실패해도 프로그램은 계속 진행합니다."""
    if not force:
        return
    assets = base / "assets"
    assets.mkdir(exist_ok=True)
    seed = int(cfg.get("art_seed", 1234))
    log.info("그림을 새로 받아 옵니다 (1~3분)…")
    _download(COURT_PROMPT, 1600, 900, seed, assets / "court_auto.jpg")
    _download(PORTRAIT_PROMPT, 512, 600, seed + 7, assets / "portrait_auto.jpg")
