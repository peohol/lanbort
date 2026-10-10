import { reportToPlatform } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ target, body }`: reports a user, an object, a review or a response to
 * the platform stewards (PS-TRUST-013–015). Only while stewards can handle
 * cases (UX-EXC-011).
 */
export const POST = stewardsOnly(userCommandRoute(reportToPlatform));
