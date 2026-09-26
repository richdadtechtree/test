r"""
publish.py — 완성된 상소를 Cloudflare Pages(인터넷의 비공개 방)에 올려, 휴대폰·다른 PC에서도 보게 하는 곳

전체 흐름
  내 컴퓨터가 상소를 씀 → site/ 폴더에 '올릴 것만' 모음 → wrangler(Cloudflare 공식 도구)로 올림
  → https://<프로젝트>.pages.dev/  (Cloudflare Access 로 '내 이메일로 로그인한 사람만' 들어오게 잠급니다)

site/ 에 들어가는 것 — 이것만 인터넷에 올라갑니다
  index.html   : 열면 바로 가장 최근(오늘) 상소로 넘어가는 첫 화면   ← 휴대폰에서 이 주소를 즐겨찾기
  list.html    : 지난 상소 목록
  d/날짜.html   : 날짜별 상소 (output/ 에 만들어진 화면을 그대로 복사)
  assets/      : 화면에 쓰는 그림(초상화·배경)
  ※ profile.md, 클로드 대화 기록, archive/ 원문, config.json, cloudflare.json(비밀번호)은 절대 넣지 않습니다.

설정 파일: cloudflare.json — 내 컴퓨터에만 있고 git 에 올라가지 않습니다. (py sangso.py --publish-setup 이 만들어 줌)
  {"account_id": "계정 ID", "api_token": "API 토큰", "project": "sangso-xxxx", "url": "https://....pages.dev/"}

필요한 것: Node.js — wrangler 를 npx 로 실행합니다. https://nodejs.org 에서 'LTS' 설치 (처음 한 번)

안전장치 — 잠기지 않은 주소에는 개인 내용을 올리지 않습니다
  올리기 직전마다 주소를 한 번 열어 봅니다. 로그인 화면으로 넘어가면(=Access 로 잠김) 올리고,
  누구나 바로 볼 수 있는 상태면 올리지 않고 로그에 경고만 남깁니다.
  처음 설정(--publish-setup) 때는 개인 내용이 없는 '준비 중' 페이지만 올립니다.

디버깅 힌트
  - "잠겨 있지 않아 올리지 않았습니다" → 안내대로 Cloudflare Access(이메일 잠금)를 켠 뒤 py sangso.py --publish
  - "npx 를 찾지 못했습니다" → Node.js 를 설치한 뒤 PowerShell 창을 닫고 새로 여세요.
  - "Authentication error" / 403 → API 토큰 권한이 'Account › Cloudflare Pages › Edit' 인지 확인하세요.
  - 올리기가 실패해도 아침 창은 그대로 뜹니다. logs/sangso.log 에서 '올리기'로 검색하세요.
"""

from __future__ import annotations

import getpass
import html
import json
import logging
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from . import art

log = logging.getLogger("sangso")

CFG_NAME = "cloudflare.json"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class PublishError(Exception):
    pass


# ──────────────────────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────────────────────
def load(base: Path) -> dict | None:
    """cloudflare.json 이 있고 필요한 값이 다 있으면 그 내용을, 아니면 None(= 올리기 안 함)."""
    path = base / CFG_NAME
    if not path.exists():
        return None
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as e:
        log.warning("올리기 설정(%s)을 읽지 못했습니다: %s", CFG_NAME, e)
        return None
    return cfg if all(cfg.get(k) for k in ("account_id", "api_token", "project")) else None


