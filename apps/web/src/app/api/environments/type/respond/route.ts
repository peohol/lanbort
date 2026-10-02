import { respondToTypeChange } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An active member's own consent or vote on a weaker type (PS-ENV-008). */
export const POST = userCommandRoute(respondToTypeChange);
