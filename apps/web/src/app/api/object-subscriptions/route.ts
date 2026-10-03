import { listObjectSubscriptions, subscribeToObject } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/**
 * `?cursor=`: the caller's subscriptions, each with the object as the caller
 * finds it now, or inactive while they find it nowhere (PS-OBJ-014).
 */
export const GET = userQueryRoute(listObjectSubscriptions);

/** Subscribes to an object the caller finds in one of their environments. */
export const POST = userCommandRoute(subscribeToObject);
