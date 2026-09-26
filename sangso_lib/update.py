"""
update.py — GitHub에 올라온 최신 프로그램으로 이 폴더를 새로 고치는 곳  (python sangso.py --update)

하는 일
  1) GitHub에서 이 저장소의 ZIP(압축 파일)을 받습니다. (git 이 없어도 됩니다)
  2) 그 안의 '프로그램 파일'만 이 폴더에 덮어씁니다. 내용이 같은 파일은 건드리지 않습니다.
  3) config.json 은 내 설정을 그대로 두고, 새 버전에 새로 생긴 설정 항목만 덧붙입니다.

절대 건드리지 않는 것 (내 기록·내 그림)
  profile.md, data/, output/, archive/, logs/, assets/ 안에 내가 넣은 그림(court.jpg, portraits/wei_yan.jpg 등)
  → ZIP 에는 이런 파일이 애초에 들어 있지 않고, 아래 PROGRAM 목록에 있는 것만 덮어쓰므로 안전합니다.

디버깅 힌트
  - "404" 가 나오면: 저장소가 비공개라 로그인 없이 못 받는 경우입니다. GitHub 에서 Code → Download ZIP 으로 받아
    폴더째 덮어쓰세요(내 기록은 ZIP 에 없어서 지워지지 않습니다).
  - 다른 브랜치에서 받고 싶으면 아래 BRANCH 를 바꾸세요.
"""

from __future__ import annotations

import io
import json
import logging
import urllib.error
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

log = logging.getLogger("sangso")

REPO = "richdadtechtree/test"
BRANCH = "claude/zhuge-liang-daily-advice-1i5wmu"
ZIP_URL = f"https://codeload.github.com/{REPO}/zip/refs/heads/{BRANCH}"

# 덮어써도 되는 '프로그램 파일' (이 이름이거나, 이 폴더 안에 있는 파일)
PROGRAM = ("sangso.py", "sangso_lib/", "templates/", "install/", "install_windows.bat", "sample/",
           "README.md", "profile.example.md", ".gitignore", "assets/portraits/")


class UpdateError(Exception):
    pass


def _download() -> bytes:
    req = urllib.request.Request(ZIP_URL, headers={"User-Agent": "zhuge-sangso-updater/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        hint = " (저장소가 비공개일 수 있습니다. GitHub에서 Code → Download ZIP 으로 받아 폴더째 덮어쓰세요)" if e.code == 404 else ""
        raise UpdateError(f"최신 파일을 받지 못했습니다: HTTP {e.code}{hint}") from e
    except OSError as e:  # 인터넷 끊김, 시간 초과 등
        raise UpdateError(f"최신 파일을 받지 못했습니다: {e}") from e


def _merge_config(path: Path, new_text: str) -> bool:
    """내 config.json 값은 그대로 두고, 새 버전에만 있는 항목을 덧붙입니다. 바뀌었으면 True."""
    new = json.loads(new_text)
    if not path.exists():
        path.write_text(new_text, encoding="utf-8")
        return True
    mine = json.loads(path.read_text(encoding="utf-8"))
    added = [k for k in new if k not in mine]
    if not added:
        return False
    for k in added:
        mine[k] = new[k]
    path.write_text(json.dumps(mine, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("config.json 에 새 설정 추가: %s", ", ".join(k for k in added if not k.startswith("_")))
    return True


def run(base: Path) -> list[str]:
    """최신 프로그램 파일로 덮어쓰고, 바뀐 파일 목록을 돌려줍니다."""
    log.info("최신 프로그램을 받는 중… (%s)", ZIP_URL)
    zf = zipfile.ZipFile(io.BytesIO(_download()))
    changed = []
    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = PurePosixPath(info.filename).parts[1:]  # 맨 앞 폴더(test-브랜치이름/)는 떼어 냅니다
        if not parts or ".." in parts:
            continue  # 이상한 경로는 무시 (폴더 밖에 파일을 쓰지 않도록)
        rel = "/".join(parts)
        body = zf.read(info)
        if rel == "config.json":
            if _merge_config(base / "config.json", body.decode("utf-8")):
                changed.append(rel)
            continue
        if not any(rel == p or (p.endswith("/") and rel.startswith(p)) for p in PROGRAM):
            continue
        dest = base.joinpath(*parts)
        if dest.exists() and dest.read_bytes() == body:
            continue  # 이미 최신
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        changed.append(rel)
    return changed
