import { NextRequest, NextResponse } from "next/server";
import { AUTH_ROLE_COOKIE, AUTH_TOKEN_COOKIE } from "./src/lib/auth/constants";

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;
  const role = request.cookies.get(AUTH_ROLE_COOKIE)?.value;
  const isLoginPage = pathname === "/login";
  const isAdminPage = pathname.startsWith("/admin");
  const isProtectedPage = pathname.startsWith("/work-items") || isAdminPage || pathname === "/";

  if (!token && isProtectedPage) {
    return redirectTo(request, "/login");
  }

  if (token && isLoginPage) {
    return redirectTo(request, role === "ADMIN" ? "/admin" : "/work-items");
  }

  if (token && isAdminPage && role !== "ADMIN") {
    return redirectTo(request, "/work-items");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
