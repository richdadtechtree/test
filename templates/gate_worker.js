/* ───────────────────────────────────────────────────────────────
 * gate_worker.js — 올린 상소 페이지 앞의 '비밀번호 문' (Cloudflare Pages 에서 돌아감)
 *
 * publish.py 가 올릴 때 이 파일을 site/_worker.js 로 복사하면서 __SALT__·__HASH__·__KEY__ 를 채워 넣습니다.
 *   • 비밀번호 자체는 어디에도 저장하지 않습니다. '소금(SALT)+비밀번호'를 SHA-256 으로 섞은 값(HASH)만 비교합니다.
 *   • 맞으면 90일짜리 출입증(쿠키)을 줍니다. 출입증은 KEY 로 서명해서 위조할 수 없습니다.
 *   • 이 파일은 방문자에게 보이지 않습니다(Cloudflare 가 서버 쪽에서만 실행).
 * 흐름: 출입증 있음 → 원래 페이지(env.ASSETS) / 없음 → 비밀번호 입력 화면(401)
 * ─────────────────────────────────────────────────────────────── */
const SALT = "__SALT__", HASH = "__HASH__", KEY = "__KEY__", DAYS = 90;
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(text))); }
async function sign(exp) {
  const k = await crypto.subtle.importKey("raw", enc.encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(String(exp))));
}
// 글자를 하나씩 끝까지 비교 (어디서 틀렸는지 시간 차이로 알아내지 못하게)
function same(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hasPass(req) {
  const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)sangso=(\d+)\.([0-9a-f]{64})/);
  return !!m && Number(m[1]) > Date.now() && same(await sign(m[1]), m[2]);
}

function loginPage(msg) {
  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>승상부 — 들어가기</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1d1510;color:#efe3c8;font:16px/1.6 "Gowun Batang",serif;padding:16px;box-sizing:border-box}
form{width:100%;max-width:340px;background:#2a1d14;border:1px solid rgba(201,162,74,.6);border-radius:12px;padding:28px 22px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.5)}
h1{margin:0 0 4px;font-size:22px;color:#f3d06a;letter-spacing:.1em} p{margin:0 0 18px;font-size:14px;opacity:.8}
input{width:100%;box-sizing:border-box;font-size:18px;padding:12px;border-radius:8px;border:1px solid #c9a24a;background:#140c08;color:#fff;margin-bottom:12px}
button{width:100%;font-size:17px;padding:12px;border:0;border-radius:8px;background:linear-gradient(180deg,#f3d98a,#c9a24a);color:#1d120a;font-weight:700;cursor:pointer}
.err{color:#ff9d8a;min-height:1.4em;margin:0 0 8px}
</style></head><body>
<form method="post" action="/__login">
<h1>丞相府</h1><p>제갈량 상소문 — 비밀번호를 넣어 주시옵소서</p>
<div class="err">${msg}</div>
<input type="password" name="pw" autocomplete="current-password" placeholder="비밀번호" autofocus required>
<button type="submit">들어가기</button>
</form></body></html>`;
  return new Response(html, { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/__login" && req.method === "POST") {
      const form = await req.formData();
      if (same(await sha256(SALT + String(form.get("pw") || "")), HASH)) {
        const exp = Date.now() + DAYS * 864e5;
        return new Response(null, { status: 303, headers: {
          "Location": "/",
          "Set-Cookie": `sangso=${exp}.${await sign(exp)}; Max-Age=${DAYS * 86400}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          "cache-control": "no-store" } });
      }
      await new Promise((r) => setTimeout(r, 1000)); // 틀리면 1초 쉬기 (마구 넣어 보기를 느리게)
      return loginPage("비밀번호가 맞지 않사옵니다.");
    }
    if (!(await hasPass(req))) return loginPage("");
    const res = await env.ASSETS.fetch(req);                     // 출입증이 있으면 원래 페이지
    const h = new Headers(res.headers);
    h.set("cache-control", "private, max-age=300");              // 남의(공용) 캐시에 남지 않게
    h.set("x-robots-tag", "noindex");
    return new Response(res.body, { status: res.status, headers: h });
  },
};
