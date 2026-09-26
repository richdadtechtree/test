/* ───────────────────────────────────────────────────────────────
 * court.js — 승상부 조회(朝會) 장면: 조조전 느낌의 쿼터뷰 + SD(머리 큰 아기자기한) 캐릭터
 *
 * 화면 구성
 *   ① 캔버스: 대각선 위에서 내려다본 대전(쿼터뷰). 단상 위 제갈량, 비스듬히 뻗은 붉은 융단 양옆에 한 줄씩 장수 9명.
 *      위쪽 줄 = 문관(장완·비의·동윤·양의·마속), 아래쪽 줄 = 무장(조운·위연·강유·왕평).
 *      왼쪽 앞 창가에는 적국 위(魏)의 사마의가 홀로 서서, 조회 마지막에 승상과 반대되는 조언을 던집니다.
 *   ② 아래 대화창: 말하는 사람의 초상화 + 이름 + 대사. 승상 → 신하들 순서로 차례로 말합니다.
 *      말하는 캐릭터는 머리 위에 '…' 말풍선이 뜨고 통통 튑니다. 대화창을 눌러야 다음 대사로 넘어갑니다.
 *
 * 핵심 개념 — 쿼터뷰 좌표 iso(x, y, z)
 *   바닥을 바둑판(칸)으로 보고, 칸 번호 (x, y)와 높이 z(픽셀)를 화면 좌표로 바꿉니다.
 *     x가 1 늘면 오른쪽 아래로, y가 1 늘면 왼쪽 아래로 한 칸 (마름모 64×32 픽셀).
 *   그래서 인물은 '몇 번째 칸에 세울지'만 정하면 되고, 화면에서 아래쪽(앞쪽)에 있는 것을 나중에 그려 겹침을 맞춥니다.
 *
 * 캐릭터 모양은 아래 CAST 표에서 바꿉니다 (옷 색·모자·수염·표정·든 물건).
 * 성능: 움직이지 않는 배경은 한 번만 그려 두고(bg), 매 프레임엔 인물·등불·연기만 새로 그립니다.
 * 디버깅: 화면이 비면 브라우저 F12 → Console 탭의 빨간 오류를 확인하세요.
 * ─────────────────────────────────────────────────────────────── */
