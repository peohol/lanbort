import { deactivateAccount } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The user stops new activity on their account (PS-ADM-002). */
export const POST = userPathCommandRoute(deactivateAccount);
