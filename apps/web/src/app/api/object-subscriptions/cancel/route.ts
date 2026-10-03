import { unsubscribeFromObject } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Ends the caller's subscription to an object. */
export const POST = userCommandRoute(unsubscribeFromObject);
