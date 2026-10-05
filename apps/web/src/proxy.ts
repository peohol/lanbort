import { type NextRequest, NextResponse } from "next/server";
import { isChatPage, usesCamera } from "@/navigation/chat";
import { getSecurityHeaders } from "@/security-headers";
import { runtime } from "@/server/runtime";

/** Supabase session cookies are named `sb-<project>-auth-token[.n]`. */
const hasSessionCookie = (request: NextRequest) =>
  request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));

/**
 * A chat page's security headers, with a fresh nonce for its scripts
 * (ADR-0010 §13). Next.js reads the nonce from the request's policy and
 * puts it on the scripts it renders.
 */
function chatHeaders(request: NextRequest) {
  if (!isChatPage(request.nextUrl.pathname)) {
    return undefined;
  }

  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))),
  );

  return getSecurityHeaders({
    development: process.env.NODE_ENV === "development",
    chat: { nonce, camera: usesCamera(request.nextUrl.pathname) },
  });
}

/**
 * Keeps sessions fresh: an expired access token is refreshed here, where the
 * new cookies can still be written to both the request and the response.
 * This is not an authorization layer; Route Handlers and domain policies
 * decide access. It also gives chat pages their own security headers.
 */
export async function proxy(request: NextRequest) {
  const security = chatHeaders(request);
  const policy = security?.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;
  const forward = () => {
    const headers = new Headers(request.headers);

    if (policy) {
      headers.set("content-security-policy", policy);
    }

    return NextResponse.next({ request: { headers } });
  };
  const respond = (response: NextResponse) => {
    for (const { key, value } of security ?? []) {
      response.headers.set(key, value);
    }

    return response;
  };

  let response = forward();

  if (!hasSessionCookie(request)) {
    return respond(response);
  }

  const auth = runtime.auth(
    {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }

        response = forward();

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

  return respond(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|maplibre/|api/health|api/internal).*)",
  ],
};
