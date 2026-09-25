/* ───────────────────────────────────────────────────────────────
 * court.js — 승상부 조회(朝會) 장면 일러스트
 *
 * 그림 파일 없이 코드로 그리는 원근 일러스트입니다. (인터넷 없이도 동작)
 * 구도: 엎드린 문무백관의 뒷모습 너머, 금박 병풍 앞 단상에 승상 제갈량이 서 있습니다.
 *
 * 핵심 개념 — 원근 투영 P(X, Y, Z)
 *   실제 궁궐을 미터 단위 3차원 공간으로 두고, 카메라(높이 1.6m)에서 본 화면 좌표로 바꿉니다.
 *     X: 좌우(m, 가운데 0)   Y: 높이(m, 바닥 0)   Z: 카메라에서의 거리(m)
 *   멀수록(Z가 클수록) 작게, 가운데로 모이게 그려집니다.
 *   그래서 인물을 '어디에 세울지'만 미터로 정하면 크기와 위치는 자동으로 맞춰집니다.
 *
 * 성능: 움직이지 않는 부분은 한 번만 그려 두고(bg), 매 프레임엔 부채·연기·먼지·빛만 새로 그립니다.
 * 디버깅: 화면이 비면 브라우저 F12 → Console 탭의 빨간 오류를 확인하세요.
 * ─────────────────────────────────────────────────────────────── */
