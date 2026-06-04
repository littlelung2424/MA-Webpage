import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROTECTED_PATHS = ["/admin", "/api/admin"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function unauthorized(message = "Authentication required") {
  return new NextResponse(message, {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Mission Atlas Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

function forbidden(message: string, status = 403) {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function parseBasicAuth(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) return null;

  try {
    const credentials = atob(authorizationHeader.slice("Basic ".length));
    const separatorIndex = credentials.indexOf(":");

    if (separatorIndex === -1) return null;

    return {
      username: credentials.slice(0, separatorIndex),
      password: credentials.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const adminUsername = process.env.ADMIN_USERNAME?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (!adminUsername || !adminPassword) {
    return forbidden("Admin access is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.", 503);
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"));

  if (!credentials) {
    return unauthorized();
  }

  if (credentials.username !== adminUsername || credentials.password !== adminPassword) {
    return unauthorized("Invalid admin credentials");
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
