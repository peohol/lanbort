import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthGateway, CookieStore, VerifiedIdentity } from "@lanbort/auth";
import {
  type Actor,
  anonymousActor,
  type DomainContext,
  type SystemActor,
  systemActor,
  type UserActor,
  resolveUserActor,
} from "@lanbort/domain";
import { writeLog } from "@lanbort/observability";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { runtime as defaultRuntime, type Runtime } from "../runtime";
import { errorResponse, toErrorResponse } from "./errors";

/**
 * Every Route Handler is created through this module (ADR-0002, WP-11).
 * The wrapper decides who the caller is before any handler code runs:
 *
 * - `user`: a signed-in user with a verified e-mail; anyone else gets 401.
 * - `public`: no sign-in required. Each public route is listed with a reason
 *   in `route-boundary.test.ts`, which fails for unlisted or unwrapped routes.
 * - `scheduler`: a scheduled job proven by the cron secret.
 *
 * Resource authorization still happens in the domain policies that the
 * handler's commands and queries run; the wrapper only establishes the actor.
 * State-changing requests must come from the app's own origin (CSRF), and
 * every response is `no-store` and logged without personal data.
 */
export type Access = "public" | "user" | "scheduler";

/** Dynamic route segments, e.g. `{ objectId }` for `/api/objects/[objectId]`. */
export type RouteParams = Readonly<
  Record<string, string | string[] | undefined>
>;

interface BaseContext {
  readonly request: NextRequest;
  readonly requestId: string;
  readonly domain: DomainContext;
  readonly params: RouteParams;
}

export interface PublicContext extends BaseContext {
  readonly auth: AuthGateway;
  /** The signed-in user, if any; anonymous otherwise. */
  resolveActor(): Promise<Actor>;
}

export interface UserContext extends BaseContext {
  readonly auth: AuthGateway;
  readonly actor: UserActor;
  /** The provider identity behind the actor, verified for this request. */
  readonly identity: VerifiedIdentity;
}

export interface SchedulerContext extends BaseContext {
  readonly actor: SystemActor;
}

type HandlerOf<C> = (context: C) => Promise<Response>;

export interface RouteBoundary {
  readonly access: Access;
}

export type RouteHandler = ((
  request: NextRequest,
  context: { params: Promise<unknown> },
) => Promise<Response>) & { readonly [routeBoundary]: RouteBoundary };

/** Brand that marks a handler as created by this module. */
export const routeBoundary: unique symbol = Symbol.for("lanbort.routeBoundary");

export function boundaryOf(value: unknown): RouteBoundary | undefined {
  return typeof value === "function"
    ? (value as Partial<RouteHandler>)[routeBoundary]
    : undefined;
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Browsers send Origin on state-changing requests; it must be our own host.
 * Like Next.js does for Server Actions, the host is taken from the
 * (forwarded) Host header, since the internal request URL can differ.
 * A cross-site page cannot set these headers without a CORS preflight.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!origin) {
    return request.headers.get("sec-fetch-site") === "same-origin";
  }

  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function requestCookies(): Promise<CookieStore> {
  const store = await cookies();

  return {
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      for (const { name, value, options } of toSet) {
        store.set(name, value, options);
      }
    },
  };
}

function secretMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Computes a value on first access only. */
function once<T>(create: () => T): () => T {
  let value: { current: T } | undefined;

  return () => (value ??= { current: create() }).current;
}

export function createRouteFactory(runtime: Runtime) {
  async function run(
    access: Access,
    request: NextRequest,
    handle: (requestId: string) => Promise<Response>,
  ): Promise<Response> {
    const startedAt = performance.now();
    const requestId = randomUUID();
    let response: Response;

    try {
      response =
        access !== "scheduler" &&
        unsafeMethods.has(request.method) &&
        !isSameOrigin(request)
          ? errorResponse("cross_site_request")
          : await handle(requestId);
    } catch (error) {
      response = toErrorResponse(error) ?? errorResponse("internal_error");

      if (response.status >= 500) {
        writeLog("error", "http.request_failed", {
          requestId,
          route: request.nextUrl.pathname,
          method: request.method,
        });
      }
    }

    response.headers.set("cache-control", "no-store");
    response.headers.set("x-request-id", requestId);
    writeLog("info", "http.request_completed", {
      requestId,
      route: request.nextUrl.pathname,
      method: request.method,
      statusCode: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });

    return response;
  }

  function brand(
    access: Access,
    handler: (request: NextRequest, params: RouteParams) => Promise<Response>,
  ): RouteHandler {
    const wrapped = async (
      request: NextRequest,
      context?: { params?: Promise<unknown> },
    ) => handler(request, ((await context?.params) ?? {}) as RouteParams);

    return Object.assign(wrapped, {
      [routeBoundary]: Object.freeze({ access }),
    });
  }

  /** Database and auth are created lazily, so probes need no configuration. */
  async function sessionFor(request: NextRequest, requestId: string) {
    const cookieStore = await requestCookies();
    const domain = once(() => runtime.domain());
    const auth = once(() =>
      runtime.auth(cookieStore, {
        secureCookies: request.nextUrl.protocol === "https:",
      }),
    );
    const user = once(async () => {
      const identity = await auth().currentIdentity();
      const actor = identity
        ? await resolveUserActor(domain(), identity, requestId)
        : null;

      return identity && actor ? { identity, actor } : null;
    });
    const actor = async (): Promise<Actor> =>
      (await user())?.actor ?? anonymousActor;

    return { domain, auth, user, actor };
  }

  return {
    /** A route anyone may call, such as starting sign-in. */
    public(handler: HandlerOf<PublicContext>): RouteHandler {
      return brand("public", (request, params) =>
        run("public", request, async (requestId) => {
          const session = await sessionFor(request, requestId);

          return handler({
            request,
            requestId,
            params,
            get domain() {
              return session.domain();
            },
            get auth() {
              return session.auth();
            },
            resolveActor: session.actor,
          });
        }),
      );
    },

    /** A route for signed-in users. */
    user(handler: HandlerOf<UserContext>): RouteHandler {
      return brand("user", (request, params) =>
        run("user", request, async (requestId) => {
          const session = await sessionFor(request, requestId);
          const user = await session.user();

          if (!user) {
            return errorResponse("unauthenticated");
          }

          return handler({
            request,
            requestId,
            params,
            ...user,
            domain: session.domain(),
            auth: session.auth(),
          });
        }),
      );
    },

    /** A scheduled job, authenticated by the shared cron secret. */
    scheduler(
      process: string,
      handler: HandlerOf<SchedulerContext>,
    ): RouteHandler {
      const actor = systemActor(process);

      return brand("scheduler", (request, params) =>
        run("scheduler", request, async (requestId) => {
          const secret = runtime.cronSecret();

          if (!secret) {
            return errorResponse("unavailable");
          }

          if (!secretMatches(request.headers.get("authorization"), secret)) {
            return errorResponse("unauthenticated");
          }

          return handler({
            request,
            requestId,
            params,
            actor,
            domain: runtime.domain(),
          });
        }),
      );
    },
  };
}

export const route = createRouteFactory(defaultRuntime);
