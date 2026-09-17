import { timingSafeEqual } from "node:crypto";
const same = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function accessError(req) {
  const username = process.env.OARS_ADMIN_USER,
    password = process.env.OARS_ADMIN_PASSWORD;
  const headers = { "Cache-Control": "private, no-store" };
  if (!username || !password || password.length < 20)
    return new Response("관리자 인증 환경설정이 필요합니다.", {
      status: 503,
      headers,
    });
  const value = req.headers.get("authorization") || "";
  let decoded = "";
  try {
    if (value.startsWith("Basic "))
      decoded = Buffer.from(value.slice(6), "base64").toString();
  } catch {}
  if (!same(decoded, `${username}:${password}`))
    return new Response("관리자 로그인이 필요합니다.", {
      status: 401,
      headers: {
        ...headers,
        "WWW-Authenticate": 'Basic realm="OARS Manager", charset="UTF-8"',
      },
    });
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (!origin || origin !== new URL(req.url).origin)
      return new Response("허용되지 않은 요청 출처입니다.", {
        status: 403,
        headers,
      });
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return new Response("JSON 요청이 필요합니다.", { status: 415, headers });
    if (Number(req.headers.get("content-length") || 0) > 2 * 1024 * 1024)
      return new Response("요청 크기 제한 초과", { status: 413, headers });
  }
  return null;
}

export const secure =
  (handler) =>
  async (req, ...args) =>
    accessError(req) || handler(req, ...args);