(function () {
  "use strict";
  var DATA = {};
  try { DATA = JSON.parse(document.getElementById("court-data").textContent); } catch (e) {}
  var courtEl = document.querySelector(".court"), artImg = document.getElementById("court-art");
  var cv = document.getElementById("court-canvas");
  // 그림 파일(assets/court.jpg 등)을 쓰는 중이면 캔버스 장면은 그리지 않고 대화창만 움직입니다
  var HAS_ART = !!(courtEl && courtEl.classList.contains("has-art"));
  var still = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ── 1. 등장인물 ─────────────────────────────────────────────
   * 모습은 대화창 초상화(삼국지 시리즈 그림)에 맞췄습니다. 항목 뜻:
   *   robe: 옷 색 / trim: 깃·소맷부리·옷단 색 / armor: 갑옷 색(무장만) / shoulder: 어깨 갑옷 색 / cape: 망토
   *   hat: tall(높은 관 — hatCol 색, top: flat·round·flare, ribs 골, spiral 소용돌이 장식, emblem 금장식)
   *        crown(상투 + 작은 금관) · hood(두건 + 금 머리띠) · topknot(맨 상투) · helmet(투구 — helm 색, plume 술, mane 흰 갈기)
   *   scarf: 목도리 색 (scarfType: knot 매듭 · shawl 어깨걸이) / longHair: 등 뒤로 늘어진 긴 머리 / panel: 앞섶 세로 띠
   *   beard: vandyke(콧수염+뾰족 턱수염)·vandykeLong·full·mustache·none / mood: 표정 / hold: 든 물건
   *   wide: 넉넉한 도포와 넓은 소매(승상) / fanCol·fanSize: 부채 색·크기 / size: 크기 배율(승상은 조금 크게) / bubble: '…' 말풍선 높이
   * x, y: 서 있는 바닥 칸 (아래 '쿼터뷰 좌표' 참고) / f: 바라보는 쪽 (-1 화면 왼쪽, 1 오른쪽)
   * 붉은 융단(y = 4.5~6.5)이 단상에서 화면 오른쪽 아래로 비스듬히 뻗고, 그 양옆에 한 줄씩 섭니다. 사마의는 신하들과 떨어져 왼쪽 앞 창가에 홀로.
   *   위쪽 줄(y = 3.6) 문관 5명, 아래쪽 줄(y = 7.4) 무장 4명. 단상에 가까울수록 윗자리, x 가 1.6씩 늘며 뒤로.
   *   (아래쪽 줄은 화면 앞이라 단상과 겹치지 않도록 반 칸 뒤에서 시작합니다)
   *   신하들은 모두 단상의 승상 쪽(화면 왼쪽 위)을 바라보고, 승상은 신하들 쪽(오른쪽 아래)을 봅니다. */
  var CAST = {
    // 청록 높은 관 + 금테, 등 뒤 긴 머리, 남색 테 두른 흰 도포, 큼직한 흰 깃털 부채
    "제갈량": { hj: "諸葛亮", robe: "#f6f3ec", trim: "#27336a", hat: "tall", hatCol: "#2fa39c", top: "flare", ribs: true, emblem: true, longHair: true, panel: true, wide: true,
      beard: "vandykeLong", mood: "calm", hold: "fan", fanSize: 1.55, size: 1.16, bubble: 134, x: 2.3, y: 5.5, f: 1 },
    // 소용돌이 장식의 청록 관, 청록 겉옷 + 베이지 속옷
    "장완": { hj: "蔣琬", robe: "#35898a", trim: "#ecdfc2", hat: "tall", hatCol: "#2f9a93", top: "round", spiral: true, beard: "vandyke", mood: "calm", hold: "tablet", bubble: 116, x: 5.4, y: 3.6, f: -1 },
    // 자줏빛 붉은 높은 관 + 금장식, 초록 어깨걸이
    "비의": { hj: "費禕", robe: "#b39a62", trim: "#efe2bd", hat: "tall", hatCol: "#8c2c22", top: "flat", emblem: true, scarf: "#4e8a34", scarfType: "shawl", beard: "vandyke", mood: "smile", hold: "tablet", bubble: 114, x: 7.0, y: 3.6, f: -1 },
    // 검은 관, 청록 도포 + 흰 깃, 검은 수염
    "동윤": { hj: "董允", robe: "#2e8595", trim: "#f2efe6", hat: "tall", hatCol: "#26272e", top: "round", ribs: true, beard: "vandyke", mood: "stern", hold: "tablet", bubble: 110, x: 8.6, y: 3.6, f: -1 },
    // 상투 + 작은 금관, 연두 도포, 가는 콧수염, 가슴에 손
    "양의": { hj: "楊儀", robe: "#7fae78", trim: "#3f6a44", hat: "crown", beard: "mustache", mood: "sly", hold: "chest", x: 10.2, y: 3.6, f: -1 },
    // 상투 + 작은 금관, 초록 어깨걸이, 갈색 깃털 부채
    "마속": { hj: "馬謖", robe: "#3e4652", trim: "#9aa3ad", hat: "crown", scarf: "#6f9a36", scarfType: "shawl", beard: "none", mood: "proud", hold: "fan", fanCol: "#b58a58", fanSize: 1.1, x: 11.8, y: 3.6, f: -1 },
    // 은빛 투구 + 흰 갈기, 흰 목도리·망토, 푸른빛 갑옷
    "조운": { hj: "趙雲", robe: "#48559a", armor: "#c9cfdb", shoulder: "#dfe3ea", cape: "#fbfbfb", hat: "helmet", helm: "#d7dce4", mane: true, scarf: "#ffffff", beard: "none", mood: "calm", hold: "spear", x: 6.0, y: 7.4, f: -1 },
    // 맨 상투, 덥수룩한 수염, 붉은 목도리, 검붉은 갑옷 + 금 어깨
    "위연": { hj: "魏延", robe: "#4a1a14", armor: "#6e2a20", shoulder: "#c9a24a", hat: "topknot", scarf: "#d23a2a", beard: "full", mood: "angry", hold: "glaive", x: 7.6, y: 7.4, f: -1, skin: "#e0ab7f" },
    // 초록 두건 + 금 머리띠, 흰 목도리, 금·초록 갑옷
    "강유": { hj: "姜維", robe: "#3a7a46", armor: "#c9a24a", shoulder: "#d9b24a", hat: "hood", hatCol: "#3f8f4c", scarf: "#f6f4ee", beard: "none", mood: "eager", hold: "spear", x: 9.2, y: 7.4, f: -1 },
    // 쇠 투구 + 붉은 술, 회색 비늘 갑옷, 초록 목도리
    "왕평": { hj: "王平", robe: "#3a5a3e", armor: "#8d939b", hat: "helmet", helm: "#9aa0a8", plume: "#b8322a", scarf: "#3f8a4a", beard: "vandyke", mood: "calm", hold: "sword", x: 10.8, y: 7.4, f: -1 },
    // 적국 위(魏)의 맞수. 촉의 신하들과 떨어져 왼쪽 앞 창가(햇빛 드는 곳)에 홀로 서서 승상을 바라봅니다. 조회 마지막에 반대 의견을 던집니다
    // 높고 각진 검은 관 + 금장식, 보라 도포, 회색 망토, 팔짱
    "사마의": { hj: "司馬懿", robe: "#4a3c6e", trim: "#d8d0c0", cape: "#b9b4ac", hat: "tall", hatCol: "#1f1f26", top: "flat", emblem: true, beard: "vandyke", mood: "scheme", hold: "crossed", bubble: 118, x: 4.0, y: 10.0, f: 1, rival: true },
  };
  var OL = "#2a1a12"; // 캐릭터 외곽선 색

  /* ── 2. 쿼터뷰 좌표 ──────────────────────────────────────── */
  var W = 960, H = 540, OX = 450, OY = 72; // OX, OY: 가장 안쪽 구석(0,0)이 화면에 놓이는 자리 → 바꾸면 장면 전체가 움직입니다
  function iso(x, y, z) { return [OX + (x - y) * 32, OY + (x + y) * 16 - (z || 0)]; }
  var RUG = 5.5; // 융단 가운데 줄(y). 단상·병풍·촛대도 이 줄을 중심으로 놓입니다

  /* 그리기 도우미 */
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function ell(c, x, y, rx, ry, fill, stroke, lw) {
    c.beginPath(); c.ellipse(x, y, Math.max(rx, .01), Math.max(ry, .01), 0, 0, Math.PI * 2);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.4; c.stroke(); }
  }
  function svg(c, d, fill, stroke, lw) {
    var p = new Path2D(d);
    if (fill) { c.fillStyle = fill; c.fill(p); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.4; c.stroke(p); }
  }
  function lg(c, x0, y0, x1, y1, stops) { var g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rrect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // 색 문자열(#rrggbb 또는 rgb(...)) → [r, g, b]
  function rgbOf(col) {
    if (col.charAt(0) === "#") { var n = parseInt(col.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    var m = col.match(/\d+(\.\d+)?/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }
  // k<1 이면 어둡게(그림자 면), k>1 이면 밝게(빛 받는 면)
  function shade(col, k) {
    return "rgb(" + rgbOf(col).map(function (v) { return Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1)); }).join(",") + ")";
  }
  /* 2.5D의 핵심 — 입체 음영 vol(색, 중심 x, y, 크기)
   * 빛이 왼쪽 위(창 쪽)에서 온다고 보고, 도형 왼쪽 위는 밝게, 오른쪽 아래는 어둡게 칠하는 둥근 그라데이션을 만듭니다.
   * 평평한 한 가지 색 대신 이걸로 칠하면 공이나 인형처럼 도톰해 보입니다. (반투명 rgba 색은 그대로 둡니다) */
  function vol(c, col, x, y, r) {
    if (col.indexOf("rgba") === 0) return col;
    var g = c.createRadialGradient(x - r * .42, y - r * .5, r * .06, x - r * .12, y - r * .12, r * 1.3);
    g.addColorStop(0, shade(col, 1.38)); g.addColorStop(.45, col); g.addColorStop(1, shade(col, .56));
    return g;
  }

  /* 말하는 동작: 지금 그리는 캐릭터가 말하는 중이면 A = { t: 초, mouth: 0~1(입 벌린 정도) }, 아니면 null.
   * chibi()를 부르기 직전에 frame()이 정하고, 몸·고개·손·입 그리는 곳에서 이 값을 보고 살짝 움직입니다.
   *   몸: 숨 쉬듯 살짝 늘었다 줄었다 / 고개: 가볍게 끄덕임 / 입: 글자가 찍히는 동안 뻥긋뻥긋
   *   손: 제갈량은 부채를 부치고, 문관은 홀을 들썩이고, 무장은 빈손으로 손짓 */
  var A = null;
  function wave(speed, amp) { return A ? Math.sin(A.t * speed) * amp : 0; }

  /* ── 3. SD 캐릭터 한 명 그리기 ─────────────────────────────
   * 기준점(0,0)은 발밑. 위쪽이 음수. 키는 약 75px (머리가 몸의 절반쯤 되는 SD 비율).
   * f: 얼굴이 향한 쪽 (-1 왼쪽, 0 정면, 1 오른쪽) — 눈·입·수염을 그쪽으로 조금 옮겨 고개를 돌린 느낌을 냅니다. */
  function chibi(c, sp, f) {
    var skin = sp.skin || "#f7d9ba", hair = sp.hair || "#1c1512", armor = sp.armor, side = f || 1;
    c.lineJoin = "round"; c.lineCap = "round";
    c.save(); c.scale(1, 1 + wave(5, .022));                                             // 말할 때 숨 쉬듯 (발밑 기준)
    // 망토(몸 뒤)
    if (sp.cape) svg(c, "M-12,-33 Q-19,-12 -16,-1 L16,-1 Q19,-12 12,-33 Z", vol(c, sp.cape, 0, -17, 19), OL, 1.3);
    // 등 뒤로 늘어진 긴 머리 (몸보다 먼저 그려서 어깨 너머로만 보이게)
    if (sp.longHair) {
      svg(c, "M-11,-44 Q-20,-32 -18,-11 L-13,-12 Q-14,-30 -7,-42 Z", vol(c, hair, -15, -28, 12), OL, 1);
      svg(c, "M11,-44 Q20,-32 18,-11 L13,-12 Q14,-30 7,-42 Z", vol(c, hair, 15, -28, 12), OL, 1);
    }
    // 긴 무기는 몸 뒤쪽에 세워 들고 있습니다
    if (sp.hold === "spear" || sp.hold === "glaive") weapon(c, sp, side);
    // 신발
    ell(c, -5, -2, 4.6, 2.8, vol(c, "#3a2e28", -5, -2, 5), OL, 1); ell(c, 5, -2, 4.6, 2.8, vol(c, "#3a2e28", 5, -2, 5), OL, 1);
    // 몸통(옷)
    var W2 = sp.wide ? 17.5 : 14;                                                          // 옷자락 폭 (승상은 넉넉하게)
    svg(c, "M-9.5,-31 L9.5,-31 Q" + (W2 - 3) + ",-16 " + W2 + ",-3 Q0,1 -" + W2 + ",-3 Q-" + (W2 - 3) + ",-16 -9.5,-31 Z", vol(c, sp.robe, 0, -17, 19), OL, 1.4);
    svg(c, "M4,-30 Q9,-16 10,-3 L" + W2 + ",-3 Q" + (W2 - 3) + ",-16 9.5,-31 Z", "rgba(0,0,0,.13)");     // 옷 주름(그늘진 쪽)
    if (armor) {
      svg(c, "M-8.5,-30 L8.5,-30 L9.5,-13 Q0,-11 -9.5,-13 Z", vol(c, armor, 0, -22, 13), OL, 1.1);                 // 가슴 갑옷
      c.strokeStyle = shade(armor, .72); c.lineWidth = .9;
      for (var yy = -26; yy < -13; yy += 3.2) { c.beginPath(); c.moveTo(-8.5, yy); c.lineTo(8.5, yy); c.stroke(); } // 비늘 줄
      svg(c, "M-12,-10 L12,-10 L13,-4 Q0,-1 -13,-4 Z", vol(c, shade(armor, .85), 0, -7, 14), OL, 1);            // 허리 아래 갑옷 자락
      ell(c, 0, -13, 3, 2.2, vol(c, "#d9b24a", 0, -13, 3.5), OL, .8);                                            // 허리띠 장식
    } else {
      svg(c, "M-" + W2 + ",-3 Q0,1 " + W2 + ",-3 L" + (W2 - .7) + ",-6.4 Q0,-2.6 -" + (W2 - .7) + ",-6.4 Z", vol(c, sp.trim, 0, -4, W2));   // 옷단
      c.strokeStyle = sp.trim; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(-6, -31); c.lineTo(1, -21); c.moveTo(6, -31); c.lineTo(-1, -22); c.stroke(); // 여민 깃
      if (sp.panel) { c.lineWidth = 3.4; c.beginPath(); c.moveTo(1, -21); c.lineTo(1.6, -3); c.stroke(); }   // 앞섶 세로 띠
      svg(c, "M-10,-18 L10,-18 L10.4,-15 L-10.4,-15 Z", shade(sp.trim, .7));                   // 허리띠
    }
    // 소매·팔
    var sleeve = armor ? shade(armor, .9) : sp.robe;
    var sx = sp.wide ? 12.5 : 10.5, srx = sp.wide ? 6.4 : 4.6, sry = sp.wide ? 9.6 : 7.2, sy = sp.wide ? -19 : -21; // 소매 (승상은 넓은 소매)
    ell(c, -sx, sy, srx, sry, vol(c, sleeve, -sx, sy, sry + 1), OL, 1.2); ell(c, sx, sy, srx, sry, vol(c, sleeve, sx, sy, sry + 1), OL, 1.2);
    if (!armor && sp.trim) { ell(c, -sx, sy + sry - 1.6, srx - .4, 2, vol(c, sp.trim, -sx, sy + sry - 1.6, srx)); ell(c, sx, sy + sry - 1.6, srx - .4, 2, vol(c, sp.trim, sx, sy + sry - 1.6, srx)); } // 소맷부리 테
    if (armor) {                                                                              // 어깨 갑옷 + 반짝임
      var sh = sp.shoulder || armor;
      ell(c, -10.5, -28, 5.4, 3.8, vol(c, sh, -10.5, -28, 6), OL, 1.1); ell(c, 10.5, -28, 5.4, 3.8, vol(c, sh, 10.5, -28, 6), OL, 1.1);
      ell(c, -12.5, -29.2, 1.8, 1, "rgba(255,255,255,.55)"); ell(c, 8.5, -29.2, 1.8, 1, "rgba(255,255,255,.4)");
    }
    if (sp.scarf) neckScarf(c, sp, f || 0);
    held(c, sp, side, skin);
    ell(c, 0, -31, 11, 3.2, "rgba(0,0,0,.2)");                                             // 머리가 몸에 드리운 그늘
    head(c, sp, f || 0, skin, hair);
    if (sp.hold === "fan") fan(c, sp, side, skin);
    c.restore();
  }

  // 깃털 부채(제갈량의 학우선·마속의 부채): 어깨 옆에 세워 들어 얼굴 옆으로 보이게. 말할 때 천천히 부침
  function fan(c, sp, side, skin) {
    var fx = (sp.wide ? 15 : 12) * side, fy = (A ? -3 : 0) - 20, k = sp.fanSize || 1.2;
    c.save(); c.translate(fx, fy); c.rotate(.22 * side + wave(3.4, .3)); c.scale(k, k);
    svg(c, "M0,2 C-9,-4 -9,-17 0,-21 C9,-17 9,-4 0,2 Z", vol(c, sp.fanCol || "#ffffff", -2, -11, 11), OL, 1.1);
    c.strokeStyle = "rgba(110,115,128,.75)"; c.lineWidth = .8;                           // 깃털 결
    for (var q = -3; q <= 3; q++) { c.beginPath(); c.moveTo(0, 1); c.lineTo(q * 2.3, -18 + Math.abs(q) * 1.1); c.stroke(); }
    svg(c, "M-3,1 Q0,-2 3,1 L2,4 L-2,4 Z", vol(c, "#2a2a3a", 0, 2, 3), OL, .7);             // 부채 받침
    c.fillStyle = "#6a4a2a"; c.fillRect(-1, 3.5, 2, 6); c.restore();                      // 손잡이
    ell(c, fx, fy + 7 * k, 3.4, 3, vol(c, skin, fx, fy + 7 * k, 4.4), OL, 1);            // 부채를 쥔 손
  }

  // 목도리(매듭) 또는 어깨걸이(넓게 두른 천)
  function neckScarf(c, sp, f) {
    var col = sp.scarf, kx = f * 2.2;
    if (sp.scarfType === "shawl") {
      svg(c, "M-13,-32 Q0,-26 13,-32 L15.5,-23 Q0,-16 -15.5,-23 Z", vol(c, col, 0, -26, 15), OL, 1.1);
      c.strokeStyle = shade(col, .7); c.lineWidth = .8;
      [-8, -3, 3, 8].forEach(function (x) { c.beginPath(); c.moveTo(x * .9, -29); c.lineTo(x * 1.15, -21); c.stroke(); }); // 천 주름
      ell(c, kx, -27, 2.4, 2, vol(c, col, kx, -27, 3), OL, .8);
    } else {
      svg(c, "M-10.5,-33 Q0,-27.5 10.5,-33 L11,-29.5 Q0,-23.5 -11,-29.5 Z", vol(c, col, 0, -29, 12), OL, 1);
      svg(c, "M" + (kx - 1) + ",-27 Q" + (kx - 4) + ",-20 " + (kx - 2) + ",-14 L" + (kx + 1.5) + ",-15 Q" + kx + ",-21 " + (kx + 2) + ",-27 Z", vol(c, col, kx, -21, 7), OL, .9); // 늘어진 끝
      ell(c, kx, -27.5, 3, 2.4, vol(c, col, kx, -27.5, 3.5), OL, .9);          // 매듭
    }
  }

  // 긴 무기 (창·언월도): 얼굴이 향한 쪽 손에 세워 듭니다
  function weapon(c, sp, side) {
    var x = 17 * side; // 몸통 바깥쪽에 세워야 자루가 보입니다
    c.save(); c.translate(x, -24); c.rotate(wave(2.6, .05)); c.translate(-x, 24);    // 말할 때 무기가 살짝 흔들림
    c.strokeStyle = "#5a3a22"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x, 2); c.lineTo(x, -66); c.stroke();
    if (sp.hold === "spear") {
      poly(c, [[x - 3, -66], [x, -78], [x + 3, -66]], "#dfe5ec", OL, 1);
      ell(c, x, -64, 3.4, 2.2, "#c8322a");                                                   // 붉은 술
    } else {
      svg(c, "M" + x + ",-66 Q" + (x + 12 * side) + ",-74 " + (x + 9 * side) + ",-88 Q" + (x + 2 * side) + ",-78 " + x + ",-80 Z", "#d9dee4", OL, 1.1); // 언월도 날
      ell(c, x, -64, 3, 2, "#2c7a3a");
    }
    c.restore();
  }

  // 손과 든 물건
  function held(c, sp, side, skin) {
    var h = sp.hold;
    if (h === "tablet") {                     // 홀(笏): 문관이 두 손으로 받쳐 드는 판
      var ty = -Math.abs(wave(3, 2.6));                                          // 말할 때 홀을 들썩
      c.save(); c.translate(0, -22 + ty); c.rotate(-.12 * side + wave(3, .08));
      svg(c, "M-2,-8 L2,-8 L2.4,6 L-2.4,6 Z", "#efe7d2", OL, 1); c.restore();
      ell(c, 0, -17 + ty, 4.4, 3.2, vol(c, skin, 0, -17 + ty, 5.4), OL, 1);
    } else if (h === "fan") {                  // 깃털 부채는 머리를 그린 뒤 fan()에서 (얼굴에 가려지지 않게)
    } else if (h === "scroll") {               // 마속의 병법서 두루마리
      var sy = -Math.abs(wave(3, 2.4));                                          // 말할 때 두루마리를 흔들며 으쓱
      c.save(); c.translate(0, -19 + sy); c.rotate(wave(3, .1));
      svg(c, "M-8,-3 L8,-3 L8,3 L-8,3 Z", "#efe0b8", OL, 1);
      ell(c, -8, 0, 1.6, 3.4, "#8a5a36", OL, .8); ell(c, 8, 0, 1.6, 3.4, "#8a5a36", OL, .8); c.restore();
      ell(c, -5, -17 + sy, 3, 2.6, vol(c, skin, -5, -17 + sy, 4), OL, 1); ell(c, 5, -17 + sy, 3, 2.6, vol(c, skin, 5, -17 + sy, 4), OL, 1);
    } else if (h === "sword") {                // 왕평: 허리에 찬 칼
      c.save(); c.translate(-6 * side, -12); c.rotate(.9 * side);
      c.fillStyle = "#3a2a1e"; c.fillRect(-1.6, -2, 3.2, 20); c.fillStyle = "#d9b24a"; c.fillRect(-3, -3, 6, 2);
      c.restore();
      var gy = A ? -5 + wave(5, 2.2) : 0;                                         // 말할 때 한 손을 들어 손짓
      ell(c, 11 * side, -16 + gy, 3.2, 3, vol(c, skin, 11 * side, -16 + gy, 4.2), OL, 1); ell(c, -11 * side, -16, 3.2, 3, vol(c, skin, -11 * side, -16, 4.2), OL, 1);
    } else if (h === "chest") {                // 양의: 한 손을 가슴에 얹음 (말할 때 살짝 들썩)
      var py = -Math.abs(wave(3, 1.8));
      ell(c, 2 * side, -24 + py, 3.4, 3, vol(c, skin, 2 * side, -24 + py, 4.4), OL, 1);
    } else if (h === "crossed") {              // 사마의: 팔짱 (말할 때 팔을 살짝 들썩)
      var cy = -Math.abs(wave(2.4, 1.6));
      svg(c, "M-13," + (-25 + cy) + " Q0," + (-28 + cy) + " 13," + (-25 + cy) + " L13," + (-17 + cy) + " Q0," + (-14 + cy) + " -13," + (-17 + cy) + " Z", vol(c, sp.robe, 0, -21 + cy, 14), OL, 1.2);
      c.strokeStyle = shade(sp.robe, .6); c.lineWidth = 1; c.beginPath(); c.moveTo(-9, -21 + cy); c.quadraticCurveTo(0, -18.5 + cy, 9, -21 + cy); c.stroke(); // 팔이 겹친 주름
      svg(c, "M-13," + (-25 + cy) + " L-9," + (-25.6 + cy) + " L-9," + (-16.6 + cy) + " L-13," + (-17 + cy) + " Z", sp.trim);   // 소매 끝단
      svg(c, "M13," + (-25 + cy) + " L9," + (-25.6 + cy) + " L9," + (-16.6 + cy) + " L13," + (-17 + cy) + " Z", sp.trim);
    } else {                                   // 창·언월도를 쥔 손
      ell(c, 16 * side, -24, 3.4, 3.2, vol(c, skin, 16 * side, -24, 4.4), OL, 1);
      var hy2 = A ? -6 + wave(5, 2.4) : 0;                                        // 말할 때 빈손을 들어 손짓
      ell(c, -10.5 * side, -16 + hy2, 3.2, 3, vol(c, skin, -10.5 * side, -16 + hy2, 4.2), OL, 1);
    }
  }

  // 머리: 뒷머리 → 얼굴 → 앞머리 → 눈썹·눈·볼·입 → 수염 → 모자
  function head(c, sp, f, skin, hair) {
    var hy = -46, fx = f * 3.2, m = sp.mood;
    c.save(); c.translate(0, -31); c.rotate(wave(4.2, .07) * (f || 1)); c.translate(0, 31 + Math.abs(wave(4.2, 1.2))); // 고개 끄덕임
    var back = f ? -f : 1;                                                        // 머리 뒤쪽(얼굴 반대편)
    if (sp.hat === "hood") {                                                      // 강유: 두건 자락이 뒤로 늘어짐
      svg(c, "M" + (back * 6) + "," + (hy - 12) + " Q" + (back * 22) + "," + (hy - 2) + " " + (back * 19) + "," + (hy + 20) + " L" + (back * 13) + "," + (hy + 18) + " Q" + (back * 15) + "," + (hy + 2) + " " + (back * 2) + "," + (hy - 6) + " Z", vol(c, sp.hatCol, back * 14, hy + 4, 14), OL, 1);
    }
    if (sp.mane) {                                                                // 조운: 투구 위로 흩날리는 흰 갈기
      for (var mi = 0; mi < 4; mi++) {
        svg(c, "M" + (back * -2) + "," + (hy - 22) + " Q" + (back * (14 + mi * 5)) + "," + (hy - 30 + mi * 4) + " " + (back * (22 + mi * 3)) + "," + (hy - 8 + mi * 9) + " Q" + (back * (10 + mi * 3)) + "," + (hy - 12 + mi * 5) + " " + (back * 2) + "," + (hy - 16) + " Z", vol(c, "#f4f6f9", back * 14, hy - 12, 16), OL, .9);
      }
    }
    if (sp.hat === "guanjin") {                                                 // 윤건의 끈 두 가닥 (머리 뒤로 늘어짐)
      svg(c, "M-9," + (hy - 8) + " Q-17," + (hy + 8) + " -12," + (hy + 24) + " L-9," + (hy + 23) + " Q-13," + (hy + 8) + " -6," + (hy - 7) + " Z", "#23233a");
      svg(c, "M9," + (hy - 8) + " Q17," + (hy + 8) + " 12," + (hy + 24) + " L9," + (hy + 23) + " Q13," + (hy + 8) + " 6," + (hy - 7) + " Z", "#23233a");
    }
    ell(c, 0, hy - 1, 16, 15.5, vol(c, hair, 0, hy - 1, 17), OL, 1.4);            // 뒷머리
    ell(c, fx * .35, hy + 2.5, 13.6, 12.6, vol(c, skin, fx * .35, hy + 2.5, 15), OL, 1.2); // 얼굴
    c.beginPath(); c.ellipse(0, hy - 1.5, 15.2, 10.5, 0, Math.PI, 0); c.fillStyle = vol(c, hair, 0, hy - 5, 15); c.fill(); // 앞머리
    svg(c, "M" + (-15 + fx) + "," + (hy - 1) + " Q" + (-9 + fx) + "," + (hy - 5) + " " + (-3 + fx) + "," + (hy - 1) + " Q" + (3 + fx) + "," + (hy - 6) + " " + (9 + fx) + "," + (hy - 1) + " Q" + (13 + fx) + "," + (hy - 4) + " 15.2," + (hy - 1.5) + " L15.2," + (hy - 3) + " L-15.2," + (hy - 3) + " Z", hair);
    c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 1.6;                   // 머리카락 윤기
    c.beginPath(); c.ellipse(-2, hy - 5, 10, 6.5, -.25, Math.PI * 1.08, Math.PI * 1.55); c.stroke();

    var ex = 5.2, ey = hy + 4, brow = sp.hair && sp.beard === "grey" ? "#6f6a64" : "#1c1410";
    // 눈썹 (표정의 절반은 눈썹입니다)
    c.strokeStyle = brow; c.lineWidth = 1.5;
    var tilt = { stern: 2.2, angry: 3, sly: -1, proud: -.6, eager: -1.4, happy: -1, calm: 0, scheme: 1.4, smile: -.6 }[m] || 0;
    c.beginPath();
    c.moveTo(fx - ex - 3, ey - 6 - tilt); c.lineTo(fx - ex + 2.5, ey - 6 + tilt * .6);
    c.moveTo(fx + ex + 3, ey - 6 - tilt + (m === "sly" ? -1.6 : 0)); c.lineTo(fx + ex - 2.5, ey - 6 + tilt * .6);
    c.stroke();
    // 눈
    c.fillStyle = "#1d1410"; c.strokeStyle = "#1d1410"; c.lineWidth = 1.5;
    if (m === "happy") {                        // 웃는 눈 ^ ^
      [-ex, ex].forEach(function (x) { c.beginPath(); c.moveTo(fx + x - 2.4, ey + 1); c.quadraticCurveTo(fx + x, ey - 2.4, fx + x + 2.4, ey + 1); c.stroke(); });
    } else if (m === "sly" || m === "proud" || m === "scheme") {  // 가늘게 뜬 눈
      [-ex, ex].forEach(function (x) { ell(c, fx + x, ey + .5, 2.4, 1.3, "#1d1410"); });
      c.lineWidth = 1.2; [-ex, ex].forEach(function (x) { c.beginPath(); c.moveTo(fx + x - 2.8, ey - .8); c.lineTo(fx + x + 2.8, ey - .8); c.stroke(); });
    } else {
      var big = m === "eager" ? 1.25 : 1;
      [-ex, ex].forEach(function (x) {
        ell(c, fx + x, ey, 2.1 * big, 3 * big, "#1d1410");
        ell(c, fx + x + .7, ey - 1.1, .8 * big, .9 * big, "#ffffff");
        if (big > 1) ell(c, fx + x - .6, ey + 1.1, .45, .45, "#ffffff");
      });
    }
    ell(c, fx - ex - 2.8, ey + 5, 2.6, 1.4, "rgba(240,118,104,.42)"); ell(c, fx + ex + 2.8, ey + 5, 2.6, 1.4, "rgba(240,118,104,.42)"); // 볼터치
    // 입
    var my = ey + 7.5, open = A ? A.mouth : 0;
    if (open > .12 && m !== "angry") {                                             // 말하는 입: 세로로 벌어지는 타원
      ell(c, fx, my + .6, 2.2 + open * .6, .6 + open * 2, "#6a2018", "#4a1810", .8);
      ell(c, fx, my + .6 + open * 1.1, 1.3, open * .8, "#d8706a");                  // 혀
      m = "open";
    }
    c.strokeStyle = "#7a3a2a"; c.lineWidth = 1.2; c.beginPath();
    if (m === "happy" || m === "eager" || m === "smile") { c.moveTo(fx - 2.6, my - .6); c.quadraticCurveTo(fx, my + 2.4, fx + 2.6, my - .6); }
    else if (m === "stern") { c.moveTo(fx - 2.4, my + .6); c.quadraticCurveTo(fx, my - .8, fx + 2.4, my + .6); }
    else if (m === "sly" || m === "proud" || m === "scheme") { c.moveTo(fx - 2, my); c.quadraticCurveTo(fx + 1, my + 1, fx + 3, my - 1.4); }
    else if (m !== "angry" && m !== "open") { c.moveTo(fx - 1.8, my); c.lineTo(fx + 1.8, my); }
    c.stroke();
    beard(c, sp.beard, fx, ey, sp.hair);
    if (m === "angry") svg(c, "M" + (fx - 3.6) + "," + (my - 1.4) + " L" + (fx + 3.6) + "," + (my - 1.4) + " Q" + fx + "," + (my + 3.6 + open * 2.4) + " " + (fx - 3.6) + "," + (my - 1.4) + " Z", "#fff6ea", "#5a2418", 1); // 위연의 이 드러낸 웃음
    hat(c, sp, f, hy);
    c.restore();
  }

  function beard(c, b, fx, ey, grey) {
    var col = b === "grey" ? "#b9b4ad" : "#1c1410", y = ey + 7;
    if (b === "long" || b === "grey") {
      var w = b === "grey" ? 5.5 : 3.6;
      svg(c, "M" + (fx - w) + "," + (y + 1.4) + " Q" + fx + "," + (y + 3) + " " + (fx + w) + "," + (y + 1.4) + " L" + (fx + 1) + "," + (y + 17) + " L" + (fx - 1) + "," + (y + 17) + " Z", col);
      svg(c, "M" + (fx - 4.8) + "," + (y - .4) + " Q" + (fx - 2) + "," + (y - 2.4) + " " + fx + "," + (y - 1) + " Q" + (fx + 2) + "," + (y - 2.4) + " " + (fx + 4.8) + "," + (y - .4) + " Q" + fx + "," + (y - .2) + " " + (fx - 4.8) + "," + (y - .4) + " Z", col, col, .8);
    } else if (b === "full") {
      svg(c, "M" + (fx - 12) + "," + (ey - 1) + " Q" + (fx - 14) + "," + (y + 12) + " " + fx + "," + (y + 14) + " Q" + (fx + 14) + "," + (y + 12) + " " + (fx + 12) + "," + (ey - 1) + " Q" + (fx + 7) + "," + (y + 4) + " " + fx + "," + (y + 3) + " Q" + (fx - 7) + "," + (y + 4) + " " + (fx - 12) + "," + (ey - 1) + " Z", col, OL, 1);
    } else if (b === "short") {
      svg(c, "M" + (fx - 6.5) + "," + y + " Q" + fx + "," + (y + 9) + " " + (fx + 6.5) + "," + y + " Q" + fx + "," + (y + 4) + " " + (fx - 6.5) + "," + y + " Z", col);
    } else if (b === "goatee") {
      svg(c, "M" + (fx - 2) + "," + (y + 2) + " L" + (fx + 2) + "," + (y + 2) + " L" + (fx + .4) + "," + (y + 10) + " Z", col);
      c.strokeStyle = col; c.lineWidth = .9; c.beginPath(); c.moveTo(fx - 4, y - .6); c.quadraticCurveTo(fx, y - 2, fx + 4, y - .6); c.stroke();
    } else if (b === "mustache") {
      c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
      c.moveTo(fx - 4.6, y + .4); c.quadraticCurveTo(fx - 2, y - 1.6, fx, y - .8); c.quadraticCurveTo(fx + 2, y - 1.6, fx + 4.6, y + .4); c.stroke();
    } else if (b === "vandyke" || b === "vandykeLong") {                          // 콧수염 + 뾰족한 턱수염 (초상화 속 문관·승상)
      var L = b === "vandykeLong" ? 12 : 7;
      svg(c, "M" + (fx - 5.6) + "," + (y + 1.2) + " Q" + (fx - 2.6) + "," + (y - 2) + " " + fx + "," + (y - .9) + " Q" + (fx + 2.6) + "," + (y - 2) + " " + (fx + 5.6) + "," + (y + 1.2) + " Q" + (fx + 2.6) + "," + (y - .3) + " " + fx + "," + (y + .3) + " Q" + (fx - 2.6) + "," + (y - .3) + " " + (fx - 5.6) + "," + (y + 1.2) + " Z", col);
      svg(c, "M" + (fx - 2.6) + "," + (y + 2.6) + " Q" + fx + "," + (y + 3.6) + " " + (fx + 2.6) + "," + (y + 2.6) + " L" + (fx + .6) + "," + (y + 2.6 + L) + " L" + (fx - .6) + "," + (y + 2.6 + L) + " Z", col);
    } else if (b === "stubble") {
      ell(c, fx, y + 2, 8.5, 4.6, "rgba(50,35,25,.28)");
    }
  }

  // 모자: 머리 중심(hy)을 원점으로 옮겨 놓고 그립니다
  function hat(c, sp, f, hy) {
    var k = sp.hat, b = -f * 1.6; // 모자 뒤쪽 장식은 얼굴 반대쪽으로 살짝
    c.save(); c.translate(0, hy);
    if (k === "tall") {            // 높은 관 (제갈량·장완·비의·동윤·사마의)
      tallHat(c, sp, f);
    } else if (k === "crown") {    // 상투 + 작은 금관 (양의·마속)
      ell(c, 0, -17, 5.6, 5, vol(c, "#2a201a", 0, -17, 6.5), OL, 1.1);
      svg(c, "M-3.4,-19 L-4,-28 L4,-28 L3.4,-19 Z", vol(c, "#e0b64c", 0, -24, 5), OL, 1);
      c.strokeStyle = "#b8862e"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-8, -21.5); c.lineTo(8, -21.5); c.stroke(); // 비녀
    } else if (k === "topknot") {  // 맨 상투 (위연)
      ell(c, 0, -17, 5.8, 5.2, vol(c, "#2a201a", 0, -17, 6.5), OL, 1.1);
      c.fillStyle = "#c9a24a"; c.fillRect(-4.5, -15, 9, 2);
    } else if (k === "hood") {     // 초록 두건 + 금 머리띠 (강유)
      svg(c, "M-15.5,-1 Q-17,-21 0,-23 Q17,-21 15.5,-1 Q13,-8 0,-9 Q-13,-8 -15.5,-1 Z", vol(c, sp.hatCol, 0, -12, 17), OL, 1.1);
      svg(c, "M-14.5,-6 Q0,-11 14.5,-6 L14.5,-2.8 Q0,-7.8 -14.5,-2.8 Z", vol(c, "#e0b64c", 0, -6, 14), OL, .8);
      ell(c, f * 2, -7, 2.2, 2, vol(c, "#f3d06a", f * 2, -7, 2.5), OL, .7);
    } else if (k === "guan") {     // 관모(문관): 검은 모자 + 뒤로 솟은 판
      svg(c, "M-13,-5 Q-13,-16 0,-17 Q13,-16 13,-5 Q0,-8 -13,-5 Z", vol(c, "#24242c", 0, -10, 14), OL, 1.1);
      svg(c, "M" + (b - 6) + ",-14 L" + (b - 4.5) + ",-27 L" + (b + 5.5) + ",-27 L" + (b + 7) + ",-14 Z", vol(c, "#24242c", b, -21, 10), OL, 1.1);
      c.strokeStyle = "#c9a24a"; c.lineWidth = .9; c.beginPath(); c.moveTo(b - 4.8, -24); c.lineTo(b + 5.8, -24); c.stroke();
    } else if (k === "guanjin") {  // 윤건(제갈량): 골이 진 검은 비단 두건
      svg(c, "M-13,-4 Q-14,-18 -6,-24 L6,-24 Q14,-18 13,-4 Q0,-8 -13,-4 Z", vol(c, "#2c2c48", 0, -14, 15), OL, 1.1);
      c.strokeStyle = "rgba(160,160,200,.45)"; c.lineWidth = .9;
      for (var i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 2.6, -22); c.lineTo(i * 3.3, -6); c.stroke(); }
    } else if (k === "scarf") {    // 복건(선비의 두건) + 뒤로 늘어진 자락
      var s = f ? -f : 1;
      svg(c, "M" + (s * 8) + ",-10 Q" + (s * 18) + ",-4 " + (s * 16) + ",10 L" + (s * 12) + ",8 Q" + (s * 13) + ",-2 " + (s * 4) + ",-8 Z", "#1e1e24", OL, 1);
      ell(c, 0, -7, 15, 9.5, vol(c, "#26262e", 0, -7, 15), OL, 1.1);
    } else if (k === "helmet") {   // 투구(무장) + 술
      svg(c, "M-15,-5 Q-15,-24 0,-26 Q15,-24 15,-5 L11,-6 Q11,-16 0,-17 Q-11,-16 -11,-6 Z", vol(c, sp.helm || sp.armor, 0, -16, 17), OL, 1.2);
      ell(c, -7, -20, 3.2, 1.8, "rgba(255,255,255,.5)");                                  // 투구 반짝임
      svg(c, "M-12,-17 Q0,-21 12,-17 L12,-14 Q0,-18 -12,-14 Z", vol(c, "#d9b24a", 0, -17, 12));
      c.strokeStyle = "#5a3a22"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -26); c.lineTo(0, -31); c.stroke();
      if (sp.plume) svg(c, "M0,-31 Q" + (b * 4 - 7) + ",-40 " + (b * 5 - 3) + ",-44 Q" + (b * 2 + 4) + ",-38 2,-30 Z", sp.plume, OL, .9);
    } else if (k === "band") {     // 강유: 상투 + 붉은 머리띠(끈이 뒤로 날림)
      var d = f ? -f : 1;
      ell(c, 0, -16, 5.2, 5, vol(c, "#2a201a", 0, -16, 6), OL, 1.1);
      c.fillStyle = sp.band; c.fillRect(-15, -6, 30, 3.6);
      svg(c, "M" + (d * 13) + ",-5 q" + (d * 7) + ",2 " + (d * 10) + ",9 l" + (-d * 3) + ",0 q" + (-d * 2) + ",-5 " + (-d * 7) + ",-7 Z", sp.band);
    }
    c.restore();
  }

  // 높은 관: 이마 위 금테 → 원통 → 윗부분(flat 각진·round 둥근·flare 넓게 퍼진 테)
  function tallHat(c, sp, f) {
    var col = sp.hatCol, y0 = -9, h = sp.top === "flare" ? 24 : sp.top === "flat" ? 24 : 21, y1 = y0 - h;
    var w0 = 11.5, w1 = sp.top === "flare" ? 9.5 : sp.top === "flat" ? 12.5 : 9.5, ox = f * 1.5; // ox: 앞장식을 얼굴 쪽으로
    var body = sp.top === "flat" ? "M-" + w0 + "," + y0 + " L-" + w1 + "," + y1 + " L" + w1 + "," + y1 + " L" + w0 + "," + y0 + " Q0," + (y0 - 3) + " -" + w0 + "," + y0 + " Z"
      : "M-" + w0 + "," + y0 + " L-" + w1 + "," + (y1 + 5) + " Q0," + (y1 - 3) + " " + w1 + "," + (y1 + 5) + " L" + w0 + "," + y0 + " Q0," + (y0 - 3) + " -" + w0 + "," + y0 + " Z";
    svg(c, body, vol(c, col, 0, (y0 + y1) / 2, h), OL, 1.2);
    if (sp.ribs) {                                                                  // 비단을 접은 세로 골
      c.strokeStyle = shade(col, .68); c.lineWidth = 1;
      for (var i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 4.2, y0 - 3); c.lineTo(i * 3.8, y1 + 5); c.stroke(); }
    }
    if (sp.top === "flare") {                                                       // 승상의 관: 윗부분이 뒤로 둥글게 말린 모양
      var bk = f ? -f : 1;
      c.save(); c.translate(bk * 2.5, y1 + 3); c.rotate(-.28 * bk);
      c.beginPath(); c.ellipse(0, 0, w1 + 3.5, 5.2, 0, 0, Math.PI * 2);
      c.fillStyle = vol(c, shade(col, 1.1), 0, 0, w1 + 3); c.fill(); c.strokeStyle = OL; c.lineWidth = 1.1; c.stroke();
      c.beginPath(); c.ellipse(bk * 3, .6, w1 - 1, 2.4, 0, 0, Math.PI * 2); c.fillStyle = shade(col, .66); c.fill(); // 말린 안쪽
      c.restore();
    }
    if (sp.spiral) {                                                                // 장완의 관: 앞의 소용돌이 장식
      c.strokeStyle = shade(col, 1.35); c.lineWidth = 1.7; c.beginPath();
      for (var t = 0; t < 12.5; t += .25) { var r = 5.2 - t * .38; c.lineTo(ox + Math.cos(t) * r, y1 + 8 + Math.sin(t) * r); }
      c.stroke();
    }
    svg(c, "M-" + w0 + "," + y0 + " Q0," + (y0 - 3) + " " + w0 + "," + y0 + " L" + (w0 - .4) + "," + (y0 - 3.6) + " Q0," + (y0 - 6.6) + " -" + (w0 - .4) + "," + (y0 - 3.6) + " Z", vol(c, "#e0b64c", 0, y0 - 2, w0), OL, .8); // 금테
    if (sp.emblem) svg(c, "M" + ox + "," + (y0 - 10) + " L" + (ox + 3.4) + "," + (y0 - 6.2) + " L" + ox + "," + (y0 - 2.4) + " L" + (ox - 3.4) + "," + (y0 - 6.2) + " Z", vol(c, "#f3d06a", ox, y0 - 6, 4), OL, .8); // 금장식
  }

  /* ── 4. 배경: 대전 (한 번만 그려 bg 캔버스에 보관) ───────────
   * 2.5D 느낌을 내는 요소
   *   • 빛의 방향을 하나로 통일: 햇빛이 왼쪽 벽 창으로 들어옵니다 → 윗면은 밝게, 오른쪽을 향한 면은 어둡게
   *   • 구석 그늘(AO): 벽과 바닥이 만나는 곳, 단상 둘레를 어둡게 해 바닥이 '안쪽으로 들어가' 보이게
   *   • 두께가 있는 물건: 들보·굽도리·창턱·2단 단상·촛대·도자기를 상자/원기둥으로 그림
   *   • 창으로 든 햇살 기둥과 바닥의 빛 웅덩이 (프레임마다 먼지가 떠다님) */
  var K = Math.min(2, window.devicePixelRatio || 1); // 고해상도 화면에서도 선명하게
  var WALL = 150;                                     // 벽 높이(픽셀)
  var SUN = [[8.8, 10.4], [12.3, 13.9], [15.8, 17.4]];         // 왼쪽 벽(햇빛 드는 쪽) 창 자리: 벽을 따라 몇 번째 칸부터 몇 번째 칸까지
  var RWIN = [[5, 6.6], [8.5, 10.1], [12, 13.6], [15.5, 17.1]]; // 오른쪽 벽 창 자리
  var DAIS = 16;                                      // 단상 높이(제갈량이 서는 윗단)
  // 창으로 든 빛이 바닥에 닿는 자리 (왼쪽 벽 창 → 방 안쪽 오른쪽 아래로 비스듬히)
  function pool(w) { return [iso(.5, w[0] + .6), iso(.5, w[1] + .6), iso(3.8, w[1] + 2.4), iso(3.8, w[0] + 2.4)]; }

  // 상자 하나: 윗면 + 화면 쪽으로 보이는 두 옆면. 빛 방향에 맞춰 왼쪽 앞면은 중간, 오른쪽 앞면은 어둡게
  function box(c, x0, y0, x1, y1, z0, z1, col) {
    poly(c, [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)], shade(col, .72), OL, 1);
    poly(c, [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)], shade(col, .5), OL, 1);
    var a = iso(x0, y0, z1), b = iso(x1, y1, z1);
    poly(c, [a, iso(x1, y0, z1), b, iso(x0, y1, z1)], lg(c, a[0], a[1], b[0], b[1], [[0, shade(col, 1.18)], [1, col]]), OL, 1);
  }
  // 바닥 띠 그늘: at(i)가 돌려주는 가는 띠를 안쪽부터 점점 옅게 겹칩니다
  function aoStrips(c, n, strip, a) {
    for (var i = 0; i < n; i++) poly(c, strip(i / n, (i + 1) / n), "rgba(0,0,0," + (a * Math.pow(1 - i / n, 2)).toFixed(3) + ")");
  }

  function background(c) {
    c.fillStyle = "#140c08"; c.fillRect(0, 0, W, H);
    // 바닥: 긴 마루 널 (줄마다 이음새를 엇갈리게, 널마다 색을 살짝 다르게)
    for (var r = 0; r < 66; r++) {
      var y0 = r / 3, y1 = (r + 1) / 3, off = (r * 7 % 3) * .7;
      for (var x = -off; x < 22; x += 2.1) {
        var h = (Math.sin(r * 12.9898 + x * 78.233) * 43758.5) % 1, v = Math.abs(h);
        poly(c, [iso(x, y0), iso(x + 2.1, y0), iso(x + 2.1, y1), iso(x, y1)],
          "rgb(" + Math.round(98 + v * 22) + "," + Math.round(62 + v * 14) + "," + Math.round(38 + v * 9) + ")", "rgba(34,18,9,.7)", .8);
      }
    }
    // 반들반들한 마루에 비친 빛
    var gl = c.createRadialGradient(480, 300, 20, 480, 300, 330);
    gl.addColorStop(0, "rgba(255,214,150,.13)"); gl.addColorStop(1, "rgba(255,214,150,0)");
    c.fillStyle = gl; c.fillRect(0, 0, W, H);
    // 벽 밑 구석 그늘
    aoStrips(c, 10, function (a, b) { return [iso(a * 1.4, 0), iso(b * 1.4, 0), iso(b * 1.4, 22), iso(a * 1.4, 22)]; }, .5);
    aoStrips(c, 10, function (a, b) { return [iso(0, a * 1.4), iso(0, b * 1.4), iso(22, b * 1.4), iso(22, a * 1.4)]; }, .55);
    // 바닥의 빛 웅덩이 (창살 그림자 줄무늬 포함)
    c.save(); c.globalCompositeOperation = "lighter";
    SUN.forEach(function (w) {
      poly(c, pool(w), "rgba(255,196,118,.16)");
    });
    c.restore();
    SUN.forEach(function (w) {
      for (var i = 1; i < 5; i++) { var u = w[0] + (w[1] - w[0]) * i / 5; line2(c, iso(.5, u + .6), iso(3.8, u + 2.4), "rgba(40,20,10,.16)", 2.2); }
    });
    // 뒤쪽 두 벽 (왼쪽 벽: x=0 — 창으로 햇빛이 들어오는 쪽 / 오른쪽 벽: y=0)
    wall(c, function (u, z, d) { return iso(d || 0, u, z); }, "#6e1d14", true, SUN);
    wall(c, function (u, z, d) { return iso(u, d || 0, z); }, "#7c2217", false, RWIN);
    // 붉은 기둥 (벽을 따라)
    [2.4, 8.2, 11.6, 15.1, 18.6].forEach(function (k) { pillar(c, iso(.35, k)); }); // 왼쪽 벽: 단상(병풍) 양옆 + 창 사이
    [3.5, 7, 10.5, 14, 17.5].forEach(function (k) { pillar(c, iso(k, .35)); });
    // 융단: 단상 앞에서 화면 아래까지 (가장자리 밑에 얇은 그림자 → 바닥 위에 깔린 두께)
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    var rug = [iso(4.7, RUG - 1), iso(4.7, RUG + 1), iso(22, RUG + 1), iso(22, RUG - 1)];
    poly(c, rug.map(function (p) { return [p[0] + 3, p[1] + 2]; }), "rgba(0,0,0,.35)");
    poly(c, rug, lg(c, 0, 200, 0, 540, [[0, "#8c1a14"], [1, "#b0281d"]]));
    poly(c, rug, null, "#e0b44c", 3);
    poly(c, [iso(4.9, RUG - .72), iso(4.9, RUG + .72), iso(22, RUG + .72), iso(22, RUG - .72)], null, "rgba(240,200,110,.55)", 1.2);
    for (var t = 5.8; t < 18; t += 1.1)    // 융단 가운데 금색 마름모 무늬 (바닥 칸 방향에 맞춰 눕힘)
      poly(c, [iso(t - .35, RUG), iso(t, RUG - .35), iso(t + .35, RUG), iso(t, RUG + .35)], null, "rgba(236,190,90,.75)", 1.4);
    c.restore();
    // 단상: 왼쪽 벽 앞, 융단 머리. 아랫단(넓고 낮게) + 윗단. 보이는 두 면 앞 바닥에 그늘
    var y0 = RUG - 2, y1 = RUG + 2;
    aoStrips(c, 6, function (a, b) { return [iso(4.7 + a * .8, y0), iso(4.7 + b * .8, y0), iso(4.7 + b * .8, y1 + b * .8), iso(4.7 + a * .8, y1 + a * .8)]; }, .45);
    aoStrips(c, 6, function (a, b) { return [iso(.3, y1 + a * .8), iso(4.7 + a * .8, y1 + a * .8), iso(4.7 + b * .8, y1 + b * .8), iso(.3, y1 + b * .8)]; }, .45);
    box(c, .3, y0, 4.7, y1, 0, 8, "#7a3a20");
    box(c, .6, y0 + .3, 4, y1 - .3, 8, DAIS, "#a52a1f");
    poly(c, [iso(.85, y0 + .55, DAIS), iso(3.75, y0 + .55, DAIS), iso(3.75, y1 - .55, DAIS), iso(.85, y1 - .55, DAIS)], null, "#e0b44c", 2);
    // 금박 병풍: 윗단 뒤 벽 앞에 넓게 한 폭 + 양쪽 날개 (뒤 날개 → 가운데 → 앞 날개 순서로 그려야 겹침이 맞습니다)
    screen(c, function (u, z) { return iso(.75 + u * .9, y0 + .4, z + DAIS); }, 1);
    screen(c, function (u, z) { return iso(.75, y0 + .4 + u * 3.2, z + DAIS); }, .82);
    screen(c, function (u, z) { return iso(.75 + u * .9, y1 - .4, z + DAIS); }, 1);
    // 청동 촛대 (윗단 앞 모서리 두 곳) — 불꽃은 프레임마다 그립니다
    CANDLES.forEach(function (q) { candleStand(c, q); });
    // 청화백자 큰 항아리 (단상 양옆 바닥)
    vase(c, iso(1.1, y0 - .9)); vase(c, iso(1.1, y1 + .9));
    // 향로 (단상 앞 융단 위)
    var q = iso(5.1, RUG);
    ell(c, q[0] + 4, q[1] + 2, 14, 5, "rgba(0,0,0,.35)");
    [-6, 0, 6].forEach(function (dx) { line2(c, [q[0] + dx, q[1] - 6], [q[0] + dx * 1.2, q[1] + 1], "#3a2a14", 2.4); });
    svg(c, "M" + (q[0] - 10) + "," + (q[1] - 15) + " Q" + q[0] + "," + (q[1] + 3) + " " + (q[0] + 10) + "," + (q[1] - 15) + " Z", vol(c, "#9a7a34", q[0], q[1] - 11, 11), OL, 1.2);
    ell(c, q[0], q[1] - 15, 10, 3.4, vol(c, "#c9a24a", q[0], q[1] - 15, 10), OL, 1);
    ell(c, q[0], q[1] - 15, 6, 1.8, "#3a2a14");
    // 전체 빛: 위(안쪽)는 따뜻한 햇빛 안개, 가장자리는 어둡게(비네트) → 화면에 깊이감
    c.fillStyle = lg(c, 0, 0, 0, H, [[0, "rgba(255,190,110,.12)"], [.55, "rgba(0,0,0,0)"], [1, "rgba(10,5,2,.3)"]]);
    c.fillRect(0, 0, W, H);
    var vg = c.createRadialGradient(480, 250, 260, 480, 250, 640);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.5)");
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }
  function line2(c, a, b, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }

  // 벽: at(u, z, d) = 벽을 따라 u칸, 높이 z, 벽에서 방 안쪽으로 d칸 튀어나온 곳
  function wall(c, at, col, sunny, wins) {
    var g = lg(c, 0, 330, 0, 0, [[0, shade(col, .55)], [.6, col], [1, shade(col, .8)]]);
    poly(c, [at(0, 0), at(22, 0), at(22, WALL), at(0, WALL)], g);
    // 옻칠 판벽: 세로 이음매 + 금색 못
    for (var u = 1.75; u < 22; u += 3.5) {
      line2(c, at(u, 30), at(u, WALL - 20), "rgba(30,6,4,.45)", 2);
      [48, 118].forEach(function (z) { ell(c, at(u, z)[0], at(u, z)[1], 2, 2, vol(c, "#e0b44c", at(u, z)[0], at(u, z)[1], 2.4)); });
    }
    // 창: 창틀 → 빛나는 창호지 → 창살 → 튀어나온 창턱(윗면이 보임)
    wins.forEach(function (w) {
      poly(c, [at(w[0] - .15, 44), at(w[1] + .15, 44), at(w[1] + .15, 118), at(w[0] - .15, 118)], "#3a140c");
      var glow = sunny ? "#ffd998" : "#e9b872";
      poly(c, [at(w[0], 50), at(w[1], 50), at(w[1], 112), at(w[0], 112)], glow);
      for (var i = 1; i < 5; i++) { var uu = w[0] + (w[1] - w[0]) * i / 5; line2(c, at(uu, 50), at(uu, 112), "rgba(90,30,14,.9)", 1.3); }
      for (var z = 60; z < 112; z += 10) line2(c, at(w[0], z), at(w[1], z), "rgba(90,30,14,.9)", 1.3);
      poly(c, [at(w[0] - .2, 44, 0), at(w[1] + .2, 44, 0), at(w[1] + .2, 44, .22), at(w[0] - .2, 44, .22)], "#8a4a26", OL, .8); // 창턱 윗면
      poly(c, [at(w[0] - .2, 38, .22), at(w[1] + .2, 38, .22), at(w[1] + .2, 44, .22), at(w[0] - .2, 44, .22)], "#4a2412", OL, .8); // 창턱 앞면
    });
    // 굽도리(벽 아래 두꺼운 널): 앞면 + 윗면
    poly(c, [at(0, 0, .14), at(22, 0, .14), at(22, 28, .14), at(0, 28, .14)], shade(col, .5), OL, 1);
    poly(c, [at(0, 28, 0), at(22, 28, 0), at(22, 28, .14), at(0, 28, .14)], shade(col, 1.15));
    line2(c, at(0, 24, .14), at(22, 24, .14), "#d9a441", 1.6);
    // 위 들보: 벽에서 튀어나온 굵은 나무 — 윗면(밝게) + 앞면(어둡게, 금 테) + 들보를 받치는 공포(금색 받침)
    for (var k = 1.2; k < 22; k += 1.75) {
      poly(c, [at(k - .2, WALL - 30, .35), at(k + .2, WALL - 30, .35), at(k + .2, WALL - 18, .35), at(k - .2, WALL - 18, .35)], vol(c, "#c99a3a", at(k, WALL - 24, .35)[0], at(k, WALL - 24, .35)[1], 8), OL, .8);
    }
    poly(c, [at(0, WALL - 18, .45), at(22, WALL - 18, .45), at(22, WALL, .45), at(0, WALL, .45)], "#2b120c", OL, 1);
    poly(c, [at(0, WALL, 0), at(22, WALL, 0), at(22, WALL, .45), at(0, WALL, .45)], "#5a2616");
    line2(c, at(0, WALL - 14, .45), at(22, WALL - 14, .45), "#d9a441", 2);
    line2(c, at(0, WALL - 4, .45), at(22, WALL - 4, .45), "rgba(217,164,65,.6)", 1);
  }
  function pillar(c, base) {
    var x = base[0], y = base[1], w = 9;
    ell(c, x + 6, y + 3, 16, 6, "rgba(0,0,0,.35)");
    c.fillStyle = lg(c, x - w, 0, x + w, 0, [[0, "#9a2a1e"], [.3, "#d9483a"], [.55, "#a52a1f"], [1, "#3a0a07"]]); // 왼쪽(창 쪽)이 밝은 원기둥
    c.fillRect(x - w, y - WALL - 20, w * 2, WALL + 20);
    c.fillStyle = "rgba(255,230,200,.25)"; c.fillRect(x - w * .45, y - WALL - 20, 2, WALL + 12);          // 옻칠 반사광
    ell(c, x, y, w, 4.5, "#4a0f0a");
    // 주춧돌 (두께 있는 받침)
    c.fillStyle = lg(c, x - w - 4, 0, x + w + 4, 0, [[0, "#6a5a48"], [1, "#2e2418"]]); c.fillRect(x - w - 4, y - 9, w * 2 + 8, 9);
    ell(c, x, y - 9, w + 4, 4, "#8a7a64"); ell(c, x, y - 9, w, 3.6, "#4a0f0a");
    c.fillStyle = "#d9a441"; c.fillRect(x - w, y - WALL + 2, w * 2, 5); c.fillRect(x - w, y - 36, w * 2, 3);
  }
  function screen(c, at, light) {
    var hgt = 84;
    poly(c, [at(0, 0), at(1, 0), at(1, hgt), at(0, hgt)], shade("#e6c26a", light), OL, 2);
    // 먹으로 그린 산
    c.beginPath(); var s0 = at(0, 18); c.moveTo(s0[0], s0[1]);
    for (var i = 0; i <= 30; i++) { var u = i / 30, p = at(u, 22 + 34 * Math.abs(Math.sin(u * Math.PI * 2.4)) * (1 - .3 * Math.sin(u * 9))); c.lineTo(p[0], p[1]); }
    var e = at(1, 18); c.lineTo(e[0], e[1]); c.closePath(); c.fillStyle = "rgba(70,62,52,.55)"; c.fill();
    for (var k = 1; k < 4; k++) line2(c, at(k / 4, 0), at(k / 4, hgt), "rgba(90,60,20,.65)", 1.2);                // 병풍 폭 나눔
    for (var j = 1; j < 4; j++) { var a = at(j / 4, 0), b = at(j / 4, hgt); c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(a[0], b[1], 3, a[1] - b[1]); } // 접힌 골 그늘
    line2(c, at(0, hgt), at(1, hgt), "#5a2a14", 4);
  }
  var CANDLES = [iso(3.65, RUG - 1.35, DAIS), iso(3.65, RUG + 1.35, DAIS)];
  function candleStand(c, q) {
    ell(c, q[0] + 4, q[1] + 1, 9, 3.4, "rgba(0,0,0,.35)");
    ell(c, q[0], q[1] - 2, 7, 3, vol(c, "#8a6a2a", q[0], q[1] - 2, 7), OL, 1);          // 받침
    c.fillStyle = lg(c, q[0] - 2, 0, q[0] + 2, 0, [[0, "#d9b24a"], [1, "#5a4418"]]); c.fillRect(q[0] - 1.8, q[1] - 54, 3.6, 52); // 기둥
    ell(c, q[0], q[1] - 54, 8, 3, vol(c, "#b08d3a", q[0], q[1] - 54, 8), OL, 1);        // 접시
    c.fillStyle = "#f3ead8"; c.fillRect(q[0] - 2, q[1] - 64, 4, 10);                      // 초
  }
  function vase(c, q) {
    ell(c, q[0] + 6, q[1] + 2, 15, 5, "rgba(0,0,0,.35)");
    var body = "M" + (q[0] - 6) + "," + (q[1] - 44) + " Q" + (q[0] - 16) + "," + (q[1] - 30) + " " + (q[0] - 9) + "," + (q[1] - 2) + " L" + (q[0] + 9) + "," + (q[1] - 2) + " Q" + (q[0] + 16) + "," + (q[1] - 30) + " " + (q[0] + 6) + "," + (q[1] - 44) + " Z";
    svg(c, body, vol(c, "#eef0f2", q[0], q[1] - 26, 20), OL, 1.2);
    c.save(); c.clip(new Path2D(body));
    c.strokeStyle = "rgba(40,70,150,.75)"; c.lineWidth = 1.6;                          // 청화 무늬
    for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(q[0] - 14, q[1] - 30 + i * 5); c.bezierCurveTo(q[0] - 6, q[1] - 36 + i * 5, q[0] + 4, q[1] - 24 + i * 5, q[0] + 14, q[1] - 30 + i * 5); c.stroke(); }
    c.fillStyle = "rgba(40,70,150,.7)"; c.fillRect(q[0] - 14, q[1] - 12, 28, 3); c.fillRect(q[0] - 10, q[1] - 42, 20, 2);
    c.restore();
    ell(c, q[0], q[1] - 44, 6, 2, "#2a3a6a", OL, 1);
    ell(c, q[0] - 5, q[1] - 32, 2, 5, "rgba(255,255,255,.6)");                           // 도자기 반짝임
  }

  /* ── 5. 매 프레임: 등불·연기 + 인물 + 이름표 + 말풍선 ─────── */
  var NAMES = Object.keys(CAST), speaker = "", typing = false, ctx = null, bg = null; // typing: 대사 글자가 찍히는 중(입이 움직임)
  var LANTERNS = [[1.2, 9.6, 135], [1.2, 14, 135], [6, 1.2, 135], [12, 1.2, 135]].map(function (l) { return iso(l[0], l[1], l[2]); });
  function frame(ms) {
    var c = ctx, t = ms / 1000;
    c.setTransform(K, 0, 0, K, 0, 0);
    c.drawImage(bg, 0, 0, W, H);
    // 매달린 붉은 등 (살짝 깜빡이는 불빛)
    LANTERNS.forEach(function (p, i) {
      var fl = .75 + .25 * Math.sin(t * 3 + i * 1.7) * Math.sin(t * 1.3 + i);
      var g = c.createRadialGradient(p[0], p[1], 2, p[0], p[1], 60);
      g.addColorStop(0, "rgba(255,190,90," + (.45 * fl) + ")"); g.addColorStop(1, "rgba(255,150,60,0)");
      c.fillStyle = g; c.fillRect(p[0] - 60, p[1] - 60, 120, 120);
      c.strokeStyle = "#2a120a"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p[0], p[1] - 16); c.lineTo(p[0], 0); c.stroke();
      ell(c, p[0], p[1], 11, 14, "#d23a26", OL, 1.4);
      c.fillStyle = "#d9a441"; c.fillRect(p[0] - 6, p[1] - 17, 12, 4); c.fillRect(p[0] - 6, p[1] + 13, 12, 4);
      c.strokeStyle = "rgba(120,20,10,.6)"; c.lineWidth = 1; c.beginPath(); c.moveTo(p[0], p[1] - 13); c.lineTo(p[0], p[1] + 13); c.stroke();
    });
    // 햇살 기둥: 창에서 바닥의 빛 웅덩이까지 비스듬히 (천천히 밝기가 일렁임)
    c.save(); c.globalCompositeOperation = "lighter";
    SUN.forEach(function (w, i) {
      var top = [iso(0, w[0], 112), iso(0, w[1], 112)], fl = pool(w), al = .075 + .025 * Math.sin(t * .6 + i);
      var g = c.createLinearGradient(top[0][0], top[0][1], fl[2][0], fl[2][1]);
      g.addColorStop(0, "rgba(255,210,140," + al + ")"); g.addColorStop(1, "rgba(255,210,140,0)");
      poly(c, [top[0], top[1], iso(0, w[1], 50), fl[2], fl[3], iso(0, w[0], 50)], g);
      // 빛 속을 떠다니는 먼지
      for (var k = 0; k < 7; k++) {
        var ph = (t * .05 + k * .137 + i * .31) % 1, u = w[0] + (w[1] - w[0]) * ((k * .379 + i * .21) % 1);
        var pz = iso(ph * 3.3, u + ph * 1.8, 112 - ph * 100 + Math.sin(t + k) * 4);
        ell(c, pz[0], pz[1], 1.1, 1.1, "rgba(255,236,200," + (.5 * Math.sin(ph * Math.PI)).toFixed(2) + ")");
      }
    });
    c.restore();
    // 촛불 (흔들리는 불꽃 + 둥근 불빛)
    CANDLES.forEach(function (q, i) {
      var fx = q[0] + Math.sin(t * 9 + i) * .8, fy = q[1] - 69, fl = .8 + .2 * Math.sin(t * 11 + i * 3);
      var g = c.createRadialGradient(fx, fy, 1, fx, fy, 34);
      g.addColorStop(0, "rgba(255,200,110," + (.5 * fl) + ")"); g.addColorStop(1, "rgba(255,160,60,0)");
      c.fillStyle = g; c.fillRect(fx - 34, fy - 34, 68, 68);
      ell(c, fx, fy, 2.4, 5 * fl, "#ffb347"); ell(c, fx, fy + 1.2, 1.2, 2.6 * fl, "#fff4c8");
    });
    // 향 연기
    var q = iso(5.1, RUG);
    for (var k = 0; k < 5; k++) {
      var ph = (t * .35 + k / 5) % 1;
      ell(c, q[0] + Math.sin(t * 1.4 + k * 2) * 6 * ph, q[1] - 18 - ph * 70, 3 + ph * 8, 2.5 + ph * 5, "rgba(235,228,215," + (.35 * (1 - ph)) + ")");
    }
    // 인물: 뒤(화면 위)에 있는 사람부터 그립니다
    var people = NAMES.map(function (n) { var s = CAST[n]; var p = iso(s.x, s.y); return { n: n, s: s, x: p[0], y: p[1] - (n === "제갈량" ? 16 : 0) }; })
      .sort(function (a, b) { return a.y - b.y; });
    people.forEach(function (o) {
      var talk = o.n === speaker, bob = still ? 0 : Math.sin(t * 2.2 + o.s.x * 1.7) * .6;
      var hop = 0;
      // 부드러운 그림자: 빛이 왼쪽 위에서 오므로 오른쪽 아래로 비껴 떨어집니다
      c.save(); c.translate(o.x + 7, o.y + 2); c.scale(1.7, .55);
      var sg = c.createRadialGradient(0, 0, 1, 0, 0, 15);
      sg.addColorStop(0, "rgba(0,0,0,.5)"); sg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = sg; c.fillRect(-15, -15, 30, 30); c.restore();
      ell(c, o.x, o.y, 11, 3.6, "rgba(0,0,0,.35)");                                          // 발이 닿은 곳
      if (talk) ell(c, o.x, o.y, 17, 6, null, "rgba(255,210,100,.9)", 2);                     // 말하는 사람: 금빛 고리
      var sz = o.s.size || 1.05;                                                       // 승상은 조금 크게
      c.save(); c.translate(o.x, o.y + bob + hop); c.scale(sz, sz);
      A = talk && !still ? { t: t, mouth: typing ? Math.abs(Math.sin(t * 11)) : 0 } : null;
      chibi(c, o.s, o.s.f);
      A = null;
      c.restore();
      if (talk) dots(c, o.x, o.y + hop - (o.s.bubble || 104), t);
    });
    people.forEach(function (o) { plate(c, o.n, o.x, o.y + 16, o.n === speaker, o.s.rival); });
  }
  // 이름표
  function plate(c, n, x, y, on, rival) {
    c.font = "700 11px 'Gowun Batang', 'Noto Serif KR', serif"; c.textAlign = "center"; c.textBaseline = "middle";
    var w = c.measureText(n).width + 12;
    rrect(c, x - w / 2, y - 8, w, 16, 4);
    c.fillStyle = on ? "rgba(232,190,90,.95)" : rival ? "rgba(58,32,88,.9)" : "rgba(20,12,8,.72)"; c.fill(); // 맞수(사마의)는 보랏빛
    c.strokeStyle = on ? "#5a3a14" : rival ? "rgba(190,160,230,.7)" : "rgba(201,162,74,.6)"; c.lineWidth = 1; c.stroke();
    c.fillStyle = on ? "#2a1a0a" : "#f3e6c8"; c.fillText(n, x, y + .5);
  }
  // 말하는 중 '…' 말풍선
  function dots(c, x, y, t) {
    rrect(c, x - 16, y - 11, 32, 20, 8); c.fillStyle = "#fffaf0"; c.fill(); c.strokeStyle = OL; c.lineWidth = 1.4; c.stroke();
    poly(c, [[x - 4, y + 8], [x + 4, y + 8], [x, y + 14]], "#fffaf0", OL, 1.2);
    c.fillStyle = "#fffaf0"; c.fillRect(x - 3.4, y + 6, 6.8, 3);
    var n = still ? 3 : 1 + Math.floor(t * 3) % 3;
    for (var i = 0; i < 3; i++) ell(c, x - 8 + i * 8, y - 1, 2.2, 2.2, i < n ? "#3a2a1a" : "rgba(58,42,26,.2)");
  }

  var last = 0, running = false;
  function loop(ms) { if (!running) return; if (ms - last > 45) { frame(ms); last = ms; } requestAnimationFrame(loop); }
  function startScene() {
    if (!cv || !cv.getContext) return;
    cv.width = W * K; cv.height = H * K;
    ctx = cv.getContext("2d");
    bg = document.createElement("canvas"); bg.width = W * K; bg.height = H * K;
    var b = bg.getContext("2d"); b.setTransform(K, 0, 0, K, 0, 0); background(b);
    frame(0);
    if (!still && !running) { running = true; requestAnimationFrame(loop); }
  }
  function redraw() { if (ctx && still) frame(0); } // 움직임 줄이기 설정일 땐 말하는 사람이 바뀔 때만 다시 그립니다
  function artFailed() { HAS_ART = false; courtEl.classList.remove("has-art"); startScene(); }
  if (HAS_ART && artImg && artImg.complete && !artImg.naturalWidth) artFailed(); // 그림 파일이 이미 깨져 있음
  else if (!HAS_ART) startScene();
  else if (artImg) artImg.addEventListener("error", artFailed);                  // 그림 파일이 깨졌으면 코드 장면으로

  /* ── 6. 대화창: 승상의 한마디 → 신하들의 대답을 차례로 ────────
   * 대화창을 누르면(또는 Enter/스페이스) 글자 찍기를 건너뛰거나 다음 대사로 넘어갑니다.
   * 저절로 넘어가지 않습니다 — 누를 때까지 그 대사에 머무릅니다. 마지막 대사에서 누르면 처음부터 다시. */
  var talk = document.getElementById("talk"), tName = document.getElementById("talk-name"),
      tText = document.getElementById("talk-text"), tSrc = document.getElementById("talk-src"),
      tImg = document.getElementById("talk-img"), tCv = document.getElementById("talk-canvas"),
      tNext = document.getElementById("talk-next"),
      tStep = document.getElementById("talk-step");
  var LINES = [{ who: "제갈량", text: DATA.saying || (tText ? tText.textContent : ""), src: DATA.event || "" }]
    .concat((DATA.replies || []).map(function (r) { return { who: r.who || "신하", text: r.text || "" }; }))
    .concat(DATA.rival ? [{ who: "사마의", text: DATA.rival, tag: "맞수의 한마디" }] : []); // 조회의 마지막: 적국 위의 사마의가 반대편에서 한마디
  var PORTRAITS = DATA.portraits || {};
  var idx = 0, pos = 0, timer = null;

  // 초상화: 그림 파일이 있으면 그것, 없으면 SD 캐릭터 얼굴을 크게 그려 씁니다
  function portrait(who) {
    var url = PORTRAITS[who];
    if (url && tImg) { tImg.hidden = false; tCv.hidden = true; if (tImg.getAttribute("src") !== url) tImg.src = url; return; }
    if (tImg) tImg.hidden = true;
    if (!tCv || !tCv.getContext) return;
    tCv.hidden = false;
    var c = tCv.getContext("2d"), sp = CAST[who] || { robe: "#6a5a48", trim: "#e0d0a0", hat: "guan", beard: "short", mood: "calm", hold: "tablet" };
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = lg(c, 0, 0, 0, 280, [[0, "#3a2418"], [1, "#140c08"]]); c.fillRect(0, 0, 240, 280);
    c.save(); c.translate(120, 322); c.scale(3.1, 3.1); chibi(c, sp, 0); c.restore(); // 머리가 가운데 오도록 크게
  }
  if (tImg) tImg.addEventListener("error", function () { var w = LINES[idx] && LINES[idx].who; delete PORTRAITS[w]; portrait(w); });

  function clear() { if (timer) { clearTimeout(timer); timer = null; } }
  function show(i) {
    clear(); idx = i; pos = 0;
    var L = LINES[i], sp = CAST[L.who];
    speaker = L.who; redraw();
    if (tName) tName.innerHTML = "";
    if (tName) {
      tName.appendChild(document.createTextNode(L.who));
      if (sp && sp.hj) { var s = document.createElement("span"); s.textContent = sp.hj; tName.appendChild(s); }
      var tag = i === 0 ? "오늘의 한마디" : L.tag;
      if (tag) { var s2 = document.createElement("em"); s2.textContent = tag; if (sp && sp.rival) s2.className = "rival"; tName.appendChild(s2); }
    }
    if (tSrc) tSrc.textContent = L.src ? "— 근거: " + L.src : "";
    if (tStep) tStep.textContent = (i + 1) + " / " + LINES.length;
    if (talk) talk.classList.remove("done");
    if (tNext) tNext.textContent = i === LINES.length - 1 ? "끝 · 누르면 처음부터 ↻" : "눌러서 계속 ▼";
    portrait(L.who);
    if (still) { finish(); return; }
    typing = true;
    tText.textContent = "";
    type();
  }
  function type() {
    var L = LINES[idx];
    pos++; tText.textContent = L.text.slice(0, pos);
    if (pos < L.text.length) timer = setTimeout(type, 38); else finish();
  }
  function finish() {
    clear(); typing = false;
    var L = LINES[idx];
    tText.textContent = L.text;
    if (talk) talk.classList.add("done");
    // 다음 대사로는 누를 때만 넘어갑니다. 오른쪽 아래 안내 글로 알려 줍니다
    var last = idx === LINES.length - 1;
    if (tNext) tNext.textContent = last ? "끝 · 누르면 처음부터 ↻" : "눌러서 계속 ▼";
  }
  function next() {
    if (!tText) return;
    if (pos < LINES[idx].text.length && !still && !talk.classList.contains("done")) finish();
    else if (idx < LINES.length - 1) show(idx + 1);
    else show(0);
  }
  if (talk && tText) {
    talk.addEventListener("click", next);
    talk.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); next(); } });
    show(0);
  }
  var replay = document.getElementById("court-replay"), go = document.getElementById("court-go");
  if (replay) replay.addEventListener("click", function () { show(0); });
  if (go) go.addEventListener("click", function () { document.querySelector(".stage").scrollIntoView({ behavior: still ? "auto" : "smooth" }); });
})();
