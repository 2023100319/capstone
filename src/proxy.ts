import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import type { Role } from "@prisma/client";
import {
  HOME_BY_ROLE,
  LOGIN_PATH,
  OLD_LOGIN_PATHS,
  canAccessPath,
} from "@/lib/roles";

/**
 * Signed-out staff go to the one sign-in screen; signed-in staff can only reach
 * their own area. Without this, a supervisor could simply type /staff/owner.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const role = token?.role as Role | undefined;
  const home = role ? HOME_BY_ROLE[role] : undefined;

  // The sign-in screen, plus the old per-role URLs that now redirect to it:
  // someone already signed in has no use for a form, so send them to their
  // dashboard. Everyone else falls through to the page — this branch is also
  // what keeps the redirect below from looping.
  if (pathname === LOGIN_PATH || OLD_LOGIN_PATHS.includes(pathname)) {
    return home
      ? NextResponse.redirect(new URL(home, request.url))
      : NextResponse.next();
  }

  // No session.
  if (!home) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (!canAccessPath(role as Role, pathname)) {
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

// The sign-in screen, the old per-role URLs, and every staff area. The matcher
// has to be literal strings — Next reads it at build time, so LOGIN_PATH and
// OLD_LOGIN_PATHS cannot be spread in. "/staff" matches that exact path only;
// the dashboards below are covered by their own :path* entries.
export const config = {
  matcher: [
    "/staff",
    "/supervisor",
    "/admin",
    "/owner",
    "/staff/cashier/:path*",
    "/staff/supervisor/:path*",
    "/staff/admin/:path*",
    "/staff/owner/:path*",
    "/staff/kitchen/:path*",
  ],
};
