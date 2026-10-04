import { reportInEnvironment } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ environmentId, target, body }`: a member reports a member or an object to the administrators (PS-TRUST-013). */
export const POST = userCommandRoute(reportInEnvironment);