(function () {
  var cv = document.getElementById("court-canvas");
  if (!cv || !cv.getContext) return;
  // 그림 파일(assets/court.jpg 등)을 쓰는 중이면 장면은 그리지 않고 말풍선만 움직입니다.
  // 그림 파일이 깨졌으면(onerror) 코드 그림으로 되돌아갑니다.
  var courtEl = document.querySelector(".court"), artImg = document.getElementById("court-art");
  var HAS_ART = courtEl && courtEl.classList.contains("has-art");
  var W = 1280, H = 720, F = 700, HOR = 300, CH = 1.6;
  var K = Math.min(2, window.devicePixelRatio || 1); // 고해상도 화면에서도 선명하게
  cv.width = W * K; cv.height = H * K;
  var out = cv.getContext("2d");
  var ctx = out;
  var DATA = {};
  try { DATA = JSON.parse(document.getElementById("court-data").textContent); } catch (e) {}

  function P(X, Y, Z) { return [640 + X * F / Z, HOR + (CH - Y) * F / Z]; }
  function S(Z) { return F / Z; } // 거리 Z에서 1m가 몇 픽셀인지

  function path(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); }
  function fillPoly(pts, fill) { path(pts); ctx.fillStyle = fill; ctx.fill(); }
  function lg(x0, y0, x1, y1, stops) { var g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rg(x, y, r0, r1, stops) { var g = ctx.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function ell(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(rx, 1e-4), Math.max(ry, 1e-4), 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function line(a, b, c, w) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
  // 로컬 좌표(미터)로 도형을 그리는 도우미: 인물처럼 복잡한 모양을 '발 위치 + 크기'로 배치
  function local(x, y, s, fn) { ctx.save(); ctx.translate(x, y); ctx.scale(s, s); fn(); ctx.restore(); }
  function shape(d, fill) { ctx.fillStyle = fill; ctx.fill(new Path2D(d)); }

  /* ── 1. 천장·벽 ─────────────────────────────────────────── */
  function hall() {
    ctx.fillStyle = "#120a07"; ctx.fillRect(0, 0, W, H);
    // 천장
    fillPoly([P(-9, 8, 2.4), P(9, 8, 2.4), P(9, 8, 22), P(-9, 8, 22)], lg(0, 0, 0, 60, [[0, "#1a0f0a"], [1, "#2a1810"]]));
    // 좌우 벽
    [-9, 9].forEach(function (X) {
      fillPoly([P(X, 0, 2.4), P(X, 0, 22), P(X, 8, 22), P(X, 8, 2.4)], lg(X < 0 ? 0 : W, 0, 640, 0, [[0, "#2b140c"], [1, "#4a1c10"]]));
      // 빛이 드는 창살 창
      [[3.5, 7.2], [10.5, 14], [17, 20.5]].forEach(function (z) {
        var q = [P(X, 1.8, z[0]), P(X, 1.8, z[1]), P(X, 5.6, z[1]), P(X, 5.6, z[0])];
        var cx = (q[0][0] + q[1][0]) / 2, cy = (q[0][1] + q[3][1]) / 2;
        fillPoly(q, rg(cx, cy, 0, Math.abs(q[1][0] - q[0][0]) + 60, [[0, "rgba(255,214,140,.95)"], [1, "rgba(200,120,50,.75)"]]));
        for (var t = 1; t < 8; t++) { var zz = z[0] + (z[1] - z[0]) * t / 8; line(P(X, 1.8, zz), P(X, 5.6, zz), "rgba(70,24,12,.9)", 1.4); }
        for (var yy = 2.2; yy < 5.6; yy += .42) line(P(X, yy, z[0]), P(X, yy, z[1]), "rgba(70,24,12,.9)", 1.2);
        path(q); ctx.strokeStyle = "#7a1c10"; ctx.lineWidth = 3; ctx.stroke();
      });
    });
    // 뒷벽 + 현판
    var a = P(-9, 0, 22), b = P(9, 8, 22);
    ctx.fillStyle = lg(0, b[1], 0, a[1], [[0, "#3a120b"], [1, "#6a1a10"]]);
    ctx.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]);
    var p1 = P(-2.2, 7.8, 21.9), p2 = P(2.2, 6.9, 21.9);
    ctx.fillStyle = "#140c08"; ctx.fillRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
    ctx.strokeStyle = "#c9a24a"; ctx.lineWidth = 2; ctx.strokeRect(p1[0] + 3, p1[1] + 3, p2[0] - p1[0] - 6, p2[1] - p1[1] - 6);
    ctx.fillStyle = lg(0, p1[1], 0, p2[1], [[0, "#f6dc8a"], [1, "#b8862e"]]);
    ctx.font = "700 " + Math.round((p2[1] - p1[1]) * .62) + "px 'Noto Serif KR', 'Batang', serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("丞 相 府", (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + 1);
    // 천장 들보
    [5, 9, 13, 17].forEach(function (z) {
      fillPoly([P(-9, 8, z), P(9, 8, z), P(9, 7.4, z), P(-9, 7.4, z)], "#3b1a0e");
      line(P(-9, 7.4, z), P(9, 7.4, z), "rgba(201,162,74,.8)", Math.max(1, S(z) * .05));
    });
  }

  /* ── 2. 바닥: 윤이 나는 검은 돌 ───────────────────────────── */
  function floor() {
    fillPoly([P(-9, 0, 2.4), P(9, 0, 2.4), P(9, 0, 22), P(-9, 0, 22)], lg(0, HOR + 50, 0, H, [[0, "#4a3a31"], [.35, "#2c231e"], [1, "#161110"]]));
    ctx.globalAlpha = .22;
    for (var X = -9; X <= 9; X += 1.5) line(P(X, 0, 2.4), P(X, 0, 22), "#0b0706", 1);
    for (var z = 2.4; z < 22; z *= 1.16) line(P(-9, 0, z), P(9, 0, z), "#0b0706", 1);
    ctx.globalAlpha = 1;
    // 창에서 들어온 빛이 바닥에 맺힌 자국
    [[-6, 5.5], [-6, 12.5], [6, 5.5], [6, 12.5]].forEach(function (p) {
      var c = P(p[0], 0, p[1]), s = S(p[1]);
      ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, .28);
      ell(0, 0, s * 2.4, s * 2.4, rg(0, 0, 0, s * 2.4, [[0, "rgba(255,200,120,.22)"], [1, "rgba(255,200,120,0)"]]));
      ctx.restore();
    });
  }

  /* ── 3. 기둥 (바닥 반사 포함) ─────────────────────────────── */
  function pillar(X, Z) {
    var s = S(Z), b = P(X, 0, Z), t = P(X, 7.4, Z), r = .36 * s;
    var sh = lg(b[0] - r, 0, b[0] + r, 0, [[0, "#3d0906"], [.3, "#b42a18"], [.45, "#d8452a"], [.7, "#8e1a0f"], [1, "#2e0604"]]);
    ctx.globalAlpha = .18; ctx.fillStyle = lg(0, b[1], 0, b[1] + s * 2.5, [[0, "#b42a18"], [1, "rgba(180,42,24,0)"]]);
    ctx.fillRect(b[0] - r, b[1], r * 2, s * 2.5); ctx.globalAlpha = 1;               // 반사
    ctx.fillStyle = sh; ctx.fillRect(b[0] - r, t[1], r * 2, b[1] - t[1]);           // 기둥 몸
    ctx.fillStyle = "#4a4038"; ctx.fillRect(b[0] - r * 1.35, b[1] - s * .28, r * 2.7, s * .28); // 주춧돌
    ctx.fillStyle = lg(b[0] - r, 0, b[0] + r, 0, [[0, "#6b4a18"], [.45, "#f0cf78"], [1, "#6b4a18"]]);
    ctx.fillRect(b[0] - r, b[1] - s * .5, r * 2, s * .12);                          // 금띠(아래)
    ctx.fillRect(b[0] - r, t[1] + s * .35, r * 2, s * .18);                         // 금띠(위)
    ctx.fillStyle = "#5a1a10"; ctx.fillRect(b[0] - r * 1.6, t[1], r * 3.2, s * .35); // 공포(두공)
    ctx.fillStyle = "rgba(201,162,74,.9)"; ctx.fillRect(b[0] - r * 1.6, t[1] + s * .33, r * 3.2, Math.max(1, s * .03));
  }

  /* ── 4. 붉은 길과 단상 ────────────────────────────────────── */
  function carpet() {
    fillPoly([P(-1.35, 0, 2.4), P(1.35, 0, 2.4), P(1.35, 0, 10), P(-1.35, 0, 10)], "#b8903e");
    fillPoly([P(-1.2, 0, 2.4), P(1.2, 0, 2.4), P(1.2, 0, 10), P(-1.2, 0, 10)], lg(0, HOR + 60, 0, H, [[0, "#8a1d14"], [1, "#5a0f0a"]]));
    for (var z = 2.9; z < 10; z += .9) { // 금실 무늬
      var c = P(0, 0, z), s = S(z);
      ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, .3);
      ctx.strokeStyle = "rgba(230,190,100,.45)"; ctx.lineWidth = Math.max(.6, s * .03);
      ctx.beginPath(); ctx.arc(0, 0, s * .35, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s * .16, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  function dais() {
    for (var k = 0; k < 3; k++) {
      var y0 = k * .25, y1 = y0 + .25, zf = 10 + k * .35, xw = 4.4 - k * .25;
      fillPoly([P(-xw, y0, zf), P(xw, y0, zf), P(xw, y1, zf), P(-xw, y1, zf)], lg(0, P(0, y1, zf)[1], 0, P(0, y0, zf)[1], [[0, "#8d8378"], [1, "#5a524a"]]));
      fillPoly([P(-xw, y1, zf), P(xw, y1, zf), P(xw, y1, 13.6), P(-xw, y1, 13.6)], "#a39a8e");
      line(P(-xw, y1, zf), P(xw, y1, zf), "rgba(240,220,170,.7)", 1.2);
      // 계단 위로 이어지는 카펫
      fillPoly([P(-1.2, y0, zf), P(1.2, y0, zf), P(1.2, y1, zf), P(-1.2, y1, zf)], "#6e140d");
      fillPoly([P(-1.2, y1, zf), P(1.2, y1, zf), P(1.2, y1, 13.6), P(-1.2, y1, 13.6)], "#8a1d14");
    }
    fillPoly([P(-3.2, .75, 10.75), P(3.2, .75, 10.75), P(3.2, .75, 13.6), P(-3.2, .75, 13.6)], "#8a1d14");
    line(P(-3.2, .75, 10.75), P(3.2, .75, 10.75), "#d4ac4f", 1.5);
  }

  /* ── 5. 금박 병풍 ─────────────────────────────────────────── */
  function screen() {
    var Z = 12.9, x0 = -3.5, x1 = 3.5, y0 = .75, y1 = 3.9, n = 6;
    var a = P(x0, y1, Z), b = P(x1, y0, Z), w = b[0] - a[0], h = b[1] - a[1];
    // 병풍 뒤로 번지는 은은한 빛
    ell((a[0] + b[0]) / 2, a[1] + h * .45, w * .75, h * .8, rg((a[0] + b[0]) / 2, a[1] + h * .45, 0, w * .75, [[0, "rgba(255,210,120,.28)"], [1, "rgba(255,210,120,0)"]]));
    ctx.fillStyle = "#140c08"; ctx.fillRect(a[0] - 4, a[1] - 4, w + 8, h + 8);
    ctx.fillStyle = lg(a[0], a[1], b[0], b[1], [[0, "#b8903e"], [.35, "#ecd48c"], [.6, "#d4b060"], [1, "#9c7630"]]);
    ctx.fillRect(a[0], a[1], w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(a[0], a[1], w, h); ctx.clip();
    // 먹으로 그린 산과 구름
    function mountains(base, amp, color, seed) {
      ctx.beginPath(); ctx.moveTo(a[0], b[1]);
      for (var x = 0; x <= w; x += w / 60) {
        var yy = base - amp * (Math.sin(x / w * 7 + seed) * .5 + Math.sin(x / w * 17 + seed * 2) * .25 + .6);
        ctx.lineTo(a[0] + x, a[1] + yy);
      }
      ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    mountains(h * .72, h * .38, "rgba(60,72,66,.42)", 1.3);
    mountains(h * .86, h * .28, "rgba(40,52,48,.55)", 4.1);
    mountains(h * .98, h * .16, "rgba(28,36,34,.6)", 2.2);
    for (var c = 0; c < 5; c++) ell(a[0] + w * (.12 + c * .19), a[1] + h * (.5 + (c % 2) * .1), w * .08, h * .035, "rgba(255,246,220,.55)");
    ell(a[0] + w * .76, a[1] + h * .22, h * .07, h * .07, "rgba(190,40,24,.85)"); // 붉은 해
    ctx.restore();
    for (var k = 1; k < n; k++) { var xx = a[0] + w * k / n; line([xx, a[1]], [xx, b[1]], "rgba(20,12,8,.75)", 2); }
    ctx.strokeStyle = "#c9a24a"; ctx.lineWidth = 1; ctx.strokeRect(a[0] - 2, a[1] - 2, w + 4, h + 4);
  }

  /* ── 6. 인물 ──────────────────────────────────────────────── */
  // 엎드린 신하 (뒷모습). 좌표는 미터, 원점은 무릎 사이 바닥
  function kneeler(X, Z, robe, dark) {
    var c = P(X, 0, Z), s = S(Z);
    ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, .22);
    ell(0, 0, s * .7, s * .7, "rgba(0,0,0,.45)"); ctx.restore();          // 그림자
    local(c[0], c[1], s, function () {
      var g = lg(0, -.7, 0, 0, [[0, robe], [1, dark]]);
      shape("M-.5,0 C-.62,-.08 -.64,-.2 -.52,-.26 C-.5,-.2 -.44,-.12 -.38,-.08 Z", dark);            // 왼쪽 소매
      shape("M.5,0 C.62,-.08 .64,-.2 .52,-.26 C.5,-.2 .44,-.12 .38,-.08 Z", dark);                   // 오른쪽 소매
      shape("M-.52,0 C-.57,-.26 -.46,-.56 -.2,-.63 C-.07,-.67 .07,-.67 .2,-.63 C.46,-.56 .57,-.26 .52,0 Z", g); // 등과 허리
      shape("M-.46,-.12 C-.3,-.4 -.12,-.6 -.05,-.64 C-.2,-.55 -.36,-.36 -.42,-.08 Z", "rgba(255,230,190,.18)"); // 창빛 테두리
      ctx.strokeStyle = "rgba(0,0,0,.25)"; ctx.lineWidth = .012;
      ctx.beginPath(); ctx.moveTo(0, -.64); ctx.lineTo(0, 0); ctx.stroke();                        // 등솔기
      ctx.strokeStyle = "#c9a24a"; ctx.lineWidth = .035;
      ctx.beginPath(); ctx.moveTo(-.44, -.3); ctx.quadraticCurveTo(0, -.24, .44, -.3); ctx.stroke(); // 허리띠
      ell(0, -.265, .05, .03, "#7fb59a");                                                         // 옥 장식
      ell(0, -.67, .11, .065, "#15110e");                                                          // 복두(관모)
      shape("M-.1,-.69 L-.42,-.7 L-.44,-.73 L-.1,-.72 Z M.1,-.69 L.42,-.7 L.44,-.73 L.1,-.72 Z", "#15110e"); // 관모 날개
    });
  }

  // 창을 든 호위 무사 (정면)
  function guard(X, Z) {
    var c = P(X, 0, Z), s = S(Z);
    ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, .22); ell(0, 0, s * .45, s * .45, "rgba(0,0,0,.45)"); ctx.restore();
    local(c[0], c[1], s, function () {
      ctx.strokeStyle = "#4a2e18"; ctx.lineWidth = .04; ctx.beginPath(); ctx.moveTo(.3, 0); ctx.lineTo(.3, -2.5); ctx.stroke();
      shape("M.3,-2.75 L.25,-2.5 L.35,-2.5 Z M.3,-2.52 C.42,-2.5 .44,-2.36 .36,-2.3 L.3,-2.34 Z", "#c7ccd4");
      ell(.3, -2.28, .05, .08, "#b3261e");
      var g = lg(-.3, 0, .3, 0, [[0, "#1d1c20"], [.5, "#4a4a55"], [1, "#1a191d"]]);
      shape("M-.28,0 L-.24,-.95 L.24,-.95 L.28,0 Z", "#2a1612");                                   // 하의
      shape("M-.26,-.9 C-.3,-1.2 -.28,-1.4 -.22,-1.5 L.22,-1.5 C.28,-1.4 .3,-1.2 .26,-.9 Z", g);     // 갑옷
      for (var yy = -1.4; yy < -.95; yy += .08) { ctx.strokeStyle = "rgba(200,170,110,.35)"; ctx.lineWidth = .01; ctx.beginPath(); ctx.moveTo(-.24, yy); ctx.lineTo(.24, yy); ctx.stroke(); }
      ell(-.27, -1.42, .09, .07, "#3a3a44"); ell(.27, -1.42, .09, .07, "#3a3a44");              // 어깨
      ctx.fillStyle = "#b3261e"; ctx.fillRect(-.24, -1.0, .48, .05);                            // 붉은 띠
      ell(0, -1.62, .08, .1, "#c89872");                                                         // 얼굴
      shape("M-.11,-1.62 C-.12,-1.78 .12,-1.78 .11,-1.62 L.08,-1.66 L-.08,-1.66 Z", "#2c2c34");   // 투구
      ell(0, -1.8, .025, .06, "#b3261e");                                                        // 술
    });
  }

  // 향로(鼎)
  function burner(X, Z) {
    var c = P(X, 0, Z), s = S(Z);
    local(c[0], c[1], s, function () {
      var g = lg(-.3, 0, .3, 0, [[0, "#3e3016"], [.4, "#b89a52"], [1, "#3a2c14"]]);
      shape("M-.2,0 L-.16,-.2 L-.12,-.2 L-.14,0 Z M.2,0 L.16,-.2 L.12,-.2 L.14,0 Z", "#3a2c14");
      shape("M-.3,-.2 C-.32,-.45 -.26,-.55 -.22,-.58 L.22,-.58 C.26,-.55 .32,-.45 .3,-.2 Z", g);
      ell(0, -.58, .23, .05, "#2a1f0e");
      shape("M-.24,-.58 L-.26,-.72 L-.2,-.72 L-.19,-.6 Z M.24,-.58 L.26,-.72 L.2,-.72 L.19,-.6 Z", "#8d7640");
    });
  }

  // 궁등(宮燈)
  function lantern(X, Z) {
    var c = P(X, 5.8, Z), s = S(Z), top = P(X, 7.4, Z);
    line([c[0], top[1]], [c[0], c[1] - s * .4], "rgba(40,20,10,.9)", Math.max(1, s * .02));
    ell(c[0], c[1], s * 1.3, s * 1.3, rg(c[0], c[1], 0, s * 1.3, [[0, "rgba(255,170,80,.35)"], [1, "rgba(255,170,80,0)"]]));
    ell(c[0], c[1], s * .32, s * .4, rg(c[0] - s * .08, c[1] - s * .1, 0, s * .45, [[0, "#ffd9a0"], [.5, "#e0552c"], [1, "#8a1a0e"]]));
    ctx.fillStyle = "#c9a24a"; ctx.fillRect(c[0] - s * .2, c[1] - s * .44, s * .4, s * .07); ctx.fillRect(c[0] - s * .2, c[1] + s * .37, s * .4, s * .07);
    line([c[0], c[1] + s * .44], [c[0], c[1] + s * .8], "#b3261e", Math.max(1, s * .04));
  }

  // 제갈량: 흰 학창의(鶴氅衣), 남색 깃, 윤건(綸巾), 긴 수염 — 정면
  var Z_ZG = 11.6, ZG = P(0, .75, Z_ZG), SZ = S(Z_ZG);
  function zhuge() {
    ctx.save(); ctx.translate(ZG[0], ZG[1]); ctx.scale(1, .22); ell(0, 0, SZ * .5, SZ * .5, "rgba(0,0,0,.45)"); ctx.restore();
    // 뒤에서 비추는 후광
    ell(ZG[0], ZG[1] - SZ * 1.35, SZ * .9, SZ * 1.1, rg(ZG[0], ZG[1] - SZ * 1.35, 0, SZ * 1.1, [[0, "rgba(255,236,190,.35)"], [1, "rgba(255,236,190,0)"]]));
    local(ZG[0], ZG[1], SZ, function () {
      var robe = lg(-.4, 0, .4, 0, [[0, "#d3cbb8"], [.35, "#f6f3ea"], [.7, "#e8e2d4"], [1, "#b9b09c"]]);
      var navy = "#22325a";
      shape("M-.37,0 C-.34,-.4 -.29,-.8 -.25,-1.06 L.25,-1.06 C.29,-.8 .34,-.4 .37,0 Z", robe);               // 치마
      shape("M-.37,0 L.37,0 L.365,-.07 L-.365,-.07 Z", navy);                                                  // 밑단 선
      shape("M-.05,-1.06 L.03,-1.06 L.02,0 L-.07,0 Z", navy);                                                  // 앞섶 선
      shape("M-.25,-1.06 C-.26,-1.2 -.25,-1.34 -.2,-1.43 C-.12,-1.48 .12,-1.48 .2,-1.43 C.25,-1.34 .26,-1.2 .25,-1.06 Z", robe); // 상체
      shape("M-.2,-1.43 C-.35,-1.37 -.43,-1.1 -.46,-.7 C-.42,-.6 -.27,-.6 -.22,-.68 C-.22,-.95 -.21,-1.12 -.18,-1.22 Z", robe); // 왼 소매(늘어뜨림)
      shape("M-.46,-.7 C-.42,-.6 -.27,-.6 -.22,-.68 L-.23,-.74 C-.28,-.68 -.4,-.68 -.45,-.77 Z", navy);         // 소매 끝단
      shape("M.2,-1.43 C.34,-1.37 .39,-1.18 .35,-1.02 C.31,-.9 .15,-.9 .07,-.98 C.05,-1.04 .11,-1.13 .17,-1.19 Z", robe); // 오른 소매(부채 든 팔)
      shape("M.07,-.98 C.15,-.9 .31,-.9 .35,-1.02 L.33,-.96 C.27,-.87 .14,-.88 .08,-.94 Z", navy);
      ctx.fillStyle = navy; ctx.fillRect(-.24, -1.1, .48, .05);                                                // 허리띠
      shape("M-.03,-1.06 L.01,-1.06 L.03,-.7 L-.01,-.68 Z M.02,-1.06 L.05,-1.06 L.08,-.74 L.05,-.73 Z", "#1a2748"); // 띠 자락
      shape("M-.14,-1.46 L.06,-1.2 L.02,-1.17 L-.18,-1.43 Z", navy);                                          // 깃(왼쪽이 위로)
      shape("M.14,-1.46 L-.02,-1.26 L.02,-1.23 L.18,-1.43 Z", "#1a2748");
      shape("M-.04,-1.52 L.04,-1.52 L.045,-1.44 L-.045,-1.44 Z", "#d6a67d");                                    // 목
      ell(0, -1.6, .085, .105, lg(-.08, 0, .08, 0, [[0, "#e7bf97"], [.6, "#f0cfaa"], [1, "#c99a72"]]));        // 얼굴
      ctx.strokeStyle = "#2a1c14"; ctx.lineWidth = .012;
      ctx.beginPath(); ctx.moveTo(-.055, -1.615); ctx.lineTo(-.02, -1.61); ctx.moveTo(.02, -1.61); ctx.lineTo(.055, -1.615); ctx.stroke(); // 눈
      ctx.lineWidth = .014; ctx.beginPath(); ctx.moveTo(-.06, -1.64); ctx.lineTo(-.02, -1.645); ctx.moveTo(.02, -1.645); ctx.lineTo(.06, -1.64); ctx.stroke(); // 눈썹
      shape("M-.05,-1.545 C-.02,-1.565 .02,-1.565 .05,-1.545 C.02,-1.555 -.02,-1.555 -.05,-1.545 Z", "#1c1410"); // 콧수염
      shape("M-.035,-1.53 L.035,-1.53 L.012,-1.3 L0,-1.26 L-.012,-1.3 Z", "#1c1410");                           // 긴 수염
      shape("M-.095,-1.6 C-.1,-1.7 -.08,-1.74 -.07,-1.77 L.07,-1.77 C.08,-1.74 .1,-1.7 .095,-1.6 L.08,-1.66 C.03,-1.68 -.03,-1.68 -.08,-1.66 Z", "#15151c"); // 윤건
      ctx.strokeStyle = "rgba(120,120,150,.5)"; ctx.lineWidth = .008;
      for (var k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * .025, -1.765); ctx.lineTo(k * .03, -1.675); ctx.stroke(); }
      shape("M.08,-1.66 C.13,-1.6 .15,-1.5 .14,-1.4 L.12,-1.41 C.12,-1.5 .1,-1.58 .07,-1.63 Z", "#15151c");     // 두건 끈
    });
  }
  // 깃털 부채: 매 프레임 살랑살랑 흔들립니다
  function fan(tt) {
    var hand = [ZG[0] + SZ * .07, ZG[1] - SZ * 1.0];
    ctx.save(); ctx.translate(hand[0], hand[1]); ctx.scale(SZ, SZ);
    ctx.rotate(-.2 + Math.sin(tt / 700) * .12);
    ell(0, .005, .04, .03, "#e9c29a");                                              // 손
    ctx.strokeStyle = "#5a3a1c"; ctx.lineWidth = .02; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -.14); ctx.stroke();
    var g = lg(-.14, -.5, .14, -.1, [[0, "#ffffff"], [.6, "#f1efe8"], [1, "#b9bcc2"]]);
    shape("M0,-.12 C-.17,-.18 -.17,-.46 0,-.5 C.17,-.46 .17,-.18 0,-.12 Z", g);
    ctx.strokeStyle = "rgba(110,115,125,.45)"; ctx.lineWidth = .005;
    for (var k = -4; k <= 4; k++) { ctx.beginPath(); ctx.moveTo(0, -.13); ctx.lineTo(k * .032, -.48 + Math.abs(k) * .025); ctx.stroke(); }
    shape("M-.12,-.42 C-.06,-.5 .06,-.5 .12,-.42 C.06,-.47 -.06,-.47 -.12,-.42 Z", "rgba(60,60,70,.55)");      // 깃 끝
    ctx.restore();
  }

  /* ── 장면 조립 (먼 곳 → 가까운 곳 순서) ───────────────────── */
  var bg = document.createElement("canvas"); bg.width = W * K; bg.height = H * K;
  ctx = bg.getContext("2d"); ctx.scale(K, K);
  hall(); floor();
  [21, 17, 13].forEach(function (z) { pillar(-8.2, z); pillar(8.2, z); });
  [21, 17].forEach(function (z) { pillar(-5.2, z); pillar(5.2, z); });
  [[-3.3, 18], [3.3, 18], [-3.3, 14], [3.3, 14]].forEach(function (l) { lantern(l[0], l[1]); });
  carpet(); dais(); screen();
  pillar(-5.2, 13); pillar(5.2, 13);
  zhuge();
  guard(-4.8, 11.2); guard(4.8, 11.2);
  burner(-2.6, 10.3); burner(2.6, 10.3);
  [[-3.3, 9], [3.3, 9], [-3.3, 6.5], [3.3, 6.5]].forEach(function (l) { lantern(l[0], l[1]); });
  pillar(-5.2, 9); pillar(5.2, 9);
  // 문무백관: 붉은 길 양쪽으로 네 줄씩 (먼 줄부터)
  var ROBES = [["#2f6b5e", "#163a33"], ["#7a2a2a", "#3e1212"], ["#34457a", "#18203e"], ["#8a6a2c", "#4a3614"], ["#5e3a6e", "#2e1a38"], ["#3d5a3a", "#1d2e1c"]];
  [8.6, 7.1, 5.7, 4.4].forEach(function (z, r) {
    [-3.8, -2.35, 2.35, 3.8].forEach(function (x, cIdx) { var c = ROBES[(r * 2 + cIdx) % 6]; kneeler(x, z, c[0], c[1]); });
  });
  pillar(-5.2, 5); pillar(5.2, 5);
  // 색감 보정 + 가장자리 어둡게
  ctx.fillStyle = rg(640, 330, 200, 860, [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,.6)"]]); ctx.fillRect(0, 0, W, H);
  ctx = out;

  /* ── 움직이는 것들: 부채·향 연기·빛줄기·먼지 ───────────────── */
  var dust = [];
  for (var d = 0; d < 70; d++) dust.push({ x: Math.random() * W, y: Math.random() * H * .8, r: .6 + Math.random() * 1.6, v: .1 + Math.random() * .3, p: Math.random() * 6 });
  var BURN = [P(-2.6, .72, 10.3), P(2.6, .72, 10.3)];
  function frame(tt) {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    fan(tt);
    // 향 연기
    BURN.forEach(function (b, bi) {
      for (var k = 0; k < 9; k++) {
        var ph = (tt / 5200 + k / 9 + bi * .37) % 1, s = S(10.3);
        var x = b[0] + Math.sin(ph * 5 + k + bi) * s * .25 * ph, y = b[1] - ph * s * 2.4;
        ell(x, y, s * (.08 + ph * .35), s * (.08 + ph * .35), rg(x, y, 0, s * (.08 + ph * .35), [[0, "rgba(235,228,215," + (.16 * (1 - ph)) + ")"], [1, "rgba(235,228,215,0)"]]));
      }
    });
    // 왼쪽 창에서 비껴 드는 빛줄기
    ctx.globalCompositeOperation = "screen";
    var br = .06 + Math.sin(tt / 2600) * .02;
    [[0, 90, 260, 70, 700, 720, 380, 720], [150, 60, 330, 50, 820, 720, 560, 720]].forEach(function (q) {
      fillPoly([[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]]], lg(q[0], q[1], q[6], q[7], [[0, "rgba(255,214,150," + br + ")"], [1, "rgba(255,214,150,0)"]]));
    });
    dust.forEach(function (m) {
      m.y -= m.v * .6; m.x += Math.sin(tt / 1500 + m.p) * .2;
      if (m.y < 0) { m.y = H * .8; m.x = Math.random() * W; }
      ell(m.x, m.y, m.r, m.r, "rgba(255,226,170," + (.25 + Math.sin(tt / 600 + m.p) * .2) + ")");
    });
    ctx.globalCompositeOperation = "source-over";
  }

  var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var last = 0;
  function loop(tt) { if (tt - last > 45) { frame(tt); last = tt; } requestAnimationFrame(loop); }

  function startScene() {
    frame(0);
    if (!still) requestAnimationFrame(loop);
  }
  if (HAS_ART && artImg && artImg.complete && !artImg.naturalWidth) { HAS_ART = false; courtEl.classList.remove("has-art"); } // 이미 로드 실패
  if (!HAS_ART) startScene();
  else if (artImg) artImg.addEventListener("error", function () { // 그림 파일이 깨졌으면 코드 그림으로
    HAS_ART = false; courtEl.classList.remove("has-art"); startScene(); play();
  });

  /* ── 조회 진행: 승상의 한마디 → 신하들이 차례로 대답 ────────────
   * 대답 말풍선은 엎드린 신하의 머리 위에 뜹니다.
   * 코드 그림일 땐 실제 신하 위치(P 함수)로, 그림 파일일 땐 대략적인 자리(%)로 놓습니다. */
  var sayText = document.getElementById("say-text"), saySrc = document.getElementById("say-src"),
      box = document.getElementById("replies"), replay = document.getElementById("court-replay"),
      go = document.getElementById("court-go");
  var SAY = DATA.saying || (sayText ? sayText.textContent : "");
  var REPLIES = DATA.replies || [];
  function slots() {
    if (HAS_ART) return [[35, 62], [65, 62], [14, 74], [86, 74]];
    return [[-2.35, 8.6], [2.35, 8.6], [-3.8, 5.7], [3.8, 5.7]].map(function (k) {
      var p = P(k[0], .85, k[1]);
      return [p[0] / W * 100, p[1] / H * 100];
    });
  }
  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function play() {
    timers.forEach(clearTimeout); timers = [];
    if (!sayText || !box) return;
    box.innerHTML = "";
    if (saySrc) saySrc.textContent = DATA.event ? "— 근거: " + DATA.event : "";
    var pos = 0, S_ = slots(), speed = still ? 0 : 38;
    sayText.textContent = "";
    function tick() {
      pos++; sayText.textContent = SAY.slice(0, pos);
      if (pos < SAY.length) later(tick, speed); else later(showReplies, still ? 0 : 700);
    }
    if (still) { sayText.textContent = SAY; showReplies(); } else later(tick, 500);
    function showReplies() {
      REPLIES.forEach(function (r, i) {
        later(function () {
          var el = document.createElement("div");
          el.className = "reply";
          var s = S_[i % S_.length];
          el.style.left = s[0] + "%"; el.style.top = s[1] + "%";
          var name = document.createElement("b"); name.textContent = r.who || "신하";
          el.appendChild(name); el.appendChild(document.createTextNode(r.text));
          box.appendChild(el);
          fit(el);
        }, still ? 0 : i * 1600);
      });
    }
  }
  // 말풍선이 화면 밖으로 삐져나가지 않게 좌우를 당겨 줍니다
  function fit(el) {
    if (getComputedStyle(el).position !== "absolute") return;
    var v = box.getBoundingClientRect(), r = el.getBoundingClientRect(), dx = 0;
    if (r.left < v.left + 6) dx = v.left + 6 - r.left;
    if (r.right > v.right - 6) dx = v.right - 6 - r.right;
    if (dx) el.style.left = "calc(" + el.style.left + " + " + dx + "px)";
  }
  if (replay) replay.addEventListener("click", play);
  if (go) go.addEventListener("click", function () { document.querySelector(".stage").scrollIntoView({ behavior: still ? "auto" : "smooth" }); });
  play();

  /* ── 대화창 초상화 (240×280) ───────────────────────────────── */
  var pc = document.getElementById("court-portrait");
  if (pc && pc.getContext) {
    ctx = pc.getContext("2d");
    ctx.fillStyle = lg(0, 0, 0, 280, [[0, "#3a2418"], [1, "#140c08"]]); ctx.fillRect(0, 0, 240, 280);
    ell(120, 120, 120, 120, rg(120, 110, 10, 130, [[0, "rgba(233,196,120,.35)"], [1, "rgba(233,196,120,0)"]]));
    local(120, 330, 150, function () {
      var robe = lg(-.8, 0, .8, 0, [[0, "#bfb6a2"], [.4, "#f6f3ea"], [1, "#c9c1ad"]]);
      shape("M-.85,0 C-.8,-.3 -.7,-.62 -.42,-.72 C-.2,-.8 .2,-.8 .42,-.72 C.7,-.62 .8,-.3 .85,0 Z", robe);   // 어깨
      shape("M-.32,-.76 L.14,-.2 L.02,-.12 L-.42,-.7 Z", "#22325a");                                     // 깃
      shape("M.32,-.76 L-.04,-.32 L.06,-.26 L.42,-.7 Z", "#1a2748");
      shape("M-.09,-.9 L.09,-.9 L.1,-.72 L-.1,-.72 Z", "#cf9d74");                                       // 목
      ell(0, -1.1, .21, .26, lg(-.2, 0, .2, 0, [[0, "#dcae84"], [.55, "#f1d2ad"], [1, "#c28f66"]]));    // 얼굴
      ell(-.21, -1.08, .04, .07, "#d9a87e"); ell(.21, -1.08, .04, .07, "#c99870");                       // 귀
      ctx.strokeStyle = "#2a1c14"; ctx.lineCap = "round";
      ctx.lineWidth = .022; ctx.beginPath(); ctx.moveTo(-.15, -1.19); ctx.quadraticCurveTo(-.1, -1.215, -.04, -1.2); ctx.moveTo(.04, -1.2); ctx.quadraticCurveTo(.1, -1.215, .15, -1.19); ctx.stroke(); // 눈썹
      ell(-.085, -1.13, .042, .016, "#f8f1e6"); ell(.085, -1.13, .042, .016, "#f8f1e6");
      ell(-.08, -1.13, .018, .016, "#1a120c"); ell(.09, -1.13, .018, .016, "#1a120c");                  // 눈동자
      ctx.lineWidth = .01; ctx.beginPath(); ctx.moveTo(-.13, -1.145); ctx.quadraticCurveTo(-.085, -1.165, -.04, -1.145); ctx.moveTo(.04, -1.145); ctx.quadraticCurveTo(.085, -1.165, .13, -1.145); ctx.stroke(); // 눈꺼풀
      ctx.strokeStyle = "#b07e5a"; ctx.lineWidth = .012; ctx.beginPath(); ctx.moveTo(.005, -1.12); ctx.quadraticCurveTo(-.02, -1.05, .01, -1.02); ctx.stroke(); // 코
      shape("M-.11,-.955 C-.06,-.99 -.02,-.985 0,-.97 C.02,-.985 .06,-.99 .11,-.955 C.06,-.97 .02,-.965 0,-.955 C-.02,-.965 -.06,-.97 -.11,-.955 Z", "#1c1410"); // 콧수염
      ctx.strokeStyle = "#8a4f3a"; ctx.lineWidth = .012; ctx.beginPath(); ctx.moveTo(-.035, -.93); ctx.lineTo(.035, -.93); ctx.stroke(); // 입
      shape("M-.055,-.9 C-.04,-.8 -.02,-.66 0,-.56 C.02,-.66 .04,-.8 .055,-.9 C.02,-.88 -.02,-.88 -.055,-.9 Z", "#1c1410"); // 긴 수염
      shape("M-.23,-1.1 C-.25,-1.3 -.2,-1.38 -.17,-1.44 L-.15,-1.55 L.15,-1.55 L.17,-1.44 C.2,-1.38 .25,-1.3 .23,-1.1 L.2,-1.24 C.08,-1.28 -.08,-1.28 -.2,-1.24 Z", "#15151c"); // 윤건
      ctx.strokeStyle = "rgba(140,140,170,.45)"; ctx.lineWidth = .008;
      for (var k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * .04, -1.54); ctx.lineTo(k * .05, -1.3); ctx.stroke(); }
      shape("M.2,-1.24 C.3,-1.1 .34,-.92 .32,-.78 L.28,-.8 C.28,-.94 .25,-1.08 .18,-1.2 Z", "#15151c");     // 두건 끈
      // 가슴 앞 깃털 부채
      shape("M-.62,0 C-.78,-.2 -.7,-.52 -.46,-.56 C-.28,-.5 -.28,-.2 -.36,0 Z", lg(-.7, -.5, -.3, 0, [[0, "#ffffff"], [1, "#c5c8ce"]]));
      ctx.strokeStyle = "rgba(110,115,125,.45)"; ctx.lineWidth = .006;
      for (var q = 0; q < 7; q++) { ctx.beginPath(); ctx.moveTo(-.47, 0); ctx.lineTo(-.72 + q * .06, -.5 + Math.abs(q - 3) * .03); ctx.stroke(); }
    });
    // 낙관 「孔明」
    ctx.fillStyle = "rgba(163,40,28,.9)"; ctx.fillRect(200, 12, 28, 46);
    ctx.fillStyle = "#f6e6d4"; ctx.font = "700 17px 'Noto Serif KR', serif"; ctx.textAlign = "center";
    ctx.fillText("孔", 214, 32); ctx.fillText("明", 214, 52);
    ctx = out;
  }
})();
