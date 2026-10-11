import { listPlatformCaseQueue } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * The unavailability reports the caller may handle as a platform steward.
 * Only while stewards can handle cases.
 */
export const GET = stewardsOnly(userQueryRoute(listPlatformCaseQueue));
