import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, verifySessionToken } from "@/server/auth/session";

const PUBLIC_PATHS = ["/login", "/manifest.webmanifest", "/sw.js", "/offline"];

export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "disabled") return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (mode === "misconfigured") {
    return new NextResponse(
      "KanjiFlow: autenticazione non configurata. Imposta APP_PASSWORD_HASH_B64 (npm run auth:hash) e SESSION_SECRET (≥ 32 caratteri).",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  // Qui solo la firma: account disattivati o password cambiate vengono respinti da getStudyContext.
  const claims = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|robots.txt).*)"],
};
