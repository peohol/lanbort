import { listPlatformCaseQueue } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The unavailability reports the caller may handle as a platform steward. */
export const GET = userQueryRoute(listPlatformCaseQueue);
