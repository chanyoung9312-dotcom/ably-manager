import { NextResponse } from "next/server";
import { accessError } from "./lib/access.mjs";
export function proxy(req) {
  const error = accessError(req);
  if (error) return error;
  const r = NextResponse.next();
  r.headers.set("Cache-Control", "private, no-store");
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "same-origin");
  r.headers.set("X-Frame-Options", "DENY");
  return r;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
