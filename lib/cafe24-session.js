import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  openCafe24Session,
  sealCafe24Session,
  refreshCafe24Token,
  CAFE24_SESSION_COOKIE,
  sessionCookieOptions,
} from "./cafe24";
const refreshes = new Map();
async function refreshOnce(token) {
  if (refreshes.has(token)) return refreshes.get(token);
  const pending = refreshCafe24Token(token);
  refreshes.set(token, pending);
  try {
    return await pending;
  } finally {
    const timer = setTimeout(() => refreshes.delete(token), 5000);
    timer.unref?.();
  }
}
export async function withCafeSession(operation) {
  let refreshed = false,
    session;
  const response = (data, status = 200) => {
    const r = NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
    if (refreshed)
      r.cookies.set(
        CAFE24_SESSION_COOKIE,
        sealCafe24Session(session),
        sessionCookieOptions,
      );
    return r;
  };
  try {
    session = openCafe24Session(
      (await cookies()).get(CAFE24_SESSION_COOKIE)?.value,
    );
    if (!session?.access_token || !session?.refresh_token)
      return response(
        {
          error: "카페24 연결이 필요합니다.",
          connectUrl: "/api/cafe24/connect",
        },
        401,
      );
    const request = async (action) => {
      let result = await action(session.access_token);
      if (result.status === 401) {
        session = await refreshOnce(session.refresh_token);
        refreshed = true;
        result = await action(session.access_token);
      }
      return result;
    };
    const result = await operation(request);
    return response(result.data, result.status || 200);
  } catch {
    return response(
      {
        error:
          "카페24 요청 결과를 확인하지 못했습니다. 주문을 다시 조회한 후 처리하세요.",
      },
      502,
    );
  }
}
