/* ───────────────────────────────────────────────────────────────
 * court.js — 승상부 조회(朝會) 장면: 조조전 느낌의 쿼터뷰 + SD(머리 큰 아기자기한) 캐릭터
 *
 * 화면 구성
 *   ① 캔버스: 대각선 위에서 내려다본 대전(쿼터뷰). 단상 위 제갈량, 붉은 융단 양옆에 장수 9명.
 *      왼쪽 = 문관(장완·비의·동윤·양의·마속), 오른쪽 = 무장(강유·조운·위연·왕평).
 *   ② 아래 대화창: 말하는 사람의 초상화 + 이름 + 대사. 승상 → 신하들 순서로 차례로 말합니다.
 *      말하는 캐릭터는 머리 위에 '…' 말풍선이 뜨고 통통 튑니다. 대화창을 누르면 다음 대사로 넘어갑니다.
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
   * robe: 옷 색 / trim: 깃·단 색 / armor: 갑옷 색(무장만) / hat: guanjin(윤건)·guan(관모)·scarf(복건)·helmet(투구)·band(머리띠)
   * beard: long·grey·full·short·goatee·mustache·stubble·none / mood: 표정 / hold: 든 물건
   * t, d: 서 있는 자리 — 단상에서 융단을 따라 t칸 앞, 옆으로 d칸 (음수 = 화면 왼쪽). 두 줄로 가로로 늘어섭니다. */
  var CAST = {
    "제갈량": { hj: "諸葛亮", robe: "#f5f2ea", trim: "#27335c", hat: "guanjin", beard: "long", mood: "calm", hold: "fan", t: 2.3, d: 0 },
    "장완": { hj: "蔣琬", robe: "#3f7a52", trim: "#eadcae", hat: "guan", beard: "short", mood: "calm", hold: "tablet", t: 5.6, d: -1.8 },
    "비의": { hj: "費禕", robe: "#4b8cc4", trim: "#f2e5bb", hat: "guan", beard: "mustache", mood: "happy", hold: "tablet", t: 5.6, d: -3.1 },
    "동윤": { hj: "董允", robe: "#62437e", trim: "#dcc68c", hat: "guan", beard: "grey", mood: "stern", hold: "tablet", t: 5.6, d: -4.4, hair: "#8f8b86" },
    "양의": { hj: "楊儀", robe: "#7d6b57", trim: "#dccda3", hat: "guan", beard: "goatee", mood: "sly", hold: "tablet", t: 7.6, d: -2.5 },
    "마속": { hj: "馬謖", robe: "#2e8984", trim: "#f2e7c2", hat: "scarf", beard: "none", mood: "proud", hold: "scroll", t: 7.6, d: -3.8 },
    "강유": { hj: "姜維", robe: "#2f4f8f", armor: "#9fb2cc", hat: "band", band: "#cc3328", beard: "none", mood: "eager", hold: "spear", t: 5.6, d: 1.8 },
    "조운": { hj: "趙雲", robe: "#c9d2de", armor: "#eef1f6", cape: "#fbfbfb", hat: "helmet", plume: "#ffffff", beard: "none", mood: "calm", hold: "spear", t: 5.6, d: 3.1 },
    "위연": { hj: "魏延", robe: "#5a1d15", armor: "#9a3526", hat: "helmet", plume: "#221a18", beard: "full", mood: "angry", hold: "glaive", t: 5.6, d: 4.4, skin: "#e0ab7f" },
    "왕평": { hj: "王平", robe: "#4c3b2a", armor: "#86663f", hat: "helmet", plume: "#9b3b2a", beard: "stubble", mood: "calm", hold: "sword", t: 7.6, d: 2.5 },
  };
  var OL = "#2a1a12"; // 캐릭터 외곽선 색

  /* ── 2. 쿼터뷰 좌표 ──────────────────────────────────────── */
  var W = 960, H = 540, OX = 480, OY = 105;
  function iso(x, y, z) { return [OX + (x - y) * 32, OY + (x + y) * 16 - (z || 0)]; }
  // 융단 가운데 줄을 따라 t칸 앞으로, 옆으로 d칸(음수=화면 왼쪽) 떨어진 곳
  function spot(t, d) { return iso(t + d, t - d, 0); }

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
  // 색을 조금 어둡게 (그림자 면에 사용)
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return "rgb(" + [r, g, b].map(function (v) { return Math.round(v * k); }).join(",") + ")";
  }

  /* ── 3. SD 캐릭터 한 명 그리기 ─────────────────────────────
   * 기준점(0,0)은 발밑. 위쪽이 음수. 키는 약 75px (머리가 몸의 절반쯤 되는 SD 비율).
   * f: 얼굴이 향한 쪽 (-1 왼쪽, 0 정면, 1 오른쪽) — 눈·입·수염을 그쪽으로 조금 옮겨 고개를 돌린 느낌을 냅니다. */
  function chibi(c, sp, f) {
    var skin = sp.skin || "#f7d9ba", hair = sp.hair || "#1c1512", armor = sp.armor, side = f || 1;
    c.lineJoin = "round"; c.lineCap = "round";
    // 망토(몸 뒤)
    if (sp.cape) svg(c, "M-12,-33 Q-19,-12 -16,-1 L16,-1 Q19,-12 12,-33 Z", sp.cape, OL, 1.3);
    // 긴 무기는 몸 뒤쪽에 세워 들고 있습니다
    if (sp.hold === "spear" || sp.hold === "glaive") weapon(c, sp, side);
    // 신발
    ell(c, -5, -2, 4.6, 2.8, "#2a211d", OL, 1); ell(c, 5, -2, 4.6, 2.8, "#2a211d", OL, 1);
    // 몸통(옷)
    svg(c, "M-9,-31 L9,-31 Q12,-16 14,-4 Q0,0 -14,-4 Q-12,-16 -9,-31 Z", sp.robe, OL, 1.4);
    if (armor) {
      svg(c, "M-8.5,-30 L8.5,-30 L9.5,-13 Q0,-11 -9.5,-13 Z", armor, OL, 1.1);                 // 가슴 갑옷
      c.strokeStyle = shade(armor, .72); c.lineWidth = .9;
      for (var yy = -26; yy < -13; yy += 3.2) { c.beginPath(); c.moveTo(-8.5, yy); c.lineTo(8.5, yy); c.stroke(); } // 비늘 줄
      svg(c, "M-12,-10 L12,-10 L13,-4 Q0,-1 -13,-4 Z", shade(armor, .85), OL, 1);            // 허리 아래 갑옷 자락
      ell(c, 0, -13, 3, 2.2, "#d9b24a", OL, .8);                                            // 허리띠 장식
    } else {
      svg(c, "M-14,-4 Q0,0 14,-4 L13.4,-7 Q0,-3.5 -13.4,-7 Z", sp.trim);                    // 옷단
      c.strokeStyle = sp.trim; c.lineWidth = 2.6;
      c.beginPath(); c.moveTo(-6, -31); c.lineTo(1, -21); c.moveTo(6, -31); c.lineTo(-1, -22); c.stroke(); // 여민 깃
      svg(c, "M-10,-18 L10,-18 L10.4,-15 L-10.4,-15 Z", shade(sp.trim, .7));                   // 허리띠
    }
    // 소매·팔
    var sleeve = armor ? shade(armor, .9) : sp.robe;
    ell(c, -10.5, -21, 4.6, 7.2, sleeve, OL, 1.2); ell(c, 10.5, -21, 4.6, 7.2, sleeve, OL, 1.2);
    if (armor) { ell(c, -10.5, -28, 5.4, 3.8, armor, OL, 1.1); ell(c, 10.5, -28, 5.4, 3.8, armor, OL, 1.1); } // 어깨 갑옷
    held(c, sp, side, skin);
    head(c, sp, f || 0, skin, hair);
  }

  // 긴 무기 (창·언월도): 얼굴이 향한 쪽 손에 세워 듭니다
  function weapon(c, sp, side) {
    var x = 17 * side; // 몸통 바깥쪽에 세워야 자루가 보입니다
    c.strokeStyle = "#5a3a22"; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x, 2); c.lineTo(x, -66); c.stroke();
    if (sp.hold === "spear") {
      poly(c, [[x - 3, -66], [x, -78], [x + 3, -66]], "#dfe5ec", OL, 1);
      ell(c, x, -64, 3.4, 2.2, "#c8322a");                                                   // 붉은 술
    } else {
      svg(c, "M" + x + ",-66 Q" + (x + 12 * side) + ",-74 " + (x + 9 * side) + ",-88 Q" + (x + 2 * side) + ",-78 " + x + ",-80 Z", "#d9dee4", OL, 1.1); // 언월도 날
      ell(c, x, -64, 3, 2, "#2c7a3a");
    }
  }

  // 손과 든 물건
  function held(c, sp, side, skin) {
    var h = sp.hold;
    if (h === "tablet") {                     // 홀(笏): 문관이 두 손으로 받쳐 드는 판
      c.save(); c.translate(0, -22); c.rotate(-.12 * side);
      svg(c, "M-2,-8 L2,-8 L2.4,6 L-2.4,6 Z", "#efe7d2", OL, 1); c.restore();
      ell(c, 0, -17, 4.4, 3.2, skin, OL, 1);
    } else if (h === "fan") {                  // 제갈량의 학우선(깃털 부채)
      var fx = 9 * side;
      c.save(); c.translate(fx, -22); c.rotate(-.35 * side);
      svg(c, "M0,2 C-8,-4 -8,-16 0,-19 C8,-16 8,-4 0,2 Z", "#ffffff", OL, 1.1);
      c.strokeStyle = "rgba(120,125,135,.6)"; c.lineWidth = .7;
      for (var k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, 1); c.lineTo(k * 2.6, -16 + Math.abs(k)); c.stroke(); }
      c.fillStyle = "#6a4a2a"; c.fillRect(-1, 1, 2, 5); c.restore();
      ell(c, fx, -17, 3.4, 3, skin, OL, 1);
    } else if (h === "scroll") {               // 마속의 병법서 두루마리
      c.save(); c.translate(0, -19);
      svg(c, "M-8,-3 L8,-3 L8,3 L-8,3 Z", "#efe0b8", OL, 1);
      ell(c, -8, 0, 1.6, 3.4, "#8a5a36", OL, .8); ell(c, 8, 0, 1.6, 3.4, "#8a5a36", OL, .8); c.restore();
      ell(c, -5, -17, 3, 2.6, skin, OL, 1); ell(c, 5, -17, 3, 2.6, skin, OL, 1);
    } else if (h === "sword") {                // 왕평: 허리에 찬 칼
      c.save(); c.translate(-6 * side, -12); c.rotate(.9 * side);
      c.fillStyle = "#3a2a1e"; c.fillRect(-1.6, -2, 3.2, 20); c.fillStyle = "#d9b24a"; c.fillRect(-3, -3, 6, 2);
      c.restore();
      ell(c, 11 * side, -16, 3.2, 3, skin, OL, 1); ell(c, -11 * side, -16, 3.2, 3, skin, OL, 1);
    } else {                                   // 창·언월도를 쥔 손
      ell(c, 16 * side, -24, 3.4, 3.2, skin, OL, 1);
      ell(c, -10.5 * side, -16, 3.2, 3, skin, OL, 1);
    }
  }

  // 머리: 뒷머리 → 얼굴 → 앞머리 → 눈썹·눈·볼·입 → 수염 → 모자
  function head(c, sp, f, skin, hair) {
    var hy = -46, fx = f * 3.2, m = sp.mood;
    if (sp.hat === "guanjin") {                                                 // 윤건의 끈 두 가닥 (머리 뒤로 늘어짐)
      svg(c, "M-9," + (hy - 8) + " Q-17," + (hy + 8) + " -12," + (hy + 24) + " L-9," + (hy + 23) + " Q-13," + (hy + 8) + " -6," + (hy - 7) + " Z", "#23233a");
      svg(c, "M9," + (hy - 8) + " Q17," + (hy + 8) + " 12," + (hy + 24) + " L9," + (hy + 23) + " Q13," + (hy + 8) + " 6," + (hy - 7) + " Z", "#23233a");
    }
    ell(c, 0, hy - 1, 16, 15.5, hair, OL, 1.4);                                   // 뒷머리
    ell(c, fx * .35, hy + 2.5, 13.6, 12.6, skin, OL, 1.2);                        // 얼굴
    c.beginPath(); c.ellipse(0, hy - 1.5, 15.2, 10.5, 0, Math.PI, 0); c.fillStyle = hair; c.fill(); // 앞머리
    svg(c, "M" + (-15 + fx) + "," + (hy - 1) + " Q" + (-9 + fx) + "," + (hy - 5) + " " + (-3 + fx) + "," + (hy - 1) + " Q" + (3 + fx) + "," + (hy - 6) + " " + (9 + fx) + "," + (hy - 1) + " Q" + (13 + fx) + "," + (hy - 4) + " 15.2," + (hy - 1.5) + " L15.2," + (hy - 3) + " L-15.2," + (hy - 3) + " Z", hair);

    var ex = 5.2, ey = hy + 4, brow = sp.hair && sp.beard === "grey" ? "#6f6a64" : "#1c1410";
    // 눈썹 (표정의 절반은 눈썹입니다)
    c.strokeStyle = brow; c.lineWidth = 1.5;
    var tilt = { stern: 2.2, angry: 3, sly: -1, proud: -.6, eager: -1.4, happy: -1, calm: 0 }[m] || 0;
    c.beginPath();
    c.moveTo(fx - ex - 3, ey - 6 - tilt); c.lineTo(fx - ex + 2.5, ey - 6 + tilt * .6);
    c.moveTo(fx + ex + 3, ey - 6 - tilt + (m === "sly" ? -1.6 : 0)); c.lineTo(fx + ex - 2.5, ey - 6 + tilt * .6);
    c.stroke();
    // 눈
    c.fillStyle = "#1d1410"; c.strokeStyle = "#1d1410"; c.lineWidth = 1.5;
    if (m === "happy") {                        // 웃는 눈 ^ ^
      [-ex, ex].forEach(function (x) { c.beginPath(); c.moveTo(fx + x - 2.4, ey + 1); c.quadraticCurveTo(fx + x, ey - 2.4, fx + x + 2.4, ey + 1); c.stroke(); });
    } else if (m === "sly" || m === "proud") {  // 가늘게 뜬 눈
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
    var my = ey + 7.5;
    c.strokeStyle = "#7a3a2a"; c.lineWidth = 1.2; c.beginPath();
    if (m === "happy" || m === "eager") { c.moveTo(fx - 2.6, my - .6); c.quadraticCurveTo(fx, my + 2.4, fx + 2.6, my - .6); }
    else if (m === "stern") { c.moveTo(fx - 2.4, my + .6); c.quadraticCurveTo(fx, my - .8, fx + 2.4, my + .6); }
    else if (m === "sly" || m === "proud") { c.moveTo(fx - 2, my); c.quadraticCurveTo(fx + 1, my + 1, fx + 3, my - 1.4); }
    else if (m !== "angry") { c.moveTo(fx - 1.8, my); c.lineTo(fx + 1.8, my); }
    c.stroke();
    beard(c, sp.beard, fx, ey, sp.hair);
    if (m === "angry") svg(c, "M" + (fx - 3.6) + "," + (my - 1.4) + " L" + (fx + 3.6) + "," + (my - 1.4) + " Q" + fx + "," + (my + 3.6) + " " + (fx - 3.6) + "," + (my - 1.4) + " Z", "#fff6ea", "#5a2418", 1); // 위연의 이 드러낸 웃음
    hat(c, sp, f, hy);
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
    } else if (b === "stubble") {
      ell(c, fx, y + 2, 8.5, 4.6, "rgba(50,35,25,.28)");
    }
  }

  // 모자: 머리 중심(hy)을 원점으로 옮겨 놓고 그립니다
  function hat(c, sp, f, hy) {
    var k = sp.hat, b = -f * 1.6; // 모자 뒤쪽 장식은 얼굴 반대쪽으로 살짝
    c.save(); c.translate(0, hy);
    if (k === "guan") {            // 관모(문관): 검은 모자 + 뒤로 솟은 판
      svg(c, "M-13,-5 Q-13,-16 0,-17 Q13,-16 13,-5 Q0,-8 -13,-5 Z", "#1a1a20", OL, 1.1);
      svg(c, "M" + (b - 6) + ",-14 L" + (b - 4.5) + ",-27 L" + (b + 5.5) + ",-27 L" + (b + 7) + ",-14 Z", "#1a1a20", OL, 1.1);
      c.strokeStyle = "#c9a24a"; c.lineWidth = .9; c.beginPath(); c.moveTo(b - 4.8, -24); c.lineTo(b + 5.8, -24); c.stroke();
    } else if (k === "guanjin") {  // 윤건(제갈량): 골이 진 검은 비단 두건
      svg(c, "M-13,-4 Q-14,-18 -6,-24 L6,-24 Q14,-18 13,-4 Q0,-8 -13,-4 Z", "#23233a", OL, 1.1);
      c.strokeStyle = "rgba(160,160,200,.45)"; c.lineWidth = .9;
      for (var i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 2.6, -22); c.lineTo(i * 3.3, -6); c.stroke(); }
    } else if (k === "scarf") {    // 복건(선비의 두건) + 뒤로 늘어진 자락
      var s = f ? -f : 1;
      svg(c, "M" + (s * 8) + ",-10 Q" + (s * 18) + ",-4 " + (s * 16) + ",10 L" + (s * 12) + ",8 Q" + (s * 13) + ",-2 " + (s * 4) + ",-8 Z", "#1e1e24", OL, 1);
      ell(c, 0, -7, 15, 9.5, "#1e1e24", OL, 1.1);
    } else if (k === "helmet") {   // 투구(무장) + 술
      svg(c, "M-15,-5 Q-15,-24 0,-26 Q15,-24 15,-5 L11,-6 Q11,-16 0,-17 Q-11,-16 -11,-6 Z", sp.armor, OL, 1.2);
      svg(c, "M-12,-17 Q0,-21 12,-17 L12,-14 Q0,-18 -12,-14 Z", "#d9b24a");
      c.strokeStyle = "#5a3a22"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -26); c.lineTo(0, -31); c.stroke();
      svg(c, "M0,-31 Q" + (b * 4 - 7) + ",-40 " + (b * 5 - 3) + ",-44 Q" + (b * 2 + 4) + ",-38 2,-30 Z", sp.plume, OL, .9);
    } else if (k === "band") {     // 강유: 상투 + 붉은 머리띠(끈이 뒤로 날림)
      var d = f ? -f : 1;
      ell(c, 0, -16, 5.2, 5, "#1c1512", OL, 1.1);
      c.fillStyle = sp.band; c.fillRect(-15, -6, 30, 3.6);
      svg(c, "M" + (d * 13) + ",-5 q" + (d * 7) + ",2 " + (d * 10) + ",9 l" + (-d * 3) + ",0 q" + (-d * 2) + ",-5 " + (-d * 7) + ",-7 Z", sp.band);
    }
    c.restore();
  }

  /* ── 4. 배경: 대전 (한 번만 그려 bg 캔버스에 보관) ─────────── */
  var K = Math.min(2, window.devicePixelRatio || 1); // 고해상도 화면에서도 선명하게
  var WALL = 150;                                     // 벽 높이(픽셀)
  function background(c) {
    c.fillStyle = "#140c08"; c.fillRect(0, 0, W, H);
    // 바닥: 나무 마루 (칸마다 색을 살짝 달리해 결을 냅니다)
    for (var x = 0; x < 22; x++) for (var y = 0; y < 22; y++) {
      var v = ((x * 7 + y * 13) % 5) / 5, dark = (x + y) % 2;
      poly(c, [iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)],
        "rgb(" + Math.round(104 + v * 14 - dark * 10) + "," + Math.round(66 + v * 9 - dark * 7) + "," + Math.round(40 + v * 6 - dark * 5) + ")",
        "rgba(40,22,12,.55)", 1);
    }
    // 뒤쪽 두 벽 (왼쪽 벽: x=0, 오른쪽 벽: y=0)
    wall(c, function (u, z) { return iso(0, u, z); }, "#6e1d14", "#4a130d");
    wall(c, function (u, z) { return iso(u, 0, z); }, "#7c2217", "#561710");
    // 붉은 기둥 (벽을 따라)
    [3.5, 7, 10.5, 14, 17.5].forEach(function (k) { pillar(c, iso(.35, k)); pillar(c, iso(k, .35)); });
    // 융단: 단상 앞에서 화면 아래까지
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    poly(c, [spot(4, -1), spot(4, 1), spot(22, 1), spot(22, -1)], "#9c1f18");
    poly(c, [spot(4, -1), spot(4, 1), spot(22, 1), spot(22, -1)], null, "#e0b44c", 3);
    poly(c, [spot(4.2, -.72), spot(4.2, .72), spot(22, .72), spot(22, -.72)], null, "rgba(240,200,110,.55)", 1.2);
    for (var t = 5; t < 16; t += 1.1) {   // 융단 가운데 금색 무늬
      var p = spot(t, 0);
      poly(c, [[p[0], p[1] - 6], [p[0] + 11, p[1]], [p[0], p[1] + 6], [p[0] - 11, p[1]]], null, "rgba(236,190,90,.75)", 1.4);
    }
    c.restore();
    // 단상 (가로세로 0.6~4칸, 높이 16픽셀)
    var A = .6, B = 4, h = 16;
    poly(c, [iso(A, B, 0), iso(B, B, 0), iso(B, B, h), iso(A, B, h)], "#5a2a18", OL, 1);   // 왼쪽 앞면
    poly(c, [iso(B, A, 0), iso(B, B, 0), iso(B, B, h), iso(B, A, h)], "#6e341e", OL, 1);   // 오른쪽 앞면
    poly(c, [iso(A, A, h), iso(B, A, h), iso(B, B, h), iso(A, B, h)], "#a52a1f", OL, 1);   // 윗면
    poly(c, [iso(A + .25, A + .25, h), iso(B - .25, A + .25, h), iso(B - .25, B - .25, h), iso(A + .25, B - .25, h)], null, "#e0b44c", 2);
    // 금박 병풍 (단상 뒤, 두 벽을 따라 ㄱ자로)
    screen(c, function (u, z) { return iso(.75, .75 + u * 3, z + h); });
    screen(c, function (u, z) { return iso(.75 + u * 3, .75, z + h); });
    // 향로 (단상 앞 융단 위)
    var q = spot(4.7, 0);
    ell(c, q[0], q[1], 13, 5, "rgba(0,0,0,.3)");
    svg(c, "M" + (q[0] - 9) + "," + (q[1] - 14) + " Q" + q[0] + "," + (q[1] + 2) + " " + (q[0] + 9) + "," + (q[1] - 14) + " Z", "#8a6a2a", OL, 1.2);
    ell(c, q[0], q[1] - 14, 9, 3, "#b08d3a", OL, 1);
    [-6, 0, 6].forEach(function (dx) { c.strokeStyle = OL; c.lineWidth = 2; c.beginPath(); c.moveTo(q[0] + dx, q[1] - 5); c.lineTo(q[0] + dx * 1.2, q[1] + 1); c.stroke(); });
    // 전체에 따뜻한 빛
    c.fillStyle = lg(c, 0, 0, 0, H, [[0, "rgba(255,190,110,.10)"], [.6, "rgba(0,0,0,0)"], [1, "rgba(10,5,2,.35)"]]);
    c.fillRect(0, 0, W, H);
  }
  function wall(c, at, col, low) {
    poly(c, [at(0, 0), at(22, 0), at(22, WALL), at(0, WALL)], col);
    poly(c, [at(0, 0), at(22, 0), at(22, 28), at(0, 28)], low);                             // 아래 벽널
    poly(c, [at(0, WALL - 12), at(22, WALL - 12), at(22, WALL), at(0, WALL)], "#2b120c");  // 위 들보
    c.strokeStyle = "#d9a441"; c.lineWidth = 2; c.beginPath();
    var a = at(0, WALL - 12), b = at(22, WALL - 12); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    a = at(0, 28); b = at(22, 28); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    // 빛이 드는 창살 창
    [[5, 6.6], [8.5, 10.1], [12, 13.6], [15.5, 17.1]].forEach(function (w) {
      poly(c, [at(w[0], 50), at(w[1], 50), at(w[1], 112), at(w[0], 112)], "#f4c77a", "#3a140c", 3);
      c.strokeStyle = "rgba(90,30,14,.9)"; c.lineWidth = 1.3;
      for (var i = 1; i < 5; i++) { var u = w[0] + (w[1] - w[0]) * i / 5, p1 = at(u, 50), p2 = at(u, 112); c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke(); }
      for (var z = 60; z < 112; z += 10) { var p3 = at(w[0], z), p4 = at(w[1], z); c.beginPath(); c.moveTo(p3[0], p3[1]); c.lineTo(p4[0], p4[1]); c.stroke(); }
    });
  }
  function pillar(c, base) {
    var x = base[0], y = base[1], w = 9;
    c.fillStyle = "rgba(0,0,0,.28)"; c.beginPath(); c.ellipse(x + 4, y + 2, 14, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = lg(c, x - w, 0, x + w, 0, [[0, "#5a130d"], [.35, "#c0392b"], [.6, "#a52a1f"], [1, "#4a0f0a"]]);
    c.fillRect(x - w, y - WALL - 20, w * 2, WALL + 20);
    ell(c, x, y, w, 4.5, "#4a0f0a");
    c.fillStyle = "#3a2a1a"; c.fillRect(x - w - 3, y - 8, w * 2 + 6, 8);                  // 주춧돌
    c.fillStyle = "#d9a441"; c.fillRect(x - w, y - WALL + 2, w * 2, 5); c.fillRect(x - w, y - 36, w * 2, 3);
  }
  function screen(c, at) {
    var hgt = 84;
    poly(c, [at(0, 0), at(1, 0), at(1, hgt), at(0, hgt)], "#e6c26a", OL, 2);
    // 먹으로 그린 산
    c.beginPath(); var s0 = at(0, 18); c.moveTo(s0[0], s0[1]);
    for (var i = 0; i <= 30; i++) { var u = i / 30, p = at(u, 22 + 34 * Math.abs(Math.sin(u * Math.PI * 2.4)) * (1 - .3 * Math.sin(u * 9))); c.lineTo(p[0], p[1]); }
    var e = at(1, 18); c.lineTo(e[0], e[1]); c.closePath(); c.fillStyle = "rgba(70,62,52,.55)"; c.fill();
    c.strokeStyle = "rgba(90,60,20,.65)"; c.lineWidth = 1.2;
    for (var k = 1; k < 4; k++) { var a = at(k / 4, 0), b = at(k / 4, hgt); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); } // 병풍 폭 나눔
    var r1 = at(0, hgt), r2 = at(1, hgt); c.strokeStyle = "#5a2a14"; c.lineWidth = 4; c.beginPath(); c.moveTo(r1[0], r1[1]); c.lineTo(r2[0], r2[1]); c.stroke();
  }

  /* ── 5. 매 프레임: 등불·연기 + 인물 + 이름표 + 말풍선 ─────── */
  var NAMES = Object.keys(CAST), speaker = "", ctx = null, bg = null;
  var LANTERNS = [[1.2, 6, 170], [6, 1.2, 170], [1.2, 12, 170], [12, 1.2, 170]].map(function (l) { return iso(l[0], l[1], l[2]); });
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
    // 향 연기
    var q = spot(4.7, 0);
    for (var k = 0; k < 5; k++) {
      var ph = (t * .35 + k / 5) % 1;
      ell(c, q[0] + Math.sin(t * 1.4 + k * 2) * 6 * ph, q[1] - 18 - ph * 70, 3 + ph * 8, 2.5 + ph * 5, "rgba(235,228,215," + (.35 * (1 - ph)) + ")");
    }
    // 인물: 뒤(화면 위)에 있는 사람부터 그립니다
    var people = NAMES.map(function (n) { var s = CAST[n]; var p = spot(s.t, s.d); return { n: n, s: s, x: p[0], y: p[1] - (n === "제갈량" ? 16 : 0) }; })
      .sort(function (a, b) { return a.y - b.y; });
    people.forEach(function (o) {
      var talk = o.n === speaker, bob = still ? 0 : Math.sin(t * 2.2 + o.s.t * 1.7) * .6;
      var hop = talk && !still ? -Math.abs(Math.sin(t * 7)) * 3 : 0;
      ell(c, o.x, o.y, 15, 5.5, talk ? "rgba(255,210,100,.55)" : "rgba(0,0,0,.32)");     // 발밑 그림자(말하는 사람은 금빛)
      c.save(); c.translate(o.x, o.y + bob + hop); c.scale(1.05, 1.05);
      chibi(c, o.s, o.s.d < 0 ? 1 : o.s.d > 0 ? -1 : 0);
      c.restore();
      if (talk) dots(c, o.x, o.y + hop - 104, t);
    });
    people.forEach(function (o) { plate(c, o.n, o.x, o.y + 16, o.n === speaker); });
  }
  // 이름표
  function plate(c, n, x, y, on) {
    c.font = "700 11px 'Gowun Batang', 'Noto Serif KR', serif"; c.textAlign = "center"; c.textBaseline = "middle";
    var w = c.measureText(n).width + 12;
    rrect(c, x - w / 2, y - 8, w, 16, 4);
    c.fillStyle = on ? "rgba(232,190,90,.95)" : "rgba(20,12,8,.72)"; c.fill();
    c.strokeStyle = on ? "#5a3a14" : "rgba(201,162,74,.6)"; c.lineWidth = 1; c.stroke();
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
   * 가만히 두어도 읽을 시간을 준 뒤 자동으로 넘어갑니다. */
  var talk = document.getElementById("talk"), tName = document.getElementById("talk-name"),
      tText = document.getElementById("talk-text"), tSrc = document.getElementById("talk-src"),
      tImg = document.getElementById("talk-img"), tCv = document.getElementById("talk-canvas"),
      tStep = document.getElementById("talk-step");
  var LINES = [{ who: "제갈량", text: DATA.saying || (tText ? tText.textContent : ""), src: DATA.event || "" }]
    .concat((DATA.replies || []).map(function (r) { return { who: r.who || "신하", text: r.text || "" }; }));
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
      if (i === 0) { var s2 = document.createElement("em"); s2.textContent = "오늘의 한마디"; tName.appendChild(s2); }
    }
    if (tSrc) tSrc.textContent = L.src ? "— 근거: " + L.src : "";
    if (tStep) tStep.textContent = (i + 1) + " / " + LINES.length;
    if (talk) talk.classList.remove("done");
    portrait(L.who);
    if (still) { finish(); return; }
    tText.textContent = "";
    type();
  }
  function type() {
    var L = LINES[idx];
    pos++; tText.textContent = L.text.slice(0, pos);
    if (pos < L.text.length) timer = setTimeout(type, 38); else finish();
  }
  function finish() {
    clear();
    var L = LINES[idx];
    tText.textContent = L.text;
    if (talk) talk.classList.add("done");
    // 다음 대사로: 글 길이에 맞춰 읽을 시간을 줍니다 (최소 2.4초)
    if (idx < LINES.length - 1) timer = setTimeout(function () { show(idx + 1); }, Math.max(2400, L.text.length * 70));
    else { timer = setTimeout(function () { speaker = ""; redraw(); if (talk) talk.classList.add("end"); }, 2600); }
  }
  function next() {
    if (!tText) return;
    if (talk) talk.classList.remove("end");
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
  if (replay) replay.addEventListener("click", function () { if (talk) talk.classList.remove("end"); show(0); });
  if (go) go.addEventListener("click", function () { document.querySelector(".stage").scrollIntoView({ behavior: still ? "auto" : "smooth" }); });
})();
