import type { NextRequest } from "next/server";

const addressPattern = /^[0-9A-Fa-f.:]{2,45}$/;
const loopbackPattern = /^(127\.|::1$|::ffff:127\.)/;

/**
 * The client's network address for rate limits (WP-73), or null when it is
 * not known. The hosting platform (Vercel, ADR-0006) overwrites
 * `x-forwarded-for` with the client's address and does not pass on what the
 * client sent, so the first entry is trustworthy there. A loopback address
 * is the machine itself (local development and tests) and identifies no
 * client. Never log or store the address; it is only used hashed.
 */
export function clientAddress(request: Pick<NextRequest, "headers">) {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return first && addressPattern.test(first) && !loopbackPattern.test(first)
    ? first.toLowerCase()
    : null;
}
