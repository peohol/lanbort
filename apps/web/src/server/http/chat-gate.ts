import { chatEnabled, platformStewardsEnabled } from "../env";
import { errorResponse } from "./errors";
import { boundaryOf, type RouteHandler, routeBoundary } from "./route";

/**
 * A route that exists only while `enabled()`: otherwise it answers as if it
 * did not exist, before anything else runs. It keeps the boundary of the
 * route it wraps.
 */
function onlyWhile(
  enabled: () => boolean,
  handler: RouteHandler,
): RouteHandler {
  const boundary = boundaryOf(handler);

  if (!boundary) {
    throw new Error("A gate wraps a route built through the boundary");
  }

  return Object.assign(
    (...args: Parameters<RouteHandler>) =>
      enabled()
        ? handler(...args)
        : Promise.resolve(errorResponse("not_found")),
    { [routeBoundary]: boundary },
  );
}

/** Private chat stays off until Port C (ADR-0010 §2). */
export const chatOnly = (handler: RouteHandler) =>
  onlyWhile(chatEnabled, handler);

/**
 * Platform stewards' routes stay off until their privileged access is
 * verified in this deployment (ADR-0011, `PLATFORM_STEWARDS_ENABLED`).
 */
export const stewardsOnly = (handler: RouteHandler) =>
  onlyWhile(platformStewardsEnabled, handler);
