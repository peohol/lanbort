import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { type Access, boundaryOf } from "./route";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

/**
 * WP-11 / Port A: every API goes through the same boundary. This test finds
 * every Route Handler file and fails if an exported HTTP method was not built
 * with `route.*`, or if a route is public or scheduled without being listed
 * here with its reason. New sensitive routes therefore default to failing CI
 * until they use `route.user` (and a domain policy) or are justified below.
 */
const nonUserRoutes: Record<
  string,
  { access: Exclude<Access, "user">; reason: string }
> = {
  "GET /api/health": {
    access: "public",
    reason: "liveness probe without data",
  },
  "POST /api/auth/email-code": {
    access: "public",
    reason: "starts sign-in; same answer for known and unknown addresses",
  },
  "POST /api/auth/email-code/verify": {
    access: "public",
    reason: "completes sign-in by proving control of the address",
  },
  "POST /api/auth/sign-out": {
    access: "public",
    reason: "must be able to clear a broken or expired session",
  },
  "GET /api/internal/outbox": {
    access: "scheduler",
    reason: "outbox worker, authenticated with the cron secret",
  },
  "GET /api/internal/environment-memberships": {
    access: "scheduler",
    reason:
      "ends expired transition periods, authenticated with the cron secret",
  },
  "GET /api/internal/environment-continuity": {
    access: "scheduler",
    reason:
      "resolves ownerless and winding-down environments, authenticated with the cron secret",
  },
  "GET /api/internal/environment-type-changes": {
    access: "scheduler",
    reason:
      "decides proposed type changes at their deadline, authenticated with the cron secret",
  },
  "GET /api/internal/case-queue-returns": {
    access: "scheduler",
    reason:
      "tells handlers about cases returned to the queue, authenticated with the cron secret",
  },
  "GET /api/internal/loan-handovers": {
    access: "scheduler",
    reason:
      "ends unanswered handover clarifications at their deadline, authenticated with the cron secret",
  },
  "GET /api/internal/loan-returns": {
    access: "scheduler",
    reason:
      "makes return confirmations whose undo buffer is over, authenticated with the cron secret",
  },
  "GET /api/internal/loan-reviews": {
    access: "scheduler",
    reason:
      "publishes reviews whose window is over, authenticated with the cron secret",
  },
  "GET /api/internal/notification-deadlines": {
    access: "scheduler",
    reason:
      "tells loan parties about handover and return days, authenticated with the cron secret",
  },
  "GET /api/internal/notification-emails": {
    access: "scheduler",
    reason:
      "sends queued notification e-mails, authenticated with the cron secret",
  },
  "GET /api/internal/object-subscriptions": {
    access: "scheduler",
    reason:
      "tells subscribers when an object has become available, authenticated with the cron secret",
  },
};

const httpMethods = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];
const appDir = fileURLToPath(new URL("../../app", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return /^route\.(ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

function urlOf(file: string): string {
  const segments = relative(appDir, file).split(sep).slice(0, -1);
  // Route groups such as (site) are not part of the URL.
  return `/${segments.filter((segment) => !/^\(.*\)$/.test(segment)).join("/")}`;
}

describe("route boundary", async () => {
  const routes: { key: string; access: Access | undefined }[] = [];

  for (const file of routeFiles(appDir)) {
    const routeModule = (await import(file)) as Record<string, unknown>;

    for (const method of httpMethods.filter((name) => name in routeModule)) {
      routes.push({
        key: `${method} ${urlOf(file)}`,
        access: boundaryOf(routeModule[method])?.access,
      });
    }
  }

  it("finds the route handlers", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)(
    "$key is created through the route boundary",
    ({ access }) => {
      expect(access).toBeDefined();
    },
  );

  it("only exposes the listed routes without a signed-in user", () => {
    const actual = Object.fromEntries(
      routes
        .filter((route) => route.access !== "user")
        .map((route) => [route.key, route.access]),
    );
    const expected = Object.fromEntries(
      Object.entries(nonUserRoutes).map(([key, entry]) => [key, entry.access]),
    );

    expect(actual).toEqual(expected);
  });
});
