import { reportToPlatform } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ target, body }`: reports a user, an object, a review or a response to the platform stewards (PS-TRUST-013–015). */
export const POST = userCommandRoute(reportToPlatform);
