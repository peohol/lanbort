import { type NextRequest, NextResponse } from "next/server";
import { runtime } from "@/server/runtime";

/** Supabase session cookies are named `sb-<project>-auth-token[.n]`. */
const hasSessionCookie = (request: NextRequest) =>
  request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));

/**
 * Keeps sessions fresh: an expired access token is refreshed here, where the
 * new cookies can still be written to both the request and the response.
 * This is not an authorization layer; Route Handlers and domain policies
 * decide access.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSessionCookie(request)) {
    return response;
  }

  const auth = runtime.auth(
    {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }

        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
    { secureCookies: request.nextUrl.protocol === "https:" },
  );

  try {
    await auth.refreshSession();
  } catch {
    // An unusable session is treated as signed out further down.
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/internal).*)",
  ],
};
