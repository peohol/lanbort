import { listEnvironmentCaseQueue } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The cases of `environmentId` the caller may handle as its administrator. */
export const GET = userQueryRoute(listEnvironmentCaseQueue);
