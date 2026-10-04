import { chatEnabled } from "../env";
import { errorResponse } from "./errors";
import { boundaryOf, type RouteHandler, routeBoundary } from "./route";

/**
 * Private chat stays off until Port C (ADR-0010 §2). While it is off, every
 * chat route answers as if it did not exist, before anything else runs; it
 * keeps the boundary of the route it wraps.
 */
export function chatOnly(handler: RouteHandler): RouteHandler {
  const boundary = boundaryOf(handler);

  if (!boundary) {
    throw new Error("chatOnly wraps a route built through the boundary");
  }

  return Object.assign(
    (...args: Parameters<RouteHandler>) =>
      chatEnabled()
        ? handler(...args)
        : Promise.resolve(errorResponse("not_found")),
    { [routeBoundary]: boundary },
  );
}