# ──────────────────────────────────────────────────────────────
# 1) 올릴 폴더(site/) 만들기
# ──────────────────────────────────────────────────────────────
def build_site(base: Path) -> Path:
    out, site = base / "output", base / "site"
    pages = sorted(p for p in out.glob("*.html") if DATE_RE.match(p.stem))  # 날짜 이름인 것만 (견본·임시본 제외)
    if not pages:
        raise PublishError("올릴 상소가 아직 없습니다. 먼저 py sangso.py 로 상소를 받으세요.")
    if site.exists():
        shutil.rmtree(site)
    (site / "d").mkdir(parents=True)
    for p in pages:
        shutil.copy2(p, site / "d" / p.name)
    # 그림: assets 안의 그림 파일만 (d/날짜.html 이 '../assets/…' 로 가리키므로 site/assets 에 같은 모양으로)
    assets = base / "assets"
    for f in assets.rglob("*"):
        if f.is_file() and f.suffix.lower() in art.EXTS:
            dest = site / "assets" / f.relative_to(assets)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)

    latest = pages[-1].name
    titles = {}
    for p in pages:  # 목록에 보일 제목 (archive 원문에서 제목 한 줄만 꺼냄)
        try:
            titles[p.stem] = json.loads((base / "archive" / f"{p.stem}.json").read_text(encoding="utf-8")).get("title", "")
        except (OSError, ValueError):
            titles[p.stem] = ""
    (site / "index.html").write_text(_INDEX.format(latest=latest), encoding="utf-8")
    rows = "\n".join(f'<li><a href="d/{p.name}"><b>{p.stem}</b> {html.escape(titles[p.stem])}</a></li>' for p in reversed(pages))
    (site / "list.html").write_text(_LIST.replace("{rows}", rows), encoding="utf-8")
    # 검색엔진이 긁어 가지 않도록 (Access 로 잠그면 어차피 못 들어오지만 한 겹 더)
    (site / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    return site


_INDEX = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>제갈량 상소문</title>
<meta http-equiv="refresh" content="0; url=d/{latest}">
<style>body{{background:#1d1510;color:#efe3c8;font:16px/1.7 serif;text-align:center;padding:40px 16px}}a{{color:#f3d06a}}</style>
</head><body>
<p>오늘의 상소로 갑니다…</p>
<p><a href="d/{latest}">바로 열기</a> · <a href="list.html">지난 상소 목록</a></p>
</body></html>
"""

_LIST = """<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>지난 상소 목록</title>
<style>
body{background:#1d1510;color:#efe3c8;font:16px/1.7 serif;margin:0;padding:24px 16px}
h1{font-size:22px;margin:0 0 16px} ul{list-style:none;padding:0;margin:0;max-width:640px}
li a{display:block;padding:12px 14px;margin-bottom:8px;border:1px solid rgba(201,162,74,.4);border-radius:8px;color:#efe3c8;text-decoration:none}
li a b{color:#f3d06a;margin-right:8px}
</style></head><body>
<h1>지난 상소 목록</h1>
<ul>
{rows}
</ul>
</body></html>
"""


# ──────────────────────────────────────────────────────────────
# 2) wrangler 로 올리기
# ──────────────────────────────────────────────────────────────
def _npx() -> str:
    exe = shutil.which("npx")  # 윈도우에서는 npx.cmd 를 찾아 줍니다
    if not exe:
        raise PublishError("npx 를 찾지 못했습니다. https://nodejs.org 에서 Node.js(LTS)를 설치한 뒤 창을 새로 여세요.")
    return exe


def _wrangler(cfg: dict, *args: str, timeout: int = 600) -> str:
    """npx wrangler … 를 실행하고 화면에 나온 글을 돌려줍니다. 실패하면 PublishError."""
    env = dict(os.environ, CLOUDFLARE_API_TOKEN=cfg["api_token"], CLOUDFLARE_ACCOUNT_ID=cfg["account_id"],
               WRANGLER_SEND_METRICS="false")
    cmd = [_npx(), "--yes", "wrangler", *args]  # --yes: "설치할까요?" 질문 없이 최신 wrangler 로 진행
    try:
        r = subprocess.run(cmd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise PublishError(f"wrangler 가 {timeout}초 안에 끝나지 않았습니다") from e
    text = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0:
        raise PublishError("wrangler 실패:\n" + text.strip()[-1500:])
    return text


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # 넘어가지 말고 '넘어가려 했다'는 사실만 봅니다
        return None


def is_protected(url: str) -> bool:
    """주소를 로그인 없이 열어 봅니다. 로그인 화면으로 보내면(3xx/401/403) 잠긴 것, 바로 보이면(200) 안 잠긴 것."""
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(urllib.request.Request(url, headers={"User-Agent": "zhuge-sangso/1.0"}), timeout=20) as r:
            return r.status >= 300
    except urllib.error.HTTPError as e:
        return e.code in (301, 302, 303, 307, 308, 401, 403)
    except OSError as e:
        raise PublishError(f"주소가 잠겼는지 확인하지 못했습니다 ({url}): {e}") from e


def real_url(cfg: dict) -> str | None:
    """Cloudflare 에 '이 프로젝트의 진짜 주소'를 물어봅니다 (이름이 겹치면 sangso-abc.pages.dev 처럼 달라지므로 짐작하지 않음)."""
    text = _wrangler(cfg, "pages", "project", "list")
    for line in text.splitlines():
        cells = [c.strip() for c in line.split("│" if "│" in line else "|")]
        if cfg["project"] in cells:  # 표에서 이 프로젝트 줄만
            m = re.search(r"([\w-]+\.pages\.dev)", line)
            if m:
                return f"https://{m.group(1)}/"
    return None


def _upload(cfg: dict, site: Path) -> str:
    text = _wrangler(cfg, "pages", "deploy", str(site), f"--project-name={cfg['project']}", "--branch=main")
    urls = re.findall(r"https://[\w.-]+\.pages\.dev\S*", text)
    return cfg.get("url") or (urls[-1] if urls else "")


def deploy(base: Path, cfg: dict) -> str:
    if not cfg.get("url_checked"):  # 처음 한 번: 저장된 주소가 진짜 이 프로젝트의 주소인지 Cloudflare 에 확인
        url = real_url(cfg)
        if not url:
            raise PublishError(f"'{cfg['project']}' 프로젝트의 주소를 확인하지 못해 올리지 않았습니다.")
        cfg["url"], cfg["url_checked"] = url, True
        (base / CFG_NAME).write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    url = cfg["url"]
    if not is_protected(url):
        raise PublishError(f"{url} 이 아직 잠겨 있지 않아 올리지 않았습니다. Cloudflare Access(이메일 잠금)를 먼저 켜 주세요.")
    site = build_site(base)
    _upload(cfg, site)
    log.info("올리기 완료: %s", url)
    return url


def publish_if_configured(base: Path) -> None:
    """상소를 쓴 뒤 자동으로 부릅니다. 설정이 없으면 조용히 넘어가고, 실패해도 프로그램은 계속됩니다."""
    cfg = load(base)
    if not cfg:
        return
    try:
        deploy(base, cfg)
    except Exception as e:  # 인터넷 끊김, 토큰 만료 등 — 아침 창은 그대로 떠야 하므로 기록만 남깁니다
        log.warning("올리기 실패: %s", e)


# ──────────────────────────────────────────────────────────────
# 3) 처음 한 번: 설정 도우미  (py sangso.py --publish-setup)
# ──────────────────────────────────────────────────────────────
def setup(base: Path) -> int:
    print("\n=== Cloudflare 올리기 설정 ===")
    try:
        _npx()
    except PublishError as e:
        print("✗", e)
        return 1
    old = load(base) or {}
    acct = input(f"① 계정 ID(Account ID)를 붙여 넣고 Enter {('[그대로: Enter]' if old else '')}: ").strip() or old.get("account_id", "")
    # 주소창 글자를 통째로 붙여 넣어도(dash.cloudflare.com/1e1b…/home) 32자리 계정 ID만 골라냅니다
    m = re.search(r"[0-9a-f]{32}", acct.lower())
    acct = m.group(0) if m else acct
    print("② API 토큰을 붙여 넣고 Enter  (붙여 넣어도 화면에 글자가 안 보이는 게 정상입니다)")
    token = getpass.getpass("   토큰: ").strip() or old.get("api_token", "")
    default = old.get("project") or f"sangso-{secrets.token_hex(3)}"
    proj = input(f"③ 프로젝트 이름 (영어 소문자·숫자·-, 그냥 Enter 면 {default}): ").strip().lower() or default
    if not (acct and token and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,56}", proj)):
        print("✗ 값이 비었거나 프로젝트 이름이 올바르지 않습니다. 다시 실행해 주세요.")
        return 1
    cfg = {"account_id": acct, "api_token": token, "project": proj, "url": old.get("url", "")}

    print("\n프로젝트를 만드는 중… (처음엔 wrangler 를 내려받느라 1~2분 걸릴 수 있습니다)")
    try:
        text = _wrangler(cfg, "pages", "project", "create", proj, "--production-branch=main")
        urls = re.findall(r"https://[\w.-]+\.pages\.dev", text)
        if urls:
            cfg["url"] = urls[0].rstrip("/") + "/"
    except PublishError as e:
        if "already exists" not in str(e).lower():  # 이미 만든 프로젝트면 그대로 씁니다
            print("✗", e)
            return 1
    try:
        cfg["url"] = real_url(cfg) or cfg["url"]  # 진짜 주소를 확인해서 저장 (잠금 확인을 엉뚱한 주소에 하지 않도록)
    except PublishError as e:
        log.warning("프로젝트 주소 확인 실패: %s", e)
    if not cfg["url"]:
        print(f"✗ '{proj}' 프로젝트의 주소를 확인하지 못했습니다. 잠시 뒤 다시 실행해 주세요.")
        return 1
    (base / CFG_NAME).write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 설정 저장: {base / CFG_NAME}  (이 파일은 내 컴퓨터에만 두세요)")

    # 첫 올리기는 개인 내용 없는 '준비 중' 페이지만 (아직 잠그기 전이라 누구나 볼 수 있으므로)
    print("\n'준비 중' 페이지를 올리는 중… (개인 내용 없음)")
    with tempfile.TemporaryDirectory() as tmp:
        Path(tmp, "index.html").write_text(
            '<!DOCTYPE html><meta charset="utf-8"><meta name="robots" content="noindex"><title>준비 중</title><p>준비 중입니다.</p>',
            encoding="utf-8")
        try:
            _upload(cfg, Path(tmp))
        except PublishError as e:
            print("✗", e)
            return 1
    print(f"\n✓ 주소가 생겼습니다 → {cfg['url']}")
    print("다음 순서: 안내대로 Cloudflare Access(이메일 잠금)를 켠 뒤  py sangso.py --publish  를 실행하세요.")
    print("(잠기기 전에는 개인 내용을 올리지 않습니다)")
    return 0
